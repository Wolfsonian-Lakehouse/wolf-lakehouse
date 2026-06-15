'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useDuckDB } from '../hooks/useDuckDB';

export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const { isReady, runQuery } = useDuckDB();
  const [messages, setMessages] = useState<{role: 'user' | 'assistant', content: string}[]>([
    { role: 'assistant', content: 'HELLO. I AM THE LAKEHOUSE ASSISTANT. SEARCH THE CATALOG USING NATURAL LANGUAGE OR KEYWORDS.' }
  ]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleOpen = () => {
    setIsOpen(true);
  };

  const sendMessage = async () => {
    if (!input.trim() || !isReady || isGenerating) return;
    
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsGenerating(true);
    
    try {
      // Basic stop word filtering
      const stopWords = ['a', 'an', 'the', 'in', 'on', 'at', 'to', 'for', 'with', 'about', 'show', 'me', 'find', 'search', 'what', 'is', 'are', 'do', 'does'];
      const keywords = userMsg.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !stopWords.includes(w));
      
      let reply = '';
      
      if (keywords.length === 0) {
        reply = 'PLEASE PROVIDE MORE SPECIFIC KEYWORDS TO SEARCH THE CATALOG.';
      } else {
        // Construct a dynamic query
        // Escape single quotes in keywords
        const safeKeywords = keywords.map(k => k.replace(/'/g, "''"));
        
        // Build WHERE clause
        const conditions = safeKeywords.map(k => `(
          title ILIKE '%${k}%' OR 
          field_subject ILIKE '%${k}%' OR 
          field_genre ILIKE '%${k}%' OR 
          field_description_long ILIKE '%${k}%' OR
          field_linked_agent ILIKE '%${k}%'
        )`).join(' AND ');

        const query = `
          SELECT title, field_identifier, field_collection_type, field_subject
          FROM catalog 
          WHERE ${conditions}
          LIMIT 5;
        `;
        
        const results = await runQuery(query);
        
        if (!results || results.length === 0) {
          reply = `NO MATCHES FOUND FOR: ${keywords.join(', ').toUpperCase()}`;
        } else {
          reply = `FOUND ${results.length} MATCH${results.length === 1 ? '' : 'ES'} FOR: ${keywords.join(', ').toUpperCase()}\n\n`;
          results.forEach((r: any, i: number) => {
            reply += `[${i + 1}] ${r.title}\nID: ${r.field_identifier}\n`;
            if (r.field_subject) reply += `SUBJECTS: ${r.field_subject}\n`;
            reply += '\n';
          });
          reply += 'VIEW THESE ITEMS IN THE MAIN EXPLORER FOR MORE DETAILS.';
        }
      }
      
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
      
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'assistant', content: 'ERROR GENERATING RESPONSE. DATABASE MIGHT STILL BE LOADING.' }]);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      {/* Toggle Button */}
      <button 
        onClick={handleOpen}
        className={`fixed bottom-6 right-6 z-50 bg-mca-cyan text-mca-black font-black tracking-widest px-6 py-4 border-2 border-mca-cyan hover:bg-mca-black hover:text-mca-cyan transition-colors text-sm uppercase shadow-lg ${isOpen ? 'hidden' : 'block'}`}
      >
        CHAT WITH LAKEHOUSE ASSISTANT
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 w-[22rem] sm:w-96 h-[32rem] bg-mca-dark border-2 border-white z-50 flex flex-col shadow-[8px_8px_0_0_#00FFFF]">
          {/* Header */}
          <div className="flex justify-between items-center p-4 border-b-2 border-white bg-mca-black">
            <h2 className="font-black tracking-widest text-white uppercase">LAKEHOUSE ASSISTANT (DB)</h2>
            <button 
              onClick={() => setIsOpen(false)}
              className="text-white hover:text-red-500 font-bold"
            >
              [X]
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-sm">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`p-3 max-w-[85%] border-2 whitespace-pre-wrap ${msg.role === 'user' ? 'bg-white text-mca-black border-white' : 'bg-transparent text-mca-cyan border-mca-cyan'}`}>
                  {msg.content}
                </div>
              </div>
            ))}
            {isGenerating && (
              <div className="flex justify-start">
                <div className="p-3 bg-transparent text-mca-cyan border-2 border-mca-cyan animate-pulse">
                  SEARCHING CATALOG...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Progress Bar Area - Replaced with DB Status */}
          {!isReady && (
            <div className="p-2 border-t border-white/20 text-mca-yellow text-[10px] font-mono leading-tight">
              INITIALIZING LOCAL DATABASE...
            </div>
          )}

          {/* Input Area */}
          <div className="p-4 border-t-2 border-white bg-mca-black">
            <div className="flex gap-2">
              <input 
                type="text" 
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                placeholder="SEARCH FOR ART, SUBJECTS..."
                disabled={!isReady || isGenerating}
                className="flex-1 bg-transparent border border-white/30 text-white p-2 text-sm placeholder-white/30 focus:outline-none focus:border-mca-cyan disabled:opacity-50"
              />
              <button 
                onClick={sendMessage}
                disabled={!isReady || isGenerating || !input.trim()}
                className="bg-mca-cyan text-mca-black px-4 font-bold disabled:opacity-50 hover:bg-white transition-colors uppercase text-sm"
              >
                SEND
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
