export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { z } from "zod";

import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { vectorStore } from "@/lib/vectorstore";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const Body = z.object({
  question: z.string().min(1),
  k: z.number().int().min(1).max(20).default(4),
  filter: z.record(z.string(), z.unknown()).optional(),
  model: z.string().default("gpt-4o-mini"),
  temperature: z.number().min(0).max(2).default(0),
});

const prompt = ChatPromptTemplate.fromTemplate(`
Answer the question based ONLY on the following CONTENT.
If the answer is not found, respond: "I cannot find the answer in the documents."

Provide the answer in the following format:
ANSWER: [main answer]
CONFIDENCE: [confidence level 1-10, where 10 = very confident]
REASONING: [brief explanation of why this answer was chosen based on the available documents]

CONTENT:
{context}

QUESTION: {question}
`);

interface DocumentWithScore {
  pageContent: string;
  metadata: Record<string, unknown>;
  id?: string;
  similarityScore?: number;
  source?: string;
}

function formatDocs(docs: DocumentWithScore[]) {
  return docs
    .map(
      (d, i) =>
        `#${i + 1} ${d.metadata?.source ?? ""} (Score: ${d.similarityScore?.toFixed(4) || 'N/A'})\n` +
        (d.pageContent.length > 1000 ? d.pageContent.slice(0, 1000) + "..." : d.pageContent)
    )
    .join("\n\n");
}

function calculateConfidenceMetrics(docs: DocumentWithScore[]) {
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
    if (line.startsWith('ANSWER:')) {
      currentSection = 'answer';
      answer = line.replace('ANSWER:', '').trim();
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
    reasoning = 'Answer based on analysis of available documents';
  }
  
  return { answer, confidence, reasoning };
}

// Function to get all available sources dynamically
async function getAllAvailableSources(): Promise<string[]> {
  try {
    // Get unique sources from documents table
    const { data: sourcesData, error } = await supabaseAdmin
      .from('documents')
      .select('metadata->>source')
      .not('metadata->>source', 'is', null);
    
    if (error) {
      console.log('Error fetching sources:', error.message);
      return ["docs-langchain", "docs-fitur-a", "docs-rag"]; // Fallback to known sources
    }
    
    // Extract unique sources and filter out null/undefined values
    const uniqueSources = [...new Set(
      sourcesData
        .map((row: Record<string, unknown>) => row['metadata->>source'] as string)
        .filter((source: string) => source && source.trim() !== '')
    )];
    
    console.log(`Found ${uniqueSources.length} available sources:`, uniqueSources);
    return uniqueSources.length > 0 ? uniqueSources : ["docs-langchain", "docs-fitur-a", "docs-rag"];
  } catch (error) {
    console.log('Error in getAllAvailableSources:', error);
    return ["docs-langchain", "docs-fitur-a", "docs-rag"]; // Fallback to known sources
  }
}

export async function POST(req: NextRequest) {
  try {
    const { question, k, filter, model, temperature } = Body.parse(await req.json());

    // 1) Retrieve top-k documents from Supabase Vector Store
    let docs: DocumentWithScore[] = [];
    
    if (filter && Object.keys(filter).length > 0) {
      // Use user-provided filter
      console.log(`Using user filter:`, filter);
      const docsWithScores = await vectorStore.similaritySearchWithScore(question, k, filter as Record<string, unknown>);
      docs = docsWithScores.map(([doc, score]) => ({
        ...doc,
        similarityScore: score
      }));
      console.log(`User filter search successful, found ${docs?.length || 0} docs with scores`);
    } else {
      // Search all documents without user filter
      // Since Supabase VectorStore doesn't work well without filter,
      // we'll search by trying various available sources
      console.log('No user filter provided, searching all documents');
      
      // Strategy: Get all available sources dynamically and search per source
      const sources = await getAllAvailableSources();
      const allDocs: DocumentWithScore[] = [];
      const docsPerSource = Math.max(1, Math.floor(k / sources.length));
      
      for (const source of sources) {
        try {
          const sourceDocs = await vectorStore.similaritySearchWithScore(question, docsPerSource, { source } as Record<string, unknown>);
          // Convert format to include similarity scores
          const docsWithScores = sourceDocs.map(([doc, score]) => ({
            ...doc,
            similarityScore: score,
            source: source
          }));
          allDocs.push(...docsWithScores);
          console.log(`Found ${sourceDocs.length} docs from source: ${source} with scores`);
        } catch (sourceError) {
          console.log(`Failed to search source ${source}:`, (sourceError as Error).message);
        }
      }
      
      // If no results from known sources, try with metadata exists
      if (allDocs.length === 0) {
        try {
          console.log('No results from known sources, trying metadata filter');
          const metadataDocsWithScores = await vectorStore.similaritySearchWithScore(question, k, { metadata: { $exists: true } } as Record<string, unknown>);
          docs = metadataDocsWithScores.map(([doc, score]) => ({
            ...doc,
            similarityScore: score
          }));
          console.log(`Metadata filter search successful, found ${docs?.length || 0} docs`);
        } catch (metadataError) {
          console.log('Metadata filter also failed:', (metadataError as Error).message);
          docs = [];
        }
      } else {
        // Sort by similarity score (higher is better) and take top-k
        allDocs.sort((a, b) => (b.similarityScore || 0) - (a.similarityScore || 0));
        docs = allDocs.slice(0, k);
        console.log(`Combined search successful, found ${docs?.length || 0} docs total from ${sources.length} sources`);
        console.log(`Top similarity scores: ${docs.map(d => d.similarityScore?.toFixed(4)).join(', ')}`);
      }
    }

    console.log(`Total documents found: ${docs?.length || 0}`);

    // Calculate confidence metrics
    const confidenceMetrics = calculateConfidenceMetrics(docs);
    console.log(`Confidence metrics:`, confidenceMetrics);

    // 2) RAG chain: [format context] -> [prompt] -> [LLM]
    const llm = new ChatOpenAI({ model, temperature, apiKey: process.env.API_KEY });
    const chain = prompt.pipe(llm).pipe(new StringOutputParser());

    const rawAnswer = await chain.invoke({
      question,
      context: formatDocs(docs),
    });

    // Parse structured response
    const { answer, confidence: llmConfidence, reasoning } = parseStructuredResponse(rawAnswer);

    // 3) Save Q/A log using Prisma (ORM)
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
          explanation: `Confidence based on: average similarity ${(confidenceMetrics.avgSimilarity * 100).toFixed(1)}%, consistency score, and relevant document count (${confidenceMetrics.documentCount})`
        },
        reasoning,
        docsFound: docs?.length || 0,
        sources: docs.map((d) => ({
          id: d.id,
          metadata: d.metadata,
          snippet: d.pageContent.slice(0, 200),
          similarityScore: Math.round((d.similarityScore || 0) * 1000) / 1000,
          relevanceLevel: (d.similarityScore || 0) > 0.7 ? 'High' : (d.similarityScore || 0) > 0.5 ? 'Medium' : 'Low'
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
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Error in POST /api/query:', error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
}
