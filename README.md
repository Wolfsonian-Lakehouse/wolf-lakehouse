<div align="center">

  # 🐺 Wolfsonian Lakehouse ETL

  *A robust, containerized Data Lakehouse architecture for extracting, staging, and incrementally merging museum and library collection data using Python, DuckDB, and Parquet.*

  [![Python 3.10](https://img.shields.io/badge/Python-3.10-blue.svg)](#)
  [![Docker](https://img.shields.io/badge/Docker-Containerized-2496ED.svg)](#)
  [![DuckDB](https://img.shields.io/badge/DuckDB-OLAP-yellow.svg)](#)
  [![Data](https://img.shields.io/badge/Architecture-Medallion-brightgreen.svg)](#)
</div>

---

## 📖 Table of Contents
- [About the Project](#-about-the-project)
- [Architecture & Tech Stack](#-architecture--tech-stack)
- [Key Features](#-key-features)
- [Project Structure](#-project-structure)
- [Pipeline Execution](#-pipeline-execution)

---

## 🧐 About the Project
The Wolfsonian Lakehouse is an automated, incremental ELT (Extract, Load, Transform) pipeline designed to unify disparate data sources into a single, high-performance analytics layer. It extracts data from APIs, legacy SQL Server databases, and binary MARC files, staging them as raw Parquet files before transforming them into a clean, "Gold" standard layer for downstream systems like Workbench and Metabase.

## 🏗️ Architecture & Tech Stack
* **Orchestration:** Prefect 3 (Massive 12-Node DAG) & Docker Compose
* **Data Extraction:** Python 3.10 (Pandas, PyArrow, requests, pymarc)
* **Database Connectivity:** SQLAlchemy, pyodbc (ODBC Driver 18 for SQL Server)
* **Authentication:** Automated Kerberos (`kinit`) integration inside containers
* **Storage Format:** Apache Parquet (High-speed, columnar, immutable storage)
* **Serving Layer:** DuckDB
* **Data Pattern:** Medallion Architecture with Incremental Delta Merges (Upserts) and QA Quarantine.

---

## ⚡ Key Features

* **Incremental Delta Merges (Upserts):** To avoid expensive full table scans, the Proficio extractor utilizes a high-watermark tracker to selectively pull only records created or modified since the last run. The Silver layer then seamlessly merges (upserts) these deltas into a persistent master Parquet table without duplicating data.
* **Metabase Serving Layer (DuckDB):** The pipeline concludes by automatically generating a persistent DuckDB database with instantaneous, zero-copy Views pointing directly to the Parquet files. Metabase easily connects to this DuckDB file for lightning-fast BI visualization.
* **QA Quarantine (Dead Letter Queue):** Records that fail critical data quality checks (missing identifiers, empty titles) are automatically isolated into a `proficio_qa_failures.parquet` file via a dedicated microservice instead of breaking the pipeline. This allows data stewards to easily identify and fix dirty source data.
* **Concurrent API Fetching:** The Islandora microservice utilizes a `ThreadPoolExecutor` and auto-discovery logic to fetch paginated API data rapidly, utilizing exponential backoff for network resilience.
* **Unified Gold Catalog:** The pipeline dynamically bridges the massive schema gap between library systems (Alma) and museum systems (Proficio), automatically aligning and concatenating both into a single unified queryable table with a strict predetermined column hierarchy.
* **Robust Workflow Orchestration:** Uses Prefect to manage the ETL pipeline. The monolithic scripts have been completely decoupled into an 12-node Directed Acyclic Graph (DAG), providing an incredibly granular UI dashboard for monitoring, task-level asynchronous execution, and real-time metric summaries at the end of every flow.

---

## 📂 Project Structure

```text
wolf-lakehouse/
├── config.ini                   # Database credentials (Ignored in Git)
├── data/                        # The Lakehouse Storage Volume
│   ├── wolfsonian_lakehouse.duckdb # Serving Layer Database for Metabase
│   ├── metrics.json             # Execution metrics for Prefect dashboard
│   ├── watermark_proficio.json  # State tracker for Incremental Delta loads
│   ├── gold/                    # Gold Layer: Clean outputs & QA failures
│   │   ├── unified_catalog.parquet
│   │   ├── missing_objects.parquet
│   │   ├── proficio_qa_failures.parquet
│   │   ├── proficio_workbench_export.csv
│   │   └── alma_workbench_export.csv
│   ├── raw/                     # Bronze Layer: Unaltered source dumps
│   │   ├── alma/
│   │   ├── islandora/
│   │   └── proficio/
│   │       └── incremental/     # Timestamped delta Parquet files
│   └── silver/                  # Silver Layer: Persistent, deduplicated master tables
├── docker-compose.yml           # The Master Switch for orchestration
├── Dockerfile                   # Builds the Python 3.10 environment + ODBC/Kerberos
├── Dockerfile.metabase          # Custom Ubuntu image for Metabase DuckDB support
├── etl-pipelines/               # Core Extraction & Transformation Microservices
│   ├── extract_alma_raw.py
│   ├── extract_islandora_raw.py
│   ├── extract_proficio_raw.py
│   ├── transform_proficio_silver.py
│   ├── transform_alma_silver.py
│   ├── isolate_proficio_qa_failures.py
│   ├── export_gold_missing_objects.py
│   ├── export_gold_unified_catalog.py
│   ├── export_proficio_to_workbench.py
│   ├── export_alma_to_workbench.py
│   ├── build_duckdb_views.py    
│   └── orchestrate_prefect.py   # Master 12-Node Prefect Workflow
└── README.md
```

---

## 🚀 Pipeline Execution (Powered by Prefect)

The pipeline is managed by a master orchestrator (`orchestrate_prefect.py`) which coordinates all asynchronous micro-tasks, monitors state, and aggregates metrics.

**1. Rebuild the Docker Image**
If you've recently updated `requirements.txt` or the Dockerfile:
```bash
docker compose build
```

**2. Start the Prefect UI**
Spin up the local Prefect Server to monitor your runs:
```bash
docker compose up prefect-server -d
```
*You can now open your server IP (e.g., `http://<server-ip>:4200`) in your web browser to view the Prefect Dashboard.*

**3. Run the Pipeline**
Trigger the extraction and transformation workflow:
```bash
docker compose run --rm lakehouse
```
*Watch your pipeline execute in real-time in the terminal. The flow will conclude by building the DuckDB views and printing a dashboard summarizing the exact rows processed by the Delta Merge logic!*

**4. Visualizing with Metabase**
The pipeline includes a custom-built Metabase container equipped with the DuckDB driver for lightning-fast BI reporting.
```bash
docker compose up metabase -d
```
*Access Metabase at `http://<server-ip>:3030`.*

> [!WARNING]
> **CRITICAL DUCKDB SETUP STEP:** When connecting Metabase to DuckDB for the first time, you **must** enable Read-Only mode or the container will fatally crash due to thread deadlocking.
> 1. Go through the initial Setup Wizard. On the "Add your data" step, scroll down and click **"I'll add my data later"** to bypass the hidden defaults.
> 2. From the main dashboard, click the **Gear Icon ⚙️** -> **Admin Settings** -> **Databases** -> **Add Database**.
> 3. Add the DuckDB Database file path: `/metabase-data/wolfsonian_lakehouse.duckdb`
> 4. **Toggle "Establish a read-only connection" to ON.**
> 5. Click Save.

**Troubleshooting Metabase Crash Loops:** 
If you accidentally hit save without the toggle and the container crashes, a simple restart won't fix it because Metabase saves its settings to a persistent anonymous volume. Run the following commands to perform a hard wipe and reset the Setup Wizard:
```bash
docker compose rm -s -f -v metabase
docker compose up metabase -d
```
