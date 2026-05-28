/**
 * Local embeddings via @xenova/transformers (no API calls).
 * Model: Xenova/all-MiniLM-L6-v2 — 384 dims, ~80MB, runs in Node.
 *
 * Singleton pipeline. Lazy-loaded on first embed() call. Subsequent calls
 * reuse the same in-memory model — first call costs ~500ms cold start.
 */

const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";
const EMBEDDING_DIMS = 384;

// Use `any` (deliberate, with biome-ignore) because @xenova/transformers
// has no exported FeatureExtractionPipeline type that survives bundling.
// biome-ignore lint/suspicious/noExplicitAny: third-party type opacity
let pipelinePromise: Promise<any> | null = null;

async function getPipeline(): Promise<unknown> {
  if (pipelinePromise) return pipelinePromise;
  pipelinePromise = (async () => {
    const { pipeline, env } = await import("@xenova/transformers");
    // Cache models in .cache/transformers/ (gitignored).
    env.cacheDir = ".cache/transformers";
    return pipeline("feature-extraction", EMBEDDING_MODEL);
  })();
  return pipelinePromise;
}

/**
 * Embed a single string into a 384-dim normalized vector.
 * Use {@link embedBatch} for many strings — it's much faster.
 */
export async function embed(text: string): Promise<number[]> {
  const pipe = (await getPipeline()) as (
    input: string,
    options: { pooling: string; normalize: boolean },
  ) => Promise<{ data: Float32Array }>;
  const output = await pipe(text, { pooling: "mean", normalize: true });
  return Array.from(output.data);
}

/**
 * Embed many strings in a single forward pass. Returns an array of vectors
 * in the same order as the input.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const pipe = (await getPipeline()) as (
    input: string[],
    options: { pooling: string; normalize: boolean },
  ) => Promise<{ data: Float32Array; dims: number[] }>;
  const out = await pipe(texts, { pooling: "mean", normalize: true });
  // Reshape flat Float32Array into [batch, dim] vectors.
  const result: number[][] = [];
  const dim = out.dims[out.dims.length - 1] ?? EMBEDDING_DIMS;
  for (let i = 0; i < texts.length; i++) {
    result.push(Array.from(out.data.slice(i * dim, (i + 1) * dim)));
  }
  return result;
}

/** Pre-warm the pipeline at boot (instrumentation hook). Safe to call multiple times. */
export async function warmEmbeddings(): Promise<void> {
  try {
    await embed("warmup");
  } catch (err) {
    console.warn("[ai] embedding warmup failed:", err);
  }
}

export const EMBEDDING = {
  model: EMBEDDING_MODEL,
  dimensions: EMBEDDING_DIMS,
};
