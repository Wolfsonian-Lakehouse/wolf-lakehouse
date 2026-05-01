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

@task(name="Extract Proficio Raw")
def extract_proficio():
    run_script('etl-pipelines/extract_proficio_raw.py')

@task(name="Extract Islandora Raw")
def extract_islandora():
    run_script('etl-pipelines/extract_islandora_raw.py')

@task(name="Extract Alma Raw")
def extract_alma():
    run_script('etl-pipelines/extract_alma_raw.py')

@task(name="Transform Proficio Silver")
def transform_proficio():
    run_script('etl-pipelines/transform_proficio_silver.py')

@task(name="Export Proficio to Workbench")
def export_proficio():
    run_script('etl-pipelines/export_proficio_to_workbench.py')

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
        Missing Records Sent to Gold:       {metrics.get('missing_objects_found', 0)}
        ==================================================
        """
        logger.info(summary)
    except Exception as e:
        logger.warning(f"Could not load metrics summary: {e}")

@flow(name="Wolfsonian Lakehouse Pipeline")
def lakehouse_flow():
    # Extraction Phase
    proficio_raw = extract_proficio.submit()
    islandora_raw = extract_islandora.submit()
    alma_raw = extract_alma.submit()

    # Transformation Phase
    proficio_silver = transform_proficio.submit(wait_for=[proficio_raw, islandora_raw])

    # Export Phase
    export_fut = export_proficio.submit(wait_for=[proficio_silver])
    
    # Metrics Dashboard Phase
    metrics_fut = report_metrics.submit(wait_for=[export_fut, alma_raw])

    # Explicitly wait for terminal tasks to complete so the flow doesn't exit early
    metrics_fut.wait()

if __name__ == "__main__":
    lakehouse_flow()
