import "server-only";

import { createDeepAgent, StateBackend } from "deepagents";

import { getAnalystModel, getChatModel } from "./models";
import {
  ANALYST_PROMPT,
  MAIN_SYSTEM_PROMPT,
} from "./prompts";
import { createSearchTool, type EmitData } from "./search-tool";

export interface BuildAgentOptions {
  sessionId: string;
  emit: EmitData;
  signal?: AbortSignal;
}

/**
 * Build a fresh deepagents graph for one chat request. The Mongo client,
 * embeddings, and vector store are process-cached, but the backend, search
 * tool, and agent state are per request. The backend is in-memory only.
 */
export function buildAgent(options: BuildAgentOptions) {
  const backend = new StateBackend();
  const searchReport = createSearchTool({
    sessionId: options.sessionId,
    backend,
    emit: options.emit,
    signal: options.signal,
  });

  return createDeepAgent({
    model: getChatModel(),
    tools: [searchReport],
    backend,
    systemPrompt: MAIN_SYSTEM_PROMPT,
    subagents: [
      {
        name: "chunk-analyst",
        description:
          "Analyze one retrieved report section. Pass the user question and one /retrieved/ path.",
        systemPrompt: ANALYST_PROMPT,
        model: getAnalystModel(),
        tools: [],
        mode: "isolated",
      },
      {
        // deepagents adds a general-purpose subagent by default. Shadow it so
        // it cannot bypass the analyst model or the report-only prompt.
        name: "general-purpose",
        description:
          "Fallback report-section analyst. Prefer chunk-analyst for retrieved sections.",
        systemPrompt: ANALYST_PROMPT,
        model: getAnalystModel(),
        tools: [],
        mode: "isolated",
      },
    ],
  });
}
