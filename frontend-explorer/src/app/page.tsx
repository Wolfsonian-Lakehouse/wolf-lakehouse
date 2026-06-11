"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useDuckDB } from "../hooks/useDuckDB";
import { useCollection } from "../hooks/useCollection";
import { parseDelimited, formatEDTFDate } from "../utils/formatters";

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
  const [topGenres, setTopGenres] = useState<string[]>([]);
  const [topCollections, setTopCollections] = useState<string[]>([]);
  
  const [timelineData, setTimelineData] = useState<{decade: number, count: number}[]>([]);
  const [selectedDecade, setSelectedDecade] = useState<string>("ALL");
  
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [filteredCount, setFilteredCount] = useState(0);
  const [debugInfo, setDebugInfo] = useState<string>("");

  // Infinite Scroll State
  const [page, setPage] = useState(1);
  const [isAppending, setIsAppending] = useState(false);
  const loaderRef = useRef<HTMLDivElement>(null);

  // Modal State
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);
  const [relatedRecords, setRelatedRecords] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isModalLoading, setIsModalLoading] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  const [sharedCollectionIds, setSharedCollectionIds] = useState<string[]>([]);
  const [isCopied, setIsCopied] = useState(false);

  // Collection State
  const { collection, isLoaded, addItem, removeItem, clearCollection, isInCollection, exportCsv } = useCollection();
  const [isCollectionModalOpen, setIsCollectionModalOpen] = useState(false);

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
  }, [isReady, selectedSystem, selectedGenre, hasImageOnly, selectedCreator, selectedSubject, selectedPlace, minYear, maxYear, selectedDecade]);

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
      const creatorsQuery = `SELECT facet FROM (SELECT DISTINCT field_identifier, trim(raw_facet) as facet FROM (SELECT field_identifier, unnest(string_split(field_linked_agent, '|')) as raw_facet FROM catalog WHERE field_linked_agent IS NOT NULL)) WHERE facet != '' GROUP BY 1 ORDER BY count(*) DESC LIMIT 500`;
      const creators = await runQuery(creatorsQuery);
      if (creators) setTopCreators(creators.map((r: any) => r.facet).sort((a: string, b: string) => a.localeCompare(b)));

      const subjectsQuery = `SELECT facet FROM (SELECT DISTINCT field_identifier, trim(raw_facet) as facet FROM (SELECT field_identifier, unnest(string_split(field_subject, '|')) as raw_facet FROM catalog WHERE field_subject IS NOT NULL)) WHERE facet != '' GROUP BY 1 ORDER BY count(*) DESC LIMIT 500`;
      const subjects = await runQuery(subjectsQuery);
      if (subjects) setTopSubjects(subjects.map((r: any) => r.facet).sort((a: string, b: string) => a.localeCompare(b)));

      const placesQuery = `SELECT facet FROM (SELECT DISTINCT field_identifier, trim(raw_facet) as facet FROM (SELECT field_identifier, unnest(string_split(field_place_published, '|')) as raw_facet FROM catalog WHERE field_place_published IS NOT NULL)) WHERE facet != '' GROUP BY 1 ORDER BY count(*) DESC LIMIT 500`;
      const places = await runQuery(placesQuery);
      if (places) setTopPlaces(places.map((r: any) => r.facet).sort((a: string, b: string) => a.localeCompare(b)));

      const timeline = await runQuery(`SELECT decade_created as decade, count(*) as count FROM catalog WHERE decade_created IS NOT NULL GROUP BY 1 ORDER BY 1`);
      if (timeline) setTimelineData(timeline);

      const genres = await runQuery(`SELECT field_genre as facet FROM catalog WHERE field_genre IS NOT NULL GROUP BY 1 ORDER BY count(*) DESC LIMIT 1000`);
      if (genres) setTopGenres(genres.map((r: any) => r.facet).sort((a: string, b: string) => a.localeCompare(b)));

      const collections = await runQuery(`SELECT field_collection_type as facet FROM catalog WHERE field_collection_type IS NOT NULL GROUP BY 1 ORDER BY count(*) DESC LIMIT 50`);
      if (collections) setTopCollections(collections.map((r: any) => r.facet).sort((a: string, b: string) => a.localeCompare(b)));
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
      let whereClause = `WHERE 1=1`;

      let sharedIds: string[] = sharedCollectionIds;
      if (typeof window !== 'undefined' && sharedIds.length === 0 && !window.location.search.includes('collection_cleared')) {
         const urlParams = new URLSearchParams(window.location.search);
         const param = urlParams.get('collection');
         if (param) {
            sharedIds = param.split(',').filter(id => id.trim() !== '');
            if (sharedCollectionIds.length === 0) setSharedCollectionIds(sharedIds);
         }
      }

      if (sharedIds.length > 0) {
        const escapedIds = sharedIds.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
        whereClause = `WHERE field_identifier IN (${escapedIds})`;
      } else {
      if (searchTerm) {
        let sqlCondition = "";
        if (/\\b(AND|OR|NOT)\\b/.test(searchTerm)) {
          const tokens = searchTerm.match(/(".*?"|\\bAND\\b|\\bOR\\b|\\bNOT\\b|\\S+)/g) || [];
          let expectOperator = false;
          for (let i = 0; i < tokens.length; i++) {
            let token = tokens[i];
            const upper = token.toUpperCase();
            if (upper === 'AND' || upper === 'OR') {
              sqlCondition += ` ${upper} `;
              expectOperator = false;
            } else if (upper === 'NOT') {
              sqlCondition += (expectOperator ? ` AND NOT ` : ` NOT `);
              expectOperator = false;
            } else {
              if (expectOperator) {
                sqlCondition += ` AND `;
              }
              const e = token.replace(/(^"|"$)/g, '').replace(/'/g, "''").toLowerCase();
              sqlCondition += `(lower(title) LIKE '%${e}%' OR lower(field_description_long) LIKE '%${e}%' OR lower(field_identifier) LIKE '%${e}%')`;
              expectOperator = true;
            }
          }
        } else {
          const terms = searchTerm.split(',').map(t => t.trim()).filter(t => t.length > 0);
          if (terms.length > 0) {
            const termConditions = terms.map(term => {
              const escapedSearch = term.replace(/'/g, "''").toLowerCase();
              return `(lower(title) LIKE '%${escapedSearch}%' OR lower(field_description_long) LIKE '%${escapedSearch}%' OR lower(field_identifier) LIKE '%${escapedSearch}%')`;
            });
            sqlCondition = termConditions.join(' OR ');
          }
        }
        if (sqlCondition) {
          whereClause += ` AND (${sqlCondition})`;
        }
      }
      if (selectedSystem !== "ALL") whereClause += ` AND source_system = '${selectedSystem}'`;
      if (selectedGenre !== "ALL") whereClause += ` AND field_genre LIKE '%${selectedGenre.replace(/'/g, "''")}%'`;
      if (hasImageOnly) whereClause += ` AND has_image = true`;
      if (selectedCreator !== "ALL") whereClause += ` AND field_linked_agent LIKE '%${selectedCreator.replace(/'/g, "''")}%'`;
      if (selectedSubject !== "ALL") whereClause += ` AND field_subject LIKE '%${selectedSubject.replace(/'/g, "''")}%'`;
      if (selectedPlace !== "ALL") whereClause += ` AND field_place_published LIKE '%${selectedPlace.replace(/'/g, "''")}%'`;
      if (selectedDecade !== "ALL") whereClause += ` AND decade_created = ${selectedDecade}`;
      if (minYear && !isNaN(parseInt(minYear))) whereClause += ` AND year_created >= ${parseInt(minYear)}`;
      if (maxYear && !isNaN(parseInt(maxYear))) whereClause += ` AND year_created <= ${parseInt(maxYear)}`;
      }
      
      const limit = 48;
      const offset = (targetPage - 1) * limit;

      const dataQuery = `
        SELECT title, field_identifier, field_collection_type, field_collection_note, field_credit_line, field_extent, field_physical_form, field_genre, field_description_long, source_system, has_image, field_linked_agent, field_subject, field_place_published, field_edtf_date_created
        FROM catalog 
        ${whereClause}
        ORDER BY has_image DESC, field_identifier ASC LIMIT ${limit} OFFSET ${offset}
      `;

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

  const handleSurpriseMe = async () => {
    if (!isReady) return;
    setLoading(true);
    setSearchTerm("");
    setSelectedSystem("ALL");
    setSelectedGenre("ALL");
    setHasImageOnly(true);
    setSelectedCreator("ALL");
    setSelectedSubject("ALL");
    setSelectedPlace("ALL");
    setSelectedDecade("ALL");
    setMinYear("");
    setMaxYear("");
    
    try {
      const dataQuery = `
        SELECT title, field_identifier, field_collection_type, field_collection_note, field_credit_line, field_extent, field_physical_form, field_genre, field_description_long, source_system, has_image, field_linked_agent, field_subject, field_place_published, field_edtf_date_created 
        FROM catalog 
        WHERE has_image = true 
        USING SAMPLE 24
      `;
      const data = await runQuery(dataQuery);
      if (data) {
        setResults(data);
        setFilteredCount(24);
      }
    } catch (error: any) {
      console.error(error);
      setDebugInfo((prev: string) => prev + `\nSurprise Error: ${error?.message || error}`);
    }
    setLoading(false);
  };

  const handleRecordClick = async (identifier: string) => {
    setIsModalOpen(true);
    setIsModalLoading(true);
    setSelectedRecord(null);
    setRelatedRecords([]);
    try {
      const query = `SELECT * FROM catalog WHERE field_identifier = '${identifier.replace(/'/g, "''")}' LIMIT 1`;
      const data = await runQuery(query);
      if (data && data.length > 0) {
        setSelectedRecord(data[0]);
        
        // Fetch More Like This
        let matchConditions = [];
        if (data[0].field_subject) {
          const mainSubject = data[0].field_subject.split(';')[0].trim().replace(/'/g, "''");
          matchConditions.push(`field_subject LIKE '%${mainSubject}%'`);
        }
        if (data[0].field_genre) {
          matchConditions.push(`field_genre = '${data[0].field_genre.replace(/'/g, "''")}'`);
        }
        if (data[0].field_linked_agent) {
          matchConditions.push(`field_linked_agent = '${data[0].field_linked_agent.replace(/'/g, "''")}'`);
        }
        
        const matchSql = matchConditions.length > 0 ? `AND (${matchConditions.join(' OR ')})` : '';

        let relatedQuery = `
          SELECT title, field_identifier, has_image 
          FROM catalog 
          WHERE field_identifier != '${identifier.replace(/'/g, "''")}' 
          AND has_image = true 
          ${matchSql}
          ORDER BY field_identifier ASC
          LIMIT 4
        `;
        
        let relatedData = await runQuery(relatedQuery);
        
        // Fallback: If no semantic matches, just show 4 random visual records
        if (!relatedData || relatedData.length === 0) {
          const fallbackQuery = `
            SELECT title, field_identifier, has_image 
            FROM catalog 
            WHERE field_identifier != '${identifier.replace(/'/g, "''")}' 
            AND has_image = true 
            USING SAMPLE 4
          `;
          relatedData = await runQuery(fallbackQuery);
        }
        
        if (relatedData) {
          setRelatedRecords(relatedData);
        }
      }
    } catch (error: any) {
      console.error("Modal fetch error:", error);
      setDebugInfo((prev: string) => prev + `\nModal Error: ${error?.message || error}`);
    }
    setIsModalLoading(false);
  };

  return (
    <div className="min-h-screen bg-mca-black text-white flex flex-col selection:bg-mca-yellow selection:text-mca-black antialiased font-mono">
      
      {/* Top Banner Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 border-b-2 border-white text-xs uppercase font-bold tracking-wider divide-y-2 md:divide-y-0 md:divide-x-2 divide-white bg-mca-black">
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
        <div className="p-4 flex items-center justify-between group cursor-pointer bg-mca-dark hover:bg-mca-cyan transition-colors" onClick={() => setIsCollectionModalOpen(true)}>
          <span className="group-hover:text-mca-black">SAVED COLLECTION</span>
          <span className="text-mca-yellow group-hover:text-mca-black font-mono font-bold">
            [{isLoaded ? collection.length : 0}]
          </span>
        </div>
      </div>

      <div className="w-full px-6 md:px-12 2xl:px-24 py-12 md:py-20 flex-1 space-y-16">
        
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
          
          <div className="flex flex-col md:flex-row gap-4 items-start">
            <div className="flex-grow w-full flex flex-col gap-2">
              <input
                type="text"
                placeholder="SEARCH CATALOG BY KEYWORD..."
                className="w-full bg-mca-black border-2 border-white rounded-none px-6 py-4 text-base font-bold tracking-wide focus:outline-none focus:bg-mca-dark transition-all placeholder:text-mca-border uppercase text-white"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && executeNewSearch()}
              />
              <span className="text-[10px] text-mca-cyan uppercase font-bold tracking-widest pl-2">
                * Use commas to search for multiple keywords or accession numbers at once
              </span>
              <span className="text-[10px] text-mca-yellow uppercase font-bold tracking-widest pl-2">
                * Advanced: Use AND, OR, NOT for complex queries (e.g., France AND Medal)
              </span>
            </div>
            
            <button 
              onClick={executeNewSearch}
              disabled={!isReady}
              className="bg-white hover:bg-mca-cyan text-mca-black font-black uppercase tracking-widest px-10 py-4 rounded-none border-2 border-white hover:border-mca-cyan transition-all duration-200 cursor-pointer disabled:opacity-30 shrink-0 text-sm active:translate-y-1"
            >
              SEARCH COLLECTION
            </button>
            <button 
              onClick={handleSurpriseMe}
              disabled={!isReady}
              className="bg-mca-yellow hover:bg-mca-cyan text-mca-black font-black uppercase tracking-widest px-8 py-4 rounded-none border-2 border-mca-yellow hover:border-mca-cyan transition-all duration-200 cursor-pointer disabled:opacity-30 shrink-0 text-sm active:translate-y-1"
            >
              SURPRISE ME
            </button>
          </div>

          {/* Filtering Dashboard - MCA Bold Box Style */}
          <div className="border-2 border-white bg-mca-black p-6 space-y-6">
            
            {/* Timeline Histogram */}
            {timelineData.length > 0 && (
              <div className="space-y-3 pb-6 border-b border-white/20">
                <div className="flex justify-between items-end">
                  <span className="block text-xs uppercase tracking-wider font-extrabold text-mca-cyan">
                    // HISTORICAL TIMELINE
                  </span>
                  {selectedDecade !== "ALL" && (
                    <button 
                      onClick={() => setSelectedDecade("ALL")}
                      className="text-[10px] text-mca-yellow hover:text-white uppercase font-bold tracking-widest"
                    >
                      [ CLEAR SELECTION ]
                    </button>
                  )}
                </div>
                <div className="flex h-24 space-x-1 border-b border-white/20 pb-1 mt-4">
                  {timelineData.map((d, i) => {
                    const maxCount = Math.max(...timelineData.map(t => Number(t.count)));
                    const heightPercent = (Number(d.count) / maxCount) * 100;
                    const isSelected = selectedDecade === String(d.decade);
                    return (
                      <div 
                        key={i} 
                        className="flex-1 flex flex-col justify-end group cursor-pointer relative"
                        onClick={() => setSelectedDecade(String(d.decade))}
                      >
                        {/* Tooltip */}
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 bg-white text-mca-black text-[10px] font-bold px-2 py-1 z-10 pointer-events-none whitespace-nowrap">
                          {d.decade}s ({Number(d.count).toLocaleString()})
                        </div>
                        {/* Bar */}
                        <div 
                          style={{ height: `${Math.max(2, heightPercent)}%` }} 
                          className={`w-full transition-all duration-200 ${isSelected ? 'bg-mca-yellow' : 'bg-slate-700 group-hover:bg-mca-cyan'}`}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-[10px] font-mono text-slate-500 font-bold">
                  <span>{timelineData[0]?.decade}s</span>
                  <span>{timelineData[timelineData.length - 1]?.decade}s</span>
                </div>
              </div>
            )}
            


            {/* Filter 2: Genre Categorization */}
            <div className="space-y-3 border-t border-white/20 pt-6">
              <span className="block text-xs uppercase tracking-wider font-extrabold text-mca-cyan">
                // OBJECT TYPE
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
                  { key: "PRINT", label: "PRINTS" }
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="flex flex-col space-y-2">
                  <label className="text-[10px] text-slate-400 font-bold tracking-wider">GENRE</label>
                  <select 
                    value={selectedGenre}
                    onChange={(e) => setSelectedGenre(e.target.value)}
                    className="bg-mca-black border border-white/20 text-white text-xs px-3 py-2 uppercase outline-none focus:border-mca-cyan truncate"
                  >
                    <option value="ALL">ALL TYPES</option>
                    {topGenres.map((g, i) => <option key={i} value={g}>{g}</option>)}
                  </select>
                </div>

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
        </section>

        {/* Collection Grid */}
        <main>
          {sharedCollectionIds.length > 0 && (
            <div className="bg-mca-cyan text-mca-black font-black uppercase tracking-widest p-4 flex flex-col md:flex-row justify-between items-center z-10 border-b-2 border-white mb-6">
              <div className="mb-2 md:mb-0">
                VIEWING SHARED COLLECTION ({sharedCollectionIds.length} ITEMS)
              </div>
              <button 
                onClick={() => {
                  setSharedCollectionIds([]);
                  if (typeof window !== 'undefined') {
                    const url = new URL(window.location.href);
                    url.searchParams.delete('collection');
                    url.searchParams.set('collection_cleared', 'true');
                    window.history.pushState({}, '', url);
                  }
                  executeNewSearch();
                }}
                className="border-2 border-mca-black px-4 py-2 hover:bg-mca-black hover:text-mca-cyan transition-colors text-xs"
              >
                [X] CLEAR & RETURN TO MAIN CATALOG
              </button>
            </div>
          )}
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
                  className="bg-mca-black border-r border-b border-white/20 hover:bg-mca-dark/50 transition-all duration-200 flex flex-col group p-6 space-y-6 cursor-pointer relative"
                  onClick={() => handleRecordClick(item.field_identifier)}
                >
                  
                  {/* Image Area - Stark Fit Layout */}
                  <div className="h-60 bg-mca-black relative flex items-center justify-center p-2 border border-white/10">
                    {(() => {
                      const imageId = (item.field_identifier || "").split(';')[0].trim();
                      return (
                        <img 
                          src={`/images/${encodeURIComponent(imageId.replace(/[^a-zA-Z0-9.-]/g, '_'))}.jpg`}
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
                        {item.title || item.field_identifier || '[UNTITLED OBJECT]'}
                      </h3>
                      
                      <p className="text-slate-400 text-xs leading-relaxed font-sans font-light line-clamp-4">
                        {item.field_description_long || 'No description at this time.'}
                      </p>
                      
                      <div className="flex flex-col space-y-1 pt-3 text-[10px] uppercase font-bold tracking-widest text-slate-500 border-t border-white/10 mt-3">
                        {item.field_linked_agent && (
                          <div className="flex space-x-2">
                            <span className="text-slate-600 w-20 shrink-0">CREATOR</span>
                            <span className="text-slate-300 truncate">
                              {parseDelimited(item.field_linked_agent, '|').map((agent: any, i: number, arr: any[]) => (
                                <span key={i}>
                                  <Link href={`/creator/${encodeURIComponent(agent)}`} className="hover:text-mca-yellow hover:underline" onClick={(e: any) => e.stopPropagation()}>
                                    {agent}
                                  </Link>
                                  {i < arr.length - 1 ? ' | ' : ''}
                                </span>
                              ))}
                            </span>
                          </div>
                        )}
                        {item.field_edtf_date_created && (
                          <div className="flex space-x-2">
                            <span className="text-slate-600 w-20 shrink-0">DATE</span>
                            <span className="text-slate-300 truncate">{formatEDTFDate(item.field_edtf_date_created)}</span>
                          </div>
                        )}
                        {item.field_place_published && (
                          <div className="flex space-x-2">
                            <span className="text-slate-600 w-20 shrink-0">PLACE</span>
                            <span className="text-slate-300 truncate">{item.field_place_published}</span>
                          </div>
                        )}
                        {item.field_physical_form && (
                          <div className="flex space-x-2">
                            <span className="text-slate-600 w-20 shrink-0">MATERIAL</span>
                            <span className="text-slate-300 truncate">{item.field_physical_form}</span>
                          </div>
                        )}
                        {item.field_extent && (
                          <div className="flex space-x-2">
                            <span className="text-slate-600 w-20 shrink-0">DIMENSIONS</span>
                            <span className="text-slate-300 truncate">{item.field_extent}</span>
                          </div>
                        )}
                        {item.field_subject && (
                          <div className="flex space-x-2">
                            <span className="text-slate-600 w-20 shrink-0">SUBJECT</span>
                            <span className="text-slate-300 truncate">
                              {parseDelimited(item.field_subject, item.field_subject.includes(';') ? ';' : '|').map((subject: string, i: number, arr: any[]) => (
                                <span key={i}>
                                  <Link href={`/subject/${encodeURIComponent(subject)}`} className="hover:text-mca-yellow hover:underline" onClick={(e: any) => e.stopPropagation()}>
                                    {subject}
                                  </Link>
                                  {i < arr.length - 1 ? '; ' : ''}
                                </span>
                              ))}
                            </span>
                          </div>
                        )}
                        {item.field_credit_line && (
                          <div className="flex space-x-2">
                            <span className="text-slate-600 w-20 shrink-0">CREDIT</span>
                            <span className="text-slate-300 truncate">{item.field_credit_line}</span>
                          </div>
                        )}
                        {item.field_collection_note && (
                          <div className="flex space-x-2">
                            <span className="text-slate-600 w-20 shrink-0">NOTE</span>
                            <span className="text-slate-300 truncate">{item.field_collection_note}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pt-4 border-t border-white/10 flex items-center justify-between text-[10px] font-bold">
                      <span className="text-mca-yellow">{item.field_genre || 'UNCATEGORIZED'}</span>
                      <div className="flex items-center space-x-2">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            isInCollection(item.field_identifier) ? removeItem(item.field_identifier) : addItem(item);
                          }}
                          className={`px-3 py-1.5 border transition-colors ${isInCollection(item.field_identifier) ? 'bg-mca-cyan border-mca-cyan text-mca-black' : 'border-white/20 text-slate-400 hover:text-white hover:border-white'}`}
                        >
                          {isInCollection(item.field_identifier) ? '[ - ] SAVED' : '[ + ] SAVE'}
                        </button>
                      </div>
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
        <div className="w-full px-6 md:px-12 2xl:px-24 py-6 flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-slate-600">
          <span>Wolfsonian-FIU Collection Data Lakehouse</span>
          <span>Built by <span className="text-slate-400">Andrius Aukstuolis</span></span>
        </div>
      </footer>

      {/* Full-Screen Brutalist Metadata Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-stretch bg-mca-black overflow-hidden font-mono text-white animate-in fade-in duration-200">
          
          {/* Close Button Area */}
          <div className="absolute top-0 right-0 p-6 z-50">
            <button 
              onClick={() => setIsModalOpen(false)}
              className="bg-white text-mca-black font-black uppercase tracking-widest px-6 py-3 border-2 border-white hover:bg-mca-cyan transition-colors text-sm"
            >
              [X] CLOSE
            </button>
          </div>

          <div className="flex flex-col md:flex-row w-full h-full min-h-0">
            
            {/* Left side - Image */}
            <div className="w-full md:w-1/2 bg-black border-b md:border-b-0 md:border-r border-white/20 relative flex flex-col p-8 overflow-y-auto overflow-x-hidden h-[50vh] md:h-auto custom-scrollbar">
              {isModalLoading ? (
                <div className="animate-spin h-16 w-16 border-4 border-white border-t-mca-cyan rounded-none mx-auto my-auto flex-shrink-0" />
              ) : selectedRecord ? (
                (() => {
                  const identifiers = (selectedRecord.field_identifier || "").split(';').map((i: string) => i.trim()).filter(Boolean);
                  if (identifiers.length === 0) return (
                    <div className="flex flex-col items-center justify-center text-slate-600 text-lg uppercase font-bold tracking-widest space-y-4 my-auto flex-shrink-0">
                      <span>[ NO IMAGE DATA FOUND ]</span>
                    </div>
                  );

                  return identifiers.map((id: string, idx: number) => {
                    const imgSrc = `/images/${encodeURIComponent(id.replace(/[^a-zA-Z0-9.-]/g, '_'))}.jpg`;
                    return (
                      <div key={idx} className="relative w-full flex-shrink-0 flex flex-col items-center justify-center mb-16 last:mb-0 group/img min-h-[40vh] md:min-h-[70vh]">
                        <img 
                          src={imgSrc}
                          alt={`${selectedRecord.title} - image ${idx + 1}`}
                          className="object-contain w-full h-full drop-shadow-2xl z-10 cursor-zoom-in transition-transform duration-300 hover:scale-[1.02]"
                          onClick={(e: any) => {
                            e.stopPropagation();
                            setZoomedImage(imgSrc);
                          }}
                          onError={(e: any) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                            (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                          }}
                        />
                        <div className="absolute hidden inset-0 flex flex-col items-center justify-center bg-mca-black text-slate-600 text-[10px] uppercase font-bold tracking-widest">
                          <span>[ NO IMAGE ${idx + 1} FOUND ]</span>
                        </div>
                        <a 
                          href={imgSrc}
                          download={`${id}.jpg`}
                          className="absolute bottom-0 md:bottom-4 right-0 md:right-4 bg-mca-yellow text-mca-black font-black uppercase tracking-widest px-4 py-3 border-2 border-mca-yellow hover:bg-mca-black hover:text-mca-yellow transition-colors text-[10px] opacity-0 group-hover/img:opacity-100 focus:opacity-100 z-20"
                          onClick={(e) => e.stopPropagation()}
                        >
                          [⬇] DOWNLOAD JPG {identifiers.length > 1 ? `(${idx + 1}/${identifiers.length})` : ''}
                        </a>
                      </div>
                    );
                  });
                })()
              ) : null}
            </div>

            {/* Right side - Raw Metadata Ledger */}
            <div className="w-full md:w-1/2 h-full overflow-y-auto bg-mca-black p-8 md:p-12 md:pt-28">
              <div className="max-w-2xl mx-auto space-y-12 pb-32">
                
                {isModalLoading ? (
                  <div className="space-y-4 animate-pulse">
                    <div className="h-8 bg-white/10 w-3/4"></div>
                    <div className="h-4 bg-white/10 w-1/2"></div>
                    <div className="h-4 bg-white/10 w-full mt-12"></div>
                    <div className="h-4 bg-white/10 w-full"></div>
                    <div className="h-4 bg-white/10 w-5/6"></div>
                  </div>
                ) : selectedRecord ? (
                  <>
                    <header className="space-y-4 border-b-4 border-white pb-6">
                      <div className="flex justify-between items-start">
                        <div className="text-mca-cyan text-xs font-bold tracking-widest uppercase">
                          // RECORD: {selectedRecord.field_identifier}
                        </div>
                        <button 
                          onClick={() => isInCollection(selectedRecord.field_identifier) ? removeItem(selectedRecord.field_identifier) : addItem(selectedRecord)}
                          className={`text-xs px-4 py-2 uppercase font-bold tracking-widest border-2 transition-colors ${isInCollection(selectedRecord.field_identifier) ? 'bg-mca-cyan border-mca-cyan text-mca-black hover:bg-mca-black hover:text-mca-cyan' : 'bg-mca-black border-white text-white hover:bg-white hover:text-mca-black'}`}
                        >
                          {isInCollection(selectedRecord.field_identifier) ? '[-] REMOVE FROM COLLECTION' : '[+] ADD TO COLLECTION'}
                        </button>
                      </div>
                      <h2 className="text-3xl md:text-5xl font-black font-display uppercase tracking-tight leading-tight break-words">
                        {selectedRecord.title || selectedRecord.field_identifier || '[UNTITLED OBJECT]'}
                      </h2>
                    </header>

                    <div className="space-y-8">
                      {Object.entries(selectedRecord)
                        .filter(([key, val]) => val !== null && val !== "" && !["has_image", "title", "year_created", "source_system", "id"].includes(key))
                        .sort(([keyA], [keyB]) => {
                          const orderedFields = ["field_identifier", "field_collection_type", "field_extent", "field_genre", "field_description_long", "field_linked_agent", "field_subject", "field_place_published", "field_edtf_date_created", "decade_created", "field_physical_form", "field_collection_note", "field_credit_line"];
                          const idxA = orderedFields.indexOf(keyA);
                          const idxB = orderedFields.indexOf(keyB);
                          if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                          if (idxA !== -1) return -1;
                          if (idxB !== -1) return 1;
                          return 0;
                        })
                        .map(([key, val], i) => {
                          const fieldLabels: Record<string, string> = {
                            field_identifier: "Accession Number",
                            field_collection_type: "Collection",
                            field_extent: "Dimensions",
                            field_genre: "Genre",
                            field_description_long: "Description",
                            field_linked_agent: "Creator",
                            field_subject: "Subjects",
                            field_place_published: "Place Published",
                            field_edtf_date_created: "Date Created",
                            decade_created: "Decade Created",
                            field_credit_line: "Credit Line",
                            field_physical_form: "Material",
                            field_collection_note: "Collection Note",
                          };
                          return (
                            <div key={i} className="flex flex-col space-y-2 group">
                              <span className="text-[10px] text-mca-cyan font-bold tracking-widest uppercase break-all">
                                {fieldLabels[key] || key}
                              </span>
                              <span className="text-sm md:text-base text-slate-300 font-light leading-relaxed break-words whitespace-pre-wrap">
                                {key === 'field_linked_agent' ? (
                                  <span>
                                    {parseDelimited(val, '|').map((agent: any, j: number, arr: any[]) => (
                                      <span key={j}>
                                        <Link href={`/creator/${encodeURIComponent(agent)}`} className="hover:text-mca-yellow hover:underline" onClick={(e: any) => e.stopPropagation()}>
                                          {agent}
                                        </Link>
                                        {j < arr.length - 1 ? ' | ' : ''}
                                      </span>
                                    ))}
                                  </span>
                                ) : key === 'field_subject' ? (
                                  <span>
                                    {parseDelimited(String(val), String(val).includes(';') ? ';' : '|').map((subject: string, j: number, arr: any[]) => (
                                      <span key={j}>
                                        <Link href={`/subject/${encodeURIComponent(subject)}`} className="hover:text-mca-yellow hover:underline" onClick={(e: any) => e.stopPropagation()}>
                                          {subject}
                                        </Link>
                                        {j < arr.length - 1 ? '; ' : ''}
                                      </span>
                                    ))}
                                  </span>
                                ) : key === 'field_genre' ? (
                                  <span>
                                    {parseDelimited(val, '|').map((genre: any, j: number, arr: any[]) => (
                                      <span key={j}>
                                        <Link href={`/genre/${encodeURIComponent(genre)}`} className="hover:text-mca-yellow hover:underline" onClick={(e: any) => e.stopPropagation()}>
                                          {genre}
                                        </Link>
                                        {j < arr.length - 1 ? ' | ' : ''}
                                      </span>
                                    ))}
                                  </span>
                                ) : key === 'field_edtf_date_created' ? (
                                  formatEDTFDate(val)
                                ) : key === 'field_place_published' ? (
                                  <span>
                                    {parseDelimited(String(val), '|').map((place: string, j: number, arr: any[]) => (
                                      <span key={j}>
                                        <Link href={`/place/${encodeURIComponent(place)}`} className="hover:text-mca-yellow hover:underline" onClick={(e: any) => e.stopPropagation()}>
                                          {place}
                                        </Link>
                                        {j < arr.length - 1 ? ' | ' : ''}
                                      </span>
                                    ))}
                                  </span>
                                ) : key === 'field_collection_type' ? (
                                  <span>
                                    {parseDelimited(String(val), '|').map((col: string, j: number, arr: any[]) => (
                                      <span key={j}>
                                        <Link href={`/collection/${encodeURIComponent(col)}`} className="hover:text-mca-yellow hover:underline" onClick={(e: any) => e.stopPropagation()}>
                                          {col}
                                        </Link>
                                        {j < arr.length - 1 ? ' | ' : ''}
                                      </span>
                                    ))}
                                  </span>
                                ) : (
                                  String(val)
                                )}
                              </span>
                            </div>
                          );
                      })}
                    </div>

                    {relatedRecords.length > 0 && (
                      <div className="pt-16 mt-16 border-t-2 border-white/20">
                        <h3 className="text-xl font-bold tracking-widest uppercase mb-6 text-mca-yellow">
                          [ EXPLORE MORE LIKE THIS ]
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                          {relatedRecords.map((rel: any, i: number) => (
                            <button 
                              key={i} 
                              onClick={() => handleRecordClick(rel.field_identifier)}
                              className="group relative flex flex-col text-left overflow-hidden border-2 border-white/20 hover:border-mca-cyan transition-colors"
                            >
                              <div className="w-full aspect-square bg-white/5 relative">
                                <img 
                                  src={`/images/${encodeURIComponent((rel.field_identifier || "").split(';')[0].trim().replace(/[^a-zA-Z0-9.-]/g, '_'))}.jpg`}
                                  alt={rel.title}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                />
                              </div>
                              <div className="p-3 bg-mca-black border-t-2 border-white/20">
                                <h4 className="font-bold text-xs uppercase leading-snug line-clamp-2 group-hover:text-mca-cyan transition-colors">
                                  {rel.title || rel.field_identifier || '[UNTITLED OBJECT]'}
                                </h4>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-red-500 font-bold uppercase tracking-widest">
                    Failed to load record metadata.
                  </div>
                )}
              </div>
            </div>
            
          </div>
        </div>
      )}

      {/* Full-Screen Brutalist Collection Drawer */}
      {isCollectionModalOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-mca-black overflow-hidden font-mono text-white animate-in slide-in-from-right duration-300 border-l-4 border-mca-cyan">
          
          <header className="flex items-center justify-between p-6 md:p-10 border-b-2 border-white/20">
            <div>
              <h2 className="text-3xl md:text-5xl font-black font-display uppercase tracking-tight leading-tight text-white">
                SAVED <span className="text-mca-cyan">COLLECTION</span>
              </h2>
              <div className="text-slate-400 text-xs font-bold tracking-widest uppercase mt-2">
                {collection.length} RECORDS SELECTED
              </div>
            </div>
            <div className="flex space-x-4">
              {collection.length > 0 && (
                <>
                  <button 
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        const url = new URL(window.location.href);
                        url.searchParams.set('collection', collection.map(c => c.field_identifier).join(','));
                        url.searchParams.delete('collection_cleared');
                        navigator.clipboard.writeText(url.toString());
                        setIsCopied(true);
                        setTimeout(() => setIsCopied(false), 2000);
                      }
                    }}
                    className="bg-mca-cyan text-mca-black font-black uppercase tracking-widest px-6 py-3 border-2 border-mca-cyan hover:bg-transparent hover:text-mca-cyan transition-colors text-sm"
                  >
                    {isCopied ? '[✓] COPIED!' : '[🔗] SHARE COLLECTION'}
                  </button>
                  <button 
                    onClick={exportCsv}
                    className="bg-mca-yellow text-mca-black font-black uppercase tracking-widest px-6 py-3 border-2 border-mca-yellow hover:bg-transparent hover:text-mca-yellow transition-colors text-sm"
                  >
                    [⬇] EXPORT CSV
                  </button>
                  <button 
                    onClick={clearCollection}
                    className="bg-transparent text-red-500 font-black uppercase tracking-widest px-6 py-3 border-2 border-red-500 hover:bg-red-500 hover:text-white transition-colors text-sm"
                  >
                    [🗑] CLEAR
                  </button>
                </>
              )}
              <button 
                onClick={() => setIsCollectionModalOpen(false)}
                className="bg-white text-mca-black font-black uppercase tracking-widest px-6 py-3 border-2 border-white hover:bg-mca-cyan hover:border-mca-cyan transition-colors text-sm"
              >
                [X] CLOSE
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-6 md:p-10 bg-mca-dark/50">
            {collection.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full space-y-6 text-slate-500">
                <span className="text-5xl">📭</span>
                <p className="text-sm font-bold tracking-widest uppercase">YOUR COLLECTION IS EMPTY</p>
                <button 
                  onClick={() => setIsCollectionModalOpen(false)}
                  className="px-6 py-3 border border-white/20 hover:border-white text-white transition-colors text-xs font-bold tracking-widest uppercase"
                >
                  RETURN TO SEARCH
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {collection.map((item, idx) => (
                  <article key={idx} className="bg-mca-black border border-white/20 p-4 flex flex-col space-y-4 group">
                    <div 
                      className="h-40 bg-mca-dark relative flex items-center justify-center p-2 border border-white/10 cursor-pointer hover:border-mca-cyan transition-colors"
                      onClick={() => {
                        setIsCollectionModalOpen(false);
                        handleRecordClick(item.field_identifier);
                      }}
                    >
                      <img 
                        src={`/images/${encodeURIComponent((item.field_identifier || "").split(';')[0].trim().replace(/[^a-zA-Z0-9.-]/g, '_'))}.jpg`}
                        alt={item.title}
                        className="object-contain max-w-full max-h-full"
                        onError={(e: any) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                          (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                        }}
                      />
                      <div className="absolute hidden inset-0 flex flex-col items-center justify-center bg-mca-dark/95 text-slate-600 text-[10px] uppercase font-bold tracking-widest">
                        <span>[ NO IMAGE ]</span>
                      </div>
                    </div>
                    
                    <div className="flex-1 flex flex-col justify-between space-y-4">
                      <div 
                        className="cursor-pointer group/title"
                        onClick={() => {
                          setIsCollectionModalOpen(false);
                          handleRecordClick(item.field_identifier);
                        }}
                      >
                        <div className="text-[9px] text-mca-cyan font-bold mb-1 truncate">{item.field_identifier}</div>
                        <h3 className="font-bold text-xs uppercase leading-snug line-clamp-2 group-hover/title:text-mca-cyan transition-colors">{item.title || item.field_identifier || '[UNTITLED OBJECT]'}</h3>
                      </div>
                      <button 
                        onClick={() => removeItem(item.field_identifier)}
                        className="w-full py-2 border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white transition-colors text-[10px] font-bold tracking-widest uppercase"
                      >
                        [ - ] REMOVE
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* FULL SCREEN ZOOM MODAL */}
      {zoomedImage && (
        <div 
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center cursor-zoom-out p-4 md:p-12 backdrop-blur-sm"
          onClick={() => setZoomedImage(null)}
        >
          <img 
            src={zoomedImage}
            alt="Zoomed full screen"
            className="w-full h-full object-contain max-w-[95vw] max-h-[95vh] drop-shadow-[0_0_50px_rgba(255,255,255,0.1)]"
          />
        </div>
      )}

    </div>
  );
}
