"use client";

import { useEffect, useState } from "react";
import { useDuckDB } from "@/providers/DuckDBProvider";
import Link from "next/link";

type Challenge = {
    realArtifact: any;
    options: string[];
    correctAnswer: string;
};

export default function CuratorsChallengePage() {
    const { runQuery } = useDuckDB();
    const [challenges, setChallenges] = useState<Challenge[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [score, setScore] = useState(0);
    const [loading, setLoading] = useState(true);
    const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
    const [isRevealed, setIsRevealed] = useState(false);
    
    // To track artifacts the user might want to save later
    const [likedArtifacts, setLikedArtifacts] = useState<any[]>([]);

    const initializeGame = async () => {
        setLoading(true);
        setCurrentIndex(0);
        setScore(0);
        setSelectedAnswer(null);
        setIsRevealed(false);
        setLikedArtifacts([]);
        
        // Fetch 40 random artifacts with images and non-null titles
        const query = `
            SELECT * FROM (
                SELECT title, field_identifier, field_genre, field_linked_agent, field_edtf_date_created
                FROM catalog 
                WHERE has_image = true 
                  AND title IS NOT NULL 
                  AND title != ''
            ) USING SAMPLE 40 ROWS
        `;
        
        const data = await runQuery(query);
        
        if (data && data.length >= 40) {
            const newChallenges: Challenge[] = [];
            
            // We use the first 10 for the actual challenges
            for (let i = 0; i < 10; i++) {
                const realArtifact = data[i];
                const realTitle = realArtifact.title;
                
                // We use the remaining 30 items for fake titles (3 per challenge)
                const fakeTitle1 = data[10 + i * 3].title;
                const fakeTitle2 = data[11 + i * 3].title;
                const fakeTitle3 = data[12 + i * 3].title;
                
                // Combine and shuffle the options
                const options = [realTitle, fakeTitle1, fakeTitle2, fakeTitle3].sort(() => Math.random() - 0.5);
                
                newChallenges.push({
                    realArtifact,
                    options,
                    correctAnswer: realTitle
                });
            }
            
            setChallenges(newChallenges);
        }
        
        setLoading(false);
    };

    useEffect(() => {
        initializeGame();
    }, [runQuery]);

    const handleSelectOption = (option: string) => {
        if (isRevealed) return;
        
        setSelectedAnswer(option);
        setIsRevealed(true);
        
        if (option === challenges[currentIndex].correctAnswer) {
            setScore(prev => prev + 1);
        }
    };
    
    const nextChallenge = () => {
        setSelectedAnswer(null);
        setIsRevealed(false);
        setCurrentIndex(prev => prev + 1);
    };

    if (loading) {
        return <div className="min-h-screen bg-black flex items-center justify-center text-white font-mono">Curating the challenge...</div>;
    }

    if (currentIndex >= challenges.length) {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white p-6 text-center">
                <div className="text-mca-cyan text-[10px] font-mono font-bold uppercase tracking-widest mb-4">
                    Challenge Complete
                </div>
                <h1 className="text-6xl md:text-8xl font-display font-black mb-2 uppercase tracking-tighter text-white">
                    {score} <span className="text-3xl md:text-5xl text-gray-500">/ 10</span>
                </h1>
                
                <p className="text-gray-400 mb-12 max-w-md font-sans text-lg mt-6">
                    {score >= 8 ? "Outstanding! You have the eye of a true curator." :
                     score >= 5 ? "Not bad! You've definitely spent some time in the archives." :
                     "Museum artifacts can be tricky! Keep exploring the collection to hone your eye."}
                </p>
                
                <div className="flex flex-col sm:flex-row gap-4">
                    <button onClick={initializeGame} className="px-8 py-4 bg-mca-cyan text-black hover:bg-mca-cyan/80 transition-colors font-mono uppercase tracking-widest text-sm font-bold">
                        Play Again
                    </button>
                    <Link href="/" className="px-8 py-4 border border-white/20 hover:border-white hover:bg-white/10 transition-colors font-mono uppercase tracking-widest text-sm">
                        Back to Home
                    </Link>
                </div>
            </div>
        );
    }

    const currentChallenge = challenges[currentIndex];
    const { realArtifact, options, correctAnswer } = currentChallenge;

    return (
        <div className="min-h-screen bg-black flex flex-col overflow-hidden fixed inset-0">
            <div className="p-6 flex justify-between items-center z-50">
                <Link href="/" className="text-white/50 hover:text-white transition-colors font-mono text-sm tracking-widest uppercase">
                    ← Back
                </Link>
                <div className="text-mca-cyan font-mono font-bold tracking-widest text-sm uppercase">
                    Curator's Challenge ({currentIndex + 1}/10)
                </div>
                <div className="text-mca-yellow font-mono font-bold text-sm tracking-widest uppercase">
                    Score: {score}
                </div>
            </div>

            <div className="flex-1 relative flex flex-col md:flex-row items-center justify-center px-4 gap-8 md:gap-16 max-w-7xl mx-auto w-full h-full pb-10">
                
                {/* Image Section */}
                <div className="w-full md:w-1/2 h-[40vh] md:h-[70vh] flex items-center justify-center relative">
                    <div className="w-full h-full bg-[#0a0a0a] border border-white/10 rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.8)] relative p-4 flex items-center justify-center">
                        <img 
                            src={`https://lakehouse.wolfsonian.org/images/${realArtifact.field_identifier.split(';')[0].trim()}.jpg`}
                            className="w-full h-full object-contain"
                            alt="Mystery Artifact"
                        />
                    </div>
                </div>

                {/* Options Section */}
                <div className="w-full md:w-1/2 flex flex-col gap-4">
                    <div className="mb-4 hidden md:block">
                        <h2 className="text-white font-display font-black text-4xl uppercase tracking-tight">Spot the Real Title</h2>
                        <p className="text-gray-400 font-sans mt-2">One of these titles belongs to the artifact shown. The others are pulled randomly from the archive. Choose wisely!</p>
                    </div>

                    <div className="flex flex-col gap-3">
                        {options.map((option, idx) => {
                            let buttonStyle = "border-white/20 bg-zinc-900/50 text-white hover:border-mca-cyan hover:bg-zinc-800";
                            
                            if (isRevealed) {
                                if (option === correctAnswer) {
                                    buttonStyle = "border-green-500 bg-green-500/10 text-green-400 font-bold";
                                } else if (option === selectedAnswer) {
                                    buttonStyle = "border-red-500 bg-red-500/10 text-red-400";
                                } else {
                                    buttonStyle = "border-white/10 bg-zinc-900/30 text-gray-500 opacity-50";
                                }
                            }
                            
                            return (
                                <button
                                    key={idx}
                                    onClick={() => handleSelectOption(option)}
                                    disabled={isRevealed}
                                    className={`text-left p-4 md:p-6 border rounded-xl transition-all duration-300 font-sans line-clamp-2 md:line-clamp-none ${buttonStyle}`}
                                >
                                    {option}
                                </button>
                            );
                        })}
                    </div>
                    
                    <div className="h-16 mt-4 flex items-center justify-center">
                        {isRevealed && (
                            <button 
                                onClick={nextChallenge}
                                className="px-8 py-4 bg-mca-cyan text-black hover:bg-mca-cyan/80 transition-colors font-mono uppercase tracking-widest text-sm font-bold w-full md:w-auto animate-fade-in"
                            >
                                {currentIndex === 9 ? "View Results" : "Next Artifact →"}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
