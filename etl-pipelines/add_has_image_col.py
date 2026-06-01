import pandas as pd
from pathlib import Path

OUTPUT_DIR = Path('/app/data/gold/images')
PARQUET_FILE = Path('/app/data/gold/unified_catalog_normalized.parquet')

print("Loading parquet file...")
df = pd.read_parquet(PARQUET_FILE)

print("Caching local processed images...")
existing_dest_images = set(f.name for f in OUTPUT_DIR.glob('*.jpg'))

def check_has_image(identifier):
    if pd.isna(identifier) or not identifier:
        return False
    identifier_str = str(identifier).strip()
    id_parts = [p.strip() for p in identifier_str.split(';') if p.strip()]
    primary_id = id_parts[0] if id_parts else identifier_str
    if len(primary_id) > 200:
        return False
    return f"{primary_id}.jpg" in existing_dest_images

print("Updating catalog with has_image flag...")
df['has_image'] = df['field_identifier'].apply(check_has_image)

df.to_parquet(PARQUET_FILE, index=False)
print("✅ Catalog updated with has_image flag.")
