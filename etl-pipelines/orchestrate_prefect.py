import duckdb
import logging
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
            sys.exit(0)
        else:
            raise e
    
    # Define our tables/views and their Parquet sources
    views_to_create = {
        'proficio_silver': '/app/data/silver/proficio_silver.parquet',
        'alma_silver': '/app/data/silver/alma_silver.parquet',
        'islandora_raw': '/app/data/raw/islandora/islandora_lookup.parquet',
        'proficio_missing_objects': '/app/data/gold/missing_objects.parquet',
        'proficio_qa_failures': '/app/data/gold/proficio_qa_failures.parquet',
        'gold_unified_catalog': '/app/data/gold/unified_catalog.parquet',
        'gold_normalized_catalog': '/app/data/gold/unified_catalog_normalized.parquet'
    }
    
    for view_name, parquet_path in views_to_create.items():
        if Path(parquet_path).exists():
            logging.info(f"Creating view '{view_name}' pointing to {parquet_path}")
            # CREATE OR REPLACE VIEW allows Metabase to see it instantly without duplicating data
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

if __name__ == "__main__":
    create_views()
