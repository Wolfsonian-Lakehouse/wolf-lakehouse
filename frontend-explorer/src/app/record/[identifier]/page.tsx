"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDuckDB } from "../../../hooks/useDuckDB";
import { useCollection } from "../../../hooks/useCollection";
import { parseDelimited, formatEDTFDate } from "../../../utils/formatters";
import ImageReader from "../../../components/ImageReader";

export default function RecordPage({ params }: { params: Promise<{ identifier: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { isReady, runQuery, error } = useDuckDB();
  const identifier = decodeURIComponent(resolvedParams.identifier);

  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);
  const [relatedRecords, setRelatedRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const { collection, isInCollection, addItem, removeItem } = useCollection();

  useEffect(() => {
    if (isReady) {
      loadRecord();
    }
  }, [isReady, identifier]);

  const loadRecord = async () => {
    if (!isReady) return;
    setLoading(true);
    try {
      const idEscaped = identifier.replace(/'/g, "''");
      const query = `SELECT * FROM catalog WHERE field_identifier = '${idEscaped}' OR field_identifier LIKE '${idEscaped};%' OR field_identifier LIKE '%; ${idEscaped};%' OR field_identifier LIKE '%; ${idEscaped}' LIMIT 1`;
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
          SELECT title, field_identifier, has_image, image_count 
          FROM catalog 
          WHERE field_identifier != '${idEscaped}' AND field_identifier NOT LIKE '${idEscaped};%' AND field_identifier NOT LIKE '%; ${idEscaped};%' AND field_identifier NOT LIKE '%; ${idEscaped}' 
          AND has_image = true 
          ${matchSql}
          ORDER BY field_identifier ASC
          LIMIT 4
        `;
        
        let relatedData = await runQuery(relatedQuery);
        
        // Fallback: If no semantic matches, just show 4 random visual records
        if (!relatedData || relatedData.length === 0) {
          const fallbackQuery = `
            SELECT title, field_identifier, has_image, image_count 
            FROM catalog 
            WHERE field_identifier != '${idEscaped}' AND field_identifier NOT LIKE '${idEscaped};%' AND field_identifier NOT LIKE '%; ${idEscaped};%' AND field_identifier NOT LIKE '%; ${idEscaped}' 
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
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-stretch bg-mca-black overflow-hidden font-mono text-white animate-in fade-in duration-200 relative">
      
      {/* Close Button Area */}
      <div className="absolute top-0 right-0 p-6 z-50">
        <button 
          onClick={() => router.back()}
          className="bg-white text-mca-black font-black uppercase tracking-widest px-6 py-3 border-2 border-white hover:bg-mca-cyan transition-colors text-sm"
        >
          [←] GO BACK
        </button>
      </div>

      <div className="flex flex-col md:flex-row w-full h-full min-h-0">
        
        {/* Left side - Image */}
        <div className="w-full md:w-1/2 bg-black border-b md:border-b-0 md:border-r border-white/20 relative flex flex-col overflow-hidden h-[50vh] md:h-full">
          {loading ? (
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

              return (
                <ImageReader 
                  images={images} 
                  selectedRecord={selectedRecord} 
                  setZoomedImage={setZoomedImage} 
                />
              );
            })()
          ) : null}
        </div>

        {/* Right side - Raw Metadata Ledger */}
        <div className="w-full md:w-1/2 h-full overflow-y-auto bg-mca-black p-8 md:p-12 md:pt-28">
          <div className="max-w-2xl mx-auto space-y-12 pb-32">
            
            {loading ? (
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
                        <Link 
                          key={i} 
                          href={`/record/${encodeURIComponent(rel.field_identifier)}`}
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
                        </Link>
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
