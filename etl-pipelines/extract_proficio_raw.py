import logging
import pandas as pd
import sqlalchemy as sa
from sqlalchemy.engine import URL
import configparser
import os
import sys
import subprocess
import json
from datetime import datetime

config = configparser.ConfigParser()
config_path = '/app/config.ini'

if not os.path.exists(config_path):
    logging.info(f"❌ Error: Configuration file not found at {config_path}")
    raise RuntimeError("Task Failed. Check logs for details.")

config.read(config_path)

def get_proficio_connection():
    server = config['proficio']['server'].strip()
    database = config['proficio']['database'].strip()
    username = config['proficio']['username'].strip()
    keytab = config['proficio']['keytab_path'].strip()

    logging.info(f"🔑 Generating Kerberos ticket for {username}...")
    kinit_process = subprocess.run(
        ['kinit','-k','-t', keytab, username],
        text=True,
        capture_output=True
    )

    if kinit_process.returncode != 0:
        logging.info(f"❌ Kerberos Auth Failed: {kinit_process.stderr}")
        raise RuntimeError("Task Failed. Check logs for details.")

    logging.info("✅ Secure Ketyab Authentication Success!!")

    connection_url = URL.create(
        drivername="mssql+pyodbc",
        host=server,
        database=database,
        query={
            "driver": "ODBC Driver 18 for SQL Server",
            "Trusted_Connection": "yes",
            "Encrypt": "yes",
            "TrustServerCertificate": "yes"
        }
    )
    return sa.create_engine(connection_url)

def raw_data_dump(table_name, incremental_dir):
    engine = get_proficio_connection()
    logging.info(f"🚀 Connecting to Proficio to dump '{table_name}'...")

    watermark_path = '/app/data/watermark_proficio.json'
    last_watermark = None
    watermark_data = {}
    if os.path.exists(watermark_path):
        try:
            with open(watermark_path, 'r') as f:
                watermark_data = json.load(f)
                last_watermark = watermark_data.get(table_name)
        except json.JSONDecodeError:
            pass

    if last_watermark:
        logging.info(f"💧 Incremental Extract: Fetching records modified since {last_watermark}")
        query = f"SELECT * FROM {table_name} WHERE change_dte > '{last_watermark}' OR add_dte > '{last_watermark}'"
    else:
        logging.info("💧 Full Extract: No watermark found, fetching all records")
        query = f"SELECT * FROM {table_name}"

    try:
        with engine.connect() as conn:
            df = pd.read_sql(sa.text(query), conn)

        extracted_count = len(df)
        logging.info(f"📊 Query complete. Found {extracted_count} rows.")
        
        # Save metrics
        metrics_path = '/app/data/metrics.json'
        metrics = {}
        if os.path.exists(metrics_path):
            try:
                with open(metrics_path, 'r') as f:
                    metrics = json.load(f)
            except:
                pass
        metrics['proficio_extracted'] = extracted_count
        os.makedirs(os.path.dirname(metrics_path), exist_ok=True)
        with open(metrics_path, 'w') as f:
            json.dump(metrics, f)

        if df.empty:
            logging.info(f"⚠️ No new data found in '{table_name}'.")
            return

        # Update watermark based on max dates
        if 'change_dte' in df.columns and 'add_dte' in df.columns:
            max_change = df['change_dte'].max()
            max_add = df['add_dte'].max()
            
            dates = []
            if pd.notnull(max_change): dates.append(max_change)
            if pd.notnull(max_add): dates.append(max_add)
            
            if dates:
                # Format keeping full microsecond precision to avoid truncation loops
                new_watermark = max(dates).strftime('%Y-%m-%d %H:%M:%S.%f')
                if not last_watermark or new_watermark > last_watermark:
                    watermark_data[table_name] = new_watermark
                    with open(watermark_path, 'w') as f:
                        json.dump(watermark_data, f)
                    logging.info(f"💧 Updated watermark to {new_watermark}")

        # Save to Delta File
        os.makedirs(incremental_dir, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = os.path.join(incremental_dir, f"delta_{timestamp}.parquet")
        
        df.to_parquet(output_path, index=False)
        logging.info(f"✅ Success! Dumped {len(df)} new rows to {output_path}")

    except Exception as e:
        logging.info(f"\n❌ Connection Error:\n{str(e)}")

def main():
    raw_data_dump("objects", "/app/data/raw/proficio/incremental")


if __name__ == "__main__":
    main()
