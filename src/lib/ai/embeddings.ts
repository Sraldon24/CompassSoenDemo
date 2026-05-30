/**
 * Local embeddings — public surface (preserved for all callers).
 *
 * Delegates to a swappable {@link Embedder}. The default is the real Xenova
 * adapter (lazy-loaded ~80MB model, ~500ms cold start, reused after). Tests
 * call {@link setEmbedder} with a fake so they never load the model.
 *
 * Model details + the port live in `./embedder`; the real adapter (the only
 * importer of `@xenova/transformers`) lives in `./embedder.xenova`.
 */

import { EMBEDDING, type Embedder } from "./embedder";
import { createXenovaEmbedder } from "./embedder.xenova";

let active: Embedder | null = null;

function get(): Embedder {
  if (!active) active = createXenovaEmbedder();
  return active;
}

/** TEST-ONLY seam. Pass an Embedder to override; pass null to reset to the real one. */
export function setEmbedder(embedder: Embedder | null): void {
  active = embedder;
}

/** Embed a single string into a 384-dim normalized vector. */
export async function embed(text: string): Promise<number[]> {
  return get().embed(text);
}

/** Embed many strings in a single pass. Returns vectors in input order. */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  return get().embedBatch(texts);
}

/** Pre-warm the pipeline at boot (instrumentation hook). Safe to call multiple times. */
export async function warmEmbeddings(): Promise<void> {
  try {
    await embed("warmup");
  } catch (err) {
    console.warn("[ai] embedding warmup failed:", err);
  }
}

export { EMBEDDING };
