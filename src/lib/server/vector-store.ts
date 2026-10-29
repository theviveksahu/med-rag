import "server-only";

import { MongoDBAtlasVectorSearch } from "@langchain/mongodb";
import type { Collection, Document as MongoDocument } from "mongodb";

import { VECTOR_INDEX_NAME } from "@/lib/shared/limits";

import { getChunksCollection } from "./db";
import { getEmbeddings } from "./models";

let vectorStorePromise: Promise<MongoDBAtlasVectorSearch> | undefined;

/**
 * Cache the Atlas vector store per process. The collection/client and
 * embeddings client are shared; the agent/backend are created per request.
 */
export function getVectorStore(): Promise<MongoDBAtlasVectorSearch> {
  if (!vectorStorePromise) {
    vectorStorePromise = (async () => {
      const collection = (await getChunksCollection()) as unknown as Collection<
        MongoDocument
      >;

      return new MongoDBAtlasVectorSearch(getEmbeddings(), {
        collection,
        indexName: VECTOR_INDEX_NAME,
        textKey: "text",
        embeddingKey: "embedding",
      });
    })().catch((error: unknown) => {
      vectorStorePromise = undefined;
      throw error;
    });
  }

  return vectorStorePromise;
}

/** Test-only helper; production code uses the cached instance. */
export function resetVectorStoreForTests(): void {
  vectorStorePromise = undefined;
}
