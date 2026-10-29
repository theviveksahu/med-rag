import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { CustomDataMessage } from "@/lib/shared/types";
import { ChatMessage } from "./chat-message";

function assistantMessage(
  parts: CustomDataMessage["parts"],
): CustomDataMessage {
  return {
    id: "assistant-1",
    role: "assistant",
    parts,
  } as CustomDataMessage;
}

describe("ChatMessage", () => {
  it("renders answer text and visible activity while hiding reasoning and file tools", async () => {
    const user = userEvent.setup();
    const message = assistantMessage([
      {
        type: "data-stage",
        data: {
          id: "search-1",
          stage: "searching",
          message: "Searching your report…",
          startedAt: 1,
          durationMs: 100,
        },
      },
      {
        type: "data-trace",
        data: {
          type: "search",
          query: "hemoglobin",
          pages: [1],
          chunkCount: 4,
          durationMs: 100,
        },
      },
      {
        type: "dynamic-tool",
        toolName: "task",
        toolCallId: "task-1",
        state: "output-available",
        input: { description: "Review the retrieved section." },
        output: "Hemoglobin is 13.8 g/dL.",
      },
      {
        type: "text",
        text: "Your report shows **hemoglobin 13.8 g/dL**.",
      },
      {
        type: "reasoning",
        text: "SECRET REASONING",
      },
      {
        type: "dynamic-tool",
        toolName: "read_file",
        toolCallId: "read-1",
        state: "output-available",
        input: { file_path: "/retrieved/chunk_1.md" },
        output: "SECRET CHUNK",
      },
    ]);

    render(<ChatMessage message={message} streaming={false} durationMs={1_200} />);

    expect(screen.getByText("hemoglobin 13.8 g/dL")).toBeInTheDocument();
    expect(screen.getByText(/Searched 4 sections · 1 analyst · 1.2s/)).toBeInTheDocument();
    expect(screen.queryByText(/SECRET REASONING/)).not.toBeInTheDocument();
    expect(screen.queryByText(/SECRET CHUNK/)).not.toBeInTheDocument();
    expect(screen.queryByText(/read_file/)).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /show agent trace/i }),
    );

    expect(screen.getByText("“hemoglobin”")).toBeInTheDocument();
    expect(screen.getByText("Hemoglobin is 13.8 g/dL.")).toBeInTheDocument();
    expect(screen.getByText("Synthesis")).toBeInTheDocument();
  });

  it("renders a compact right-aligned user message", () => {
    render(
      <ChatMessage
        message={{
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "What is my LDL?" }],
        } as CustomDataMessage}
        streaming={false}
      />,
    );

    expect(screen.getByText("What is my LDL?")).toBeInTheDocument();
  });

  it("does not render an empty error-only assistant message", () => {
    const message = assistantMessage([
      {
        type: "data-error",
        data: {
          code: "PROVIDER_ERROR",
          message: "The AI provider is unavailable.",
          retryable: true,
        },
      },
    ]);

    const { container } = render(
      <ChatMessage message={message} streaming={false} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("shows a pending state while streaming before text arrives", () => {
    render(
      <ChatMessage message={assistantMessage([])} streaming={true} />,
    );

    expect(
      screen.getByRole("status", { name: "Preparing your answer" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Preparing your answer…")).toBeInTheDocument();
  });
});
