import "server-only";

import {
  MongoClient,
  type Collection,
  type Db,
  type ObjectId,
} from "mongodb";

import type { SessionReport, SessionStatus } from "@/lib/shared/types";

import { getServerEnv } from "./config";

export type ServerSessionReport = Omit<SessionReport, "indexedAt"> & {
  indexedAt: Date;
};

export interface SessionDocument {
  _id: string;
  status: SessionStatus;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  report: ServerSessionReport | null;
  error: { code: string; message: string } | null;
  questionCount: number;
}

export interface ChunkDocument {
  _id?: ObjectId;
  text: string;
  embedding: number[];
  sessionId: string;
  reportHash: string;
  chunkIndex: number;
  source: string;
  page: number;
  createdAt: Date;
  expiresAt: Date;
}

type MongoGlobal = typeof globalThis & {
  __medragMongoClientPromise?: Promise<MongoClient>;
};

const globalForMongo = globalThis as MongoGlobal;

/**
 * Cache the connection promise across requests and dev-server reloads.
 * A rejected promise is cleared so the next request can retry.
 */
export function getMongoClient(): Promise<MongoClient> {
  if (!globalForMongo.__medragMongoClientPromise) {
    const { MONGODB_ATLAS_URI } = getServerEnv();
    const client = new MongoClient(MONGODB_ATLAS_URI, {
      appName: "med-rag",
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10_000,
    });

    globalForMongo.__medragMongoClientPromise = client
      .connect()
      .catch((error: unknown) => {
        delete globalForMongo.__medragMongoClientPromise;
        throw error;
      });
  }

  return globalForMongo.__medragMongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const { MONGODB_ATLAS_DB_NAME } = getServerEnv();
  const client = await getMongoClient();
  return client.db(MONGODB_ATLAS_DB_NAME);
}

export async function getChunksCollection(): Promise<
  Collection<ChunkDocument>
> {
  const { MONGODB_ATLAS_COLLECTION_NAME } = getServerEnv();
  const db = await getDb();
  return db.collection<ChunkDocument>(MONGODB_ATLAS_COLLECTION_NAME);
}

export async function getSessionsCollection(): Promise<
  Collection<SessionDocument>
> {
  const { MONGODB_ATLAS_SESSIONS_COLLECTION_NAME } = getServerEnv();
  const db = await getDb();
  return db.collection<SessionDocument>(
    MONGODB_ATLAS_SESSIONS_COLLECTION_NAME,
  );
}
