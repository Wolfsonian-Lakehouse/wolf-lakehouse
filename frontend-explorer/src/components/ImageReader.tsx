"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

interface ImageReaderProps {
  images: string[];
  selectedRecord: any;
}

export default function ImageReader({ images, selectedRecord }: ImageReaderProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFullScreen, setIsFullScreen] = useState(false);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % images.length);
  }, [images.length]);

  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  }, [images.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is interacting with an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      if (e.key === "ArrowRight") {
        handleNext();
      } else if (e.key === "ArrowLeft") {
        handlePrev();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNext, handlePrev]);

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-slate-600 text-lg uppercase font-bold tracking-widest space-y-6 my-auto flex-shrink-0 min-h-[50vh] w-full px-6 text-center">
        <span>[ NO IMAGE DATA FOUND ]</span>
        <a 
          href="https://wolfsonian.org/research/image-reproductions/" 
          target="_blank" 
          rel="noopener noreferrer"
          className="bg-mca-cyan text-mca-black font-black uppercase tracking-widest px-6 py-3 border-2 border-mca-cyan hover:bg-transparent hover:text-mca-cyan transition-colors text-sm shadow-xl"
        >
          [↗] REQUEST DIGITIZATION
        </a>
      </div>
    );
  }

  const activeImageId = images[currentIndex];
  const imgSrc = `/images/${encodeURIComponent(activeImageId)}.jpg`;
  
  return (
    <div className={
      isFullScreen 
        ? "fixed inset-0 z-[100] flex flex-col bg-mca-black group/reader overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        : "relative w-full h-[50vh] md:h-full flex flex-col bg-mca-black group/reader overflow-hidden"
    }>
      
      {/* Top Bar Indicator */}
      <div className="absolute top-0 left-0 w-full p-4 md:p-6 flex justify-between items-start z-20 pointer-events-none">
        {images.length > 1 && (
          <div className="bg-mca-black text-mca-cyan px-4 py-2 font-black text-xs uppercase tracking-widest border-2 border-mca-cyan shadow-xl pointer-events-auto">
            [ PAGE {currentIndex + 1} / {images.length} ]
          </div>
        )}
        {isFullScreen && (
          <button 
            onClick={(e) => { e.stopPropagation(); setIsFullScreen(false); }}
            className="bg-mca-yellow text-mca-black font-black uppercase tracking-widest px-4 py-2 border-2 border-mca-yellow hover:bg-mca-black hover:text-mca-yellow transition-colors text-xs shadow-xl pointer-events-auto ml-auto"
          >
            [X] CLOSE ZOOM
          </button>
        )}
      </div>

      {/* Main Image View */}
      <div className="flex-grow relative flex items-center justify-center w-full h-full p-4 md:p-12 overflow-hidden">
        {images.length > 1 && (
          <button 
            onClick={(e) => { e.stopPropagation(); handlePrev(); }}
            className="absolute left-2 md:left-6 z-30 bg-mca-black text-white font-black text-2xl border-2 border-white px-4 py-3 hover:bg-mca-cyan hover:text-mca-black transition-colors opacity-50 hover:opacity-100 shadow-2xl"
            aria-label="Previous image"
          >
            [←]
          </button>
        )}

        <TransformWrapper
          disabled={!isFullScreen}
          wheel={{ step: 0.1 }}
          doubleClick={{ disabled: true }}
          minScale={1}
          maxScale={8}
        >
          <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }} contentStyle={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <img 
              key={imgSrc} 
              src={imgSrc}
              loading="lazy"
              alt={`${selectedRecord.title || 'Record'} - image ${currentIndex + 1}`}
              className={`object-contain max-w-full max-h-full drop-shadow-2xl z-10 transition-transform duration-500 animate-in fade-in slide-in-from-bottom-2 ${!isFullScreen ? 'cursor-zoom-in hover:scale-[1.02]' : 'cursor-grab active:cursor-grabbing'}`}
              onClick={(e) => {
                e.stopPropagation();
                if (!isFullScreen) setIsFullScreen(true);
              }}
              onError={(e: any) => {
                (e.target as HTMLImageElement).style.display = 'none';
                (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
              }}
            />
          </TransformComponent>
        </TransformWrapper>
        
        <div className="absolute hidden inset-0 flex flex-col items-center justify-center bg-mca-black text-slate-600 text-[10px] uppercase font-bold tracking-widest z-0">
          <span>[ NO IMAGE {currentIndex + 1} FOUND ]</span>
        </div>

        {images.length > 1 && (
          <button 
            onClick={(e) => { e.stopPropagation(); handleNext(); }}
            className="absolute right-2 md:right-6 z-30 bg-mca-black text-white font-black text-2xl border-2 border-white px-4 py-3 hover:bg-mca-cyan hover:text-mca-black transition-colors opacity-50 hover:opacity-100 shadow-2xl"
            aria-label="Next image"
          >
            [→]
          </button>
        )}

        {/* Action Overlays */}
        <div className="absolute bottom-4 right-4 flex flex-col gap-2 items-end z-20">
          <a 
            href={imgSrc}
            download={`Wolfsonian_${activeImageId}_${(selectedRecord.title || "Untitled").replace(/[^a-z0-9]/gi, '_')}.jpg`}
            className="bg-mca-yellow text-mca-black font-black uppercase tracking-widest px-4 py-3 border-2 border-mca-yellow hover:bg-mca-black hover:text-mca-yellow transition-colors text-[10px] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            [⬇] DOWNLOAD JPG {images.length > 1 ? `(${currentIndex + 1}/${images.length})` : ''}
          </a>
        </div>
        
        <div className="absolute bottom-4 left-4 z-20 flex flex-col gap-2 items-start">
          <Link 
            href={`/merch/${encodeURIComponent(selectedRecord.field_identifier)}`}
            className="bg-white text-mca-black font-black uppercase tracking-widest px-4 py-3 border-2 border-white hover:bg-mca-black hover:text-white transition-colors text-[10px] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            [👕] VIEW ON MERCH
          </Link>
          <a 
            href="https://wolfsonian.org/research/image-reproductions/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="bg-mca-cyan text-mca-black font-black uppercase tracking-widest px-4 py-3 border-2 border-mca-cyan hover:bg-mca-black hover:text-mca-cyan transition-colors text-[10px] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            [↗] REQUEST DIGITIZATION
          </a>
        </div>
      </div>

      {/* Thumbnail Strip */}
      {images.length > 1 && (
        <div className="h-24 md:h-32 w-full border-t border-white/20 bg-mca-black flex items-center overflow-x-auto overflow-y-hidden custom-scrollbar px-4 space-x-3 py-3 z-20 shrink-0">
          {images.map((id, idx) => {
            const thumbSrc = `/images/${encodeURIComponent(id)}.jpg`;
            const isActive = idx === currentIndex;
            return (
              <button
                key={`${id}-${idx}`}
                onClick={() => setCurrentIndex(idx)}
                className={`relative h-full aspect-[3/4] flex-shrink-0 transition-all duration-300 border-2 overflow-hidden bg-white/5 ${isActive ? 'border-mca-cyan scale-105 shadow-[0_0_15px_rgba(0,255,255,0.3)]' : 'border-white/20 opacity-50 hover:opacity-100 hover:border-white'}`}
                aria-label={`Go to image ${idx + 1}`}
              >
                <img 
                  src={thumbSrc}
                  alt={`Thumbnail ${idx + 1}`}
                  className="w-full h-full object-cover"
                  onError={(e: any) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
