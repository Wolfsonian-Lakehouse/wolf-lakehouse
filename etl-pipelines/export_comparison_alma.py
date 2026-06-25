import pandas as pd
import logging
import sys
from pathlib import Path
from datetime import datetime
import os

# Paths
ALMA_SILVER = Path('/app/data/silver/alma_silver.parquet')
RAW_ISLANDORA = Path('/app/data/raw/islandora/islandora_lookup.parquet')
OUTPUT_CSV = Path(f'/app/data/gold/alma_vs_islandora_report_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv')

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def run_comparison():
    if not ALMA_SILVER.exists() or not RAW_ISLANDORA.exists():
        logging.warning("Missing required Alma Silver or Islandora Raw files.")
        return
        
    logging.info("--- 🔄 GENERATE ALMA-ISLANDORA COMPARISON ---")
    
    # Load data
    df_alma = pd.read_parquet(ALMA_SILVER)
    df_islandora = pd.read_parquet(RAW_ISLANDORA)
    
    # 1. Process Alma
    df_alma['field_identifier'] = df_alma['field_identifier'].astype(str).str.strip()
    df_alma = df_alma[df_alma['field_identifier'] != '']
    df_alma = df_alma[df_alma['field_identifier'] != 'None']
    df_alma['normalized_identifier'] = df_alma['field_identifier'].str.lower()
    
    # Deduplicate Alma by normalized ID
    df_alma_dedup = df_alma.drop_duplicates(subset=['normalized_identifier']).copy()
    
    # 2. Process Islandora
    # Map API columns
    if 'accn' in df_islandora.columns:
        df_islandora = df_islandora.rename(columns={'accn': 'field_identifier'})
    elif 'field_identifier_external' in df_islandora.columns:
        df_islandora = df_islandora.rename(columns={'field_identifier_external': 'field_identifier'})
        
    if 'title' not in df_islandora.columns:
        df_islandora['title'] = "N/A (Not in API)"
        
    df_islandora['field_identifier'] = df_islandora['field_identifier'].astype(str).str.strip()
    df_islandora = df_islandora[df_islandora['field_identifier'] != '']
    df_islandora = df_islandora[df_islandora['field_identifier'] != 'None']
    df_islandora['normalized_identifier'] = df_islandora['field_identifier'].str.lower()
    
    # Deduplicate Islandora by normalized ID
    df_islandora_dedup = df_islandora.drop_duplicates(subset=['normalized_identifier']).copy()
    
    # 3. Perform Outer Merge
    # We want to keep all columns from both, so we use suffixes
    merged_df = pd.merge(
        df_alma_dedup[['normalized_identifier', 'field_identifier', 'title']],
        df_islandora_dedup[['normalized_identifier', 'field_identifier', 'title']],
        on='normalized_identifier',
        how='outer',
        suffixes=('_alma', '_islandora'),
        indicator=True
    )
    
    # 4. Map back to user's requested report format
    def get_status(row):
        if row['_merge'] == 'both':
            return 'Match'
        elif row['_merge'] == 'left_only':
            return 'MARC Only'
        else:
            return 'API Only'
            
    report_df = pd.DataFrame()
    report_df['Normalized ID'] = merged_df['normalized_identifier']
    report_df['Status'] = merged_df.apply(get_status, axis=1)
    report_df['In MARC'] = merged_df['_merge'].isin(['both', 'left_only']).map({True: 'Yes', False: 'No'})
    report_df['MARC ID'] = merged_df['field_identifier_alma'].fillna('')
    report_df['MARC Title'] = merged_df['title_alma'].fillna('')
    report_df['In API'] = merged_df['_merge'].isin(['both', 'right_only']).map({True: 'Yes', False: 'No'})
    report_df['API ID'] = merged_df['field_identifier_islandora'].fillna('')
    report_df['API Title'] = merged_df['title_islandora'].fillna('')
    
    # 5. Export
    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    report_df.to_csv(OUTPUT_CSV, index=False)
    
    match_count = len(report_df[report_df['Status'] == 'Match'])
    marc_only_count = len(report_df[report_df['Status'] == 'MARC Only'])
    api_only_count = len(report_df[report_df['Status'] == 'API Only'])
    
    logging.info(f"Comparison complete! Total Rows: {len(report_df)}")
    logging.info(f" - Matches: {match_count}")
    logging.info(f" - MARC Only (Alma): {marc_only_count}")
    logging.info(f" - API Only (Islandora): {api_only_count}")
    logging.info(f"Saved CSV report to {OUTPUT_CSV}")
    
    # Also save a standard comparison parquet to match the proficio pattern
    OUTPUT_PARQUET = Path('/app/data/gold/comparison_alma.parquet')
    merged_df.to_parquet(OUTPUT_PARQUET, index=False)
    logging.info(f"Saved Gold Parquet results to {OUTPUT_PARQUET}")

def main():
    run_comparison()


if __name__ == "__main__":
    main()
