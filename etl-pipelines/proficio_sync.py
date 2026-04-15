import pandas as pd
import sqlalchemy as sa
import urllib
import configparser
import os
import sys

# 1. Load Configuration
config = configparser.ConfigParser()
config_path = '/app/config.ini'

if not os.path.exists(config_path):
    print(f"❌ Error: Configuration file not found at {config_path}")
    sys.exit(1)

config.read(config_path)

def get_proficio_connection():
    try:
        server = config['proficio']['server']
        database = config['proficio']['database']
        username = config['proficio']['username']
        password = config['proficio']['password']
    except KeyError as e:
        print(f"❌ Error: Missing key in config.ini: {e}")
        sys.exit(1)

    # Building the raw string first to avoid over-quoting
    conn_str = (
        f"DRIVER={{ODBC Driver 18 for SQL Server}};"
        f"SERVER={server};"
        f"DATABASE={database};"
        f"UID={username};"
        f"PWD={password};"
        f"Authentication=ActiveDirectoryPassword;"
        f"Encrypt=yes;"
        f"TrustServerCertificate=yes;"
    )
    
    # Encode for SQLAlchemy
    params = urllib.parse.quote_plus(conn_str)
    return sa.create_engine(f"mssql+pyodbc:///?odbc_connect={params}")

def sync_table(table_name, output_path):
    engine = get_proficio_connection()
    print(f"🚀 Attempting to sync '{table_name}' from Proficio...")

    query = f"SELECT * FROM {table_name}"

    try:
        # Using a context manager for the connection is safer
        with engine.connect() as conn:
            df = pd.read_sql(query, conn)

        if df.empty:
            print(f"⚠️ Warning: Table '{table_name}' returned no data.")
            return

        # Ensure directory exists
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        # Save as Parquet
        df.to_parquet(output_path, index=False)
        print(f"✅ Success! Saved {len(df)} rows to {output_path}")

    except Exception as e:
        print(f"❌ Error syncing {table_name}:")
        print(f"   {str(e)}")

if __name__ == "__main__":
    # Change "objects" to the actual table name in your Proficio DB
    sync_table("objects", "/app/data/raw/proficio/objects.parquet")
