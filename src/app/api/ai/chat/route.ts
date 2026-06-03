import { COMPASS_SYSTEM } from "@/lib/ai/prompts";
import { isComplexQuery, streamChatWithFallback } from "@/lib/ai/provider";
import { buildRAGContext } from "@/lib/ai/rag";
import { recordAIUsage } from "@/lib/ai/usage";
import { aiGuard } from "@/lib/api/route-guard";
import { db } from "@/lib/db";
import { aiConversations, aiMessages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requestSchema = z.object({
  message: z.string().trim().min(1).max(2_000),
  // Accept missing OR null — the client sends `conversationId: null` for the
  // first message of a fresh chat; `.nullish()` normalizes both to undefined.
  conversationId: z.string().uuid().nullish(),
});

export async function POST(req: NextRequest): Promise<Response> {
  // Auth → validate body → rate-limit/quota. The quota check targets the 8B
  // "instant" model: chat answers are RAG-grounded so the small model is plenty
  // capable and reaches first-token far faster than 70B. (70B stays for
  // recommend/summarize/email where reasoning depth matters more than latency.)
  const guard = await aiGuard(req, requestSchema, "aiChat", "llama-3.1-8b-instant");
  if (!guard.ok) return guard.response;
  const { session, body: parsed, decision: limit } = guard;

  // Get or create the conversation.
  let conversationId = parsed.conversationId;
  if (!conversationId) {
    const [conv] = await db
      .insert(aiConversations)
      .values({
        userId: session.user.id,
        title: parsed.message.slice(0, 80),
      })
      .returning({ id: aiConversations.id });
    if (!conv) {
      return NextResponse.json({ error: "Failed to create conversation" }, { status: 500 });
    }
    conversationId = conv.id;
  } else {
    // Make sure the user owns this conversation.
    const [conv] = await db
      .select({ userId: aiConversations.userId })
      .from(aiConversations)
      .where(eq(aiConversations.id, conversationId))
      .limit(1);
    if (!conv || conv.userId !== session.user.id) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
  }

  // Save the user message first so it persists even if the LLM fails.
  await db.insert(aiMessages).values({
    conversationId,
    role: "user",
    content: parsed.message,
  });

  // Build RAG context from the user's query.
  const rag = await buildRAGContext({ query: parsed.message, userId: session.user.id });

  // Stream the answer. Quality-first: try Groq 70B, but if it hasn't produced a
  // first token within ~8s, fall back to the fastest available model (Gemini
  // Flash if configured, else Groq 8B). The client shows a "thinking…" status
  // for the brief race window.
  const sourcesPayload = rag.sources.map((s) => ({ id: s.id, label: s.label, url: s.url }));

  // Balanced router: quick lookups go to the fast model (Gemini); strategic
  // questions try Groq 70B first (with an 8s latency fallback).
  const chat = streamChatWithFallback({
    task: "chat-complex",
    system: `${COMPASS_SYSTEM}\n\n## Context\n${rag.text || "(no relevant context found)"}`,
    messages: [{ role: "user", content: parsed.message }],
    temperature: 0.4,
    preferFast: !isComplexQuery(parsed.message),
  });

  // Accumulate tokens for persistence while forwarding them to the client.
  let assistantText = "";
  const ts = new TransformStream<string, string>({
    transform(chunk, controller) {
      assistantText += chunk;
      controller.enqueue(chunk);
    },
    async flush() {
      try {
        await db.insert(aiMessages).values({
          conversationId,
          role: "assistant",
          content: assistantText,
          model: chat.servedBy(),
          contextSources: sourcesPayload.map((s) => s.id),
        });
        await recordAIUsage({
          userId: session.user.id,
          feature: "chat",
          model: "llama-3.1-8b-instant",
          tokensUsed: Math.ceil(assistantText.length / 4),
        });
      } catch (err) {
        console.warn("[ai] failed to persist assistant message:", err);
      }
    },
  });

  const sourceStream = new ReadableStream<string>({
    async start(controller) {
      try {
        for await (const chunk of chat.textStream) {
          controller.enqueue(chunk);
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  const body = sourceStream.pipeThrough(ts).pipeThrough(new TextEncoderStream());

  // Use a hand-rolled response so we can include sources + conversationId in headers.
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Conversation-Id": conversationId,
      "X-Sources": Buffer.from(JSON.stringify(sourcesPayload)).toString("base64"),
      "X-Rate-Limit-Remaining": String(limit.remaining),
      "X-Rate-Limit-Limit": String(limit.limit),
    },
  });
}
