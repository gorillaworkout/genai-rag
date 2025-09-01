


export const runtime = "nodejs";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  try {
    console.log('Testing Supabase connection...');
    
    // Test 1: Basic connection - just select one row
    const { data: testData, error: testError } = await supabaseAdmin
      .from('documents')
      .select('*')
      .limit(1);
    
    if (testError) {
      console.error('Basic connection test failed:', testError);
      return new Response(JSON.stringify({ 
        ok: false, 
        error: 'Basic connection failed', 
        details: testError.message 
      }), { 
        headers: { "content-type": "application/json" }, 
        status: 500 
      });
    }
    
    console.log('Basic connection test passed');
    console.log('Sample document structure:', testData?.[0]);
    
    // Test 2: Get total count
    const { count, error: countError } = await supabaseAdmin
      .from('documents')
      .select('*', { count: 'exact', head: true });
    
    if (countError) {
      console.error('Count query failed:', countError);
      return new Response(JSON.stringify({ 
        ok: false, 
        error: 'Count query failed', 
        details: countError.message 
      }), { 
        headers: { "content-type": "application/json" }, 
        status: 500 
      });
    }
    
    console.log('Count query passed, total documents:', count);
    
    // Test 3: Get first 10 documents without ordering
    const { data: documents, error: docsError } = await supabaseAdmin
      .from('documents')
      .select('*')
      .limit(10);
    
    if (docsError) {
      console.error('Documents query failed:', docsError);
      return new Response(JSON.stringify({ 
        ok: false, 
        error: 'Documents query failed', 
        details: docsError.message 
      }), { 
        headers: { "content-type": "application/json" }, 
        status: 500 
      });
    }
    
    console.log('Documents query passed, found:', documents?.length || 0, 'documents');
    
    // Test 4: Get sources
    const { data: sources, error: sourcesError } = await supabaseAdmin
      .from('documents')
      .select('metadata->>source');
    
    if (sourcesError) {
      console.error('Sources query failed:', sourcesError);
    }
    
    const uniqueSources = [...new Set(
      sources?.map((s: { source: string }) => s.source).filter(Boolean) || []
    )];
    
    console.log('Sources query completed, unique sources:', uniqueSources);
    
    return new Response(JSON.stringify({
      ok: true,
      message: 'All Supabase tests passed',
      totalDocuments: count,
      sampleDocuments: documents?.slice(0, 5).map(doc => ({
        id: doc.id,
        content: doc.content?.substring(0, 100) + '...',
        metadata: doc.metadata,
        availableColumns: Object.keys(doc)
      })),
      sources: uniqueSources,
      tests: {
        connection: 'PASSED',
        count: 'PASSED',
        documents: 'PASSED',
        sources: sourcesError ? 'FAILED' : 'PASSED'
      }
    }), { 
      headers: { "content-type": "application/json" }, 
      status: 200 
    });
    
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error occurred';
    console.error('Test endpoint error:', errorMessage);
    return new Response(JSON.stringify({ 
      ok: false, 
      error: 'Test endpoint failed', 
      details: errorMessage 
    }), { 
      headers: { "content-type": "application/json" }, 
      status: 500 
    });
  }
}
