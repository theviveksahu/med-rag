import { config as loadEnv } from "dotenv";
import { MongoClient, MongoServerError, type Db, type Document } from "mongodb";

import {
  EMBEDDING_DIMENSIONS,
  VECTOR_INDEX_NAME,
} from "../src/lib/shared/limits";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

interface VectorIndexDefinition extends Document {
  fields: Array<Record<string, unknown>>;
}

const vectorDefinition: VectorIndexDefinition = {
  fields: [
    {
      type: "vector",
      path: "embedding",
      numDimensions: EMBEDDING_DIMENSIONS,
      similarity: "cosine",
    },
    {
      type: "filter",
      path: "sessionId",
    },
  ],
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function ensureCollection(db: Db, name: string): Promise<void> {
  try {
    await db.createCollection(name);
    console.log(`created collection ${name}`);
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 48) {
      console.log(`collection ${name} already exists`);
      return;
    }
    throw error;
  }
}

function latestFields(index: unknown): unknown {
  if (!index || typeof index !== "object" || !("latestDefinition" in index)) {
    return undefined;
  }

  const latest = (index as { latestDefinition?: unknown }).latestDefinition;
  if (!latest || typeof latest !== "object" || !("fields" in latest)) {
    return undefined;
  }

  return (latest as { fields?: unknown }).fields;
}

async function main(): Promise<void> {
  const uri = requireEnv("MONGODB_ATLAS_URI");
  const dbName = requireEnv("MONGODB_ATLAS_DB_NAME");
  const chunksName =
    process.env.MONGODB_ATLAS_COLLECTION_NAME ?? "chunks";
  const sessionsName =
    process.env.MONGODB_ATLAS_SESSIONS_COLLECTION_NAME ?? "sessions";
  const clean = process.argv.includes("--clean");

  const client = new MongoClient(uri, {
    appName: "med-rag-setup",
    serverSelectionTimeoutMS: 10_000,
  });

  try {
    await client.connect();
    const db = client.db(dbName);

    await ensureCollection(db, chunksName);
    await ensureCollection(db, sessionsName);

    const chunks = db.collection(chunksName);
    const sessions = db.collection(sessionsName);

    await chunks.createIndex({ sessionId: 1 }, { name: "sessionId_1" });
    await chunks.createIndex(
      { expiresAt: 1 },
      { name: "expiresAt_ttl", expireAfterSeconds: 0 },
    );
    await sessions.createIndex(
      { expiresAt: 1 },
      { name: "expiresAt_ttl", expireAfterSeconds: 0 },
    );
    console.log("regular and TTL indexes are ready");

    const searchIndexes = await chunks.listSearchIndexes().toArray();
    const vectorIndex = searchIndexes.find(
      (index) => index.name === VECTOR_INDEX_NAME,
    );

    if (!vectorIndex) {
      await chunks.createSearchIndex({
        name: VECTOR_INDEX_NAME,
        type: "vectorSearch",
        definition: vectorDefinition,
      });
      console.log(`created Atlas vector index ${VECTOR_INDEX_NAME}`);
    } else if (
      JSON.stringify(latestFields(vectorIndex)) !==
      JSON.stringify(vectorDefinition.fields)
    ) {
      await chunks.updateSearchIndex(VECTOR_INDEX_NAME, vectorDefinition);
      console.log(`updated Atlas vector index ${VECTOR_INDEX_NAME}`);
    } else {
      console.log(`Atlas vector index ${VECTOR_INDEX_NAME} is already current`);
    }

    if (clean) {
      const result = await chunks.deleteMany({
        sessionId: { $exists: false },
      });
      console.log(`removed ${result.deletedCount} legacy chunk documents`);
    }

    console.log("database setup complete");
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  if (error instanceof MongoServerError) {
    console.error(`Index setup failed (MongoDB code ${error.code ?? "unknown"}).`);
  } else if (error instanceof Error) {
    console.error(`Index setup failed: ${error.message}`);
  } else {
    console.error("Index setup failed.");
  }
  process.exitCode = 1;
});
