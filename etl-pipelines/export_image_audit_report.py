import os
import re
import pandas as pd
import logging
from pathlib import Path

# Paths
UNIFIED_CATALOG = Path('/app/data/gold/unified_catalog_normalized.parquet')
DIGITAL_IMAGES_DIR = Path('/app/data/raw/digital_images')
PROCESSED_IMAGES_DIR = Path('/app/data/gold/images')
OUTPUT_CSV = Path('/app/data/gold/image_audit_report.csv')

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def normalize_name(s):
    if not s: return ""
    s = str(s).lower().strip()
    s = re.sub(r"[()\[\]'_]", ' ', s)
    s = re.sub(r'[.\s,-]+', '.', s)
    s = s.strip('.')
    return s

def run_audit():
    logging.info("--- 📊 STARTING IMAGE COMPLETENESS AUDIT ---")
    
    if not UNIFIED_CATALOG.exists():
        logging.error(f"Unified catalog not found at {UNIFIED_CATALOG}")
        return

    # 1. Load catalog records
    df = pd.read_parquet(UNIFIED_CATALOG)
    logging.info(f"Loaded {len(df)} records from catalog.")
    
    # 2. Cache NFS folder structure for fast lookup
    logging.info("Caching NFS directory structure (Raw Images)...")
    existing_folders = {}
    subdirs_to_cache = ['Islandora_Objects', 'Islandora_Library', 'Islandora_Converted_Objects', 'Islandora_Education']
    
    for subdir in subdirs_to_cache:
        path = DIGITAL_IMAGES_DIR / subdir
        if path.exists() and path.is_dir():
            try:
                folders = os.listdir(path)
                existing_folders[subdir] = {normalize_name(f): f for f in folders}
                logging.info(f"  Cached {len(existing_folders[subdir])} folders in {subdir}")
            except Exception as e:
                logging.warning(f"  Failed to cache {subdir}: {e}")
                existing_folders[subdir] = {}
        else:
            existing_folders[subdir] = {}
            
    # 3. Cache processed images
    logging.info("Caching Processed Gold Images...")
    if PROCESSED_IMAGES_DIR.exists():
        existing_processed = set(f.name for f in PROCESSED_IMAGES_DIR.glob('*.jpg'))
    else:
        existing_processed = set()
    logging.info(f"  Cached {len(existing_processed)} processed thumbnail JPEGs.")

    # 4. Process each row to generate audit
    audit_data = []
    
    for _, row in df.iterrows():
        identifier = row.get('field_identifier')
        source_system = row.get('source_system', 'Unknown')
        title = row.get('title', 'Unknown')
        has_image_flag = row.get('has_image', False) # If already calculated by process_images.py
        
        raw_found = False
        raw_path = ""
        processed_found = False
        
        if pd.notna(identifier) and identifier:
            identifier_str = str(identifier).strip()
            id_parts = [p.strip() for p in identifier_str.split(';') if p.strip()]
            
            # Determine where to look for raw images based on system
            if source_system == 'Proficio':
                search_subdirs = ['Islandora_Objects', 'Islandora_Converted_Objects']
            elif source_system == 'Alma':
                search_subdirs = ['Islandora_Library', 'Islandora_Converted_Objects']
            else:
                search_subdirs = ['Islandora_Objects', 'Islandora_Library', 'Islandora_Converted_Objects', 'Islandora_Education']
            
            # Check for raw images and processed images
            for part in id_parts:
                if len(part) > 200: continue
                
                # Check processed images
                dest_filename = f"{re.sub(r'[^a-zA-Z0-9.-]', '_', part)}.jpg"
                if dest_filename in existing_processed:
                    processed_found = True
                    
                # Check raw images
                if not raw_found:
                    norm_candidate = normalize_name(part)
                    for subdir in search_subdirs:
                        if norm_candidate in existing_folders.get(subdir, {}):
                            real_folder_name = existing_folders[subdir][norm_candidate]
                            raw_found = True
                            raw_path = f"{subdir}/{real_folder_name}"
                            break
                            
        audit_data.append({
            'Identifier': identifier,
            'Title': title,
            'Source System': source_system,
            'Raw Image Found': 'Yes' if raw_found else 'No',
            'Raw Image Path': raw_path,
            'Processed Image Found': 'Yes' if processed_found else 'No'
        })
        
    # 5. Build report DataFrame and export
    audit_df = pd.DataFrame(audit_data)
    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    audit_df.to_csv(OUTPUT_CSV, index=False)
    
    # Calculate completeness
    total = len(audit_df)
    raw_completeness = len(audit_df[audit_df['Raw Image Found'] == 'Yes'])
    proc_completeness = len(audit_df[audit_df['Processed Image Found'] == 'Yes'])
    
    raw_pct = (raw_completeness / total) * 100 if total > 0 else 0
    proc_pct = (proc_completeness / total) * 100 if total > 0 else 0
    
    logging.info("--- 📈 COMPLETENESS SUMMARY ---")
    logging.info(f"Total Records: {total}")
    logging.info(f"Records with Raw Image in NFS: {raw_completeness} ({raw_pct:.2f}%)")
    logging.info(f"Records with Processed Thumbnail: {proc_completeness} ({proc_pct:.2f}%)")
    logging.info(f"Audit report saved to {OUTPUT_CSV}")

def main():
    run_audit()


if __name__ == "__main__":
    main()
