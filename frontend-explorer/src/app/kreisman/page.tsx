"use client";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useDuckDB } from "@/providers/DuckDBProvider";
import { formatEDTFDate } from "../../utils/formatters";

export default function KreismanCollection() {
  const { isReady, runQuery, error } = useDuckDB();
  const router = useRouter();

  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    if (isReady) {
      handleSearch();
    }
  }, [isReady]);

  const handleSearch = async () => {
    if (!isReady) return;
    setLoading(true);
    
    try {
      const dataQuery = `
        SELECT title, field_identifier, field_collection_type, field_collection_note, field_credit_line, field_extent, field_physical_form, field_genre, field_description_long, location, storage_location, source_system, has_image, image_count, field_linked_agent, field_subject, field_place_published, field_edtf_date_created 
        FROM catalog 
        WHERE LOWER(field_credit_line) LIKE '%kreisman%' AND LOWER(field_credit_line) LIKE '%dodge%'
        ORDER BY has_image DESC, title ASC 
      `;
      
      const countQuery = `SELECT count(*) as total FROM catalog WHERE LOWER(field_credit_line) LIKE '%kreisman%' AND LOWER(field_credit_line) LIKE '%dodge%'`;

      const [data, countData] = await Promise.all([
        runQuery(dataQuery),
        runQuery(countQuery)
      ]);
      
      if (data) {
        setResults(data);
      }
      
      if (countData && countData.length > 0) {
        setTotalCount(Number(countData[0].total));
      }
      
    } catch (error: any) {
      console.error(error);
    }
    
    setLoading(false);
  };

  const handleRecordClick = (identifier: string) => {
    router.push(`/record/${encodeURIComponent(identifier)}`);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col selection:bg-mca-yellow selection:text-mca-black antialiased font-sans">
      
      {/* Top Banner Navigation */}
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-[#0a0a0a]/80 border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-xs uppercase tracking-widest font-mono text-gray-400 hover:text-white transition-colors duration-300">
          ← Back to Explorer
        </Link>
        <span className="text-xs font-mono tracking-widest text-mca-cyan uppercase">
          Special Exhibition
        </span>
      </nav>

      <div className="w-full flex-1 flex flex-col">
        
        {/* Immersive Hero Section */}
        <header className="relative w-full py-24 md:py-40 px-6 md:px-12 2xl:px-24 flex flex-col items-center justify-center text-center overflow-hidden border-b border-white/10">
          <div className="absolute inset-0 bg-gradient-to-b from-mca-cyan/10 to-transparent pointer-events-none opacity-50" />
          
          <div className="relative z-10 space-y-8 max-w-4xl mx-auto">
            <div className="inline-flex items-center space-x-3 bg-white/5 border border-white/10 px-4 py-1.5 rounded-full backdrop-blur-sm">
              <span className={`h-2 w-2 rounded-full ${isReady ? 'bg-mca-cyan animate-pulse' : 'bg-mca-yellow animate-ping'}`} />
              <span className="text-[10px] uppercase tracking-[0.2em] font-mono text-gray-300">
                {isReady ? 'Collection Online' : 'Initializing Engine...'}
              </span>
            </div>
            
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-black font-display uppercase tracking-tighter leading-none bg-clip-text text-transparent bg-gradient-to-br from-white to-gray-500 pb-2">
              The Dodge and Kreisman Collection
            </h1>

            <p className="text-gray-400 text-lg md:text-xl font-light leading-relaxed max-w-2xl mx-auto">
              A curated exhibition featuring {isReady ? totalCount.toLocaleString() : '---'} exquisite archival artifacts and museum objects, meticulously preserved and digitized for public discovery.
            </p>
          </div>
        </header>

        {/* Database Error Banner */}
        {error && (
          <div className="bg-red-950/50 border border-red-500/50 text-red-200 px-6 py-4 text-xs flex flex-col items-center text-center">
            <span className="font-bold text-red-500 font-mono tracking-wide mb-1">
              DATABASE ENGINE ERROR
            </span>
            <span className="font-mono opacity-80">{error}</span>
          </div>
        )}

        {/* Collection Gallery */}
        <main className="w-full px-6 md:px-12 2xl:px-24 py-16">
          <div className="flex justify-between items-end mb-12 border-b border-white/10 pb-6">
            <h2 className="text-white font-bold tracking-[0.3em] text-sm font-mono uppercase">
              Exhibition Gallery
            </h2>
            <div className="text-gray-400 font-mono text-xs uppercase tracking-widest">
              <span className="text-white font-bold mr-2">{isReady ? totalCount.toLocaleString() : '---'}</span> 
              Items Displayed
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-32 space-y-6">
              <div className="animate-spin h-8 w-8 border-2 border-white/20 border-t-white rounded-full" />
              <p className="text-white font-light font-mono text-xs tracking-[0.3em] uppercase opacity-50">
                Loading artifacts...
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
              {results.map((item, idx) => (
                <article 
                  key={idx}
                  onClick={() => handleRecordClick(item.field_identifier.split(";")[0].trim())}
                  className="group relative flex flex-col bg-white/5 border border-white/10 hover:bg-white/10 transition-all duration-500 cursor-pointer overflow-hidden rounded-sm"
                >
                  <div className="relative w-full aspect-square bg-black/50 overflow-hidden flex items-center justify-center p-8">
                    {item.has_image ? (
                      <img 
                        src={`https://lakehouse.wolfsonian.org/images/${item.field_identifier.split(";")[0].trim()}.jpg`}
                        alt={item.title}
                        className="object-contain w-full h-full transform group-hover:scale-105 transition-transform duration-700 ease-out"
                        loading="lazy"
                        crossOrigin="anonymous"
                      />
                    ) : (
                      <div className="text-[10px] font-mono text-gray-600 uppercase tracking-widest text-center">
                        Image Restricted<br/>or Unavailable
                      </div>
                    )}
                    
                    {/* Hover Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                  </div>
                  
                  <div className="p-6 flex flex-col flex-1 z-10 bg-gradient-to-b from-transparent to-black/50">
                    <div className="text-[10px] font-mono font-bold text-mca-cyan uppercase tracking-widest mb-3 line-clamp-1">
                      {item.field_identifier.split(";")[0].trim()}
                    </div>
                    
                    <h3 className="font-bold text-lg md:text-xl text-white leading-snug line-clamp-2 mb-4 group-hover:text-mca-yellow transition-colors duration-300">
                      {item.title || "Untitled"}
                    </h3>
                    
                    <div className="mt-auto space-y-2 opacity-60 group-hover:opacity-100 transition-opacity duration-300">
                      {item.field_linked_agent && (
                        <div className="text-xs font-light line-clamp-1">
                          <span className="font-bold uppercase tracking-wider text-[10px] mr-2 opacity-50">Creator</span>
                          {item.field_linked_agent.split('|')[0]}
                        </div>
                      )}
                      
                      {item.field_edtf_date_created && (
                        <div className="text-xs font-light line-clamp-1">
                          <span className="font-bold uppercase tracking-wider text-[10px] mr-2 opacity-50">Date</span>
                          {formatEDTFDate(item.field_edtf_date_created)}
                        </div>
                      )}
                      
                      {item.field_genre && (
                        <div className="text-xs font-light line-clamp-1">
                          <span className="font-bold uppercase tracking-wider text-[10px] mr-2 opacity-50">Type</span>
                          {item.field_genre.split('|')[0]}
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
