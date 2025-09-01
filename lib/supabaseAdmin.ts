// lib/vectorstore.ts
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { OpenAIEmbeddings } from "@langchain/openai";
import { createClient } from "@supabase/supabase-js";

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}
if (!process.env.API_KEY) {
  throw new Error("Missing API_KEY (OpenAI API key)");
}

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
console.log(process.env.API_KEY, "api key");
export const vectorStore = new SupabaseVectorStore(
  new OpenAIEmbeddings({
    apiKey: process.env.API_KEY,      // <-- pakai API_KEY milikmu
    // optional:
    // model: "text-embedding-3-small",
    // organization: process.env.OPENAI_ORG, // jika perlu
    // project: process.env.OPENAI_PROJECT,  // jika pakai sk-proj dan butuh header project
  }),
  {
    client: supabaseAdmin,
    tableName: "documents",
    queryName: "match_documents",
  }
);
