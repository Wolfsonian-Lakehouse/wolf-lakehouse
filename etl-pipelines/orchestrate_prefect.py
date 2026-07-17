import logging
import json
import os
from prefect import flow, task

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Imports from ETL scripts
import extract_proficio_raw
import extract_islandora_raw
import extract_alma_raw
import extract_google_analytics
import transform_proficio_silver
import transform_alma_silver
import isolate_proficio_qa_failures
import export_gold_missing_objects
import export_duplicates_report
import export_gold_unified_catalog
import export_comparison_proficio
import export_comparison_alma
import export_image_audit_report
import export_gold_normalized
import snapshot_dashboard_metrics
import export_proficio_to_workbench
import export_alma_to_workbench
import build_duckdb_views
import process_images
import process_audio

# ==========================================
# 1. BRONZE LAYER (Extraction)
# ==========================================
@task(name="Extract Proficio Raw")
def extract_proficio():
    extract_proficio_raw.main()

@task(name="Extract Islandora Raw")
def extract_islandora():
    extract_islandora_raw.main()

@task(name="Extract Alma Raw")
def extract_alma():
    extract_alma_raw.main()

@task(name="Extract Google Analytics")
def extract_ga4():
    extract_google_analytics.main()

# ==========================================
# 2. SILVER LAYER (Cleansing & Merging)
# ==========================================
@task(name="Transform Proficio Silver")
def transform_proficio():
    transform_proficio_silver.main()

@task(name="Transform Alma Silver")
def transform_alma():
    transform_alma_silver.main()

# ==========================================
# 3. GOLD LAYER (Validation & Export)
# ==========================================
@task(name="Isolate QA Failures")
def isolate_qa_failures():
    isolate_proficio_qa_failures.main()

@task(name="Generate Gold Missing Objects")
def generate_missing_objects():
    export_gold_missing_objects.main()

@task(name="Generate Duplicates Report")
def generate_duplicates_report():
    export_duplicates_report.main()

@task(name="Generate Gold Unified Catalog")
def generate_unified_catalog():
    export_gold_unified_catalog.main()

@task(name="Generate Comparison Proficio")
def generate_comparison_proficio():
    export_comparison_proficio.main()

@task(name="Generate Comparison Alma")
def generate_comparison_alma():
    export_comparison_alma.main()

@task(name="Generate Image Audit Report")
def generate_image_audit_report():
    export_image_audit_report.main()

@task(name="Normalize Gold Catalog")
def normalize_catalog():
    export_gold_normalized.main()

@task(name="Snapshot Dashboard Metrics")
def snapshot_dashboard_metrics_task():
    snapshot_dashboard_metrics.main()

@task(name="Export Proficio to Workbench")
def export_proficio():
    export_proficio_to_workbench.main()

@task(name="Export Alma to Workbench")
def export_alma():
    export_alma_to_workbench.main()

# ==========================================
# 4. SERVING LAYER (DuckDB Metabase)
# ==========================================
@task(name="Build DuckDB Metabase Views")
def build_duckdb():
    build_duckdb_views.main()

# ==========================================
# 4.5. IMAGES LAYER (NFS Ingestion)
# ==========================================
@task(name="Ingest and Convert NFS Images")
def process_images_task():
    process_images.main()

# ==========================================
# 4.6. AUDIO LAYER (NFS Ingestion)
# ==========================================
@task(name="Ingest and Convert NFS Audio")
def process_audio_task():
    process_audio.main()

# ==========================================
# 5. MONITORING
# ==========================================
@task(name="Report Pipeline Metrics")
def report_metrics():
    metrics_path = '/app/data/metrics.json'
    if not os.path.exists(metrics_path):
        logger.warning("No metrics.json found. Summary cannot be generated.")
        return

    try:
        with open(metrics_path, 'r') as f:
            metrics = json.load(f)
            
        summary = f"""
        \n
        ==================================================
        📊 WOLFSONIAN LAKEHOUSE METRICS SUMMARY
        ==================================================
        Proficio Records Extracted (Delta): {metrics.get('proficio_extracted', 0)}
        Proficio Deltas Processed:          {metrics.get('proficio_deltas_processed', 0)}
        Total Silver Master Records:        {metrics.get('proficio_silver_total', 0)}
        QA Validation Failures:             {metrics.get('proficio_qa_failures', 0)}
        Missing Records Sent to Gold:       {metrics.get('missing_objects_found', 0)}
        Alma Silver Records Processed:      {metrics.get('alma_silver_total', 0)}
        ==================================================
        """
        logger.info(summary)
    except Exception as e:
        logger.warning(f"Could not load metrics summary: {e}")

@flow(name="Wolfsonian Lakehouse Pipeline")
def lakehouse_flow():
    # 1. Extraction Phase
    proficio_raw = extract_proficio.submit()
    islandora_raw = extract_islandora.submit()
    alma_raw = extract_alma.submit()
    ga4_raw = extract_ga4.submit()

    # 2. Transformation Phase (Silver)
    proficio_silver = transform_proficio.submit(wait_for=[proficio_raw])
    alma_silver = transform_alma.submit(wait_for=[alma_raw])

    # 3. Validation Phase (QA)
    qa_failures = isolate_qa_failures.submit(wait_for=[proficio_silver])

    # 4. Gold Generation Phase
    duplicates_report = generate_duplicates_report.submit(wait_for=[proficio_silver, alma_silver])
    unified_catalog = generate_unified_catalog.submit(wait_for=[proficio_silver, alma_silver])
    normalized_catalog = normalize_catalog.submit(wait_for=[unified_catalog])
    missing_objects = generate_missing_objects.submit(wait_for=[qa_failures, islandora_raw, unified_catalog])
    comparison_proficio = generate_comparison_proficio.submit(wait_for=[proficio_silver, islandora_raw])
    comparison_alma = generate_comparison_alma.submit(wait_for=[alma_silver, islandora_raw])
    history_metrics = snapshot_dashboard_metrics_task.submit(wait_for=[alma_silver, islandora_raw, normalized_catalog])
    image_audit = generate_image_audit_report.submit(wait_for=[normalized_catalog])

    # 5. Export Phase (CSV to Workbench)
    proficio_csv = export_proficio.submit(wait_for=[missing_objects])
    alma_csv = export_alma.submit(wait_for=[alma_silver])
    
    # 6.5. Process NFS Images (Net New Only)
    images_fut = process_images_task.submit(wait_for=[normalized_catalog])
    
    # 6.6. Process NFS Audio
    audio_fut = process_audio_task.submit(wait_for=[images_fut])

    # 6. Serving Layer Phase (DuckDB)
    duckdb_fut = build_duckdb.submit(wait_for=[proficio_csv, alma_csv, normalized_catalog, history_metrics, comparison_alma, comparison_proficio, image_audit, audio_fut, ga4_raw])
    
    # 7. Metrics Dashboard Phase
    metrics_fut = report_metrics.submit(wait_for=[duckdb_fut, audio_fut])

    # Explicitly wait for terminal tasks to complete
    metrics_fut.wait()

if __name__ == "__main__":
    lakehouse_flow()
