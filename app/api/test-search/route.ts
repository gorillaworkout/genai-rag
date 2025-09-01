export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { vectorStore } from "@/lib/vectorstore";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const { question, k = 4, filter } = await req.json();
    
    const results = {
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
          docs: docsWithFilter.map((d: any) => ({
            id: d.id,
            metadata: d.metadata,
            content: d.pageContent.substring(0, 100)
          }))
        };
      } catch (error) {
        results.tests.withFilter = {
          success: false,
          error: error.message
        };
      }
    }

    // Test 2: Search tanpa filter (parameter kosong)
    try {
      const docsNoFilter = await vectorStore.similaritySearch(question, k);
      results.tests.noFilter = {
        success: true,
        count: docsNoFilter.length,
        docs: docsNoFilter.map((d: any) => ({
          id: d.id,
          metadata: d.metadata,
          content: d.pageContent.substring(0, 100)
        }))
      };
    } catch (error) {
      results.tests.noFilter = {
        success: false,
        error: error.message
      };
    }

    // Test 3: Search dengan filter kosong object
    try {
      const docsEmptyFilter = await vectorStore.similaritySearch(question, k, {});
      results.tests.emptyFilter = {
        success: true,
        count: docsEmptyFilter.length,
        docs: docsEmptyFilter.map((d: any) => ({
          id: d.id,
          metadata: d.metadata,
          content: d.pageContent.substring(0, 100)
        }))
      };
    } catch (error) {
      results.tests.emptyFilter = {
        success: false,
        error: error.message
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
        results.totalDocuments = { count };
      }
    } catch (error) {
      results.totalDocuments = { error: error.message };
    }

    return new Response(
      JSON.stringify(results, null, 2),
      { headers: { "content-type": "application/json" }, status: 200 }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      headers: { "content-type": "application/json" },
      status: 400,
    });
  }
}
