"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as duckdb from '@duckdb/duckdb-wasm';

interface DuckDBContextValue {
  isReady: boolean;
  error: string | null;
  runQuery: (query: string) => Promise<any[] | null>;
}

const DuckDBContext = createContext<DuckDBContextValue | null>(null);

export function DuckDBProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<duckdb.AsyncDuckDB | null>(null);
  const [conn, setConn] = useState<duckdb.AsyncDuckDBConnection | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activeDb: duckdb.AsyncDuckDB | null = null;
    let activeConn: duckdb.AsyncDuckDBConnection | null = null;

    async function init() {
      try {
        const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
        const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
        
        const workerUrl = URL.createObjectURL(
          new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' })
        );
        const worker = new Worker(workerUrl);
        
        const logger = new duckdb.ConsoleLogger();
        const newDb = new duckdb.AsyncDuckDB(logger, worker);
        activeDb = newDb;
        
        await newDb.instantiate(bundle.mainModule, bundle.pthreadWorker);
        URL.revokeObjectURL(workerUrl);
        
        const newConn = await newDb.connect();
        activeConn = newConn;
        
        try {
          const absoluteUrl = `${window.location.origin}/data/unified_catalog_normalized.parquet?v=2`;
          await newDb.registerFileURL('normalized_catalog.parquet', absoluteUrl, duckdb.DuckDBDataProtocol.HTTP, false);
          
          await newConn.query(`
            CREATE VIEW catalog AS 
            SELECT 
              id, 
              title, 
              field_identifier, 
              field_collection_type, 
              field_collection_note,
              field_credit_line,
              field_extent,
              field_physical_form,
              field_genre, 
              field_description_long, 
              field_linked_agent,
              field_subject,
              field_place_published,
              field_edtf_date_created,
              decade_created,
              year_created,
              source_system,
              has_image,
              image_count
            FROM read_parquet('normalized_catalog.parquet')
            QUALIFY ROW_NUMBER() OVER (
              PARTITION BY COALESCE(field_identifier, CAST(id AS VARCHAR)) 
              ORDER BY CASE WHEN source_system = 'Proficio' THEN 1 ELSE 2 END
            ) = 1;
          `);
          console.log("DuckDB Context initialized and Parquet file mounted!");
          
          setDb(newDb);
          setConn(newConn);
          setIsReady(true);
        } catch (e: any) {
          console.error("Failed to mount parquet file.", e);
          setError(`Failed to mount parquet file: ${e?.message || e}`);
        }
      } catch (err: any) {
        console.error("Failed to initialize DuckDB WASM engine:", err);
        setError(`Failed to initialize WASM engine: ${err?.message || err}`);
      }
    }
    
    init();

    return () => {
      activeConn?.close();
      activeDb?.terminate();
    };
  }, []);

  const runQuery = async (query: string) => {
    if (!conn) return null;
    try {
      const arrowResult: any = await conn.query(query);
      return arrowResult.toArray().map((row: any) => row.toJSON());
    } catch (e: any) {
      console.error("Query Failed:", e);
      setError(`Query failed: ${e?.message || e}`);
      return [];
    }
  };

  return (
    <DuckDBContext.Provider value={{ isReady, error, runQuery }}>
      {children}
    </DuckDBContext.Provider>
  );
}

export function useDuckDB() {
  const context = useContext(DuckDBContext);
  if (!context) {
    throw new Error("useDuckDB must be used within a DuckDBProvider");
  }
  return context;
}
