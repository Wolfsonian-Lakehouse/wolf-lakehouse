import logging
import pandas as pd
import requests
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

# --- CONFIGURATION ---
API_URL = "https://digital.wolfsonian.org/admin/aa_good_lookup?_format=json"
ITEMS_PER_PAGE = 100
MAX_WORKERS = 15        # Parallel connections
BATCH_SIZE = 20         # Fetch 20 pages at a time

# This path running inside the Docker container
# mapped to data folder.
OUTPUT_FILE = "/app/data/raw/islandora/islandora_lookup.parquet" 

def fetch_page(url_template, page_number, items_per_page):
    """
    Fetches a single page with timeout AND retry logic.
    If the server hiccups, it tries again.
    """
    separator = '&' if '?' in url_template else '?'
    url = f"{url_template}{separator}items_per_page={items_per_page}&page={page_number}"
    
    max_retries = 5  
    retry_delay = 2  
    
    for attempt in range(max_retries):
        try:
            response = requests.get(url, timeout=60) 
            response.raise_for_status()
            data = response.json()
            return data if data else []
            
        except Exception as e:
            if attempt < max_retries - 1:
                logging.info(f"⚠️ Page {page_number} failed (Attempt {attempt+1}/{max_retries}). Retrying in {retry_delay}s... Error: {e}")
                time.sleep(retry_delay)
                retry_delay *= 2 # Exponential backoff
            else:
                logging.info(f"❌ FAILED to fetch page {page_number} after {max_retries} attempts. Error: {e}")
                return []

def get_data_auto_discovery(base_url, items_per_page=100, max_workers=10, batch_size=20):
    """
    Fetches all data concurrently in batches.
    """
    all_data = []
    current_page = 0
    is_finished = False
    
    logging.info(f"🚀 Starting concurrent fetch from {base_url}...")

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        while not is_finished:
            logging.info(f"   -> Fetching pages {current_page} to {current_page + batch_size}...")
            
            future_to_page = {
                executor.submit(fetch_page, base_url, page, items_per_page): page
                for page in range(current_page, current_page + batch_size)
            }

            batch_has_data = False
            empty_pages_found = 0

            for future in as_completed(future_to_page):
                try:
                    data = future.result()
                    if data:
                        all_data.extend(data)
                        batch_has_data = True
                    else:
                        empty_pages_found += 1
                except Exception as e:
                    logging.info(f"Error processing future: {e}")

            if empty_pages_found > 0 or not batch_has_data:
                is_finished = True
            else:
                current_page += batch_size
                
    logging.info(f"🏁 Finished external fetch. Total items retrieved: {len(all_data)}")
    return pd.DataFrame(all_data)


def main():
    logging.info("--- 📥 Starting Islandora API Loader Microservice ---")
    
    # 1. Fetch the data from the API
    df_external_nodes = get_data_auto_discovery(API_URL, ITEMS_PER_PAGE, MAX_WORKERS, BATCH_SIZE)
    
    # 2. Format columns dynamically based on what the API actually returned
    if not df_external_nodes.empty:
        node_col = 'nid' if 'nid' in df_external_nodes.columns else 'node'
        
        # Dynamically find the accession/identifier column
        if 'field_identifier_external' in df_external_nodes.columns:
            accn_col = 'field_identifier_external'
        elif 'field_identifier' in df_external_nodes.columns:
            accn_col = 'field_identifier'
        else:
            accn_col = 'accn'

        if node_col not in df_external_nodes.columns: df_external_nodes[node_col] = None
        if accn_col not in df_external_nodes.columns: df_external_nodes[accn_col] = None

        df_external_nodes = df_external_nodes.rename(columns={
            node_col: 'node_id', 
            accn_col: 'field_identifier'
        })
        
        # 3. Save it to Parquet
        # Ensure the raw directory exists (just in case the volume isn't perfectly mapped yet)
        os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
        
        logging.info(f"💾 Saving to Parquet file: {OUTPUT_FILE}")
        
        # use engine='pyarrow' for speed and stability
        df_external_nodes.to_parquet(OUTPUT_FILE, index=False, engine='pyarrow')
        
        logging.info(f"✅ Successfully saved {len(df_external_nodes)} records to staging.")
    else:
        logging.info("❌ No data fetched. Parquet file not created.")


if __name__ == "__main__":
    main()
