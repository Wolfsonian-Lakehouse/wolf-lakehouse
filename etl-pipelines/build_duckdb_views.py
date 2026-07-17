import duckdb
import logging
import glob
from pathlib import Path

# Logging setup
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')

def create_views():
    DB_PATH = '/app/data/wolfsonian_lakehouse.duckdb'
    logging.info(f"🦆 Connecting to DuckDB database at {DB_PATH}")
    
    # Connect to DuckDB
    try:
        con = duckdb.connect(DB_PATH)
    except duckdb.IOException as e:
        if "lock" in str(e).lower():
            logging.warning("⚠️ DuckDB file is locked (likely by Metabase).")
            logging.warning("Skipping view recreation. Metabase will automatically query the freshly updated Parquet files!")
            import sys
            return
        else:
            raise e
    
    views_to_create = {
        'proficio_silver': '/app/data/silver/proficio_silver.parquet',
        'comparison_proficio': '/app/data/gold/comparison_proficio.parquet',  
        'alma_silver': '/app/data/silver/alma_silver.parquet',
        'islandora_raw': '/app/data/raw/islandora/islandora_lookup.parquet',
        'proficio_missing_objects': '/app/data/gold/missing_objects.parquet',
        'proficio_qa_failures': '/app/data/gold/proficio_qa_failures.parquet',
        'gold_unified_catalog': '/app/data/gold/unified_catalog.parquet',
        'gold_normalized_catalog': '/app/data/gold/unified_catalog_normalized.parquet',
        'comparison_alma': '/app/data/gold/comparison_alma.parquet',
        'image_audit_report': '/app/data/gold/image_audit_report.csv',
        'ga4_metrics': '/app/data/gold/ga4_metrics.parquet'
    }
    snapshot_files = glob.glob('/app/data/gold/snapshots/history_*.parquet')
    for parquet_path in snapshot_files:
        view_name = Path(parquet_path).stem
        views_to_create[view_name] = parquet_path
        
    for view_name, parquet_path in views_to_create.items():
        if Path(parquet_path).exists():
            logging.info(f"Creating view '{view_name}' pointing to {parquet_path}")
            if parquet_path.endswith('.csv'):
                con.execute(f"CREATE OR REPLACE VIEW {view_name} AS SELECT * FROM read_csv_auto('{parquet_path}')")
            else:
                con.execute(f"CREATE OR REPLACE VIEW {view_name} AS SELECT * FROM read_parquet('{parquet_path}')")
        else:
            logging.warning(f"⚠️ Parquet file not found: {parquet_path}. Skipping view '{view_name}'.")
            
    # List created views for confirmation
    tables = con.execute("SHOW TABLES").df()
    logging.info(f"✅ Successfully registered tables in DuckDB:")
    for _, row in tables.iterrows():
        logging.info(f"  - {row['name']}")
        
    con.close()
    logging.info("DuckDB setup complete! Ready for Metabase.")

def main():
    create_views()


if __name__ == "__main__":
    main()
