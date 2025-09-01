export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { z } from "zod";

import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { vectorStore } from "@/lib/vectorstore";
import { prisma } from "@/lib/prisma";

const Body = z.object({
  question: z.string().min(1),
  k: z.number().int().min(1).max(20).default(4),
  filter: z.record(z.any(), z.any()).optional(), // akan diteruskan ke match_documents(filter JSONB)
  model: z.string().default("gpt-4o-mini"),
  temperature: z.number().min(0).max(2).default(0),
});

const prompt = ChatPromptTemplate.fromTemplate(`
Jawab pertanyaan hanya berdasarkan KONTEN berikut.
Jika jawabannya tidak ada, jawab: "Aku tidak menemukan jawabannya di dokumen."

KONTEN:
{context}

PERTANYAAN: {question}
`);

function formatDocs(docs: Array<{ pageContent: string; metadata: any; id?: string }>) {
  return docs
    .map(
      (d, i) =>
        `#${i + 1} ${d.metadata?.source ?? ""}\n` +
        (d.pageContent.length > 1000 ? d.pageContent.slice(0, 1000) + "..." : d.pageContent)
    )
    .join("\n\n");
}

export async function POST(req: NextRequest) {
  try {
    const { question, k, filter, model, temperature } = Body.parse(await req.json());

    // 1) Retrieve top-k dokumen dari Supabase Vector Store (dengan optional JSONB filter)
    const docs = await vectorStore.similaritySearch(question, k, filter as any);

    // 2) RAG chain sederhana: [format context] -> [prompt] -> [LLM]
    const llm = new ChatOpenAI({ model, temperature, apiKey: process.env.API_KEY });
    const chain = prompt.pipe(llm).pipe(new StringOutputParser());

    const answer = await chain.invoke({
      question,
      context: formatDocs(docs),
    });

    // 3) Simpan log Q/A pakai Prisma (ORM)
    await prisma.queryLog.create({
      data: {
        question,
        answer,
      },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        answer,
        sources: docs.map((d) => ({
          id: d.id,
          metadata: d.metadata,
          snippet: d.pageContent.slice(0, 200),
        })),
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
