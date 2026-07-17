import os
import logging
import pandas as pd
from google.analytics.data_v1beta import BetaAnalyticsDataClient
from google.analytics.data_v1beta.types import (
    DateRange,
    Dimension,
    Metric,
    RunReportRequest,
)
from google.oauth2 import service_account

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def fetch_ga4_data(property_id, credentials_path):
    try:
        credentials = service_account.Credentials.from_service_account_file(credentials_path)
        client = BetaAnalyticsDataClient(credentials=credentials)
    except Exception as e:
        logging.error(f"Failed to initialize GA4 client with {credentials_path}: {e}")
        return None

    request = RunReportRequest(
        property=f"properties/{property_id}",
        dimensions=[Dimension(name="date"), Dimension(name="pagePath")],
        metrics=[Metric(name="sessions"), Metric(name="activeUsers"), Metric(name="screenPageViews")],
        date_ranges=[DateRange(start_date="30daysAgo", end_date="today")],
    )

    try:
        response = client.run_report(request)
        
        data = []
        for row in response.rows:
            data.append({
                "date": row.dimension_values[0].value,
                "page_path": row.dimension_values[1].value,
                "sessions": int(row.metric_values[0].value),
                "active_users": int(row.metric_values[1].value),
                "page_views": int(row.metric_values[2].value),
            })
            
        df = pd.DataFrame(data)
        return df
    except Exception as e:
        logging.error(f"Failed to fetch data from GA4 API: {e}")
        return None


def main():
    logging.info("--- 📊 Starting Google Analytics Extraction ---")
    
    credentials_path = "/app/ga4_credentials.json"
    property_id = os.environ.get("GA4_PROPERTY_ID")
    
    if not os.path.exists(credentials_path):
        logging.warning(f"No GA4 credentials found at {credentials_path}. Skipping GA4 extraction.")
        return
        
    if not property_id:
        logging.warning("GA4_PROPERTY_ID environment variable not set. Skipping GA4 extraction.")
        return
        
    df = fetch_ga4_data(property_id, credentials_path)
    
    if df is not None and not df.empty:
        output_dir = "/app/data/gold"
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, "ga4_metrics.parquet")
        
        # Convert date string to datetime object for better querying in DuckDB
        df['date'] = pd.to_datetime(df['date'], format='%Y%m%d')
        
        df.to_parquet(output_path, engine='pyarrow')
        logging.info(f"Successfully saved {len(df)} rows of GA4 data to {output_path}")
    else:
        logging.warning("No data retrieved from GA4 or an error occurred.")

if __name__ == "__main__":
    main()
