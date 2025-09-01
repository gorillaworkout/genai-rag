export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { vectorStore } from "@/lib/vectorstore";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { Document } from "@langchain/core/documents";

interface TestResult {
  success: boolean;
  count?: number;
  docs?: Array<{
    id: string;
    metadata: Record<string, unknown>;
    content: string;
  }>;
  error?: string;
}

interface SearchResults {
  question: string;
  k: number;
  filter?: Record<string, unknown>;
  tests: {
    withFilter?: TestResult;
    noFilter?: TestResult;
    emptyFilter?: TestResult;
  };
  totalDocuments?: { count?: number; error?: string };
}

export async function POST(req: NextRequest) {
  try {
    const { question, k = 4, filter } = await req.json();
    
    const results: SearchResults = {
      question,
      k,
      filter,
      tests: {}
    };

    // Test 1: Search dengan filter yang ada
    if (filter && Object.keys(filter).length > 0) {
      try {
        const docsWithFilter = await vectorStore.similaritySearch(question, k, filter);
        results.tests.withFilter = {
          success: true,
          count: docsWithFilter.length,
          docs: docsWithFilter.map((d: Document) => ({
            id: d.metadata?.id as string || Math.random().toString(),
            metadata: d.metadata || {},
            content: d.pageContent.substring(0, 100)
          }))
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.tests.withFilter = {
          success: false,
          error: errorMessage
        };
      }
    }

    // Test 2: Search tanpa filter (parameter kosong)
    try {
      const docsNoFilter = await vectorStore.similaritySearch(question, k);
      results.tests.noFilter = {
        success: true,
        count: docsNoFilter.length,
        docs: docsNoFilter.map((d: Document) => ({
          id: d.metadata?.id as string || Math.random().toString(),
          metadata: d.metadata || {},
          content: d.pageContent.substring(0, 100)
        }))
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      results.tests.noFilter = {
        success: false,
        error: errorMessage
      };
    }

    // Test 3: Search dengan filter kosong object
    try {
      const docsEmptyFilter = await vectorStore.similaritySearch(question, k, {});
      results.tests.emptyFilter = {
        success: true,
        count: docsEmptyFilter.length,
        docs: docsEmptyFilter.map((d: Document) => ({
          id: d.metadata?.id as string || Math.random().toString(),
          metadata: d.metadata || {},
          content: d.pageContent.substring(0, 100)
        }))
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      results.tests.emptyFilter = {
        success: false,
        error: errorMessage
      };
    }

    // Test 4: Direct database query untuk melihat total dokumen
    try {
      const { count, error: countError } = await supabaseAdmin
        .from('documents')
        .select('*', { count: 'exact', head: true });
      
      if (countError) {
        results.totalDocuments = { error: countError.message };
      } else {
        results.totalDocuments = { count: count || undefined };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      results.totalDocuments = { error: errorMessage };
    }

    return new Response(
      JSON.stringify(results, null, 2),
      { headers: { "content-type": "application/json" }, status: 200 }
    );
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ ok: false, error: errorMessage }), {
      headers: { "content-type": "application/json" },
      status: 400,
    });
  }
}
