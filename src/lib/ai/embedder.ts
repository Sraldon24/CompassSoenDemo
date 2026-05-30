/**
 * Embedder port — the seam over text-embedding.
 *
 * The real implementation (Xenova all-MiniLM-L6-v2) lives in `embedder.xenova.ts`
 * (the only file that imports `@xenova/transformers`). Tests inject a fake from
 * `embedders/fake.ts` so they never load the ~80MB model. `embeddings.ts` keeps
 * the historical `embed`/`embedBatch`/`warmEmbeddings` free functions and routes
 * them through the active embedder.
 */

export interface Embedder {
  /** Embed a single string into a normalized vector. */
  embed(text: string): Promise<number[]>;
  /** Embed many strings in one pass; same order as input. */
  embedBatch(texts: string[]): Promise<number[][]>;
}

export const EMBEDDING = {
  model: "Xenova/all-MiniLM-L6-v2",
  dimensions: 384,
} as const;
