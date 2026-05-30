import { EMBEDDING } from "@/lib/ai/embedder";
import { createFakeEmbedder } from "@/lib/ai/embedders/fake";
import { embed, embedBatch, setEmbedder } from "@/lib/ai/embeddings";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Inject the fake so these tests never load the ~80MB Xenova model.
beforeAll(() => setEmbedder(createFakeEmbedder()));
afterAll(() => setEmbedder(null));

describe("fake embedder via setEmbedder seam", () => {
  it("produces vectors of the configured dimension", async () => {
    const v = await embed("COMP 352 Data Structures");
    expect(v).toHaveLength(EMBEDDING.dimensions);
  });

  it("is deterministic — same text embeds identically", async () => {
    const a = await embed("operating systems");
    const b = await embed("operating systems");
    expect(a).toEqual(b);
  });

  it("differs across distinct texts", async () => {
    const a = await embed("databases");
    const b = await embed("compilers");
    expect(a).not.toEqual(b);
  });

  it("returns L2-normalized vectors (unit length)", async () => {
    const v = await embed("machine learning");
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("embedBatch preserves order and returns [] for empty input", async () => {
    expect(await embedBatch([])).toEqual([]);
    const [a, b] = await embedBatch(["x", "y"]);
    expect(a).toEqual(await embed("x"));
    expect(b).toEqual(await embed("y"));
  });
});
