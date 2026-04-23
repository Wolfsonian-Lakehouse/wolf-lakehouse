#!/bin/bash
set -e # This makes the pipeline stop immediately if any script fails
echo "🚀 --- STARTING EXTRACTION PHASE ---"
python etl-pipelines/extract_proficio_raw.py
python etl-pipelines/extract_islandora_raw.py
python etl-pipelines/extract_alma_raw.py
echo "🛠️ --- STARTING TRANSFORMATION PHASE ---"
python etl-pipelines/transform_proficio_silver.py
python etl-pipelines/transform_alma_raw.py
echo "📤 --- STARTING EXPORT PHASE ---"
python etl-pipelines/export_proficio_to_workbench.py
echo "✅ --- ENTIRE LAKEHOUSE PIPELINE COMPLETE ---"