import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { vectorStore } from '@/lib/vectorstore';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const source = searchParams.get('source');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    console.log('Documents API called with:', { source, page, limit, offset });

    // Try Supabase first with better error handling
    try {
      let query = supabaseAdmin
        .from('documents')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      // Filter by source if provided
      if (source && source !== 'all') {
        query = query.eq('metadata->>source', source);
      }

      // Get total count first
      const { count: totalCount, error: countError } = await query;
      
      if (countError) {
        console.error('Count query error:', countError);
        throw countError;
      }

      console.log('Total documents found:', totalCount);

      // Get documents with pagination
      const { data: documents, error } = await query
        .range(offset, offset + limit - 1);

      console.log('Supabase query result:', { 
        documentsCount: documents?.length || 0, 
        totalCount, 
        error: error?.message 
      });

      if (error) {
        console.error('Documents query error:', error);
        throw error;
      }

      // Get unique sources for filtering
      const { data: sources, error: sourcesError } = await supabaseAdmin
        .from('documents')
        .select('metadata->>source');

      if (sourcesError) {
        console.error('Error fetching sources:', sourcesError);
      }

      const uniqueSources = [...new Set(
        sources?.map((s: { source: string }) => s.source).filter(Boolean) || []
      )];

      console.log('Supabase query successful, returning', documents?.length || 0, 'documents');

      return NextResponse.json({
        ok: true,
        documents: documents || [],
        pagination: {
          page,
          limit,
          total: totalCount || 0,
          totalPages: Math.ceil((totalCount || 0) / limit)
        },
        sources: uniqueSources,
        filters: {
          currentSource: source || 'all'
        },
        note: 'Using Supabase (full data)'
      });

    } catch (supabaseError: unknown) {
      const errorMessage = supabaseError instanceof Error ? supabaseError.message : 'Unknown Supabase error';
      console.error('Supabase failed with error:', errorMessage);
      console.log('Supabase failed, trying vector store fallback:', errorMessage);
      
      // Fallback: Use vector store to get sample documents
      try {
        console.log('Using vector store fallback...');
        
        // Try to get documents from vector store first
        const langchainDocs = await vectorStore.similaritySearch('langchain', 50);
        const fiturDocs = await vectorStore.similaritySearch('fitur', 50);
        let allDocs = [...langchainDocs, ...fiturDocs];
        
        console.log('Vector store returned:', allDocs.length, 'total documents');
        console.log('Langchain docs:', langchainDocs.length);
        console.log('Fitur docs:', fiturDocs.length);
        
        // If vector store doesn't have enough data, try debug endpoint as backup
        if (allDocs.length < 10) { // If we have less than 10 docs, use debug endpoint
          console.log('Vector store has insufficient data, trying debug endpoint...');
          try {
            const debugResponse = await fetch('http://localhost:3000/api/debug');
            const debugData = await debugResponse.json();
            
            if (debugData.ok && debugData.sampleDocuments) {
              allDocs = debugData.sampleDocuments.map((doc: { id: string; content: string; metadata: Record<string, unknown> }) => ({
                id: doc.id,
                pageContent: doc.content,
                metadata: doc.metadata
              }));
              console.log('Debug endpoint returned:', allDocs.length, 'documents');
            }
          } catch (debugError) {
            console.log('Debug endpoint also failed:', debugError);
          }
        }
        
        // Filter by source if needed
        let filteredDocs = allDocs;
        if (source && source !== 'all') {
          filteredDocs = allDocs.filter(doc => 
            doc.metadata?.source === source
          );
          console.log('Filtered by source', source, ':', filteredDocs.length, 'documents');
        }

        // Apply pagination
        const startIndex = offset;
        const endIndex = startIndex + limit;
        const paginatedDocs = filteredDocs.slice(startIndex, endIndex);

        // Get unique sources from all documents
        const uniqueSources = [...new Set(
          allDocs.map(doc => doc.metadata?.source).filter(Boolean)
        )];
        console.log('Unique sources found:', uniqueSources);

        return NextResponse.json({
          ok: true,
          documents: paginatedDocs.map(doc => ({
            id: doc.id || Math.random().toString(),
            content: doc.pageContent,
            metadata: doc.metadata,
            created_at: new Date().toISOString() // Fallback date
          })),
          pagination: {
            page,
            limit,
            total: filteredDocs.length,
            totalPages: Math.ceil(filteredDocs.length / limit)
          },
          sources: uniqueSources,
          filters: {
            currentSource: source || 'all'
          },
          note: 'Using vector store fallback (limited metadata)'
        });

      } catch (vectorStoreError: unknown) {
        const vectorErrorMsg = vectorStoreError instanceof Error ? vectorStoreError.message : 'Unknown vector store error';
        console.error('Vector store fallback also failed:', vectorErrorMsg);
        throw new Error('Both Supabase and vector store failed');
      }
    }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error('Documents API error:', errorMessage);
    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: 500 }
    );
  }
}
