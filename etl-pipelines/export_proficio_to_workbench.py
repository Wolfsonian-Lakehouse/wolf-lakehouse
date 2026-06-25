import pandas as pd
import logging
from pathlib import Path

# Setup simple logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

GOLD_PARQUET = Path('/app/data/gold/missing_objects.parquet')
OUTPUT_CSV = Path('/app/data/export/workbench_upload.csv')

def export_for_workbench():
    if not GOLD_PARQUET.exists():
        logging.error(f"❌ Cannot find Parquet file at {GOLD_PARQUET}. Did the transformation script run successfully?")
        return

    logging.info(f"Reading clean data from {GOLD_PARQUET}")
    df = pd.read_parquet(GOLD_PARQUET)
    
    # You can add any Workbench-specific final tweaks here if needed
    
    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUTPUT_CSV, index=False, encoding='utf-8', errors='replace')
    logging.info(f"✅ Successfully generated Workbench CSV at {OUTPUT_CSV}")

def main():
    export_for_workbench()


if __name__ == "__main__":
    main()
