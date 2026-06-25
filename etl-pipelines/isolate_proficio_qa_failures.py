import pandas as pd
import logging
import sys
import json
from pathlib import Path

MASTER_SILVER = Path('/app/data/silver/proficio_silver.parquet')
QA_FAILURES_PARQUET = Path('/app/data/gold/proficio_qa_failures.parquet')

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def run_qa_checks(row):
    errors = []
    
    # 1. Must have an identifier (either access_nbr or field_identifier)
    identifier = str(row.get('field_identifier', row.get('access_nbr', ''))).strip()
    if not identifier or identifier == 'nan':
        errors.append("Identifier is missing")
        
    # 2. Must have a title
    title = str(row.get('title', '')).strip()
    if not title or title == 'nan':
        errors.append("Title is missing")
        
    return errors

def main():
    if not MASTER_SILVER.exists():
        logging.warning("No Master Silver file found. Skipping QA.")
        return
        
    logging.info("--- 🔍 RUN QA CHECKS ---")
    df_master = pd.read_parquet(MASTER_SILVER)
    
    df_master['qa_errors'] = df_master.apply(run_qa_checks, axis=1)
    df_master['qa_pass'] = df_master['qa_errors'].apply(lambda x: len(x) == 0)
    
    df_pass = df_master[df_master['qa_pass']].copy()
    df_fail = df_master[~df_master['qa_pass']].copy()
    
    logging.info(f"QA Results: {len(df_pass)} rows passed, {len(df_fail)} rows failed.")

    QA_FAILURES_PARQUET.parent.mkdir(parents=True, exist_ok=True)
    if not df_fail.empty:
        df_fail['qa_errors_str'] = df_fail['qa_errors'].apply(lambda x: " | ".join(x))
        df_fail.astype(str).drop(columns=['qa_errors']).to_parquet(QA_FAILURES_PARQUET, index=False)
        logging.info(f"💾 Saved {len(df_fail)} failed records to {QA_FAILURES_PARQUET}")
        
    # Overwrite master with qa flags so next step doesn't re-calculate
    df_master['qa_errors'] = df_master['qa_errors'].apply(lambda x: " | ".join(x))
    df_master.to_parquet(MASTER_SILVER, index=False)
    
    metrics_path = '/app/data/metrics.json'
    metrics = {}
    if Path(metrics_path).exists():
        try:
            with open(metrics_path, 'r') as f: metrics = json.load(f)
        except: pass
        
    metrics['proficio_qa_failures'] = len(df_fail)
    with open(metrics_path, 'w') as f:
        json.dump(metrics, f)


if __name__ == "__main__":
    main()
