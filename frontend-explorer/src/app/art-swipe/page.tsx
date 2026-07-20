"use client";

import { useEffect, useState } from "react";
import { useDuckDB } from "@/providers/DuckDBProvider";
import { useCollection } from "@/hooks/useCollection";
import Link from "next/link";

export default function ArtSwipePage() {
    const { runQuery } = useDuckDB();
    const { addItem } = useCollection();
    const [cards, setCards] = useState<any[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [animating, setAnimating] = useState<"left" | "right" | null>(null);

    useEffect(() => {
        const fetchCards = async () => {
            const query = `
                SELECT title, field_identifier, field_genre, field_linked_agent, field_edtf_date_created, field_description_long
                FROM catalog 
                WHERE has_image = true 
                USING SAMPLE 20
            `;
            const data = await runQuery(query);
            if (data) {
                setCards(data);
            }
            setLoading(false);
        };
        fetchCards();
    }, [runQuery]);

    const handleDecision = (decision: "save" | "skip") => {
        if (animating || currentIndex >= cards.length) return;
        
        if (decision === "save") {
            setAnimating("right");
            addItem({
                ...cards[currentIndex],
                has_image: true
            });
        } else {
            setAnimating("left");
        }
        
        setTimeout(() => {
            setAnimating(null);
            setCurrentIndex(prev => prev + 1);
        }, 300);
    };

    if (loading) {
        return <div className="min-h-screen bg-black flex items-center justify-center text-white font-mono">Shuffling the deck...</div>;
    }

    if (currentIndex >= cards.length) {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white p-6 text-center">
                <h1 className="text-4xl md:text-6xl font-display font-black mb-4 uppercase tracking-tighter">Deck Complete</h1>
                <p className="text-gray-400 mb-12 max-w-md font-sans text-lg">You've swiped through 20 artifacts. Check out your saved collection or draw a new deck!</p>
                <div className="flex flex-col sm:flex-row gap-4">
                    <button onClick={() => window.location.reload()} className="px-8 py-4 border border-white/20 hover:border-white hover:bg-white/10 transition-colors font-mono uppercase tracking-widest text-sm">Draw New Deck</button>
                    <Link href="/" className="px-8 py-4 border border-mca-cyan text-mca-cyan hover:bg-mca-cyan hover:text-black transition-colors font-mono uppercase tracking-widest text-sm font-bold">Back to Home</Link>
                </div>
            </div>
        );
    }

    const currentCard = cards[currentIndex];
    const nextCard = currentIndex + 1 < cards.length ? cards[currentIndex + 1] : null;

    return (
        <div className="min-h-screen bg-black flex flex-col overflow-hidden fixed inset-0">
            <div className="p-6 flex justify-between items-center z-50">
                <Link href="/" className="text-white/50 hover:text-white transition-colors font-mono text-sm tracking-widest uppercase">
                    ← Back
                </Link>
                <div className="text-mca-cyan font-mono font-bold tracking-widest text-sm uppercase">
                    Art Swipe ({currentIndex + 1}/{cards.length})
                </div>
                <div className="w-16"></div>
            </div>

            <div className="flex-1 relative flex items-center justify-center px-4 overflow-hidden -mt-8">
                {nextCard && (
                    <div className="absolute w-full max-w-md aspect-[3/4] bg-zinc-900 border border-white/5 rounded-2xl overflow-hidden shadow-2xl scale-95 opacity-40 translate-y-6 blur-[2px]">
                        <img 
                            src={`https://lakehouse.wolfsonian.org/images/${nextCard.field_identifier.split(';')[0].trim()}.jpg`}
                            className="w-full h-full object-cover opacity-50"
                        />
                    </div>
                )}
                
                <div 
                    className={`absolute w-full max-w-md aspect-[3/4] bg-zinc-900 border border-white/10 rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-10 flex flex-col transition-transform duration-300 ease-out origin-bottom
                        ${animating === 'left' ? '-translate-x-[120%] -rotate-12 opacity-0' : ''}
                        ${animating === 'right' ? 'translate-x-[120%] rotate-12 opacity-0' : ''}
                    `}
                >
                    <div className="flex-1 bg-[#0a0a0a] relative flex items-center justify-center p-6">
                        <img 
                            src={`https://lakehouse.wolfsonian.org/images/${currentCard.field_identifier.split(';')[0].trim()}.jpg`}
                            className="w-full h-full object-contain"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent pointer-events-none" />
                    </div>
                    <div className="absolute bottom-0 w-full p-8 text-left pb-10">
                        <div className="text-mca-cyan text-[10px] font-mono font-bold uppercase tracking-widest mb-3">
                            {currentCard.field_genre || 'Artifact'} • {currentCard.field_edtf_date_created}
                        </div>
                        <h2 className="text-white font-display font-black text-3xl leading-[1.1] mb-3">
                            {currentCard.title}
                        </h2>
                        <p className="text-gray-400 text-sm font-sans line-clamp-3 leading-relaxed">
                            {currentCard.field_linked_agent || currentCard.field_description_long || 'No additional description provided.'}
                        </p>
                    </div>
                </div>
            </div>

            <div className="p-8 pb-16 flex justify-center gap-10 z-50">
                <button 
                    onClick={() => handleDecision("skip")}
                    className="w-24 h-24 rounded-full border border-red-500/30 bg-black/50 backdrop-blur-sm text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all active:scale-95 group shadow-[0_0_30px_rgba(239,68,68,0.15)] hover:shadow-[0_0_50px_rgba(239,68,68,0.4)]"
                >
                    <svg className="w-10 h-10 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
                <button 
                    onClick={() => handleDecision("save")}
                    className="w-24 h-24 rounded-full border border-mca-cyan/30 bg-black/50 backdrop-blur-sm text-mca-cyan flex items-center justify-center hover:bg-mca-cyan hover:text-black transition-all active:scale-95 group shadow-[0_0_30px_rgba(0,255,255,0.15)] hover:shadow-[0_0_50px_rgba(0,255,255,0.4)]"
                >
                    <svg className="w-10 h-10 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 0-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path></svg>
                </button>
            </div>
        </div>
    );
}
