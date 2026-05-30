/**
 * Deterministic fake embedder for tests — no model load, no network.
 *
 * Produces stable, L2-normalized 384-dim vectors derived from a hash of the
 * input text, so cosine similarity (`recommend-core.cosineSimilarity`,
 * pgvector `<=>`) stays well-defined and identical strings embed identically.
 */

import { EMBEDDING, type Embedder } from "../embedder";

/** Tiny deterministic string hash (FNV-1a-ish), seeds a PRNG. */
function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Mulberry32 PRNG — deterministic from a seed. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fakeVector(text: string): number[] {
  const rng = mulberry32(hashSeed(text));
  const v = new Array<number>(EMBEDDING.dimensions);
  let norm = 0;
  for (let i = 0; i < v.length; i++) {
    const x = rng() * 2 - 1; // [-1, 1)
    v[i] = x;
    norm += x * x;
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < v.length; i++) v[i] = (v[i] as number) / norm;
  return v;
}

export function createFakeEmbedder(): Embedder {
  return {
    async embed(text: string): Promise<number[]> {
      return fakeVector(text);
    },
    async embedBatch(texts: string[]): Promise<number[][]> {
      return texts.map(fakeVector);
    },
  };
}
