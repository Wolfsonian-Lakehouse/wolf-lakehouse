import pandas as pd
import logging
import sys
import json
from pathlib import Path

# Setup paths
SILVER_ALMA = Path('/app/data/silver/alma_silver.parquet')
SILVER_PROFICIO = Path('/app/data/silver/proficio_silver.parquet')
OUTPUT_PARQUET = Path('/app/data/gold/unified_catalog.parquet')

# Ensure directory exists
OUTPUT_PARQUET.parent.mkdir(parents=True, exist_ok=True)

# Logging setup
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# The strictly predefined columns requested by the user
predefined_cols = [
    'id', 'field_resource_type', 'field_collection_type', 'field_model', 'parent_id',
    'field_weight', 'field_member_of', 'file', 'media_use_tid',
    'field_display_hints', 'field_identifier', 'alma_identifier', 'title', 'url_alias',
    'field_genre', 'field_linked_agent', 'field_credit_line',
    'field_edtf_date_created', 'field_description_long', 'field_extent',
    'field_physical_form', 'field_collection_note', 'field_note', 'field_place_published',
    'field_geographic_subject', 'field_subject_pictured', 'field_language', 
    'field_subject', 'field_subjects_name', 'field_temporal_subject', 'three_letter_code',
    'country_code', 'field_lvr', 'source_system', 'location', 'storage_location'
]

def main():
    if not SILVER_ALMA.exists() and not SILVER_PROFICIO.exists():
        logging.warning("No Silver databases found. Cannot generate unified catalog.")
        return
        
    logging.info("--- 🔄 GENERATE GOLD UNIFIED CATALOG ---")
    
    dfs = []
    
    # Load Alma
    if SILVER_ALMA.exists():
        logging.info(f"Loading Alma Silver: {SILVER_ALMA}")
        df_alma = pd.read_parquet(SILVER_ALMA)
        df_alma['source_system'] = 'Alma'
        dfs.append(df_alma)
        
    # Load Proficio
    if SILVER_PROFICIO.exists():
        logging.info(f"Loading Proficio Silver: {SILVER_PROFICIO}")
        df_proficio = pd.read_parquet(SILVER_PROFICIO)
        df_proficio['source_system'] = 'Proficio'
        dfs.append(df_proficio)
        
    if not dfs:
        return
        
    logging.info("Merging datasets...")
    # Concatenate all available sources
    df_unified = pd.concat(dfs, ignore_index=True)
    
    logging.info("Applying manual exclusions...")
    EXCLUDED_IDS = ['2022.37.1']
    if 'field_identifier' in df_unified.columns:
        before_excl = len(df_unified)
        # Check if any excluded ID is in the field_identifier
        df_unified = df_unified[~df_unified['field_identifier'].astype(str).apply(
            lambda x: any(excl in [i.strip() for i in x.split(';')] for excl in EXCLUDED_IDS) if x != 'nan' else False
        )]
        after_excl = len(df_unified)
        logging.info(f"Removed {before_excl - after_excl} explicitly excluded records.")
    
    logging.info("Deduplicating records across sources (Prioritizing Proficio over Alma)...")
    if 'field_identifier' in df_unified.columns:
        # Extract all normalized Proficio identifiers into a fast lookup set
        df_proficio_subset = df_unified[df_unified['source_system'] == 'Proficio']
        proficio_ids = set()
        for val in df_proficio_subset['field_identifier']:
            if pd.notna(val):
                for p in str(val).split(';'):
                    clean_id = p.strip().lower()
                    if clean_id:
                        proficio_ids.add(clean_id)
                        
        def append_dup_if_alma_duplicate(row):
            # Only append _dup to Alma records that overlap with Proficio
            if row['source_system'] != 'Alma':
                return row['field_identifier']
            val = row['field_identifier']
            if pd.notna(val):
                new_ids = []
                for p in str(val).split(';'):
                    clean_id = p.strip()
                    if clean_id.lower() in proficio_ids:
                        # Append the index name to make it completely unique for the frontend
                        new_ids.append(clean_id + f'_dup_{row.name}')
                    else:
                        new_ids.append(clean_id)
                return '; '.join(new_ids)
            return val
            
        df_unified['field_identifier'] = df_unified.apply(append_dup_if_alma_duplicate, axis=1)
        
        logging.info(f"Appended '_dup' to Alma records that overlapped with Proficio. Maintained {len(df_unified)} total records.")
    
    # Overwrite any existing generic IDs and generate a clean sequence
    df_unified['id'] = range(1, len(df_unified) + 1)
    
    logging.info("Sorting and aligning columns...")
    
    # Get all raw diagnostic columns that are not in the predefined list
    other_cols = sorted([col for col in df_unified.columns if col not in predefined_cols])
    
    # Build the final column order
    final_columns = []
    seen_cols = set()
    
    # Force predefined columns to the front (even if they are empty)
    for col in predefined_cols:
        if col not in df_unified.columns:
            df_unified[col] = pd.NA
        final_columns.append(col)
        seen_cols.add(col)
        
    # Append all remaining raw columns to the end
    for col in other_cols:
        if col not in seen_cols:
            final_columns.append(col)
            seen_cols.add(col)
            
    df_unified = df_unified[final_columns]
    
    logging.info("Applying DuckDB Null-Safety...")
    # Convert all object/string columns to string and replace exact nan/None strings with pd.NA
    str_cols = df_unified.select_dtypes(include=['object', 'string']).columns
    for col in str_cols:
        df_unified[col] = df_unified[col].astype(str).str.strip().replace('', pd.NA).replace('nan', pd.NA).replace('None', pd.NA)
        
    # Drop columns that are completely empty across the entire unified catalog to prevent DuckDB UNKNOWN type crashes
    initial_col_count = len(df_unified.columns)
    df_unified = df_unified.dropna(axis=1, how='all')
    final_col_count = len(df_unified.columns)
    logging.info(f"Dropped {initial_col_count - final_col_count} completely empty columns.")
    
    # Convert nanosecond timestamps to standard datetime [us] to prevent DuckDB cast errors in Metabase
    for col in df_unified.select_dtypes(include=['datetime64[ns]', 'datetime64[ns, UTC]']).columns:
        df_unified[col] = df_unified[col].astype('datetime64[us]')

    # Save the Unified Catalog
    df_unified.to_parquet(OUTPUT_PARQUET, index=False)
    logging.info(f"💾 Saved Unified Catalog Parquet: {OUTPUT_PARQUET}")
    logging.info(f"Final Shape: {len(df_unified)} records, {final_col_count} columns.")
    
    # Write metrics
    metrics_path = '/app/data/metrics.json'
    metrics = {}
    if Path(metrics_path).exists():
        try:
            with open(metrics_path, 'r') as f: metrics = json.load(f)
        except: pass
        
    metrics['unified_catalog_total'] = len(df_unified)
    with open(metrics_path, 'w') as f:
        json.dump(metrics, f)
        
    logging.info("✅ Gold Unified Catalog generation complete!")


if __name__ == "__main__":
    main()
