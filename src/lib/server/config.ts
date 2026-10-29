import "server-only";

import { z } from "zod";

/**
 * Server configuration is parsed lazily so `next build` does not require
 * production secrets. Never include secret values in an error or log.
 */
const envSchema = z.object({
  MONGODB_ATLAS_URI: z.string().min(1),
  MONGODB_ATLAS_DB_NAME: z.string().min(1),
  MONGODB_ATLAS_COLLECTION_NAME: z.string().min(1).default("chunks"),
  MONGODB_ATLAS_SESSIONS_COLLECTION_NAME: z.string().min(1).default("sessions"),
  OPENROUTER_API_KEY: z.string().min(1),
  CHAT_MODEL: z
    .string()
    .min(1)
    .default("nvidia/nemotron-3-ultra-550b-a55b:free"),
  ANALYST_MODEL: z.string().min(1).optional(),
  EMBEDDING_MODEL: z
    .string()
    .min(1)
    .default("nvidia/nemotron-3.5-embed-8b:free"),
});

type ParsedServerEnv = z.infer<typeof envSchema>;

export type ServerEnv = Omit<ParsedServerEnv, "ANALYST_MODEL"> & {
  ANALYST_MODEL: string;
};

export class ConfigurationError extends Error {
  readonly variables: string[];

  constructor(variables: string[]) {
    super(
      `Missing or invalid server configuration: ${variables.join(", ")}`,
    );
    this.name = "ConfigurationError";
    this.variables = variables;
  }
}

let cachedEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (cachedEnv) return cachedEnv;

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const variables = [
      ...new Set(
        parsed.error.issues.map((issue) =>
          String(issue.path[0] ?? "unknown"),
        ),
      ),
    ];

    throw new ConfigurationError(variables);
  }

  cachedEnv = {
    ...parsed.data,
    ANALYST_MODEL: parsed.data.ANALYST_MODEL ?? parsed.data.CHAT_MODEL,
  };

  return cachedEnv;
}

/** Test-only helper; production code should use the cached environment. */
export function resetServerEnvForTests(): void {
  cachedEnv = undefined;
}
