"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useDuckDB } from "../../../hooks/useDuckDB";
import { formatEDTFDate } from "../../../utils/formatters";
import ImageReader from "../../../components/ImageReader";


export default function CreatorPage({ params }: { params: Promise<{ name: string }> }) {
  const resolvedParams = use(params);
  const { isReady, runQuery, error } = useDuckDB();
  const creatorName = decodeURIComponent(resolvedParams.name);

  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  // Modal State
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isModalLoading, setIsModalLoading] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  useEffect(() => {
    if (isReady) {
      handleSearch();
    }
  }, [isReady, creatorName]);

  const handleSearch = async () => {
    if (!isReady) return;
    setLoading(true);
    
    try {
      const escapedCreator = creatorName.replace(/'/g, "''");
      const dataQuery = `
        SELECT title, field_identifier, field_collection_type, field_collection_note, field_credit_line, field_extent, field_physical_form, field_genre, field_description_long, source_system, has_image, image_count, field_linked_agent, field_subject, field_place_published, field_edtf_date_created 
        FROM catalog 
        WHERE list_contains(string_split(field_collection_type, '|'), '${escapedCreator}')
        ORDER BY has_image DESC, title ASC 
      `;
      
      const countQuery = `SELECT count(*) as total FROM catalog WHERE list_contains(string_split(field_collection_type, '|'), '${escapedCreator}')`;

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

  const handleRecordClick = async (identifier: string) => {
    setIsModalOpen(true);
    setIsModalLoading(true);
    setSelectedRecord(null);
    try {
      const idEscaped = identifier.replace(/'/g, "''");
      const query = `SELECT * FROM catalog WHERE field_identifier = '${idEscaped}' OR field_identifier LIKE '${idEscaped};%' OR field_identifier LIKE '%; ${idEscaped};%' OR field_identifier LIKE '%; ${idEscaped}' LIMIT 1`;
      const data = await runQuery(query);
      if (data && data.length > 0) {
        setSelectedRecord(data[0]);
      }
    } catch (error: any) {
      console.error("Modal fetch error:", error);
    }
    setIsModalLoading(false);
  };

  return (
    <div className="min-h-screen bg-mca-black text-white flex flex-col selection:bg-mca-yellow selection:text-mca-black antialiased font-mono">
      
      {/* Top Banner Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 border-b-2 border-white text-xs uppercase font-bold tracking-wider divide-y-2 md:divide-y-0 md:divide-x-2 divide-white bg-mca-black">
        <div className="p-4 flex items-center justify-between">
          <Link href="/" className="hover:text-mca-yellow transition-colors">
            ← RETURN TO EXPLORER
          </Link>
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
          <span>DOSSIER MATCHES</span>
          <span className="text-white font-mono">
            {isReady ? Number(totalCount).toLocaleString() : '---'}
          </span>
        </div>
      </div>

      <div className="w-full px-6 md:px-12 2xl:px-24 py-12 md:py-20 flex-1 space-y-16">
        
        {/* Dossier Header */}
        <header className="space-y-6">
          <div className="text-[11px] uppercase tracking-widest text-mca-cyan font-bold font-mono">
            COLLECTION DOSSIER INDEX
          </div>
          
          <h1 className="text-[10vw] md:text-[6vw] font-black font-display uppercase tracking-tighter leading-[0.85] text-white break-words">
            {creatorName}
          </h1>

          <div className="h-1 bg-white w-full mt-4" />
          
          <p className="text-slate-400 text-sm md:text-base font-sans max-w-2xl font-light leading-relaxed">
            Displaying all known archival records associated with this collection.
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

        {/* Collection Grid */}
        <main>
          <div className="flex justify-between items-end mb-6 border-b border-white/20 pb-4">
            <h2 className="text-white font-bold tracking-widest text-sm uppercase">
              DOSSIER ARCHIVE
            </h2>
            <div className="text-mca-yellow font-mono text-xs uppercase tracking-widest bg-mca-yellow/10 px-3 py-1.5 border border-mca-yellow/20">
              <span className="font-bold text-white mr-2">{isReady ? totalCount.toLocaleString() : '---'}</span> 
              ARTIFACTS
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
                              {item.field_linked_agent.split('|').map((agent: string, i: number) => (
                                <span key={i}>
                                  <Link href={`/creator/${encodeURIComponent(agent.trim())}`} className="hover:text-mca-yellow hover:underline" onClick={(e: any) => e.stopPropagation()}>
                                    {agent.trim()}
                                  </Link>
                                  {i < item.field_linked_agent.split('|').length - 1 ? ' | ' : ''}
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
                            <span className="text-slate-300 truncate">{item.field_subject}</span>
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
                <h4 className="font-extrabold text-white uppercase text-sm tracking-wider">No Dossier Found</h4>
                <p className="text-xs text-slate-500 font-sans leading-relaxed">
                  The query returned zero rows for this collection.
                </p>
              </div>
            </div>
          )}

        </main>
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
            <div className="w-full md:w-1/2 bg-black border-b md:border-b-0 md:border-r border-white/20 relative flex flex-col p-8 overflow-y-auto overflow-x-hidden h-[50vh] md:h-full">
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

                  const images: string[] = [];
                  if (selectedRecord.image_count && selectedRecord.image_count > 0) {
                      const firstId = identifiers[0].replace(/[^a-zA-Z0-9.-]/g, '_');
                      for (let i = 0; i < selectedRecord.image_count; i++) {
                          images.push(i === 0 ? firstId : `${firstId}_${i}`);
                      }
                  } else {
                      images.push(...identifiers.map((id: string) => id.replace(/[^a-zA-Z0-9.-]/g, '_')));
                  }

                  return <ImageReader images={images} selectedRecord={selectedRecord} setZoomedImage={setZoomedImage} />;
                })()
              ) : null}
            </div>

            {/* Right side - Raw Metadata Ledger */}
            <div className="w-full md:w-1/2 h-full overflow-y-auto bg-mca-black p-8 md:p-12">
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
                      <div className="text-mca-cyan text-xs font-bold tracking-widest uppercase">
                        // RECORD: {selectedRecord.field_identifier}
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
                              <h2 className="text-[10px] md:text-xs text-mca-cyan font-bold tracking-[0.2em] mb-4">COLLECTION DOSSIER</h2>
                              <span className="text-[10px] text-mca-cyan font-bold tracking-widest uppercase break-all">
                                {fieldLabels[key] || key}
                              </span>
                              <span className="text-sm md:text-base text-slate-300 font-light leading-relaxed break-words whitespace-pre-wrap">
                                {key === 'field_linked_agent' ? (
                                  <span>
                                    {String(val).split('|').map((agent: string, j: number) => (
                                      <span key={j}>
                                        <Link href={`/creator/${encodeURIComponent(agent.trim())}`} className="hover:text-mca-yellow hover:underline" onClick={(e: any) => e.stopPropagation()}>
                                          {agent.trim()}
                                        </Link>
                                        {j < String(val).split('|').length - 1 ? ' | ' : ''}
                                      </span>
                                    ))}
                                  </span>
                                ) : key === 'field_subject' ? (
                                  <span>
                                    {String(val).split(';').map((subject: string, j: number) => (
                                      <span key={j}>
                                        <Link href={`/subject/${encodeURIComponent(subject.trim())}`} className="hover:text-mca-yellow hover:underline" onClick={(e: any) => e.stopPropagation()}>
                                          {subject.trim()}
                                        </Link>
                                        {j < String(val).split(';').length - 1 ? '; ' : ''}
                                      </span>
                                    ))}
                                  </span>
                                ) : key === 'field_edtf_date_created' ? (
                                  formatEDTFDate(val)
                                ) : (
                                  String(val)
                                )}
                              </span>
                            </div>
                          );
                      })}
                    </div>
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
