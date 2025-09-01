export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { z } from "zod";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";
import { vectorStore } from "@/lib/vectorstore";

const Body = z.object({
  text: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
  chunkSize: z.number().int().positive().default(800),
  chunkOverlap: z.number().int().min(0).default(100),
});

export async function POST(req: NextRequest) {
  try {
    const { text, metadata = {}, chunkSize, chunkOverlap } = Body.parse(
      await req.json()
    );

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap,
    });
    const chunks = await splitter.splitText(text);
    const docs = chunks.map(
      (c, i) => new Document({ pageContent: c, metadata: { ...metadata, chunk: i } })
    );

    await vectorStore.addDocuments(docs);

    return new Response(
      JSON.stringify({ ok: true, inserted: docs.length }),
      { headers: { "content-type": "application/json" }, status: 200 }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      headers: { "content-type": "application/json" },
      status: 400,
    });
  }
}
