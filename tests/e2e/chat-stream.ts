/**
 * A valid AI SDK UI message stream used by the Playwright happy path. It
 * mirrors the sanitized contract of `/api/chat`: visible text, stage/trace data,
 * and task activity only. No reasoning or raw retrieved chunks are included.
 */
export function mockChatStream(): string {
  const startedAt = Date.now();
  const chunks: Array<Record<string, unknown>> = [
    { type: "start", messageId: "mock-assistant-1" },
    { type: "start-step" },
    {
      type: "data-stage",
      data: {
        id: "search-1",
        stage: "searching",
        message: "Searching your report…",
        startedAt,
      },
    },
    {
      type: "tool-input-start",
      toolCallId: "call-search",
      toolName: "search_report",
      dynamic: true,
    },
    {
      type: "tool-input-available",
      toolCallId: "call-search",
      toolName: "search_report",
      input: { query: "important results cholesterol glucose" },
      dynamic: true,
    },
    {
      type: "data-trace",
      data: {
        type: "search",
        query: "important results cholesterol glucose",
        pages: [1],
        scores: [0.81, 0.76, 0.71, 0.66],
        chunkCount: 4,
        durationMs: 1_240,
      },
    },
    {
      type: "data-stage",
      data: {
        id: "search-1",
        stage: "searching",
        message: "Found 4 relevant sections.",
        startedAt,
        durationMs: 1_240,
      },
    },
    {
      type: "data-stage",
      data: {
        id: "analyze-1",
        stage: "analyzing",
        message: "Analyzing 4 sections…",
        startedAt: startedAt + 1_240,
      },
    },
    {
      type: "tool-input-start",
      toolCallId: "call-task-1",
      toolName: "task",
      dynamic: true,
    },
    {
      type: "tool-input-available",
      toolCallId: "call-task-1",
      toolName: "task",
      input: {
        subagent_type: "chunk-analyst",
        description:
          "Review the retrieved sections for cholesterol and glucose results.",
      },
      dynamic: true,
    },
    {
      type: "tool-output-available",
      toolCallId: "call-task-1",
      output:
        "Total cholesterol is 192 mg/dL; LDL is 118 mg/dL; glucose is 92 mg/dL.",
    },
    {
      type: "tool-input-start",
      toolCallId: "call-task-2",
      toolName: "task",
      dynamic: true,
    },
    {
      type: "tool-input-available",
      toolCallId: "call-task-2",
      toolName: "task",
      input: {
        subagent_type: "chunk-analyst",
        description:
          "Review the retrieved sections for hemoglobin and platelet results.",
      },
      dynamic: true,
    },
    {
      type: "tool-output-available",
      toolCallId: "call-task-2",
      output:
        "Hemoglobin is 13.8 g/dL; platelets are 245 x10^3/uL; both are within the stated ranges.",
    },
    {
      type: "data-stage",
      data: {
        id: "write-1",
        stage: "writing",
        message: "Writing answer…",
        startedAt: startedAt + 2_600,
      },
    },
    { type: "text-start", id: "text-1" },
    {
      type: "text-delta",
      id: "text-1",
      delta:
        "Your report shows **total cholesterol of 192 mg/dL** and **LDL of 118 mg/dL**. ",
    },
    {
      type: "text-delta",
      id: "text-1",
      delta:
        "\n\n- **Glucose:** 92 mg/dL\n- **Hemoglobin:** 13.8 g/dL\n\n",
    },
    {
      type: "text-delta",
      id: "text-1",
      delta:
        "The report does not include a diagnosis or treatment plan.",
    },
    { type: "text-end", id: "text-1" },
    { type: "finish-step" },
    { type: "finish" },
  ];

  return `${chunks
    .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
    .join("")}data: [DONE]\n\n`;
}
