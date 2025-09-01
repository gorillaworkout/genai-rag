export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: NextRequest) {
  try {
    // Get all documents from the documents table
    const { data: documents, error } = await supabaseAdmin
      .from('documents')
      .select('*')
      .limit(10);

    if (error) {
      throw error;
    }

    // Get count of total documents
    const { count, error: countError } = await supabaseAdmin
      .from('documents')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      throw countError;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        totalDocuments: count,
        sampleDocuments: documents?.slice(0, 5).map(doc => ({
          id: doc.id,
          content: doc.content?.substring(0, 200) + '...',
          metadata: doc.metadata,
          embedding: doc.embedding ? 'Vector present' : 'No vector'
        }))
      }),
      { headers: { "content-type": "application/json" }, status: 200 }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      headers: { "content-type": "application/json" },
      status: 400,
    });
  }
}
