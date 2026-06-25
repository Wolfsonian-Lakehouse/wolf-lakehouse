import os
import re
import shutil
import subprocess
from pathlib import Path
import pandas as pd
from tqdm import tqdm
from concurrent.futures import ThreadPoolExecutor, as_completed

# --- CONFIGURATION ---
AUDIO_DIR = Path('/app/data/raw/digital_images_staging/Islandora_Audio')
OUTPUT_DIR = Path('/app/data/gold/audio')
PARQUET_FILE = Path('/app/data/gold/unified_catalog_normalized.parquet')

existing_dest_audio = set()

def normalize_name(s):
    if not s: return ""
    s = str(s).lower().strip()
    # Normalize common characters to align filename with field_identifier
    s = re.sub(r"[()\[\]'_]", ' ', s)
    s = re.sub(r'[.\s,-]+', '.', s)
    s = s.strip('.')
    return s

def process_single_row(identifier):
    if pd.isna(identifier) or not identifier:
        return 'skipped', [], []
        
    identifier_str = str(identifier).strip()
    id_parts = [p.strip() for p in identifier_str.split(';') if p.strip()]
    
    newly_copied = []
    already_exists = []
    errors = []
    
    for part in id_parts:
        if len(part) > 200:
            continue
            
        base_name = re.sub(r'[^a-zA-Z0-9.-]', '_', part)
        
        obj_dir = None
        try:
            candidate = AUDIO_DIR / part
            if candidate.exists() and candidate.is_dir():
                obj_dir = candidate
        except OSError:
            pass
            
        if not obj_dir:
            try:
                candidate = AUDIO_DIR / base_name
                if candidate.exists() and candidate.is_dir():
                    obj_dir = candidate
            except OSError:
                pass
                
        if not obj_dir:
            continue
                
        valid_exts = {'.mp3', '.wav'}
        try:
            audio_files = [
                f for f in obj_dir.iterdir() 
                if f.is_file() and f.suffix.lower() in valid_exts
            ]
        except Exception as e:
            audio_files = []
                  
        audio_files = [f for f in audio_files if not f.name.startswith('.')]
        
        if audio_files:
            for i, best_file in enumerate(sorted(audio_files)):
                try:
                    if i == 0:
                        dest_filename = f"{base_name}.mp3"
                    else:
                        dest_filename = f"{base_name}_{i}.mp3"
                        
                    dest_path = OUTPUT_DIR / dest_filename
                    
                    if dest_filename in existing_dest_audio:
                        already_exists.append(dest_filename)
                        continue

                    # Compress using ffmpeg
                    cmd = ['ffmpeg', '-y', '-i', str(best_file), '-codec:a', 'libmp3lame', '-b:a', '128k', str(dest_path)]
                    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                    
                    if result.returncode != 0:
                        errors.append(f"{best_file.name}: ffmpeg failed: {result.stderr.decode('utf-8')[:100]}")
                        continue

                    newly_copied.append(dest_filename)
                            
                except Exception as e:
                    errors.append(f"{best_file.name}: {e}")
                    
    if newly_copied or already_exists:
        return 'success', newly_copied, already_exists
    elif errors:
        return 'error', errors, []
    else:
        return 'not_found', [], []

def main():
    print("--- 🎵 STARTING LOCAL AUDIO INGESTION PIPELINE ---")
    
    if not PARQUET_FILE.exists():
        print(f"❌ Normalized catalog not found at {PARQUET_FILE}. Run normalization script first.")
        exit(1)
        
    if not AUDIO_DIR.exists():
        print(f"❌ Audio directory not found at {AUDIO_DIR}. Make sure the staging volume is mounted.")
        exit(1)
        
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # 1. Load catalog records
    df = pd.read_parquet(PARQUET_FILE)
    print(f"Loaded {len(df)} records from catalog.")
    
    print("Caching local processed audio files...")
    existing_dest_audio.update(f.name for f in OUTPUT_DIR.iterdir() if f.is_file())
    print(f"  Cached {len(existing_dest_audio)} processed audio files.")
    
    # 2. Iterate and locate audio files using parallel threads
    copied_count = 0
    already_exists_count = 0
    not_found_count = 0
    error_count = 0
    
    identifiers = df['field_identifier'].tolist()
    
    max_workers = 8
    print(f"Processing audio using {max_workers} threads...")
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(process_single_row, identifier): identifier for identifier in identifiers}
        
        for fut in tqdm(as_completed(futures), total=len(futures), desc="Processing audio"):
            res, detail1, detail2 = fut.result()
            if res == 'success':
                copied_count += len(detail1)
                already_exists_count += len(detail2)
                for d in detail1:
                    existing_dest_audio.add(d)
            elif res == 'not_found':
                not_found_count += 1
            elif res == 'error':
                error_count += 1
                for err in detail1:
                    print(f"⚠️ {err}")
            
    print(f"\n🏁 Finished Audio Ingestion:")
    print(f"   Newly Copied Files: {copied_count}")
    print(f"   Already Existed: {already_exists_count}")
    print(f"   Not Found in NFS: {not_found_count}")
    print(f"   Errors: {error_count}")
    print(f"   Total Audio stored locally: {len(list(OUTPUT_DIR.iterdir()))}")

    # 3. Update the catalog with audio counts
    print("Updating catalog with audio counts...")
    
    final_existing_audio = {f.name for f in OUTPUT_DIR.iterdir() if f.is_file()}
    
    def check_audio_count(identifier):
        if pd.isna(identifier) or not identifier:
            return 0
        identifier_str = str(identifier).strip()
        id_parts = [p.strip() for p in identifier_str.split(';') if p.strip()]
        for part in id_parts:
            if len(part) <= 200:
                base = f"{re.sub(r'[^a-zA-Z0-9.-]', '_', part)}"
                if f"{base}.mp3" in final_existing_audio or f"{base}.wav" in final_existing_audio:
                    count = 1
                    while f"{base}_{count}.mp3" in final_existing_audio or f"{base}_{count}.wav" in final_existing_audio:
                        count += 1
                    return count
        return 0

    df['audio_count'] = df['field_identifier'].apply(check_audio_count)
    df['has_audio'] = df['audio_count'] > 0
    
    df.to_parquet(PARQUET_FILE, index=False)
    print("✅ Catalog updated with audio_count and has_audio flags.")


if __name__ == "__main__":
    main()
