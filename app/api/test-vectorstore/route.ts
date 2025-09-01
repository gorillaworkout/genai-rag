import { NextResponse } from 'next/server';
import { vectorStore } from '@/lib/vectorstore';

export async function GET() {
  try {
    console.log('Testing vector store...');
    
    // Test 1: Empty query
    console.log('Test 1: Empty query similaritySearch');
    const emptyQueryResult = await vectorStore.similaritySearch('', 10);
    console.log('Empty query result:', emptyQueryResult.length, 'documents');
    
    // Test 2: Simple query
    console.log('Test 2: Simple query similaritySearch');
    const simpleQueryResult = await vectorStore.similaritySearch('langchain', 10);
    console.log('Simple query result:', simpleQueryResult.length, 'documents');
    
    // Test 3: Query for fitur documents
    console.log('Test 3: Query for fitur documents');
    const fiturQueryResult = await vectorStore.similaritySearch('fitur', 10);
    console.log('Fitur query result:', fiturQueryResult.length, 'documents');
    
    // Test 4: Query for all documents using generic terms
    console.log('Test 4: Query for all documents using generic terms');
    const allDocsQuery = await vectorStore.similaritySearch('document', 100);
    console.log('All docs query result:', allDocsQuery.length, 'documents');
    
    // Test 5: Check if documents exist
    console.log('Test 5: Check vector store state');
    
    // Get all unique sources
    const allSources = new Set();
    [simpleQueryResult, fiturQueryResult, allDocsQuery].forEach(docs => {
      docs.forEach(doc => {
        if (doc.metadata?.source) {
          allSources.add(doc.metadata.source);
        }
      });
    });
    
    return NextResponse.json({
      ok: true,
      tests: {
        emptyQuery: {
          count: emptyQueryResult.length,
          documents: emptyQueryResult.map(doc => ({
            id: doc.id,
            content: doc.pageContent.substring(0, 100) + '...',
            metadata: doc.metadata
          }))
        },
        simpleQuery: {
          count: simpleQueryResult.length,
          documents: simpleQueryResult.map(doc => ({
            id: doc.id,
            content: doc.pageContent.substring(0, 100) + '...',
            metadata: doc.metadata
          }))
        },
        fiturQuery: {
          count: fiturQueryResult.length,
          documents: fiturQueryResult.map(doc => ({
            id: doc.id,
            content: doc.pageContent.substring(0, 100) + '...',
            metadata: doc.metadata
          }))
        },
        allDocsQuery: {
          count: allDocsQuery.length,
          documents: allDocsQuery.map(doc => ({
            id: doc.id,
            content: doc.pageContent.substring(0, 100) + '...',
            metadata: doc.metadata
          }))
        }
      },
      summary: {
        totalDocuments: simpleQueryResult.length + fiturQueryResult.length + allDocsQuery.length,
        uniqueSources: Array.from(allSources),
        sourceCounts: {
          'docs-langchain': simpleQueryResult.filter(doc => doc.metadata?.source === 'docs-langchain').length,
          'docs-fitur-a': fiturQueryResult.filter(doc => doc.metadata?.source === 'docs-fitur-a').length
        }
      }
    });
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Vector store test error:', errorMessage);
    return NextResponse.json(
      { ok: false, error: errorMessage },
      { status: 500 }
    );
  }
}
