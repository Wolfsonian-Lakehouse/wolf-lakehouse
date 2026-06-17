"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useDuckDB } from "../../../hooks/useDuckDB";
import { toJpeg } from 'html-to-image';

export default function MerchMockupPage({ params }: { params: Promise<{ identifier: string }> }) {
  const resolvedParams = use(params);
  const { isReady, runQuery, error } = useDuckDB();
  const identifier = decodeURIComponent(resolvedParams.identifier);

  const [record, setRecord] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Customization State
  const [shirtColor, setShirtColor] = useState<string>("white");
  const [imageScale, setImageScale] = useState<number>(40);
  const [imageY, setImageY] = useState<number>(30);

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
        setRecord(data[0]);
      }
    } catch (err: any) {
      console.error(err);
    }
    setLoading(false);
  };

  const getHexColor = (color: string) => {
    switch (color) {
      case 'white': return '#ffffff';
      case 'black': return '#222222';
      case 'charcoal': return '#4a4a4a';
      case 'yellow': return '#fde047';
      case 'cyan': return '#22d3ee';
      default: return '#ffffff';
    }
  };

  const handleExport = async () => {
    const node = document.getElementById('mockup-container');
    if (!node) return;
    try {
      const dataUrl = await toJpeg(node, { quality: 0.95 });
      const link = document.createElement('a');
      link.download = `t_shirt_${identifier}.jpg`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Failed to export image", err);
    }
  };

  const imgSrc = record ? `/images/${encodeURIComponent((record.field_identifier || "").split(';')[0].trim().replace(/[^a-zA-Z0-9.-]/g, '_'))}.jpg` : "";

  return (
    <div className="min-h-screen bg-mca-black text-white flex flex-col antialiased font-mono selection:bg-mca-yellow selection:text-mca-black">
      
      {/* Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 border-b-2 border-white text-xs uppercase font-bold tracking-wider divide-y-2 md:divide-y-0 md:divide-x-2 divide-white bg-mca-black">
        <div className="p-4 flex items-center justify-between">
          <Link href="/" className="hover:text-mca-yellow transition-colors">
            ← RETURN TO ARCHIVE
          </Link>
          <span className="text-mca-cyan">MERCH LAB</span>
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
          <span>TARGET RECORD</span>
          <span className="text-white font-mono truncate max-w-[200px]">
            {identifier}
          </span>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row flex-1 overflow-hidden">
        
        {/* Left Side: Mockup Canvas */}
        <div className="w-full lg:w-2/3 bg-[#f0f0f0] relative flex items-center justify-center p-8 lg:p-16 border-b lg:border-b-0 lg:border-r border-white/20 overflow-hidden min-h-[60vh]">
          {loading ? (
            <div className="animate-spin h-10 w-10 border-2 border-mca-black border-t-mca-cyan rounded-none" />
          ) : !record ? (
            <div className="text-mca-black font-bold uppercase tracking-widest">[ RECORD NOT FOUND ]</div>
          ) : (
            <div id="mockup-container" className="relative w-full max-w-2xl mx-auto drop-shadow-2xl transition-transform duration-500 bg-[#f0f0f0] p-4">
              
              {/* Colored mask for the shirt shape */}
              <div 
                className="absolute inset-0 transition-colors duration-300"
                style={{ 
                  backgroundColor: getHexColor(shirtColor),
                  maskImage: 'url(/tshirt-mockup-transparent.png)',
                  WebkitMaskImage: 'url(/tshirt-mockup-transparent.png)',
                  maskSize: '100% 100%',
                  WebkitMaskSize: '100% 100%',
                  maskRepeat: 'no-repeat',
                  WebkitMaskRepeat: 'no-repeat'
                }}
              />

              {/* The Shaded T-Shirt (Transparent background) */}
              <img 
                src="/tshirt-mockup-transparent.png" 
                alt="Blank T-Shirt"
                className="w-full h-auto pointer-events-none relative mix-blend-multiply"
              />
              
              {/* The Artifact Overlay */}
              {imgSrc && (
                <img 
                  src={imgSrc}
                  alt={record.title}
                  className="absolute left-1/2 -translate-x-1/2 mix-blend-multiply opacity-90 transition-all duration-200 object-contain pointer-events-none"
                  style={{
                    width: `${imageScale}%`,
                    maxHeight: '80%',
                    top: `${imageY}%`,
                  }}
                  onError={(e: any) => { e.target.style.display = 'none'; }}
                />
              )}
            </div>
          )}
        </div>

        {/* Right Side: Controls & Metadata */}
        <div className="w-full lg:w-1/3 bg-mca-black p-8 lg:p-12 overflow-y-auto">
          <div className="max-w-md mx-auto space-y-12">
            
            <header className="space-y-4 border-b-2 border-white/20 pb-8">
              <h1 className="text-3xl md:text-5xl font-black text-mca-yellow leading-[0.8] mix-blend-difference uppercase">
                T-SHIRT<br/>GENERATOR
              </h1>
              <p className="text-slate-400 text-xs font-sans leading-relaxed">
                Visualize how this artifact translates to merchandise. Adjust settings below to test different scales and fabric colors.
              </p>
            </header>

            {record && (
              <>
                {/* Customization Controls */}
                <div className="space-y-8 border-b-2 border-white/20 pb-8">
                  <div className="space-y-4">
                    <label className="text-[10px] text-mca-cyan font-bold tracking-widest uppercase">
                      FABRIC COLOR
                    </label>
                    <div className="flex flex-wrap gap-3">
                      {[
                        { id: 'white', hex: '#ffffff' },
                        { id: 'black', hex: '#111111' },
                        { id: 'charcoal', hex: '#4a4a4a' },
                        { id: 'yellow', hex: '#fde047' },
                        { id: 'cyan', hex: '#22d3ee' },
                      ].map((c) => (
                        <button
                          key={c.id}
                          onClick={() => setShirtColor(c.id)}
                          className={`w-10 h-10 border-2 transition-all ${shirtColor === c.id ? 'border-mca-cyan scale-110' : 'border-white/20 hover:border-white/50'}`}
                          style={{ backgroundColor: c.hex }}
                          title={c.id}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <label className="text-[10px] text-mca-cyan font-bold tracking-widest uppercase">
                        GRAPHIC SCALE
                      </label>
                      <span className="text-[10px] font-bold text-white">{imageScale}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="10" 
                      max="80" 
                      value={imageScale}
                      onChange={(e) => setImageScale(Number(e.target.value))}
                      className="w-full h-1 bg-white/20 appearance-none outline-none accent-mca-cyan cursor-pointer"
                    />
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <label className="text-[10px] text-mca-cyan font-bold tracking-widest uppercase">
                        VERTICAL PLACEMENT
                      </label>
                      <span className="text-[10px] font-bold text-white">{imageY}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="10" 
                      max="70" 
                      value={imageY}
                      onChange={(e) => setImageY(Number(e.target.value))}
                      className="w-full h-1 bg-white/20 appearance-none outline-none accent-mca-yellow cursor-pointer"
                    />
                  </div>
                </div>

                {/* Record Info */}
                <div className="space-y-4">
                  <label className="text-[10px] text-mca-cyan font-bold tracking-widest uppercase">
                    SOURCE ARTIFACT
                  </label>
                  <h3 className="text-lg font-bold text-white uppercase leading-tight">
                    {record.title || record.field_identifier}
                  </h3>
                  <div className="text-xs text-slate-400 font-sans space-y-1">
                    <p><span className="font-bold text-slate-500">ID:</span> {record.field_identifier}</p>
                    {record.field_linked_agent && <p><span className="font-bold text-slate-500">CREATOR:</span> {record.field_linked_agent.split('|')[0]}</p>}
                    {record.field_genre && <p><span className="font-bold text-slate-500">GENRE:</span> {record.field_genre}</p>}
                  </div>
                </div>
                
                <div className="pt-8">
                  <button onClick={handleExport} className="w-full bg-mca-yellow text-mca-black font-black uppercase tracking-widest py-4 hover:bg-mca-cyan transition-colors border-2 border-mca-yellow hover:border-mca-cyan">
                    [ DOWNLOAD JPEG ]
                  </button>
                  <p className="text-[10px] text-center text-slate-500 mt-2 uppercase tracking-widest">
                    * Exports a JPEG of your mockup
                  </p>
                </div>
              </>
            )}
            
          </div>
        </div>
      </div>
    </div>
  );
}
