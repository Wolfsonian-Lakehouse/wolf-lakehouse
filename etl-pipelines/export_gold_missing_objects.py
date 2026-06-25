import pandas as pd
import logging
import sys
import unicodedata
import re
import json
from pathlib import Path

UNIFIED_CATALOG = Path('/app/data/gold/unified_catalog.parquet')
RAW_ISLANDORA = Path('/app/data/raw/islandora/islandora_lookup.parquet')
OUTPUT_PARQUET = Path('/app/data/gold/missing_objects.parquet')

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def normalize_identifier(s):
    if pd.isna(s): return None
    s = str(s)
    s = unicodedata.normalize('NFKC', s).lower()
    s = re.sub(r"[()\[\]'_]", ' ', s)
    s = re.sub(r'[.\s,-]+', '.', s)
    s = s.strip('.')
    return s

def main():
    if not UNIFIED_CATALOG.exists() or not RAW_ISLANDORA.exists():
        logging.warning("Missing required Unified Catalog or Islandora files.")
        return
        
    logging.info("--- 🔄 GENERATE GOLD MISSING OBJECTS ---")
    
    try:
        import pyarrow.parquet as pq
        master_schema = pq.ParquetFile(UNIFIED_CATALOG).schema.names
        islandora_schema = pq.ParquetFile(RAW_ISLANDORA).schema.names
    except ImportError:
        # Fallback if pyarrow is not directly importable
        master_schema = pd.read_parquet(UNIFIED_CATALOG, engine='fastparquet').columns.tolist()
        islandora_schema = pd.read_parquet(RAW_ISLANDORA, engine='fastparquet').columns.tolist()

    final_cols_to_keep = [
        'id', 'field_resource_type', 'field_model', 'parent_id', 'field_weight',
        'field_member_of', 'file', 'media_use_tid', 'field_display_hints',
        'url_alias', 'title', 'field_linked_agent', 'field_identifier', 'access_nbr',
        'field_genre', 'field_edtf_date_created', 'field_place_published',
        'field_subject', 'field_description_long', 'field_credit_line',
        'field_physical_form', 'field_extent', 'field_collection_type',
        'qa_pass'
    ]
    
    master_cols = [c for c in master_schema if c in final_cols_to_keep]
    df_master = pd.read_parquet(UNIFIED_CATALOG, columns=master_cols)
    
    islandora_id_col = 'field_identifier'
    if 'accn' in islandora_schema:
        islandora_id_col = 'accn'
    elif 'field_identifier_external' in islandora_schema:
        islandora_id_col = 'field_identifier_external'
        
    df_islandora = pd.read_parquet(RAW_ISLANDORA, columns=[islandora_id_col] if islandora_id_col in islandora_schema else None)
    
    # Filter out records that explicitly failed QA. Keep 'True' and empty/NaN (like Alma records)
    if 'qa_pass' in df_master.columns:
        df_pass = df_master[df_master['qa_pass'].astype(str).str.lower() != 'false'].copy()
    else:
        df_pass = df_master.copy()
    
    identifier_column = 'field_identifier'
    if identifier_column not in df_pass.columns and 'access_nbr' in df_pass.columns:
        identifier_column = 'access_nbr'

    df_pass['norm_id'] = df_pass[identifier_column].apply(normalize_identifier)
    
    if 'accn' in df_islandora.columns:
        df_islandora = df_islandora.rename(columns={'accn': 'field_identifier'})
    elif 'field_identifier_external' in df_islandora.columns:
        df_islandora = df_islandora.rename(columns={'field_identifier_external': 'field_identifier'})
        
    if 'field_identifier' in df_islandora.columns:
        df_islandora['norm_id'] = df_islandora['field_identifier'].apply(normalize_identifier)
    else:
        df_islandora['norm_id'] = None

    df_islandora_norm_keys = df_islandora[['norm_id']].dropna().drop_duplicates()

    merged_df = pd.merge(
        df_pass,
        df_islandora_norm_keys,
        on='norm_id',
        how='left',
        indicator=True
    )

    df_results = merged_df[merged_df['_merge'] == 'left_only'].drop(columns=['_merge', 'norm_id'])
    
    missing_count = len(df_results)
    logging.info(f"Found {missing_count} records missing from Islandora.")
    
    OUTPUT_PARQUET.parent.mkdir(parents=True, exist_ok=True)
    if not df_results.empty:
        df_results.loc[:, 'id'] = range(1, missing_count + 1)
        final_columns = [
            'id', 'field_resource_type', 'field_model', 'parent_id', 'field_weight',
            'field_member_of', 'file', 'media_use_tid', 'field_display_hints',
            identifier_column, 'url_alias', 'title', 'field_linked_agent',
            'field_genre', 'field_edtf_date_created', 'field_place_published',
            'field_subject', 'field_description_long', 'field_credit_line',
            'field_physical_form', 'field_extent', 'field_collection_type',
            'qa_pass'
        ]
        
        if identifier_column != 'field_identifier':
            df_results = df_results.rename(columns={identifier_column: 'field_identifier'})
            if identifier_column in final_columns:
                final_columns[final_columns.index(identifier_column)] = 'field_identifier'
                
        final_columns_exist = [col for col in final_columns if col in df_results.columns]
        
        df_export = df_results[final_columns_exist]
        str_cols = df_export.select_dtypes(include=['object', 'string']).columns
        for col in str_cols:
            df_export.loc[:, col] = df_export[col].astype(str).str.strip().replace('', pd.NA).replace('nan', pd.NA).replace('None', pd.NA)
        df_export = df_export.dropna(axis=1, how='all')
        df_export.to_parquet(OUTPUT_PARQUET, index=False)
        logging.info(f"Saved Gold Parquet results to {OUTPUT_PARQUET}")
        
    metrics_path = '/app/data/metrics.json'
    metrics = {}
    if Path(metrics_path).exists():
        try:
            with open(metrics_path, 'r') as f: metrics = json.load(f)
        except: pass
        
    metrics['missing_objects_found'] = missing_count
    with open(metrics_path, 'w') as f:
        json.dump(metrics, f)


if __name__ == "__main__":
    main()
