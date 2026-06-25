import pandas as pd
import logging
import sys
from pathlib import Path

SILVER_ALMA = Path('/app/data/silver/alma_silver.parquet')
OUTPUT_CSV = Path('/app/data/gold/alma_workbench_export.csv')

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')

def main():
    if not SILVER_ALMA.exists():
        logging.warning("No Alma Silver data found to export.")
        return
        
    logging.info(f"📤 Loading Alma Silver data from {SILVER_ALMA}")
    df = pd.read_parquet(SILVER_ALMA)
    
    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    
    logging.info(f"💾 Exporting {len(df)} Alma records to Workbench CSV...")
    df.to_csv(OUTPUT_CSV, index=False, encoding='utf-8')
    
    logging.info(f"✅ Successfully exported Alma Workbench CSV to {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
