import "server-only";

import { ChatOpenRouter } from "@langchain/openrouter";
import { OpenAIEmbeddings } from "@langchain/openai";

import { EMBED_BATCH_SIZE } from "@/lib/shared/limits";

import { getServerEnv } from "./config";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

let chatModel: ChatOpenRouter | undefined;
let analystModel: ChatOpenRouter | undefined;
let embeddings: OpenAIEmbeddings | undefined;

/**
 * Main planning/synthesis model. A fresh instance is cheap; the client itself
 * is cached per process so repeated requests reuse connections.
 */
export function getChatModel(): ChatOpenRouter {
  if (chatModel) return chatModel;

  const env = getServerEnv();
  chatModel = new ChatOpenRouter({
    model: env.CHAT_MODEL,
    apiKey: env.OPENROUTER_API_KEY,
    baseURL: OPENROUTER_BASE_URL,
    temperature: 0.2,
  });

  return chatModel;
}

/**
 * Chunk analysts get a bounded output so a single delegated section cannot
 * consume the whole answer budget.
 */
export function getAnalystModel(): ChatOpenRouter {
  if (analystModel) return analystModel;

  const env = getServerEnv();
  analystModel = new ChatOpenRouter({
    model: env.ANALYST_MODEL,
    apiKey: env.OPENROUTER_API_KEY,
    baseURL: OPENROUTER_BASE_URL,
    temperature: 0.2,
    maxTokens: 1_200,
  });

  return analystModel;
}

/**
 * OpenRouter exposes an OpenAI-compatible embeddings endpoint. This model
 * returns 4096-dimensional vectors; ingest validates each vector before insert
 * so an index/dimension mismatch fails loudly instead of silently.
 */
export function getEmbeddings(): OpenAIEmbeddings {
  if (embeddings) return embeddings;

  const env = getServerEnv();
  embeddings = new OpenAIEmbeddings({
    model: env.EMBEDDING_MODEL,
    apiKey: env.OPENROUTER_API_KEY,
    configuration: {
      baseURL: OPENROUTER_BASE_URL,
    },
    batchSize: EMBED_BATCH_SIZE,
    // Keep line breaks intact; the stored text and embedding input stay close.
    stripNewLines: false,
  });

  return embeddings;
}

/** Test-only helper; production code uses the cached instances. */
export function resetModelsForTests(): void {
  chatModel = undefined;
  analystModel = undefined;
  embeddings = undefined;
}
