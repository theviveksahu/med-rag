import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RichText } from "./rich-text";

describe("RichText", () => {
  it("renders headings, bold, inline code, lists, blockquote, and tables without raw HTML", () => {
    render(
      <RichText
        text={[
          "## Results",
          "",
          "Your **hemoglobin** is `13.8 g/dL`.",
          "",
          "- Glucose: 92 mg/dL",
          "- Platelets: 245 x10^3/uL",
          "",
          "1. Keep the report",
          "2. Ask a clinician",
          "",
          "> Discuss with your clinician.",
          "",
          "| Test | Value |",
          "| --- | --- |",
          "| Hemoglobin | 13.8 g/dL |",
          "",
          "[Read more](https://example.com)",
          "",
          "<script>alert(1)</script>",
        ].join("\n")}
      />,
    );

    // Headings, bold, inline code
    expect(screen.getByRole("heading", { name: "Results" })).toBeInTheDocument();
    expect(screen.getByText("hemoglobin")).toBeInTheDocument();
    expect(
      screen.getByText("13.8 g/dL", { selector: "code" }),
    ).toBeInTheDocument();

    // Unordered and ordered lists
    expect(screen.getAllByRole("list")).toHaveLength(2);
    expect(screen.getByText("Glucose: 92 mg/dL")).toBeInTheDocument();

    // Blockquote
    expect(screen.getByText("Discuss with your clinician.")).toBeInTheDocument();

    // GFM table renders as a real table
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Test" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("cell", { name: "13.8 g/dL" }),
    ).toBeInTheDocument();

    // Links render as plain text, not anchors
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Read more")).toBeInTheDocument();

    // Raw HTML is escaped, never rendered
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByText(/alert\(1\)/)).toBeInTheDocument();
  });
});
