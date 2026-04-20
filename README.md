<div align="center">

  # 🐺 Wolfsonian Lakehouse ETL

  *A robust, containerized Data Lakehouse architecture for extracting, staging, and analyzing museum and library collection data using Python, DuckDB, and Parquet.*

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
- [Getting Started](#-getting-started)
- [Pipeline Execution](#-pipeline-execution)

---

## 🧐 About the Project
The Wolfsonian Lakehouse is an automated ELT (Extract, Load, Transform) pipeline designed to unify disparate data sources into a single, high-performance analytics layer. It extracts data from APIs, legacy SQL Server databases, and binary MARC files, staging them as raw Parquet files before transforming them into a clean, "Gold" standard layer for visualization in Metabase.

## 🏗️ Architecture & Tech Stack
* **Orchestration:** Docker & Docker Compose
* **Data Extraction:** Python 3.10 (Pandas, PyArrow, requests, pymarc)
* **Database Connectivity:** SQLAlchemy, pyodbc (ODBC Driver 18 for SQL Server)
* **Authentication:** Automated Kerberos (`kinit`) integration inside containers
* **Storage Format:** Apache Parquet (High-speed, columnar storage)
* **Analytics Engine:** DuckDB
* **Visualization:** Metabase

---

## ⚡ Key Features
* **Concurrent API Fetching:** The Islandora microservice utilizes `ThreadPoolExecutor` and auto-discovery logic to fetch paginated API data rapidly and resiliently.
* **Seamless Kerberos Auth:** The Proficio extraction script automatically generates Kerberos tickets inside the Docker container to securely query internal SQL Server databases without exposing passwords in connection strings.
* **Binary File Processing:** Safely extracts hundreds of complex, nested diagnostic fields from Alma `.mrc` library files.
* **Medallion Architecture:** Strictly separates raw, untransformed data (`data/raw/`) from business-ready, clean data (`data/gold/`).

---

## 📂 Project Structure

```text
wolf-lakehouse/
├── docker-compose.yml           # The Master Switch for orchestration
├── Dockerfile                   # Builds the Python 3.10 environment + ODBC/Kerberos
├── config.ini                   # Database credentials (Ignored in Git)
├── aaukstuo.keytab              # Kerberos Keytab (Ignored in Git)
│
├── etl-pipelines/               # Core Extraction Microservices
│   ├── extract_islandora_raw.py # REST API -> Parquet
│   ├── extract_proficio_raw.py  # SQL Server -> Parquet
│   ├── extract_alma_raw.py      # Binary MARC -> Parquet
│   └── requirements.txt         
│
├── data/                        # The Lakehouse Storage
│   ├── raw/                     # Bronze Layer: Unaltered source dumps
│   │   ├── alma/
│   │   ├── islandora/
│   │   └── proficio/
│   └── gold/                    # Gold Layer: Clean DuckDB views/Parquet
│
└── visualization/               # Metabase configuration and dashboards
