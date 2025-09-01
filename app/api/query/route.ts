export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { z } from "zod";

import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { vectorStore } from "@/lib/vectorstore";
import { prisma } from "@/lib/prisma";

const Body = z.object({
  question: z.string().min(1),
  k: z.number().int().min(1).max(20).default(4),
  filter: z.record(z.any(), z.any()).optional(), // akan diteruskan ke match_documents(filter JSONB)
  model: z.string().default("gpt-4o-mini"),
  temperature: z.number().min(0).max(2).default(0),
});

const prompt = ChatPromptTemplate.fromTemplate(`
Jawab pertanyaan hanya berdasarkan KONTEN berikut.
Jika jawabannya tidak ada, jawab: "Aku tidak menemukan jawabannya di dokumen."

Berikan jawaban dalam format berikut:
JAWABAN: [jawaban utama]
CONFIDENCE: [tingkat kepercayaan 1-10, dimana 10 = sangat yakin]
REASONING: [penjelasan singkat mengapa jawaban ini dipilih berdasarkan dokumen yang tersedia]

KONTEN:
{context}

PERTANYAAN: {question}
`);

function formatDocs(docs: Array<{ pageContent: string; metadata: any; id?: string; similarityScore?: number }>) {
  return docs
    .map(
      (d, i) =>
        `#${i + 1} ${d.metadata?.source ?? ""} (Score: ${d.similarityScore?.toFixed(4) || 'N/A'})\n` +
        (d.pageContent.length > 1000 ? d.pageContent.slice(0, 1000) + "..." : d.pageContent)
    )
    .join("\n\n");
}

function calculateConfidenceMetrics(docs: Array<{ similarityScore?: number }>, question: string) {
  if (!docs || docs.length === 0) {
    return {
      avgSimilarity: 0,
      maxSimilarity: 0,
      minSimilarity: 0,
      scoreVariance: 0,
      documentCount: 0,
      overallConfidence: 0
    };
  }

  const scores = docs.map(d => d.similarityScore || 0).filter(s => s > 0);
  
  if (scores.length === 0) {
    return {
      avgSimilarity: 0,
      maxSimilarity: 0,
      minSimilarity: 0,
      scoreVariance: 0,
      documentCount: docs.length,
      overallConfidence: 0
    };
  }

  const avgSimilarity = scores.reduce((a, b) => a + b, 0) / scores.length;
  const maxSimilarity = Math.max(...scores);
  const minSimilarity = Math.min(...scores);
  
  // Calculate variance
  const variance = scores.reduce((acc, score) => acc + Math.pow(score - avgSimilarity, 2), 0) / scores.length;
  
  // Calculate overall confidence (0-1 scale)
  // Higher average similarity and lower variance = higher confidence
  const normalizedAvg = Math.min(avgSimilarity / 0.8, 1); // Assume 0.8 is excellent similarity
  const consistencyFactor = Math.max(0, 1 - (variance * 10)); // Lower variance = more consistent
  const documentFactor = Math.min(docs.length / 3, 1); // More documents = higher confidence (up to 3)
  
  const overallConfidence = (normalizedAvg * 0.5 + consistencyFactor * 0.3 + documentFactor * 0.2);

  return {
    avgSimilarity: avgSimilarity,
    maxSimilarity: maxSimilarity,
    minSimilarity: minSimilarity,
    scoreVariance: variance,
    documentCount: docs.length,
    overallConfidence: Math.min(overallConfidence, 1)
  };
}

function parseStructuredResponse(response: string) {
  const lines = response.split('\n').map(line => line.trim());
  
  let answer = '';
  let confidence = 0;
  let reasoning = '';
  
  let currentSection = '';
  
  for (const line of lines) {
    if (line.startsWith('JAWABAN:')) {
      currentSection = 'answer';
      answer = line.replace('JAWABAN:', '').trim();
    } else if (line.startsWith('CONFIDENCE:')) {
      currentSection = 'confidence';
      const confStr = line.replace('CONFIDENCE:', '').trim();
      confidence = parseInt(confStr) || 0;
    } else if (line.startsWith('REASONING:')) {
      currentSection = 'reasoning';
      reasoning = line.replace('REASONING:', '').trim();
    } else if (line && currentSection) {
      // Continue building the current section
      if (currentSection === 'answer') {
        answer += (answer ? ' ' : '') + line;
      } else if (currentSection === 'reasoning') {
        reasoning += (reasoning ? ' ' : '') + line;
      }
    }
  }
  
  // Fallback if structured format not found
  if (!answer && !confidence && !reasoning) {
    answer = response.trim();
    confidence = 5; // Default confidence
    reasoning = 'Jawaban berdasarkan analisis dokumen yang tersedia';
  }
  
  return { answer, confidence, reasoning };
}

export async function POST(req: NextRequest) {
  try {
    const { question, k, filter, model, temperature } = Body.parse(await req.json());

    // 1) Retrieve top-k dokumen dari Supabase Vector Store
    let docs;
    
    if (filter && Object.keys(filter).length > 0) {
      // Gunakan filter yang dikirim user
      console.log(`Using user filter:`, filter);
      const docsWithScores = await vectorStore.similaritySearchWithScore(question, k, filter as any);
      docs = docsWithScores.map(([doc, score]) => ({
        ...doc,
        similarityScore: score
      }));
      console.log(`User filter search successful, found ${docs?.length || 0} docs with scores`);
    } else {
      // Search di seluruh dokumen tanpa filter user
      // Karena Supabase VectorStore tidak bekerja dengan baik tanpa filter,
      // kita akan search dengan mencoba berbagai source yang ada
      console.log('No user filter provided, searching all documents');
      
      // Strategy: Search per source dan gabungkan hasilnya secara proporsional
      const sources = ["docs-langchain", "docs-fitur-a"];
      let allDocs: any[] = [];
      const docsPerSource = Math.max(1, Math.floor(k / sources.length));
      
      for (const source of sources) {
        try {
          const sourceDocs = await vectorStore.similaritySearchWithScore(question, docsPerSource, { source } as any);
          // Convert format to include similarity scores
          const docsWithScores = sourceDocs.map(([doc, score]) => ({
            ...doc,
            similarityScore: score,
            source: source
          }));
          allDocs.push(...docsWithScores);
          console.log(`Found ${sourceDocs.length} docs from source: ${source} with scores`);
        } catch (sourceError) {
          console.log(`Failed to search source ${source}:`, (sourceError as any).message);
        }
      }
      
      // Jika tidak ada hasil dari source yang dikenal, coba dengan metadata exists
      if (allDocs.length === 0) {
        try {
          console.log('No results from known sources, trying metadata filter');
          const metadataDocsWithScores = await vectorStore.similaritySearchWithScore(question, k, { metadata: { $exists: true } } as any);
          docs = metadataDocsWithScores.map(([doc, score]) => ({
            ...doc,
            similarityScore: score
          }));
          console.log(`Metadata filter search successful, found ${docs?.length || 0} docs`);
        } catch (metadataError) {
          console.log('Metadata filter also failed:', (metadataError as any).message);
          docs = [];
        }
      } else {
        // Sort berdasarkan similarity score (higher is better) dan ambil top-k
        allDocs.sort((a, b) => (b.similarityScore || 0) - (a.similarityScore || 0));
        docs = allDocs.slice(0, k);
        console.log(`Combined search successful, found ${docs?.length || 0} docs total from ${sources.length} sources`);
        console.log(`Top similarity scores: ${docs.map(d => d.similarityScore?.toFixed(4)).join(', ')}`);
      }
    }

    console.log(`Total documents found: ${docs?.length || 0}`);

    // Calculate confidence metrics
    const confidenceMetrics = calculateConfidenceMetrics(docs, question);
    console.log(`Confidence metrics:`, confidenceMetrics);

    // 2) RAG chain sederhana: [format context] -> [prompt] -> [LLM]
    const llm = new ChatOpenAI({ model, temperature, apiKey: process.env.API_KEY });
    const chain = prompt.pipe(llm).pipe(new StringOutputParser());

    const rawAnswer = await chain.invoke({
      question,
      context: formatDocs(docs),
    });

    // Parse structured response
    const { answer, confidence: llmConfidence, reasoning } = parseStructuredResponse(rawAnswer);

    // 3) Simpan log Q/A pakai Prisma (ORM)
    await prisma.queryLog.create({
      data: {
        question,
        answer,
      },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        answer,
        confidence: {
          llmConfidence: llmConfidence,
          overallConfidence: Math.round(confidenceMetrics.overallConfidence * 10),
          avgSimilarity: Math.round(confidenceMetrics.avgSimilarity * 1000) / 1000,
          maxSimilarity: Math.round(confidenceMetrics.maxSimilarity * 1000) / 1000,
          scoreVariance: Math.round(confidenceMetrics.scoreVariance * 1000) / 1000,
          explanation: `Confidence berdasarkan: rata-rata similarity ${(confidenceMetrics.avgSimilarity * 100).toFixed(1)}%, konsistensi score, dan jumlah dokumen relevan (${confidenceMetrics.documentCount})`
        },
        reasoning,
        docsFound: docs?.length || 0,
        sources: docs.map((d: any) => ({
          id: d.id,
          metadata: d.metadata,
          snippet: d.pageContent.slice(0, 200),
          similarityScore: Math.round((d.similarityScore || 0) * 1000) / 1000,
          relevanceLevel: d.similarityScore > 0.7 ? 'High' : d.similarityScore > 0.5 ? 'Medium' : 'Low'
        })),
        searchQuality: {
          totalDocuments: confidenceMetrics.documentCount,
          averageSimilarity: confidenceMetrics.avgSimilarity,
          consistencyScore: Math.max(0, 1 - (confidenceMetrics.scoreVariance * 10)),
          recommendation: confidenceMetrics.overallConfidence > 0.7 ? 'High confidence answer' : 
                          confidenceMetrics.overallConfidence > 0.4 ? 'Moderate confidence answer' : 
                          'Low confidence answer - consider rephrasing question'
        }
      }),
      { headers: { "content-type": "application/json" }, status: 200 }
    );
  } catch (e: any) {
    console.error('Query error:', e);
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      headers: { "content-type": "application/json" },
      status: 400,
    });
  }
}
