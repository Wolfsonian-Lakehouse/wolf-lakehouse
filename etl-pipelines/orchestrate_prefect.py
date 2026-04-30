import subprocess
import logging
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

@task(name="Transform Alma Silver")
def transform_alma():
    run_script('etl-pipelines/transform_alma_raw.py')

@task(name="Export Proficio to Workbench")
def export_proficio():
    run_script('etl-pipelines/export_proficio_to_workbench.py')

@flow(name="Wolfsonian Lakehouse Pipeline")
def lakehouse_flow():
    # Extraction Phase
    proficio_raw = extract_proficio.submit()
    islandora_raw = extract_islandora.submit()
    alma_raw = extract_alma.submit()

    # Transformation Phase (depends on extraction)
    proficio_silver = transform_proficio.submit(wait_for=[proficio_raw, islandora_raw])
    alma_silver = transform_alma.submit(wait_for=[alma_raw])

    # Export Phase
    export_proficio.submit(wait_for=[proficio_silver])

if __name__ == "__main__":
    lakehouse_flow()
