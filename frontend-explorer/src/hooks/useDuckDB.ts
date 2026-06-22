import { useState, useEffect } from 'react';
import * as duckdb from '@duckdb/duckdb-wasm';

export function useDuckDB() {
  const [db, setDb] = useState<duckdb.AsyncDuckDB | null>(null);
  const [conn, setConn] = useState<duckdb.AsyncDuckDBConnection | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        // 1. Select the correct bundle for the browser from JSDelivr CDN
        // This completely avoids any Next.js Webpack worker configuration issues!
        const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
        const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
        
        // Create a Blob URL that imports the CDN worker script (avoids cross-origin worker creation restrictions)
        const workerUrl = URL.createObjectURL(
          new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' })
        );
        const worker = new Worker(workerUrl);
        
        const logger = new duckdb.ConsoleLogger();
        const newDb = new duckdb.AsyncDuckDB(logger, worker);
        
        await newDb.instantiate(bundle.mainModule, bundle.pthreadWorker);
        URL.revokeObjectURL(workerUrl);
        
        const newConn = await newDb.connect();
        
        // 2. Register the parquet file from the public directory
        // Since it's mounted via Docker to /public/data/, the browser can access it at /data/
        try {
          const absoluteUrl = `${window.location.origin}/data/unified_catalog_normalized.parquet?v=2`;
          await newDb.registerFileURL('normalized_catalog.parquet', absoluteUrl, duckdb.DuckDBDataProtocol.HTTP, false);
          // Create a view so we can query it like a normal table, selecting only the columns of interest
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
          console.log("DuckDB initialized and Parquet file mounted!");
          
          setDb(newDb);
          setConn(newConn);
          setIsReady(true);
        } catch (e: any) {
          console.error("Failed to mount parquet file. It might not exist in the public directory yet.", e);
          setError(`Failed to mount parquet file: ${e?.message || e}`);
        }
      } catch (err: any) {
        console.error("Failed to initialize DuckDB WASM engine:", err);
        setError(`Failed to initialize WASM engine: ${err?.message || err}`);
      }
    }
    
    init();

    return () => {
      conn?.close();
      db?.terminate();
    };
  }, []);

  // Helper function to run queries
  const runQuery = async (query: string) => {
    if (!conn) return null;
    try {
      const arrowResult: any = await conn.query(query);
      // Convert Arrow table to standard JSON array
      return arrowResult.toArray().map((row: any) => row.toJSON());
    } catch (e: any) {
      console.error("Query Failed:", e);
      setError(`Query failed: ${e?.message || e}`);
      return [];
    }
  };

  return { isReady, runQuery, error };
}
