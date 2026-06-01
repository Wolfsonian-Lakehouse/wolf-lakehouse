"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useDuckDB } from "../hooks/useDuckDB";

export default function Home() {
  const { isReady, runQuery, error } = useDuckDB();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSystem, setSelectedSystem] = useState("ALL");
  const [selectedGenre, setSelectedGenre] = useState("ALL");
  const [hasImageOnly, setHasImageOnly] = useState(false);
  const [selectedCreator, setSelectedCreator] = useState("ALL");
  const [selectedSubject, setSelectedSubject] = useState("ALL");
  const [selectedPlace, setSelectedPlace] = useState("ALL");
  const [minYear, setMinYear] = useState<string>("");
  const [maxYear, setMaxYear] = useState<string>("");
  
  const [topCreators, setTopCreators] = useState<string[]>([]);
  const [topSubjects, setTopSubjects] = useState<string[]>([]);
  const [topPlaces, setTopPlaces] = useState<string[]>([]);
  
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [filteredCount, setFilteredCount] = useState(0);
  const [debugInfo, setDebugInfo] = useState<string>("");
  const [activeQuery, setActiveQuery] = useState<string>("");

  // Infinite Scroll State
  const [page, setPage] = useState(1);
  const [isAppending, setIsAppending] = useState(false);
  const loaderRef = useRef<HTMLDivElement>(null);

  const executeNewSearch = () => {
    setPage(1);
    handleSearch(1);
  };

  useEffect(() => {
    if (isReady) {
      setPage(1);
      handleSearch(1);
      fetchFacets();
    }
  }, [isReady, selectedSystem, selectedGenre, hasImageOnly, selectedCreator, selectedSubject, selectedPlace, minYear, maxYear]);

  useEffect(() => {
    if (page > 1) {
      handleSearch(page);
    }
  }, [page]);

  const handleObserver = useCallback((entries: IntersectionObserverEntry[]) => {
    const target = entries[0];
    if (target.isIntersecting && !loading && !isAppending && results.length > 0 && results.length < filteredCount) {
      setPage((prev) => prev + 1);
    }
  }, [loading, isAppending, results.length, filteredCount]);

  useEffect(() => {
    const option = { root: null, rootMargin: "400px", threshold: 0 };
    const observer = new IntersectionObserver(handleObserver, option);
    if (loaderRef.current) observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [handleObserver]);

  const fetchFacets = async () => {
    if (!isReady || topCreators.length > 0) return; // Only fetch once
    try {
      const creators = await runQuery(`SELECT field_linked_agent as facet FROM catalog WHERE field_linked_agent IS NOT NULL GROUP BY 1 ORDER BY count(*) DESC LIMIT 50`);
      if (creators) setTopCreators(creators.map((r: any) => r.facet));

      const subjects = await runQuery(`SELECT field_subject as facet FROM catalog WHERE field_subject IS NOT NULL GROUP BY 1 ORDER BY count(*) DESC LIMIT 50`);
      if (subjects) setTopSubjects(subjects.map((r: any) => r.facet));

      const places = await runQuery(`SELECT field_place_published as facet FROM catalog WHERE field_place_published IS NOT NULL GROUP BY 1 ORDER BY count(*) DESC LIMIT 50`);
      if (places) setTopPlaces(places.map((r: any) => r.facet));
    } catch (e) {
      console.error("Failed to fetch facets", e);
    }
  };

  const handleSearch = async (targetPage: number = page) => {
    if (!isReady) return;
    
    if (targetPage === 1) {
      setLoading(true);
    } else {
      setIsAppending(true);
    }
    
    try {
      let whereClause = `WHERE title IS NOT NULL`;
      
      if (searchTerm) {
        const escapedSearch = searchTerm.replace(/'/g, "''").toLowerCase();
        whereClause += ` AND (lower(title) LIKE '%${escapedSearch}%' OR lower(field_description_long) LIKE '%${escapedSearch}%')`;
      }
      if (selectedSystem !== "ALL") whereClause += ` AND source_system = '${selectedSystem}'`;
      if (selectedGenre !== "ALL") whereClause += ` AND field_genre = '${selectedGenre}'`;
      if (hasImageOnly) whereClause += ` AND has_image = true`;
      if (selectedCreator !== "ALL") whereClause += ` AND field_linked_agent = '${selectedCreator.replace(/'/g, "''")}'`;
      if (selectedSubject !== "ALL") whereClause += ` AND field_subject = '${selectedSubject.replace(/'/g, "''")}'`;
      if (selectedPlace !== "ALL") whereClause += ` AND field_place_published = '${selectedPlace.replace(/'/g, "''")}'`;
      if (minYear && !isNaN(parseInt(minYear))) whereClause += ` AND year_created >= ${parseInt(minYear)}`;
      if (maxYear && !isNaN(parseInt(maxYear))) whereClause += ` AND year_created <= ${parseInt(maxYear)}`;
      
      const limit = 48;
      const offset = (targetPage - 1) * limit;

      const dataQuery = `
        SELECT title, field_identifier, field_collection_type, field_genre, field_description_long, source_system, has_image
        FROM catalog 
        ${whereClause}
        ORDER BY has_image DESC, title ASC LIMIT ${limit} OFFSET ${offset}
      `;
      
      setActiveQuery(dataQuery);

      const countQuery = `SELECT count(*) as total FROM catalog ${whereClause}`;
      const globalCountQuery = `SELECT count(*) as total FROM catalog`;

      const [data, countData, globalCountData] = await Promise.all([
        runQuery(dataQuery),
        runQuery(countQuery),
        runQuery(globalCountQuery)
      ]);
      
      if (data) {
        if (targetPage === 1) {
          setResults(data);
        } else {
          setResults(prev => [...prev, ...data]);
        }
      }
      
      if (countData && countData.length > 0) {
        setFilteredCount(Number(countData[0].total));
      }
      if (globalCountData && globalCountData.length > 0) {
        setTotalCount(Number(globalCountData[0].total));
      }
      
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
    setIsAppending(false);
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
              onKeyDown={(e) => e.key === 'Enter' && executeNewSearch()}
            />
            
            <button 
              onClick={executeNewSearch}
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
                  { key: "BOOKS", label: "BOOKS" },
                  { key: "DESIGN DRAWING", label: "DESIGN DRAWINGS" },
                  { key: "POSTCARD", label: "POSTCARDS" },
                  { key: "PHOTOGRAPH", label: "PHOTOGRAPHS" },
                  { key: "POSTER", label: "POSTERS" },
                  { key: "PAMPHLET", label: "PAMPHLETS" },
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

            {/* Filter 3: Date Range */}
            <div className="space-y-4 border-t border-white/20 pt-6">
              <span className="block text-xs uppercase tracking-wider font-extrabold text-mca-cyan">
                // DATE RANGE
              </span>
              
              <div className="flex flex-col space-y-6 bg-mca-dark/50 p-4 border border-white/10">
                <div className="flex items-center justify-between text-mca-cyan font-bold font-mono">
                  <span>{minYear || "1800"}</span>
                  <span className="text-white">-</span>
                  <span className="text-mca-yellow">{maxYear || "2026"}</span>
                </div>
                
                <div className="space-y-4">
                  <div className="flex flex-col space-y-2">
                    <label className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">Start Year</label>
                    <input 
                      type="range" 
                      min="1800" 
                      max="2026" 
                      value={minYear || "1800"}
                      onChange={(e) => setMinYear(Math.min(Number(e.target.value), Number(maxYear || 2026)).toString())}
                      className="w-full h-1 bg-white/20 appearance-none outline-none accent-mca-cyan cursor-pointer"
                    />
                  </div>
                  
                  <div className="flex flex-col space-y-2">
                    <label className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">End Year</label>
                    <input 
                      type="range" 
                      min="1800" 
                      max="2026" 
                      value={maxYear || "2026"}
                      onChange={(e) => setMaxYear(Math.max(Number(e.target.value), Number(minYear || 1800)).toString())}
                      className="w-full h-1 bg-white/20 appearance-none outline-none accent-mca-yellow cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Filter 4: Media Settings */}
            <div className="space-y-3 border-t border-white/20 pt-6">
              <span className="block text-xs uppercase tracking-wider font-extrabold text-mca-cyan">
                // MEDIA SETTINGS
              </span>
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setHasImageOnly(!hasImageOnly)}
                  className={`px-4 py-2 border text-[11px] font-bold uppercase transition-all duration-150 cursor-pointer flex items-center space-x-2 ${hasImageOnly ? 'bg-white border-white text-mca-black font-extrabold' : 'border-white/20 text-slate-400 hover:border-white hover:text-white'}`}
                >
                  <span className={`h-2 w-2 rounded-full ${hasImageOnly ? 'bg-mca-cyan' : 'bg-slate-600'}`}></span>
                  <span>ONLY SHOW RECORDS WITH IMAGES</span>
                </button>
              </div>
            </div>

            {/* Filter 5: Advanced Indexes */}
            <div className="space-y-4 border-t border-white/20 pt-6">
              <span className="block text-xs uppercase tracking-wider font-extrabold text-mca-cyan">
                // ADVANCED INDEXES
              </span>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex flex-col space-y-2">
                  <label className="text-[10px] text-slate-400 font-bold tracking-wider">CREATOR</label>
                  <select 
                    value={selectedCreator}
                    onChange={(e) => setSelectedCreator(e.target.value)}
                    className="bg-mca-black border border-white/20 text-white text-xs px-3 py-2 uppercase outline-none focus:border-mca-cyan truncate"
                  >
                    <option value="ALL">ALL CREATORS</option>
                    {topCreators.map((c, i) => <option key={i} value={c}>{c}</option>)}
                  </select>
                </div>
                
                <div className="flex flex-col space-y-2">
                  <label className="text-[10px] text-slate-400 font-bold tracking-wider">SUBJECT</label>
                  <select 
                    value={selectedSubject}
                    onChange={(e) => setSelectedSubject(e.target.value)}
                    className="bg-mca-black border border-white/20 text-white text-xs px-3 py-2 uppercase outline-none focus:border-mca-cyan truncate"
                  >
                    <option value="ALL">ALL SUBJECTS</option>
                    {topSubjects.map((s, i) => <option key={i} value={s}>{s}</option>)}
                  </select>
                </div>

                <div className="flex flex-col space-y-2">
                  <label className="text-[10px] text-slate-400 font-bold tracking-wider">PLACE PUBLISHED</label>
                  <select 
                    value={selectedPlace}
                    onChange={(e) => setSelectedPlace(e.target.value)}
                    className="bg-mca-black border border-white/20 text-white text-xs px-3 py-2 uppercase outline-none focus:border-mca-cyan truncate"
                  >
                    <option value="ALL">ALL PLACES</option>
                    {topPlaces.map((p, i) => <option key={i} value={p}>{p}</option>)}
                  </select>
                </div>
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
          <div className="flex justify-between items-end mb-6 border-b border-white/20 pb-4">
            <h2 className="text-white font-bold tracking-widest text-sm uppercase">
              RESULTS GRID
            </h2>
            <div className="text-mca-cyan font-mono text-xs uppercase tracking-widest bg-mca-cyan/10 px-3 py-1.5 border border-mca-cyan/20">
              <span className="font-bold text-white mr-2">{isReady ? filteredCount.toLocaleString() : '---'}</span> 
              MATCHES FOUND
            </div>
          </div>
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

          {/* Infinite Scroll Loader */}
          {results.length > 0 && results.length < filteredCount && (
            <div ref={loaderRef} className="py-12 flex justify-center items-center w-full border-t border-white/20 col-span-full">
              {isAppending ? (
                <div className="flex flex-col items-center space-y-4">
                  <div className="animate-spin h-6 w-6 border-2 border-white border-t-mca-cyan rounded-none" />
                  <span className="text-[10px] text-mca-cyan font-bold tracking-widest uppercase">Fetching more records...</span>
                </div>
              ) : (
                <div className="h-6" />
              )}
            </div>
          )}

          {results.length > 0 && results.length >= filteredCount && (
            <div className="py-12 text-center border-t border-white/20 text-[10px] text-slate-500 font-bold tracking-widest uppercase col-span-full">
              END OF CATALOG REACHED ({results.length} MATCHES)
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
