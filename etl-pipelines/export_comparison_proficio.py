import pandas as pd
import logging
import sys
import unicodedata
import re
from pathlib import Path

# Paths
PROFICIO_SILVER = Path('/app/data/silver/proficio_silver.parquet')
RAW_ISLANDORA = Path('/app/data/raw/islandora/islandora_lookup.parquet')
OUTPUT_PARQUET = Path('/app/data/gold/comparison_proficio.parquet')

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def normalize_identifier(s):
    if pd.isna(s): return None
    s = str(s)
    s = unicodedata.normalize('NFKC', s).lower()
    s = re.sub(r"[()\[\]'_]", ' ', s)
    s = re.sub(r'[.\s,-]+', '.', s)
    s = s.strip('.')
    return s

def run_comparison():
    if not PROFICIO_SILVER.exists() or not RAW_ISLANDORA.exists():
        logging.warning("Missing required Proficio Silver or Islandora Raw files.")
        return
        
    logging.info("--- 🔄 GENERATE PROFICIO-ISLANDORA COMPARISON ---")
    
    # Load data
    df_proficio = pd.read_parquet(PROFICIO_SILVER)
    df_islandora = pd.read_parquet(RAW_ISLANDORA)
    
    # We compare against all valid Proficio records (QA pass)
    if 'qa_pass' in df_proficio.columns:
        df_pass = df_proficio[df_proficio['qa_pass'].astype(str).str.lower() != 'false'].copy()
    else:
        df_pass = df_proficio.copy()
    
    # Normalize Proficio identifiers
    identifier_column = 'field_identifier'
    if identifier_column not in df_pass.columns and 'access_nbr' in df_pass.columns:
        identifier_column = 'access_nbr'
    elif 'cat_nbr' in df_pass.columns:
        identifier_column = 'cat_nbr'

    df_pass['norm_id'] = df_pass[identifier_column].apply(normalize_identifier)
    
    # Normalize Islandora identifiers
    if 'accn' in df_islandora.columns:
        df_islandora = df_islandora.rename(columns={'accn': 'field_identifier'})
    elif 'field_identifier_external' in df_islandora.columns:
        df_islandora = df_islandora.rename(columns={'field_identifier_external': 'field_identifier'})
        
    df_islandora['norm_id'] = df_islandora['field_identifier'].apply(normalize_identifier)

    # We just need the unique normalized IDs from Islandora
    df_islandora_norm_keys = df_islandora[['norm_id']].dropna().drop_duplicates()

    # Perform the merge
    merged_df = pd.merge(
        df_pass,
        df_islandora_norm_keys,
        on='norm_id',
        how='left',
        indicator='exists'
    )

    # Rename indicator values to match standard pandas output or custom logic
    # 'both' means it exists in Islandora, 'left_only' means it's missing from Islandora
    df_results = merged_df.drop(columns=['norm_id'])
    
    # Clean up object/string columns for Parquet saving
    str_cols = df_results.select_dtypes(include=['object', 'string']).columns
    for col in str_cols:
        df_results.loc[:, col] = df_results[col].astype(str).str.strip().replace('', pd.NA).replace('nan', pd.NA).replace('None', pd.NA)
        
    # Drop completely empty columns to save space
    df_results = df_results.dropna(axis=1, how='all')
    
    OUTPUT_PARQUET.parent.mkdir(parents=True, exist_ok=True)
    df_results.to_parquet(OUTPUT_PARQUET, index=False)
    
    missing_count = len(df_results[df_results['exists'] == 'left_only'])
    matched_count = len(df_results[df_results['exists'] == 'both'])
    
    logging.info(f"Comparison complete! Found {missing_count} missing and {matched_count} matched objects.")
    logging.info(f"Saved Gold Parquet results to {OUTPUT_PARQUET}")

def main():
    run_comparison()


if __name__ == "__main__":
    main()
