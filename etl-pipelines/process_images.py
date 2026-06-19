import os
import re
import shutil
from pathlib import Path
import pandas as pd
from tqdm import tqdm
from PIL import Image, ImageFile, ImageOps, TiffImagePlugin
from concurrent.futures import ThreadPoolExecutor, as_completed

# Configure PIL to allow large images and truncated files
Image.MAX_IMAGE_PIXELS = None
ImageFile.LOAD_TRUNCATED_IMAGES = True

# Overcome the 'More samples per pixel than can be decoded' error
if hasattr(TiffImagePlugin, 'MAX_SAMPLESPERPIXEL'):
    TiffImagePlugin.MAX_SAMPLESPERPIXEL = 10

# --- CONFIGURATION ---
DIGITAL_IMAGES_DIR = Path('/app/data/raw/digital_images')
OUTPUT_DIR = Path('/app/data/gold/images')
PARQUET_FILE = Path('/app/data/gold/unified_catalog_normalized.parquet')

# Global caches for threads
existing_folders = {}
existing_dest_images = set()

def normalize_name(s):
    if not s: return ""
    s = str(s).lower().strip()
    # Normalize common characters to align filename with field_identifier
    s = re.sub(r"[()\[\]'_]", ' ', s)
    s = re.sub(r'[.\s,-]+', '.', s)
    s = s.strip('.')
    return s

def process_single_row(row):
    identifier = row.get('field_identifier')
    source_system = row.get('source_system')
    
    if pd.isna(identifier) or not identifier:
        return 'skipped', [], []
        
    identifier_str = str(identifier).strip()
    id_parts = [p.strip() for p in identifier_str.split(';') if p.strip()]
    
    if source_system == 'Proficio':
        search_subdirs = ['Islandora_Objects', 'Islandora_Converted_Objects']
    elif source_system == 'Alma':
        search_subdirs = ['Islandora_Library', 'Islandora_Converted_Objects']
    else:
        search_subdirs = ['Islandora_Objects', 'Islandora_Library', 'Islandora_Converted_Objects', 'Islandora_Education']
        
    newly_copied = []
    already_exists = []
    errors = []
    
    for part in id_parts:
        if len(part) > 200:
            continue
            
        import re
        dest_filename = f"{re.sub(r'[^a-zA-Z0-9.-]', '_', part)}.jpg"
        dest_path = OUTPUT_DIR / dest_filename
            
        found = False
        norm_candidate = normalize_name(part)
        
        for subdir in search_subdirs:
            if found:
                break
                
            if norm_candidate in existing_folders.get(subdir, {}):
                real_folder_name = existing_folders[subdir][norm_candidate]
                obj_dir = DIGITAL_IMAGES_DIR / subdir / real_folder_name
                if obj_dir.is_dir():
                    valid_exts = {'.tif', '.tiff', '.jpg', '.jpeg', '.png'}
                    try:
                        # Do ONE fast network call to list the directory, rather than 10 recursive globs!
                        image_files = [
                            f for f in obj_dir.iterdir() 
                            if f.is_file() and f.suffix.lower() in valid_exts
                        ]
                    except Exception as e:
                        image_files = []
                              
                    image_files = [f for f in image_files if not f.name.startswith('.')]
                    
                    if image_files:
                        for i, best_file in enumerate(sorted(image_files)):
                            try:
                                with Image.open(best_file) as img:
                                    img = ImageOps.exif_transpose(img)
                                    rgb_img = img.convert('RGB')
                                    max_size = 1200
                                    if max(rgb_img.size) > max_size:
                                        try:
                                            resample_method = Image.Resampling.LANCZOS
                                        except AttributeError:
                                            resample_method = Image.ANTIALIAS
                                        rgb_img.thumbnail((max_size, max_size), resample_method)
                                        
                                    base_name = re.sub(r'[^a-zA-Z0-9.-]', '_', part)
                                    if i == 0:
                                        dest_filename = f"{base_name}.jpg"
                                    else:
                                        dest_filename = f"{base_name}_{i}.jpg"
                                        
                                    dest_path = OUTPUT_DIR / dest_filename
                                    
                                    if dest_filename not in existing_dest_images:
                                        rgb_img.save(dest_path, 'JPEG', quality=80)
                                        newly_copied.append(dest_filename)
                                    else:
                                        already_exists.append(dest_filename)
                                        
                            except Exception as e:
                                errors.append(f"{best_file.name}: {e}")
                                
                        found = True
                        break
                            
    if newly_copied or already_exists:
        return 'success', newly_copied, already_exists
    elif errors:
        return 'error', errors, []
    else:
        return 'not_found', [], []

if __name__ == "__main__":
    print("--- 📸 STARTING LOCAL IMAGE INGESTION PIPELINE (PARALLEL MODE) ---")
    
    if not PARQUET_FILE.exists():
        print(f"❌ Normalized catalog not found at {PARQUET_FILE}. Run normalization script first.")
        exit(1)
        
    if not DIGITAL_IMAGES_DIR.exists():
        print(f"❌ Digital Images directory not found at {DIGITAL_IMAGES_DIR}. Make sure the volume is mounted.")
        exit(1)
        
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # 1. Load catalog records
    df = pd.read_parquet(PARQUET_FILE)
    print(f"Loaded {len(df)} records from catalog.")
    
    # Cache the list of existing folder names in each NFS subdirectory to prevent slow NFS roundtrips
    print("Caching NFS directory structure...")
    subdirs_to_cache = ['Islandora_Objects', 'Islandora_Library', 'Islandora_Converted_Objects', 'Islandora_Education']
    for subdir in subdirs_to_cache:
        path = DIGITAL_IMAGES_DIR / subdir
        if path.exists() and path.is_dir():
            try:
                # Use a dict mapped by normalized name for robust O(1) lookups
                folders = os.listdir(path)
                existing_folders[subdir] = {normalize_name(f): f for f in folders}
                print(f"  Cached {len(existing_folders[subdir])} folders in {subdir}")
            except Exception as e:
                print(f"  ⚠️ Failed to cache {subdir}: {e}")
                existing_folders[subdir] = {}
        else:
            existing_folders[subdir] = {}
    
    # Cache existing local output images to prevent slow exists() filesystem lookups
    print("Caching local processed images...")
    existing_dest_images = set(f.name for f in OUTPUT_DIR.glob('*.jpg'))
    print(f"  Cached {len(existing_dest_images)} processed images.")
    
    # 2. Iterate and locate image files using parallel threads
    copied_count = 0
    already_exists_count = 0
    not_found_count = 0
    error_count = 0
    
    rows = [row for _, row in df.iterrows()]
    
    max_workers = 32
    print(f"Processing images using {max_workers} threads (Utilizing new RAM capacity)...")
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(process_single_row, r): r for r in rows}
        
        for fut in tqdm(as_completed(futures), total=len(futures), desc="Processing images"):
            res, detail1, detail2 = fut.result()
            if res == 'success':
                copied_count += len(detail1)
                already_exists_count += len(detail2)
                for d in detail1:
                    existing_dest_images.add(d)
            elif res == 'not_found':
                not_found_count += 1
            elif res == 'error':
                error_count += 1
                for err in detail1:
                    # Silence standard warning outputs in threads
                    if "DecompressionBombWarning" not in str(err):
                        print(f"⚠️ {err}")
            
    print(f"\n🏁 Finished Ingestion:")
    print(f"   Newly Copied Images: {copied_count}")
    print(f"   Already Existed: {already_exists_count}")
    print(f"   Not Found in NFS: {not_found_count}")
    print(f"   Errors: {error_count}")
    print(f"   Total JPEGs stored locally: {len(list(OUTPUT_DIR.glob('*.jpg')))}")

    # 3. Update the catalog with image counts
    print("Updating catalog with image counts...")
    
    # Refresh the set so it sees all the newly downloaded variants!
    final_existing_images = {f.name for f in OUTPUT_DIR.glob('*.jpg')}
    
    def check_image_count(identifier):
        if pd.isna(identifier) or not identifier:
            return 0
        identifier_str = str(identifier).strip()
        id_parts = [p.strip() for p in identifier_str.split(';') if p.strip()]
        for part in id_parts:
            if len(part) <= 200:
                base = f"{re.sub(r'[^a-zA-Z0-9.-]', '_', part)}"
                if f"{base}.jpg" in final_existing_images:
                    count = 1
                    while f"{base}_{count}.jpg" in final_existing_images:
                        count += 1
                    return count
        return 0

    df['image_count'] = df['field_identifier'].apply(check_image_count)
    df['has_image'] = df['image_count'] > 0
    
    # Save the updated dataframe back to parquet
    df.to_parquet(PARQUET_FILE, index=False)
    print("✅ Catalog updated with image_count and has_image flags.")
