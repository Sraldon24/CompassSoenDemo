import { COMPASS_SYSTEM } from "@/lib/ai/prompts";
import { streamResponse } from "@/lib/ai/provider";
import { buildRAGContext } from "@/lib/ai/rag";
import { recordAIUsage } from "@/lib/ai/usage";
import { db } from "@/lib/db";
import { aiConversations, aiMessages } from "@/lib/db/schema";
import { getSession } from "@/lib/get-session";
import { LIMITS, rateLimitByUserId } from "@/lib/rate-limit";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requestSchema = z.object({
  message: z.string().trim().min(1).max(2_000),
  conversationId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest): Promise<Response> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let parsed: z.infer<typeof requestSchema>;
  try {
    parsed = requestSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof z.ZodError ? err.issues[0]?.message : "Bad request" },
      { status: 400 },
    );
  }

  // Rate limit BEFORE the LLM call (per ADR + audit guidance).
  const limit = rateLimitByUserId(
    session.user.id,
    "ai-chat",
    LIMITS.aiChat.limit,
    LIMITS.aiChat.windowMs,
  );
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: "Daily message limit reached.",
        remaining: 0,
        limit: limit.limit,
      },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) },
      },
    );
  }

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

  // Stream from Groq. Save the assistant message + sources when streaming finishes.
  const sourcesPayload = rag.sources.map((s) => ({ id: s.id, label: s.label, url: s.url }));

  const stream = streamResponse({
    task: "chat-complex",
    system: `${COMPASS_SYSTEM}\n\n## Context\n${rag.text || "(no relevant context found)"}`,
    messages: [{ role: "user", content: parsed.message }],
    temperature: 0.4,
  });

  // Persist assistant text once streaming finishes.
  let assistantText = "";
  const _reader = (await stream.textStream).getReader?.();

  // Use TransformStream so we can both forward tokens to the client and accumulate.
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
          model: "groq-llama-3.3-70b",
          contextSources: sourcesPayload.map((s) => s.id),
        });
        await recordAIUsage({
          userId: session.user.id,
          feature: "chat",
          model: "llama-3.3-70b-versatile",
          tokensUsed: Math.ceil(assistantText.length / 4),
        });
      } catch (err) {
        console.warn("[ai] failed to persist assistant message:", err);
      }
    },
  });

  // Pipe the text stream through our transform.
  const textStream = stream.textStream;
  const sourceStream = new ReadableStream<string>({
    async start(controller) {
      try {
        for await (const chunk of textStream) {
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
