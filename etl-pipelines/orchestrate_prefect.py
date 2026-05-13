import subprocess
import logging
import json
import os
from prefect import flow, task

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def run_script(script_path: str):
    """Runs a Python script as a subprocess and raises an error if it fails."""
    logger.info(f"Running script: {script_path}")
    result = subprocess.run(['python', script_path])
    if result.returncode != 0:
        raise RuntimeError(f"Script {script_path} failed with exit code {result.returncode}")
    else:
        logger.info(f"Successfully ran {script_path}")

# ==========================================
# 1. BRONZE LAYER (Extraction)
# ==========================================
@task(name="Extract Proficio Raw")
def extract_proficio():
    run_script('etl-pipelines/extract_proficio_raw.py')

@task(name="Extract Islandora Raw")
def extract_islandora():
    run_script('etl-pipelines/extract_islandora_raw.py')

@task(name="Extract Alma Raw")
def extract_alma():
    run_script('etl-pipelines/extract_alma_raw.py')

# ==========================================
# 2. SILVER LAYER (Cleansing & Merging)
# ==========================================
@task(name="Transform Proficio Silver")
def transform_proficio():
    run_script('etl-pipelines/transform_proficio_silver.py')

@task(name="Transform Alma Silver")
def transform_alma():
    run_script('etl-pipelines/transform_alma_silver.py')

# ==========================================
# 3. GOLD LAYER (Validation & Export)
# ==========================================
@task(name="Isolate QA Failures")
def isolate_qa_failures():
    run_script('etl-pipelines/isolate_proficio_qa_failures.py')

@task(name="Generate Gold Missing Objects")
def generate_missing_objects():
    run_script('etl-pipelines/export_gold_missing_objects.py')

@task(name="Generate Gold Unified Catalog")
def generate_unified_catalog():
    run_script('etl-pipelines/export_gold_unified_catalog.py')

@task(name="Export Proficio to Workbench")
def export_proficio():
    run_script('etl-pipelines/export_proficio_to_workbench.py')

@task(name="Export Alma to Workbench")
def export_alma():
    run_script('etl-pipelines/export_alma_to_workbench.py')

# ==========================================
# 4. SERVING LAYER (DuckDB Metabase)
# ==========================================
@task(name="Build DuckDB Metabase Views")
def build_duckdb():
    run_script('etl-pipelines/build_duckdb_views.py')

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

    # 2. Transformation Phase (Silver)
    proficio_silver = transform_proficio.submit(wait_for=[proficio_raw])
    alma_silver = transform_alma.submit(wait_for=[alma_raw])

    # 3. Validation Phase (QA)
    qa_failures = isolate_qa_failures.submit(wait_for=[proficio_silver])

    # 4. Gold Generation Phase
    unified_catalog = generate_unified_catalog.submit(wait_for=[proficio_silver, alma_silver])
    missing_objects = generate_missing_objects.submit(wait_for=[qa_failures, islandora_raw, unified_catalog])

    # 5. Export Phase (CSV to Workbench)
    proficio_csv = export_proficio.submit(wait_for=[missing_objects])
    alma_csv = export_alma.submit(wait_for=[alma_silver])
    
    # 6. Serving Layer Phase (DuckDB)
    duckdb_fut = build_duckdb.submit(wait_for=[proficio_csv, alma_csv, unified_catalog])
    
    # 7. Metrics Dashboard Phase
    metrics_fut = report_metrics.submit(wait_for=[duckdb_fut])

    # Explicitly wait for terminal tasks to complete
    metrics_fut.wait()

if __name__ == "__main__":
    lakehouse_flow()
