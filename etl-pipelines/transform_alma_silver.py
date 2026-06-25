import pandas as pd
import logging
import json
import sys
import os
import re
from pathlib import Path

# Setup paths
RAW_ALMA = Path('/app/data/raw/alma/alma_raw_dump.parquet')
SILVER_ALMA = Path('/app/data/silver/alma_silver.parquet')

# Ensure directory exists
SILVER_ALMA.parent.mkdir(parents=True, exist_ok=True)

# Logging
logger = logging.getLogger()
if logger.handlers:
    for handler in logger.handlers:
        logger.removeHandler(handler)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()
    ]
)
logging.info("🚀 Alma Silver Transformer initialized.")

def main():
    if not RAW_ALMA.exists():
        logging.warning(f"Alma raw file not found at {RAW_ALMA}. Ensure extract_alma_raw.py runs first.")
        return
        
    logging.info(f"📥 Loading raw Alma data from {RAW_ALMA}")
    try:
        df = pd.read_parquet(RAW_ALMA)
        logging.info(f"Loaded {len(df)} raw records with {len(df.columns)} columns.")
    except Exception as e:
        logging.error(f"Failed to read raw parquet: {e}")
        raise RuntimeError("Task Failed. Check logs for details.")
        
    logging.info("🛠️ Applying Silver transformations...")
    
    # 0. MAP RAW COLUMNS TO WORKBENCH STANDARDS
    alma_rename_map = {
        'new_907_full': 'field_identifier',
        'new_001_ctrl': 'alma_identifier',
        'new_598_a': 'field_credit_line',
        'new_655_a': 'field_genre',
        'new_500_a': 'field_description_long',
        'new_561_a': 'field_collection_note',
        'new_260_a': 'field_place_published',
        'new_546_a': 'field_language',
        'new_610_a': 'field_subjects_name',
        'new_008_ctrl': 'country_code',             
        'new_006_ctrl': 'field_lvr',                
        'new_650_z': 'field_geographic_subject',    
        'new_650_y': 'field_temporal_subject',      
    }
    df = df.rename(columns=alma_rename_map)

    # Construct EDTF Date (field_edtf_date_created)
    # Prefer 264$c (modern production date) over 260$c (legacy imprint date)
    if 'new_264_c' in df.columns or 'new_260_c' in df.columns:
        def get_date(row):
            d264 = str(row['new_264_c']).strip() if 'new_264_c' in row and pd.notna(row['new_264_c']) else ''
            d260 = str(row['new_260_c']).strip() if 'new_260_c' in row and pd.notna(row['new_260_c']) else ''
            val = d264 or d260
            # Clean up MARC date punctuation (e.g., [1934], 1934., c1934)
            if val:
                val = re.sub(r'[\[\]\(\)\.\,c]', '', val).strip()
            return val if val else None
        
        df['field_edtf_date_created'] = df.apply(get_date, axis=1)
    
    # Append all creators to field_linked_agent
    def merge_creators(row):
        creators = []
        # Add primary and all alternative author fields mapped in the legacy notebook
        for field in ['new_260_b', 'new_100_a', 'new_100_q', 'new_110_a', 'new_111_a', 'new_710_a', 'new_700_a', 'new_700_q']:
            if field in row and pd.notna(row[field]):
                val = str(row[field]).strip()
                if val: creators.append(val)
        return ' | '.join(creators) if creators else pd.NA
        
    df['field_linked_agent'] = df.apply(merge_creators, axis=1)
    
    # Pass through pre-joined subject from raw layer
    if 'raw_field_subject' in df.columns:
        df['field_subject'] = df['raw_field_subject']
    else:
        df['field_subject'] = pd.NA

    # Pass through pre-joined note from raw layer
    if 'raw_field_note' in df.columns:
        df['field_note'] = df['raw_field_note']
    else:
        df['field_note'] = pd.NA

    # Construct field_subject_pictured
    def merge_subjects_pictured(row):
        subjects = []
        for field in ['new_965_a', 'new_965_x', 'new_965_z', 'new_965_y']:
            if field in row and pd.notna(row[field]):
                val = str(row[field]).strip()
                if val: subjects.append(val)
        return ' | '.join(subjects) if subjects else pd.NA
        
    df['field_subject_pictured'] = df.apply(merge_subjects_pictured, axis=1)

    # Extract three_letter_code
    if 'country_code' in df.columns:
        df['three_letter_code'] = df['country_code'].str[15:18]
    
    # Construct a composite title if the pieces exist
    if 'new_245_a' in df.columns:
        b_col = df['new_245_b'].fillna('') if 'new_245_b' in df.columns else ''
        df['title'] = df['new_245_a'].fillna('') + ' ' + b_col
        df['title'] = df['title'].str.strip()
        
    # Construct physical extent (300 $a, $b, $c)
    if 'new_300_a' in df.columns:
        b_col = df['new_300_b'].fillna('') if 'new_300_b' in df.columns else ''
        c_col = df['new_300_c'].fillna('') if 'new_300_c' in df.columns else ''
        
        # Combine a, b, and c with commas
        ext_parts = df['new_300_a'].fillna('') + ', ' + b_col + ', ' + c_col
        # Clean up any weird double commas from empty columns
        df['field_extent'] = ext_parts.str.replace(r',\s*,', ',', regex=True).str.strip(', ').str.strip()
        
    # Add static fields
    df['field_resource_type'] = 'Collection'
    df['field_model'] = 'Paged Content'
    df['field_collection_type'] = 'Library'
    
    # Apply text transformations (from MASTER notebook)
    if 'field_identifier' in df.columns:
        df['field_identifier'] = df['field_identifier'].str.replace('Local', '', regex=False).str.replace('local', '', regex=False).str.replace('@', ' ', regex=False)
    if 'title' in df.columns:
        df['title'] = df['title'].str.replace('/', '', regex=False).str.replace('--', '', regex=False)
    if 'field_genre' in df.columns:
        df['field_genre'] = df['field_genre'].str.replace('.', '', regex=False)
    if 'field_place_published' in df.columns:
        df['field_place_published'] = df['field_place_published'].str.replace(':', '', regex=False)
    if 'field_physical_form' in df.columns:
        df['field_physical_form'] = df['field_physical_form'].str.replace('.', '', regex=False)
    if 'field_language' in df.columns:
        df['field_language'] = df['field_language'].str.replace('.', '', regex=False)
    if 'field_geographic_subject' in df.columns:
        df['field_geographic_subject'] = df['field_geographic_subject'].str.replace('.', '', regex=False)
    
    # 1. Drop completely empty columns (very common in MARC dumps)
    initial_cols = len(df.columns)
    df = df.dropna(axis=1, how='all')
    
    # 2. Convert all columns to strings and strip whitespace, replacing empty strings with NaN
    # We only apply this to object (string) columns to be safe
    str_cols = df.select_dtypes(include=['object']).columns
    for col in str_cols:
        df[col] = df[col].astype(str).str.strip().replace('', pd.NA).replace('nan', pd.NA)
        
    # Drop columns that became completely empty after stripping whitespace
    df = df.dropna(axis=1, how='all')
    
    final_cols = len(df.columns)
    logging.info(f"🧹 Cleaned columns: Dropped {initial_cols - final_cols} empty columns.")
    
    # Save to Silver Layer
    logging.info(f"💾 Saving to Silver Parquet: {SILVER_ALMA}")
    df.to_parquet(SILVER_ALMA, index=False)
    
    # Write metrics
    metrics_path = '/app/data/metrics.json'
    metrics = {}
    if Path(metrics_path).exists():
        try:
            with open(metrics_path, 'r') as f:
                metrics = json.load(f)
        except: pass
    
    metrics['alma_silver_total'] = len(df)
    metrics['alma_silver_columns'] = final_cols
    
    os.makedirs(os.path.dirname(metrics_path), exist_ok=True)
    with open(metrics_path, 'w') as f:
        json.dump(metrics, f)
        
    logging.info("✅ Alma Silver Pipeline Finished!")


if __name__ == "__main__":
    main()
