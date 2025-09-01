import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { OpenAIEmbeddings } from "@langchain/openai";
import { supabaseAdmin } from "./supabaseAdmin";

export const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-small", // 1536 dims
  apiKey: process.env.API_KEY,
});

export const vectorStore = new SupabaseVectorStore(embeddings, {
  client: supabaseAdmin,
  tableName: "documents",
  queryName: "match_documents",
});
