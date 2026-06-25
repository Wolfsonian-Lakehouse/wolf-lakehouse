import duckdb
import os
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s')

QUERIES = {
    "history_genre_distribution": """
WITH CleanedBase AS (
    SELECT 
        COALESCE(NULLIF(TRIM(field_collection_type), ''), '(Unknown Collection)') AS collection,
        COALESCE(NULLIF(TRIM(field_genre), ''), '(Unknown Genre)') AS genre
    FROM gold_normalized_catalog
),
GenreRanks AS (
    SELECT 
        genre,
        COUNT(*) as total_records,
        ROW_NUMBER() OVER(ORDER BY COUNT(*) DESC) as rank
    FROM CleanedBase
    GROUP BY genre
)
SELECT 
    c.collection,
    CASE 
        WHEN r.rank <= 10 THEN c.genre
        ELSE 'Other'
    END AS final_genre,
    COUNT(*) AS total_count
FROM CleanedBase c
LEFT JOIN GenreRanks r ON c.genre = r.genre
GROUP BY 1, 2
ORDER BY c.collection, total_count DESC
""",
    "history_collection_by_decade": """
SELECT 
    decade_created,
    COUNT(*) AS total_objects
FROM gold_normalized_catalog
WHERE decade_created IS NOT NULL 
  AND decade_created >= 1800 
  AND decade_created <= 2025
GROUP BY decade_created
ORDER BY decade_created ASC
""",
    "history_subject_synergy": """
WITH UnnestedBase AS (
    SELECT 
        COALESCE(NULLIF(TRIM(field_collection_type), ''), '(Unknown Collection)') AS collection,
        TRIM(unnest(string_split(field_subject, '|'))) AS subject
    FROM gold_normalized_catalog
    WHERE field_subject IS NOT NULL 
      AND field_subject != ''
),
TopSubjects AS (
    SELECT 
        subject
    FROM UnnestedBase
    GROUP BY subject
    ORDER BY COUNT(*) DESC
    LIMIT 20
)
SELECT 
    u.collection,
    u.subject,
    COUNT(*) AS total_count
FROM UnnestedBase u
JOIN TopSubjects t ON u.subject = t.subject
GROUP BY 1, 2
ORDER BY total_count DESC
""",
    "history_temporal_geography": """
WITH unnested_geo AS (
    SELECT 
        TRIM(UNNEST(string_split(field_geographic_subject, ' | '))) AS region,
        decade_created
    FROM gold_normalized_catalog
    WHERE field_geographic_subject IS NOT NULL
      AND field_geographic_subject != ''
      AND decade_created >= 1850 
      AND decade_created <= 2000
)
SELECT 
    decade_created,
    region,
    COUNT(*) AS total_items
FROM unnested_geo
WHERE region != ''
GROUP BY region, decade_created
HAVING COUNT(*) > 15 
ORDER BY decade_created ASC, total_items DESC
""",
    "history_prolific_creators": """
WITH UnnestedCreators AS (
    SELECT 
        TRIM(unnest(string_split(field_linked_agent, '|'))) AS creator
    FROM gold_normalized_catalog
    WHERE field_linked_agent IS NOT NULL 
      AND field_linked_agent != ''
)
SELECT 
    creator,
    COUNT(*) AS total_works
FROM UnnestedCreators
WHERE creator IS NOT NULL 
  AND creator != ''
GROUP BY creator
ORDER BY total_works DESC
LIMIT 15
""",
    "history_proficio_holding_type": """
SELECT
  "main"."proficio_silver"."user8" AS "user8",
  COUNT(*) AS "count"
FROM
  "main"."proficio_silver"
GROUP BY
  "main"."proficio_silver"."user8"
ORDER BY
  "main"."proficio_silver"."user8" ASC
""",
    "history_lakehouse_image_completeness": """
SELECT 
  source_system, 
  COUNT(*) as total_records, 
  SUM(CAST(has_image AS INT)) as images_found, 
  ROUND(SUM(CAST(has_image AS INT)) * 100.0 / COUNT(*), 1) as completeness_pct 
FROM gold_normalized_catalog 
GROUP BY source_system
ORDER BY completeness_pct DESC
""",
    "history_system_health": """
SELECT
    source_system,
    COUNT(*) AS total_records,
    ROUND(COUNT(title) * 100.0 / COUNT(*), 1)                  AS pct_has_title,
    ROUND(COUNT(field_linked_agent) * 100.0 / COUNT(*), 1)     AS pct_has_creator,
    ROUND(COUNT(field_edtf_date_created) * 100.0 / COUNT(*), 1) AS pct_has_date,
    ROUND(COUNT(field_genre) * 100.0 / COUNT(*), 1)            AS pct_has_genre,
    ROUND(COUNT(field_subject) * 100.0 / COUNT(*), 1)          AS pct_has_subject
FROM gold_normalized_catalog
GROUP BY source_system
""",
    "history_total_scope": """
SELECT 
    'Islandora Catalog' AS table_name,
    COUNT(*) AS total_records,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'islandora_raw') AS total_columns,
    COUNT(*) * (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'islandora_raw') AS total_values
FROM islandora_raw
UNION ALL
SELECT 
    'Gold Unified Catalog' AS table_name,
    COUNT(*) AS total_records,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'gold_unified_catalog') AS total_columns,
    COUNT(*) * (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'gold_unified_catalog') AS total_values
FROM gold_unified_catalog
UNION ALL
SELECT 
    'Normalized Catalog (Analytics Layer)' AS table_name,
    COUNT(*) AS total_records,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'gold_normalized_catalog') AS total_columns,
    COUNT(*) * (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'gold_normalized_catalog') AS total_values
FROM gold_normalized_catalog
UNION ALL
SELECT 
    'Proficio Catalog' AS table_name,
    COUNT(*) AS total_records,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'proficio_silver') AS total_columns,
    COUNT(*) * (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'proficio_silver') AS total_values
FROM proficio_silver
UNION ALL
SELECT 
    'Alma Catalog' AS table_name,
    COUNT(*) AS total_records,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'alma_silver') AS total_columns,
    COUNT(*) * (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'alma_silver') AS total_values
FROM alma_silver
ORDER BY total_records DESC
""",
    "history_alma_islandora_comparison": """
WITH islandora AS (
    SELECT * FROM (
        SELECT
            LOWER(TRIM(CAST(field_identifier AS VARCHAR))) AS norm_id,
            title,
            ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(CAST(field_identifier AS VARCHAR))) ORDER BY node_id) as rn
        FROM islandora_raw
        WHERE field_collection_type = 'Library'
          AND field_identifier IS NOT NULL 
          AND TRIM(CAST(field_identifier AS VARCHAR)) != ''
    ) i_sub
    WHERE rn = 1
),
alma AS (
    SELECT * FROM (
        SELECT
            LOWER(TRIM(CAST(field_identifier AS VARCHAR))) AS norm_id,
            title,
            ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(CAST(field_identifier AS VARCHAR))) ORDER BY field_identifier) as rn
        FROM alma_silver
        WHERE field_identifier IS NOT NULL 
          AND TRIM(CAST(field_identifier AS VARCHAR)) != ''
    ) a_sub
    WHERE rn = 1
),
comparison AS (
    SELECT
        CASE
            WHEN a.norm_id IS NOT NULL AND i.norm_id IS NOT NULL THEN
                CASE
                    WHEN jaro_winkler_similarity(LOWER(a.title), LOWER(i.title)) >= 0.4 THEN 'Match'
                    ELSE 'Mismatch'
                END
            WHEN a.norm_id IS NOT NULL THEN 'Alma only'
            WHEN i.norm_id IS NOT NULL THEN 'Islandora only'
        END AS status
    FROM alma a
    FULL OUTER JOIN islandora i 
        ON a.norm_id = i.norm_id
)
SELECT
    SUM(CASE WHEN status = 'Islandora only' THEN 1 ELSE 0 END) AS "Islandora only",
    SUM(CASE WHEN status = 'Alma only' THEN 1 ELSE 0 END) AS "Alma only",
    SUM(CASE WHEN status = 'Match' THEN 1 ELSE 0 END) AS "Match",
    SUM(CASE WHEN status = 'Mismatch' THEN 1 ELSE 0 END) AS "Mismatch",
    COUNT(*) AS "Total",
    CAST(ROUND((COUNT(CASE WHEN status = 'Match' THEN 1 END) * 100.0) / NULLIF(COUNT(*), 0), 0) AS INTEGER) AS "Match Pct"
FROM comparison
"""
}

def snapshot_metrics():
    HISTORY_DIR = '/app/data/gold/snapshots'
    os.makedirs(HISTORY_DIR, exist_ok=True)
    
    con = duckdb.connect(':memory:')
    
    # Register views so that the SQL queries execute perfectly without modification
    base_tables = {
        'proficio_silver': '/app/data/silver/proficio_silver.parquet',
        'comparison_proficio': '/app/data/gold/comparison_proficio.parquet',  
        'alma_silver': '/app/data/silver/alma_silver.parquet',
        'islandora_raw': '/app/data/raw/islandora/islandora_lookup.parquet',
        'gold_unified_catalog': '/app/data/gold/unified_catalog.parquet',
        'gold_normalized_catalog': '/app/data/gold/unified_catalog_normalized.parquet'
    }
    
    for view_name, parquet_path in base_tables.items():
        if os.path.exists(parquet_path):
            con.execute(f"CREATE VIEW {view_name} AS SELECT * FROM read_parquet('{parquet_path}')")
        else:
            # Fallback if testing locally outside the container
            con.execute(f"CREATE VIEW {view_name} AS SELECT 1")
            
    for metric_name, query in QUERIES.items():
        history_file = f"{HISTORY_DIR}/{metric_name}.parquet"
        logging.info(f"Processing snapshot for {metric_name}...")
        
        if os.path.exists(history_file):
            con.execute(f"CREATE TABLE {metric_name} AS SELECT * FROM read_parquet('{history_file}')")
            # Prevent double-inserting if the script is run multiple times in a single day
            con.execute(f"DELETE FROM {metric_name} WHERE snapshot_date = strftime(CURRENT_DATE, '%m/%d/%Y')")
            # Insert today's data by executing the query
            con.execute(f"INSERT INTO {metric_name} SELECT strftime(CURRENT_DATE, '%m/%d/%Y') AS snapshot_date, * FROM ({query})")
        else:
            # If it doesn't exist, execute the query fully to create the table with the correct schema
            con.execute(f"CREATE TABLE {metric_name} AS SELECT strftime(CURRENT_DATE, '%m/%d/%Y') AS snapshot_date, * FROM ({query})")
            
        # Save the updated table back to the parquet file
        con.execute(f"COPY {metric_name} TO '{history_file}' (FORMAT PARQUET)")
        logging.info(f"Successfully saved {history_file}")

def main():
    logging.info("--- 📊 Starting Dashboard Metrics Snapshot Microservice ---")
    snapshot_metrics()


if __name__ == "__main__":
    main()
