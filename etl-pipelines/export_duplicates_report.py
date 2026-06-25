import pandas as pd
import logging
import sys
from pathlib import Path
import datetime

# Paths
SILVER_ALMA = Path('/app/data/silver/alma_silver.parquet')
SILVER_PROFICIO = Path('/app/data/silver/proficio_silver.parquet')

timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
OUTPUT_CSV = Path(f'/app/data/gold/duplicates_report_{timestamp}.csv')

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def normalize_and_split_identifiers(df, source_name):
    """
    Takes a dataframe, extracts 'field_identifier', splits by ';' 
    and returns a normalized DataFrame with 'match_id', 'source_system', 
    and the original 'field_identifier' and 'title' for reporting.
    """
    if 'field_identifier' not in df.columns:
        return pd.DataFrame()
        
    # Copy relevant columns
    df_sub = df[['field_identifier']].copy()
    if 'title' in df.columns:
        df_sub['title'] = df['title']
    else:
        df_sub['title'] = pd.NA
        
    df_sub['source_system'] = source_name
    
    # Drop rows without identifiers
    df_sub = df_sub.dropna(subset=['field_identifier'])
    
    # Split by semicolon and explode
    df_sub['match_id'] = df_sub['field_identifier'].astype(str).str.split(';')
    df_exploded = df_sub.explode('match_id')
    
    # Clean the exploded strings
    df_exploded['match_id'] = df_exploded['match_id'].astype(str).str.strip().str.lower()
    df_exploded = df_exploded[df_exploded['match_id'] != '']
    
    return df_exploded

def main():
    if not SILVER_ALMA.exists() or not SILVER_PROFICIO.exists():
        logging.warning("Missing Alma or Proficio silver data. Cannot run duplicates report.")
        return
        
    logging.info("--- 🔍 GENERATING DUPLICATES REPORT ---")
    
    df_alma = pd.read_parquet(SILVER_ALMA)
    df_proficio = pd.read_parquet(SILVER_PROFICIO)
    
    logging.info(f"Loaded {len(df_alma)} Alma records and {len(df_proficio)} Proficio records.")
    
    # Extract and explode identifiers
    alma_exploded = normalize_and_split_identifiers(df_alma, 'Alma')
    proficio_exploded = normalize_and_split_identifiers(df_proficio, 'Proficio')
    
    # Find intersecting identifiers
    intersecting_ids = set(alma_exploded['match_id']).intersection(set(proficio_exploded['match_id']))
    
    logging.info(f"Found {len(intersecting_ids)} overlapping individual accession numbers.")
    
    if len(intersecting_ids) == 0:
        logging.info("No duplicates found! Exiting.")
        return
        
    # Filter the exploded dataframes for only the overlapping IDs
    alma_dupes = alma_exploded[alma_exploded['match_id'].isin(intersecting_ids)]
    proficio_dupes = proficio_exploded[proficio_exploded['match_id'].isin(intersecting_ids)]
    
    # Combine them for the report
    report_df = pd.concat([proficio_dupes, alma_dupes], ignore_index=True)
    
    # Sort the report so the matching IDs are next to each other
    report_df = report_df.sort_values(by=['match_id', 'source_system'], ascending=[True, False])
    
    # Reorder columns for readability
    report_df = report_df[['match_id', 'source_system', 'field_identifier', 'title']]
    
    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    report_df.to_csv(OUTPUT_CSV, index=False)
    
    logging.info(f"✅ Saved duplicates report to {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
