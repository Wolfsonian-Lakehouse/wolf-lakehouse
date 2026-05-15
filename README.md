<div align="center">

  # 🐺 Wolfsonian Lakehouse ETL

  *A robust, containerized Data Lakehouse architecture for extracting, staging, and incrementally merging museum and library collection data using Python, DuckDB, and Parquet.*

  [![Python 3.10](https://img.shields.io/badge/Python-3.10-blue.svg)](#)
  [![Docker](https://img.shields.io/badge/Docker-Containerized-2496ED.svg)](#)
  [![DuckDB](https://img.shields.io/badge/DuckDB-OLAP-yellow.svg)](#)
  [![Data](https://img.shields.io/badge/Architecture-Medallion-brightgreen.svg)](#)
  [![Records](https://img.shields.io/badge/Unified%20Catalog-115k%2B%20Records-orange.svg)](#)
</div>

---

## 📖 Table of Contents
- [About the Project](#-about-the-project)
- [Architecture & Tech Stack](#-architecture--tech-stack)
- [Data Sources & Volumes](#-data-sources--volumes)
- [Key Features](#-key-features)
- [Project Structure](#-project-structure)
- [Pipeline Execution](#-pipeline-execution)
- [Operational Notes](#-operational-notes)

---

## 🧐 About the Project
The Wolfsonian Lakehouse is an automated, incremental ELT (Extract, Load, Transform) pipeline designed to unify disparate data sources into a single, high-performance analytics layer. It extracts data from APIs, legacy SQL Server databases, and binary MARC files, staging them as raw Parquet files before transforming them into a clean, "Gold" standard layer for downstream systems like Workbench and Metabase.

## 🏗️ Architecture & Tech Stack
* **Orchestration:** Prefect 3 (13-Node DAG) & Docker Compose
* **Data Extraction:** Python 3.10 (Pandas, PyArrow, requests, pymarc)
* **Database Connectivity:** SQLAlchemy, pyodbc (ODBC Driver 18 for SQL Server)
* **Authentication:** Automated Kerberos (`kinit`) integration inside containers
* **Storage Format:** Apache Parquet (High-speed, columnar, immutable storage)
* **Serving Layer:** DuckDB
* **Data Pattern:** Medallion Architecture with Incremental Delta Merges (Upserts) and QA Quarantine.

---

## 📊 Data Sources & Volumes

| Source | System | Records | Method |
|---|---|---|---|
| **Alma** | Ex Libris Library Management | ~54,860 | Binary MARC (`.mrc`) file parsing via PyMARC |
| **Proficio** | Museum Collection Database | ~60,566 | Kerberos-authenticated SQL Server via ODBC |
| **Islandora** | Public Digital Archive | ~265,193 | Paginated REST API with concurrent fetching |
| **Unified Gold Catalog** | Merged output | ~115,000 | Alma + Proficio aligned and concatenated |
| **Normalized Gold Catalog** | Analytics-ready output | ~115,000 | Harmonized genres, dates, creators & titles |

---

## ⚡ Key Features

* **Incremental Delta Merges (Upserts):** To avoid expensive full table scans, the Proficio extractor utilizes a high-watermark tracker to selectively pull only records created or modified since the last run. The Silver layer then seamlessly merges (upserts) these deltas into a persistent master Parquet table, deduplicating on `field_identifier` (the Proficio catalog number) without duplicating data.
* **Metabase Serving Layer (DuckDB):** The pipeline concludes by automatically generating a persistent DuckDB database with instantaneous, zero-copy Views pointing directly to the Parquet files. Metabase easily connects to this DuckDB file for lightning-fast BI visualization. If DuckDB is locked by an active Metabase session, the pipeline gracefully skips view recreation — Metabase automatically picks up the freshly updated Parquet files on the next query.
* **QA Quarantine (Dead Letter Queue):** Records that fail critical data quality checks (missing identifiers, empty titles) are automatically isolated into a `proficio_qa_failures.parquet` file via a dedicated microservice instead of breaking the pipeline. This allows data stewards to easily identify and fix dirty source data.
* **Concurrent API Fetching:** The Islandora microservice utilizes a `ThreadPoolExecutor` and auto-discovery logic to fetch paginated API data rapidly, utilizing exponential backoff for network resilience.
* **Unified Gold Catalog:** The pipeline dynamically bridges the massive schema gap between library systems (Alma) and museum systems (Proficio), automatically aligning and concatenating both into a single unified queryable table with a strict predetermined column hierarchy.
* **Gold Normalization Layer:** A dedicated post-merge harmonization step (`export_gold_normalized.py`) standardizes vocabulary across both source systems — normalizing genre labels (e.g., `POSTER` → `Poster`), stripping MARC trailing punctuation from titles, cleaning creator names, and deriving `year_created` and `decade_created` columns for time-series analytics. Metabase dashboards use this `gold_normalized_catalog` view.
* **Digital Gap Analysis:** The `missing_objects.parquet` output identifies which internal catalog records (Proficio museum objects) are absent from the public-facing Islandora digital archive (`digital.wolfsonian.org`), supporting prioritization of digitization and content migration efforts.
* **Robust Workflow Orchestration:** Uses Prefect to manage the ETL pipeline. The monolithic scripts have been completely decoupled into a 13-node Directed Acyclic Graph (DAG), providing an incredibly granular UI dashboard for monitoring, task-level asynchronous execution, and real-time metric summaries at the end of every flow.

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
│   │   ├── unified_catalog_normalized.parquet  # Harmonized analytics view
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
│   ├── export_gold_normalized.py    # Cross-system harmonization (genres, dates, creators)
│   ├── export_proficio_to_workbench.py
│   ├── export_alma_to_workbench.py
│   ├── build_duckdb_views.py    
│   └── orchestrate_prefect.py   # Master 13-Node Prefect Workflow
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

---

## 🔧 Operational Notes

**Triggering a Full Proficio Re-sync**

The pipeline runs incrementally by default using a watermark file. If you need to force a full re-pull of all Proficio records (e.g., after a data volume reset or suspected data loss):

```bash
# Run from ~/wolf-lakehouse on the server
rm data/watermark_proficio.json
rm data/silver/proficio_silver.parquet
docker compose run --rm lakehouse
```

The watermark is automatically recreated at the end of the run. Future runs return to incremental mode.

> [!WARNING]
> Do **not** delete `data/silver/proficio_silver.parquet` during a normal incremental run. This file is the accumulated Silver Master and only needs to be cleared when performing a full historical rebuild.

**Refreshing Metabase Schema After a Pipeline Run**

If new columns appear in the Parquet files but Metabase doesn't show them, force a schema sync:
1. Go to **Admin → Databases → (DuckDB database) → Sync database schema now**
2. Also click **Re-scan field values**

Alternatively, stop Metabase, run `build_duckdb_views.py` directly, then restart:
```bash
docker compose stop metabase
docker compose run --rm lakehouse python etl-pipelines/build_duckdb_views.py
docker compose start metabase
```
