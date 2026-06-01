"use client";

import { useState, useEffect } from "react";
import { useDuckDB } from "../hooks/useDuckDB";

export default function Home() {
  const { isReady, runQuery, error } = useDuckDB();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSystem, setSelectedSystem] = useState("ALL");
  const [selectedGenre, setSelectedGenre] = useState("ALL");
  
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [debugInfo, setDebugInfo] = useState<string>("");
  const [activeQuery, setActiveQuery] = useState<string>("");

  // Fetch initial data when DB is ready or when filters change
  useEffect(() => {
    if (isReady) {
      handleSearch();
    }
  }, [isReady, selectedSystem, selectedGenre]);

  const handleSearch = async () => {
    if (!isReady) return;
    setLoading(true);
    
    try {
      let query = `
        SELECT title, field_identifier, field_collection_type, field_genre, field_description_long, source_system, has_image
        FROM catalog 
        WHERE title IS NOT NULL
      `;
      
      if (searchTerm) {
        // Safe string escaping for basic SQL injection protection in browser search
        const escapedSearch = searchTerm.replace(/'/g, "''").toLowerCase();
        query += ` AND (lower(title) LIKE '%${escapedSearch}%' OR lower(field_description_long) LIKE '%${escapedSearch}%')`;
      }

      if (selectedSystem !== "ALL") {
        query += ` AND source_system = '${selectedSystem}'`;
      }

      if (selectedGenre !== "ALL") {
        query += ` AND field_genre = '${selectedGenre}'`;
      }
      
      // Sort: items with an identifier (i.e. likely have an image) come first, then alphabetically
      query += ` ORDER BY has_image DESC, title ASC LIMIT 48`;
      
      setActiveQuery(query);

      const data = await runQuery(query);
      const countData = await runQuery(`SELECT count(*) as total FROM catalog`);
      
      if (data) setResults(data);
      if (countData && countData.length > 0) setTotalCount(countData[0].total);
      
      setDebugInfo(JSON.stringify({
        dataLength: data?.length,
        countData: countData,
        sampleRow: data && data.length > 0 ? data[0] : null
      }, (key, val) => typeof val === 'bigint' ? val.toString() : val));
      
    } catch (error: any) {
      console.error(error);
      setDebugInfo((prev: string) => prev + `\nCatch Error: ${error?.message || error}`);
    }
    
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-mca-black text-white flex flex-col selection:bg-mca-yellow selection:text-mca-black antialiased font-mono">
      
      {/* Top Banner Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 border-b-2 border-white text-xs uppercase font-bold tracking-wider divide-y-2 md:divide-y-0 md:divide-x-2 divide-white bg-mca-black">
        <div className="p-4 flex items-center justify-between">
          <span>ARCHIVE INDEX</span>
          <span className="text-mca-cyan">WOLFSONIAN-FIU</span>
        </div>
        <div className="p-4 flex items-center justify-between">
          <span>ENGINE STATUS</span>
          <div className="flex items-center space-x-2">
            <span className={`h-2 w-2 rounded-full ${isReady ? 'bg-mca-cyan animate-pulse' : 'bg-mca-yellow animate-ping'}`} />
            <span className={isReady ? 'text-mca-cyan' : 'text-mca-yellow'}>
              {isReady ? 'ONLINE' : 'INITIALIZING'}
            </span>
          </div>
        </div>
        <div className="p-4 flex items-center justify-between">
          <span>RECORDS MOUNTED</span>
          <span className="text-white font-mono">
            {isReady ? Number(totalCount).toLocaleString() : '---'}
          </span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-12 md:py-20 flex-1 w-full space-y-16">
        
        {/* Giant MCA-Style Typography Header */}
        <header className="space-y-6">
          <div className="text-[11px] uppercase tracking-widest text-mca-cyan font-bold font-mono">
            COLLECTION DATA LAKEHOUSE / OPEN ARCHIVES
          </div>
          
          <h1 className="text-[12vw] md:text-[8vw] font-black font-display uppercase tracking-tighter leading-[0.85] text-white select-none">
            WOLFSONIAN-FIU<br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-400 to-mca-cyan">
              LAKEHOUSE
            </span>
          </h1>

          <div className="h-1 bg-white w-full mt-4" />
          
          <p className="text-slate-400 text-sm md:text-base font-sans max-w-2xl font-light leading-relaxed">
            A serverless web explorer querying clean catalog metadata directly in your browser. Powered by DuckDB WebAssembly to scan local Parquet storage at client runtime.
          </p>
        </header>

        {/* Database Error Banner */}
        {error && (
          <div className="bg-mca-dark border-2 border-red-500 text-red-200 px-6 py-5 rounded-none text-xs flex flex-col gap-1 brutalist-shadow-white">
            <span className="font-bold text-red-500 font-display text-sm tracking-wide">
              [DATABASE ENGINE ERROR]
            </span>
            <span className="font-mono mt-1">{error}</span>
          </div>
        )}

        {/* Search Panel - Swiss Minimalist Style */}
        <section className="space-y-8">
          
          <div className="flex flex-col md:flex-row gap-4">
            <input
              type="text"
              placeholder="SEARCH CATALOG BY KEYWORD..."
              className="flex-grow bg-mca-black border-2 border-white rounded-none px-6 py-4 text-base font-bold tracking-wide focus:outline-none focus:bg-mca-dark transition-all placeholder:text-mca-border uppercase text-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            
            <button 
              onClick={handleSearch}
              disabled={!isReady}
              className="bg-white hover:bg-mca-cyan text-mca-black font-black uppercase tracking-widest px-10 py-4 rounded-none border-2 border-white hover:border-mca-cyan transition-all duration-200 cursor-pointer disabled:opacity-30 shrink-0 text-sm active:translate-y-1"
            >
              SEARCH COLLECTION
            </button>
          </div>

          {/* Filtering Dashboard - MCA Bold Box Style */}
          <div className="border-2 border-white bg-mca-black p-6 space-y-6">
            
            {/* Filter 1: Catalog Source */}
            <div className="space-y-3">
              <span className="block text-xs uppercase tracking-wider font-extrabold text-mca-cyan">
                // SOURCE CATALOG
              </span>
              <div className="flex flex-wrap gap-3">
                {[
                  { key: "ALL", label: "ALL COLLECTIONS" },
                  { key: "Alma", label: "LIBRARY (ALMA)" },
                  { key: "Proficio", label: "MUSEUM (PROFICIO)" }
                ].map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setSelectedSystem(opt.key)}
                    className={`px-4 py-2 border text-xs font-bold uppercase transition-all duration-150 cursor-pointer ${selectedSystem === opt.key ? 'bg-mca-cyan border-mca-cyan text-mca-black' : 'border-white/20 text-slate-400 hover:border-white hover:text-white'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Filter 2: Genre Categorization */}
            <div className="space-y-3 border-t border-white/20 pt-6">
              <span className="block text-xs uppercase tracking-wider font-extrabold text-mca-cyan">
                // GENRE INDEX
              </span>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "ALL", label: "ALL GENRES" },
                  { key: "POSTER", label: "POSTERS" },
                  { key: "BOOKS", label: "BOOKS" },
                  { key: "PAMPHLET", label: "PAMPHLETS" },
                  { key: "DRAWING", label: "DRAWINGS" },
                  { key: "PRINT", label: "PRINTS" },
                  { key: "OBJECT", label: "MUSEUM OBJECTS" }
                ].map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setSelectedGenre(opt.key)}
                    className={`px-3 py-2 border text-[11px] font-bold uppercase transition-all duration-150 cursor-pointer ${selectedGenre === opt.key ? 'bg-mca-yellow border-mca-yellow text-mca-black font-extrabold' : 'border-white/10 text-slate-400 hover:border-white/40 hover:text-white'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

          </div>

          {/* Active SQL Statement Display */}
          {activeQuery && (
            <div className="border border-white/20 bg-mca-dark/80 px-5 py-4 font-mono text-[10px] text-slate-400 overflow-x-auto flex items-center space-x-3">
              <span className="text-mca-cyan font-bold select-none">QUERY:</span>
              <code className="block whitespace-pre select-all text-slate-300">{activeQuery.trim()}</code>
            </div>
          )}
        </section>

        {/* Collection Grid */}
        <main>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-32 space-y-6">
              <div className="animate-spin h-10 w-10 border-2 border-white border-t-mca-cyan rounded-none" />
              <p className="text-mca-cyan font-bold font-mono text-xs tracking-widest animate-pulse">
                SCANNING LOCAL PARQUET DATA...
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 border-l border-t border-white/20">
              {results.map((item, idx) => (
                <article 
                  key={idx} 
                  className="bg-mca-black border-r border-b border-white/20 hover:bg-mca-dark/50 transition-all duration-200 flex flex-col group p-6 space-y-6"
                >
                  
                  {/* Image Area - Stark Fit Layout */}
                  <div className="h-60 bg-mca-black relative flex items-center justify-center p-2 border border-white/10">
                    {(() => {
                      const imageId = (item.field_identifier || "").split(';')[0].trim();
                      return (
                        <img 
                          src={`/images/${imageId}.jpg`}
                          alt={item.title}
                          className="object-contain max-w-full max-h-full opacity-90 group-hover:opacity-100 transition-all duration-300"
                          onError={(e: any) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                            (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                          }}
                        />
                      );
                    })()}
                    {/* Placeholder */}
                    <div className="absolute hidden inset-0 flex flex-col items-center justify-center bg-mca-dark/95 text-slate-600 text-[10px] uppercase font-bold tracking-widest space-y-2">
                      <span>[ NO IMAGE ]</span>
                    </div>
                  </div>

                  {/* Text details */}
                  <div className="flex-1 flex flex-col justify-between space-y-6">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-[10px] font-bold">
                        <span className="text-mca-cyan tracking-wider">{item.field_collection_type}</span>
                        <span className="text-slate-500">{item.field_identifier}</span>
                      </div>
                      
                      <h3 className="font-bold text-sm leading-tight text-white uppercase group-hover:text-mca-cyan transition-colors">
                        {item.title}
                      </h3>
                      
                      <p className="text-slate-400 text-xs leading-relaxed font-sans font-light line-clamp-4">
                        {item.field_description_long || 'No historical description logged.'}
                      </p>
                    </div>

                    <div className="pt-4 border-t border-white/10 flex items-center justify-between text-[10px] font-bold">
                      <span className="text-mca-yellow">{item.field_genre || 'UNCATEGORIZED'}</span>
                      <span className="text-slate-500 bg-mca-gray px-2 py-1">{item.source_system}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {/* Empty State */}
          {results.length === 0 && !loading && isReady && (
            <div className="text-center py-32 border border-white/20 bg-mca-black space-y-4 max-w-md mx-auto p-8">
              <span className="text-3xl">📭</span>
              <div className="space-y-2">
                <h4 className="font-extrabold text-white uppercase text-sm tracking-wider">No Archive Matches</h4>
                <p className="text-xs text-slate-500 font-sans leading-relaxed">
                  The query returned zero rows. Clean your filter values or enter a different search phrase to scan the catalog database.
                </p>
              </div>
            </div>
          )}
        </main>

        {/* Collapsible Debug Panel */}
        {debugInfo && (
          <div className="border border-white/20 bg-mca-black rounded-none">
            <details className="group">
              <summary className="bg-mca-dark px-6 py-4 flex items-center justify-between cursor-pointer select-none border-b border-white/10">
                <span className="text-xs uppercase tracking-widest font-bold text-slate-400">
                  ⚙️ DATABASE ENGINE DEBUGGER
                </span>
                <span className="text-slate-500 group-open:rotate-180 transition-transform duration-200">
                  ▼
                </span>
              </summary>
              <div className="p-6 text-[11px] text-slate-500 space-y-4 max-h-[300px] overflow-y-auto font-mono bg-mca-black">
                <pre className="whitespace-pre-wrap select-all text-slate-400">{debugInfo}</pre>
              </div>
            </details>
          </div>
        )}

      </div>
      {/* Footer */}
      <footer className="border-t border-white/10 mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-slate-600">
          <span>Wolfsonian-FIU Collection Data Lakehouse</span>
          <span>Built by <span className="text-slate-400">Andrius Aukstuolis</span></span>
        </div>
      </footer>

    </div>
  );
}
