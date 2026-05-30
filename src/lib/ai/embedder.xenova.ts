/**
 * Xenova embedder — the real, production adapter.
 *
 * This is the ONLY module that imports `@xenova/transformers`. The model
 * (~80MB) is lazy-loaded on first use and reused thereafter. Tests inject a
 * fake via `setEmbedder` so this module's `getPipeline` never runs.
 */

import { EMBEDDING, type Embedder } from "./embedder";

// Use `any` (deliberate, with biome-ignore) because @xenova/transformers has no
// exported FeatureExtractionPipeline type that survives bundling.
// biome-ignore lint/suspicious/noExplicitAny: third-party type opacity
let pipelinePromise: Promise<any> | null = null;

async function getPipeline(): Promise<unknown> {
  if (pipelinePromise) return pipelinePromise;
  pipelinePromise = (async () => {
    const { pipeline, env } = await import("@xenova/transformers");
    // Cache models in .cache/transformers/ (gitignored).
    env.cacheDir = ".cache/transformers";
    return pipeline("feature-extraction", EMBEDDING.model);
  })();
  return pipelinePromise;
}

export function createXenovaEmbedder(): Embedder {
  return {
    async embed(text: string): Promise<number[]> {
      const pipe = (await getPipeline()) as (
        input: string,
        options: { pooling: string; normalize: boolean },
      ) => Promise<{ data: Float32Array }>;
      const output = await pipe(text, { pooling: "mean", normalize: true });
      return Array.from(output.data);
    },

    async embedBatch(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];
      const pipe = (await getPipeline()) as (
        input: string[],
        options: { pooling: string; normalize: boolean },
      ) => Promise<{ data: Float32Array; dims: number[] }>;
      const out = await pipe(texts, { pooling: "mean", normalize: true });
      const result: number[][] = [];
      const dim = out.dims[out.dims.length - 1] ?? EMBEDDING.dimensions;
      for (let i = 0; i < texts.length; i++) {
        result.push(Array.from(out.data.slice(i * dim, (i + 1) * dim)));
      }
      return result;
    },
  };
}
