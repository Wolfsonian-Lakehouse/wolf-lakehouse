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
    print(f"❌ Error: Configuration file not found at {config_path}")
    sys.exit(1)

config.read(config_path)

def get_proficio_connection():
    server = config['proficio']['server'].strip()
    database = config['proficio']['database'].strip()
    username = config['proficio']['username'].strip()
    keytab = config['proficio']['keytab_path'].strip()

    print(f"🔑 Generating Kerberos ticket for {username}...")
    kinit_process = subprocess.run(
        ['kinit','-k','-t', keytab, username],
        text=True,
        capture_output=True
    )

    if kinit_process.returncode != 0:
        print(f"❌ Kerberos Auth Failed: {kinit_process.stderr}")
        sys.exit(1)

    print("✅ Secure Ketyab Authentication Success!!")

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
    print(f"🚀 Connecting to Proficio to dump '{table_name}'...")

    watermark_path = '/app/data/watermark_proficio.json'
    last_watermark = None
    if os.path.exists(watermark_path):
        try:
            with open(watermark_path, 'r') as f:
                data = json.load(f)
                last_watermark = data.get(table_name)
        except json.JSONDecodeError:
            pass

    if last_watermark:
        print(f"💧 Incremental Extract: Fetching records modified since {last_watermark}")
        query = f"SELECT * FROM {table_name} WHERE change_dte > '{last_watermark}' OR add_dte > '{last_watermark}'"
    else:
        print("💧 Full Extract: No watermark found, fetching all records")
        query = f"SELECT * FROM {table_name}"

    try:
        with engine.connect() as conn:
            df = pd.read_sql(sa.text(query), conn)

        extracted_count = len(df)
        print(f"📊 Query complete. Found {extracted_count} rows.")
        
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
            print(f"⚠️ No new data found in '{table_name}'.")
            return

        # Update watermark based on max dates
        if 'change_dte' in df.columns and 'add_dte' in df.columns:
            max_change = df['change_dte'].max()
            max_add = df['add_dte'].max()
            
            dates = []
            if pd.notnull(max_change): dates.append(max_change)
            if pd.notnull(max_add): dates.append(max_add)
            
            if dates:
                # Format exactly as SQL Server datetime
                new_watermark = max(dates).strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
                if not last_watermark or new_watermark > last_watermark:
                    with open(watermark_path, 'w') as f:
                        json.dump({table_name: new_watermark}, f)
                    print(f"💧 Updated watermark to {new_watermark}")

        # Save to Delta File
        os.makedirs(incremental_dir, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = os.path.join(incremental_dir, f"delta_{timestamp}.parquet")
        
        df.to_parquet(output_path, index=False)
        print(f"✅ Success! Dumped {len(df)} new rows to {output_path}")

    except Exception as e:
        print(f"\n❌ Connection Error:\n{str(e)}")

if __name__ == "__main__":
    raw_data_dump("objects", "/app/data/raw/proficio/incremental")
