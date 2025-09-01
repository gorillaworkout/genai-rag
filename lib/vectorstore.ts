import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { OpenAIEmbeddings } from "@langchain/openai";
import { supabaseAdmin } from "./supabaseAdmin";

// Debug environment variables
console.log('🔍 Vectorstore initialization - Environment check:');
console.log('API_KEY exists:', !!process.env.API_KEY);
console.log('API_KEY length:', process.env.API_KEY?.length || 0);
console.log('API_KEY prefix:', process.env.API_KEY?.substring(0, 10) || 'none');
console.log('NODE_ENV:', process.env.NODE_ENV);

export const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-small", // 1536 dims
  apiKey: process.env.API_KEY,
});

export const vectorStore = new SupabaseVectorStore(embeddings, {
  client: supabaseAdmin,
  tableName: "documents",
  queryName: "match_documents",
});

// Custom search method yang lebih reliable
export async function customSimilaritySearch(
  question: string, 
  k: number = 4, 
  filter?: Record<string, unknown>
) {
  try {
    // Generate embedding untuk question
    const questionEmbedding = await embeddings.embedQuery(question);
    
    // Build query berdasarkan ada tidaknya filter
    const query = supabaseAdmin.rpc('match_documents', {
      query_embedding: questionEmbedding,
      match_count: k,
      ...(filter && Object.keys(filter).length > 0 ? { filter: filter } : {})
    });
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Supabase RPC error:', error);
      throw error;
    }
    
    if (!data || data.length === 0) {
      console.log('No documents found with custom search');
      return [];
    }
    
    // Convert ke format yang diharapkan LangChain
    return data.map((doc: { content: string; metadata?: Record<string, unknown>; id: string }) => ({
      pageContent: doc.content,
      metadata: doc.metadata || {},
      id: doc.id
    }));
    
  } catch (error) {
    console.error('Custom search error:', error);
    // Fallback ke method original
    if (filter && Object.keys(filter).length > 0) {
      return vectorStore.similaritySearch(question, k, filter);
    } else {
      return vectorStore.similaritySearch(question, k);
    }
  }
}
