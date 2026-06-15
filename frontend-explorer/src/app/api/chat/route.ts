import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not configured.' }), { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: "You are the Lakehouse Assistant, an expert AI guide for the Wolfsonian Lakehouse collection. You answer questions conversationally and concisely. Use the catalog data provided in the user's prompt to give factual answers about the collection. Match the brutalist, ALL-CAPS aesthetic of the site.",
    });

    // Format messages for the Gemini SDK
    // Format: [{role: 'user', parts: [{text: '...'}], ...}]
    const contents = messages.map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const result = await model.generateContentStream({ contents });

    // Create a ReadableStream to stream the response back
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            if (chunkText) {
              controller.enqueue(new TextEncoder().encode(chunkText));
            }
          }
        } catch (e) {
          console.error("Stream error:", e);
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (error: any) {
    console.error('Chat API Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { status: 500 });
  }
}
