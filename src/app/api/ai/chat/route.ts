import { COMPASS_SYSTEM } from "@/lib/ai/prompts";
import { isComplexQuery, streamChatWithFallback } from "@/lib/ai/provider";
import { buildRAGContext } from "@/lib/ai/rag";
import { recordAIUsage } from "@/lib/ai/usage";
import { ANALYTICS_EVENTS } from "@/lib/analytics/events";
import { trackServer } from "@/lib/analytics/server";
import { apiError } from "@/lib/api/response";
import { aiGuard } from "@/lib/api/route-guard";
import { db } from "@/lib/data/db";
import { aiConversations, aiMessages } from "@/lib/data/schema";
import { and, desc, eq, ne } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { z } from "zod";

/** How many prior turns to feed the model for follow-up context. Keep small so
 * the context (and token cost) stays bounded; RAG carries the heavy grounding. */
const HISTORY_TURNS = 8;

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
      return apiError("Failed to create conversation", 500);
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
      return apiError("Conversation not found", 404);
    }
  }

  // Load prior turns BEFORE inserting the new message, so multi-turn chat has
  // context (follow-ups like "what about its prereq?"). Fetch the NEWEST rows
  // (desc + limit — uses idx_ai_messages_conversation), then reverse back to
  // chronological order so the model reads oldest→newest with the latest turns.
  const priorRows = await db
    .select({ role: aiMessages.role, content: aiMessages.content })
    .from(aiMessages)
    .where(and(eq(aiMessages.conversationId, conversationId), ne(aiMessages.role, "system")))
    .orderBy(desc(aiMessages.createdAt))
    .limit(HISTORY_TURNS * 2);
  const history = priorRows
    .filter(
      (m): m is { role: "user" | "assistant"; content: string } =>
        (m.role === "user" || m.role === "assistant") && m.content.length > 0,
    )
    .reverse();

  // Save the user message first so it persists even if the LLM fails.
  await db.insert(aiMessages).values({
    conversationId,
    role: "user",
    content: parsed.message,
  });

  void trackServer(session.user.id, ANALYTICS_EVENTS.ai_chat_sent, {
    complex: isComplexQuery(parsed.message),
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
    messages: [...history, { role: "user", content: parsed.message }],
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
          // Record the model that ACTUALLY served the stream (70B / Gemini / 8B),
          // not a hardcoded guess — keeps the per-model usage ledger accurate.
          model: chat.servedBy(),
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
