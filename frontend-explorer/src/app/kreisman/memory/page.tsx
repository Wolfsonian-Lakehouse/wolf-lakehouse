"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useDuckDB } from "@/providers/DuckDBProvider";

type Card = {
  id: string;
  uniqueId: string;
  title: string;
  image: string;
  metadata: any;
  isFlipped: boolean;
  isMatched: boolean;
};

export default function MemoryMatch() {
  const { isReady, runQuery } = useDuckDB();
  const [cards, setCards] = useState<Card[]>([]);
  const [flippedIndices, setFlippedIndices] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [matches, setMatches] = useState(0);
  const [loading, setLoading] = useState(true);
  const [won, setWon] = useState(false);
  
  // Audio refs for sound effects (optional but adds to the premium feel)
  const flipAudioRef = useRef<HTMLAudioElement | null>(null);
  const matchAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      flipAudioRef.current = new Audio("https://actions.google.com/sounds/v1/foley/whoosh.ogg");
      matchAudioRef.current = new Audio("https://actions.google.com/sounds/v1/cartoon/clink_and_sparkle.ogg");
    }
  }, []);

  const playSound = (audioRef: React.RefObject<HTMLAudioElement | null>) => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.volume = 0.2;
      audioRef.current.play().catch(() => {});
    }
  };

  const initGame = async () => {
    if (!isReady) return;
    setLoading(true);
    setWon(false);
    setMoves(0);
    setMatches(0);
    setFlippedIndices([]);
    
    try {
      // Fetch 8 random items with images
      const query = `
        SELECT title, field_identifier, field_linked_agent, field_edtf_date_created, field_genre 
        FROM catalog 
        WHERE ((LOWER(field_credit_line) LIKE '%kreisman%' OR LOWER(field_credit_line) LIKE '%dodge%') 
           OR (source_system = 'Proficio' AND field_identifier LIKE '2022.7%'))
        AND has_image = true 
        ORDER BY random() 
        LIMIT 8
      `;
      const data = await runQuery(query);
      
      if (data && data.length > 0) {
        // Create pairs
        const pairs: Card[] = [];
        data.forEach((item: any) => {
          const id = item.field_identifier.split(";")[0].trim();
          const img = `https://lakehouse.wolfsonian.org/images/${id}.jpg`;
          
          const cardData = {
            id,
            title: item.title,
            image: img,
            metadata: item,
            isFlipped: false,
            isMatched: false
          };
          
          pairs.push({ ...cardData, uniqueId: `${id}-A` });
          pairs.push({ ...cardData, uniqueId: `${id}-B` });
        });
        
        // Shuffle
        for (let i = pairs.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
        }
        
        setCards(pairs);
      }
    } catch (e) {
      console.error("Failed to load memory match data", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isReady) {
      initGame();
    }
  }, [isReady]);

  const handleCardClick = (index: number) => {
    // Prevent clicking if already 2 cards flipped, or if card is already flipped/matched
    if (flippedIndices.length === 2) return;
    if (cards[index].isFlipped || cards[index].isMatched) return;

    playSound(flipAudioRef);
    
    const newCards = [...cards];
    newCards[index].isFlipped = true;
    setCards(newCards);
    
    const newFlippedIndices = [...flippedIndices, index];
    setFlippedIndices(newFlippedIndices);
    
    if (newFlippedIndices.length === 2) {
      setMoves(m => m + 1);
      const [firstIndex, secondIndex] = newFlippedIndices;
      
      if (newCards[firstIndex].id === newCards[secondIndex].id) {
        // Match!
        setTimeout(() => {
          playSound(matchAudioRef);
          const matchedCards = [...newCards];
          matchedCards[firstIndex].isMatched = true;
          matchedCards[secondIndex].isMatched = true;
          setCards(matchedCards);
          setFlippedIndices([]);
          setMatches(m => {
            const newMatches = m + 1;
            if (newMatches === 8) {
              setWon(true);
            }
            return newMatches;
          });
        }, 500);
      } else {
        // No match
        setTimeout(() => {
          const resetCards = [...newCards];
          resetCards[firstIndex].isFlipped = false;
          resetCards[secondIndex].isFlipped = false;
          setCards(resetCards);
          setFlippedIndices([]);
        }, 1000);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col font-sans selection:bg-mca-cyan selection:text-black">
      {/* Top Nav */}
      <nav className="sticky top-0 z-50 bg-[#0a0a0a]/90 backdrop-blur-md border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <Link href="/kreisman" className="text-xs uppercase tracking-widest font-mono text-gray-400 hover:text-white transition-colors duration-300">
          ← Back to Exhibition
        </Link>
        <span className="text-xs font-mono tracking-widest text-mca-cyan uppercase hidden md:inline-block">
          Interactive Archive • Memory Match
        </span>
        <div className="flex gap-4 items-center">
          <div className="text-xs font-mono uppercase tracking-widest text-gray-400">
            Moves: <span className="text-white font-bold">{moves}</span>
          </div>
          <button 
            onClick={initGame}
            className="text-[10px] uppercase tracking-widest font-mono border border-white/20 px-3 py-1.5 hover:bg-white hover:text-black transition-colors"
          >
            Restart
          </button>
        </div>
      </nav>

      <main className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 relative overflow-hidden">
        {/* Ambient background glow */}
        <div className="absolute inset-0 bg-gradient-to-b from-mca-cyan/5 to-transparent pointer-events-none opacity-50" />
        
        {won && (
          <div className="absolute inset-0 z-40 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-1000">
            <h2 className="text-6xl md:text-8xl font-black font-display uppercase tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-mca-cyan to-white mb-6 animate-pulse">
              Archive Mastered
            </h2>
            <p className="text-gray-300 font-mono tracking-widest uppercase mb-12">
              Completed in {moves} moves
            </p>
            <button 
              onClick={initGame}
              className="px-8 py-4 bg-mca-cyan text-black font-bold font-mono uppercase tracking-widest hover:bg-white transition-all transform hover:scale-105"
            >
              Play Again
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center space-y-6">
            <div className="animate-spin h-8 w-8 border-2 border-mca-cyan/20 border-t-mca-cyan rounded-full" />
            <p className="text-mca-cyan font-light font-mono text-xs tracking-[0.3em] uppercase animate-pulse">
              Initializing Memory Matrix...
            </p>
          </div>
        ) : (
          <div className="w-full max-w-5xl">
            {/* The 4x4 Grid */}
            <div className="grid grid-cols-4 gap-3 md:gap-6 w-full max-w-4xl mx-auto z-10 relative">
              {cards.map((card, index) => (
                <div 
                  key={card.uniqueId}
                  onClick={() => handleCardClick(index)}
                  className="relative aspect-[3/4] cursor-pointer group perspective-[1000px]"
                >
                  <div 
                    className={`w-full h-full transition-all duration-500 [transform-style:preserve-3d] ${card.isFlipped || card.isMatched ? '[transform:rotateY(180deg)]' : ''}`}
                  >
                    {/* Front of card (Face down) */}
                    <div className="absolute inset-0 w-full h-full [backface-visibility:hidden] bg-white/5 border border-white/10 hover:border-mca-cyan/50 hover:bg-white/10 transition-colors duration-300 flex items-center justify-center rounded-sm shadow-2xl">
                      <div className="opacity-20 group-hover:opacity-100 transition-opacity duration-500">
                        <svg className="w-8 h-8 text-mca-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    </div>

                    {/* Back of card (Face up) */}
                    <div className="absolute inset-0 w-full h-full [backface-visibility:hidden] [transform:rotateY(180deg)] bg-black border border-white/20 flex flex-col rounded-sm overflow-hidden shadow-[0_0_30px_rgba(0,255,255,0.1)]">
                      <div className="flex-1 w-full bg-white flex items-center justify-center p-4">
                        <img 
                          src={card.image} 
                          alt={card.title}
                          className={`max-w-full max-h-full object-contain ${card.isMatched ? 'opacity-50 grayscale mix-blend-multiply' : ''} transition-all duration-1000`}
                          crossOrigin="anonymous"
                          draggable={false}
                        />
                      </div>
                      
                      {/* Revealed Metadata Bar */}
                      <div className={`h-12 bg-mca-cyan flex items-center justify-center p-2 transform transition-transform duration-500 ${card.isMatched ? 'translate-y-0' : 'translate-y-full absolute bottom-0 w-full'}`}>
                        <div className="text-[9px] font-mono font-bold text-black uppercase tracking-widest text-center line-clamp-2 leading-tight">
                          {card.title}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
