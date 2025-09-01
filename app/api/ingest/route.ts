export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { z } from "zod";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";
import { vectorStore } from "@/lib/vectorstore";

// Schema for text input
const TextBody = z.object({
  text: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
  chunkSize: z.number().int().positive().default(800),
  chunkOverlap: z.number().int().min(0).default(100),
});

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    
    let text: string;
    let metadata: Record<string, unknown> = {};
    let chunkSize = 800;
    let chunkOverlap = 100;

    if (contentType.includes('multipart/form-data')) {
      // Handle file upload
      const formData = await req.formData();
      const file = formData.get('file') as File;
      const source = formData.get('source') as string;
      const description = formData.get('description') as string;
      const chunkSizeStr = formData.get('chunkSize') as string;
      const chunkOverlapStr = formData.get('chunkOverlap') as string;

      if (!file) {
        throw new Error('No file provided');
      }

      // Read file content
      const fileContent = await file.text();
      text = fileContent;
      
      metadata = {
        source: source || file.name,
        description: description || '',
        filename: file.name,
        fileSize: file.size,
        fileType: file.type,
        uploadedAt: new Date().toISOString(),
        chunk: 0
      };

      if (chunkSizeStr) chunkSize = parseInt(chunkSizeStr);
      if (chunkOverlapStr) chunkOverlap = parseInt(chunkOverlapStr);

    } else {
      // Handle text input
      const body = await req.json();
      const { text: bodyText, metadata: bodyMetadata, chunkSize: bodyChunkSize, chunkOverlap: bodyChunkOverlap } = TextBody.parse(body);
      
      text = bodyText;
      metadata = { ...bodyMetadata, chunk: 0 };
      if (bodyChunkSize) chunkSize = bodyChunkSize;
      if (bodyChunkOverlap) chunkOverlap = bodyChunkOverlap;
    }

    // Process text with text splitter
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap,
    });
    
    const chunks = await splitter.splitText(text);
    const docs = chunks.map(
      (c, i) => new Document({ 
        pageContent: c, 
        metadata: { 
          ...metadata, 
          chunk: i,
          chunkCount: chunks.length,
          processedAt: new Date().toISOString()
        } 
      })
    );

    await vectorStore.addDocuments(docs);

    return new Response(
      JSON.stringify({ 
        ok: true, 
        inserted: docs.length,
        source: metadata.source,
        chunks: chunks.length,
        message: `Successfully processed ${docs.length} chunks from ${metadata.source || 'text input'}`
      }),
      { headers: { "content-type": "application/json" }, status: 200 }
    );
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error occurred';
    console.error('Ingest error:', errorMessage);
    return new Response(JSON.stringify({ ok: false, error: errorMessage }), {
      headers: { "content-type": "application/json" },
      status: 400,
    });
  }
}
