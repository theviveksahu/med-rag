import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RichText } from "./rich-text";

describe("RichText", () => {
  it("renders headings, bold text, inline code, and lists without raw HTML", () => {
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
          "<script>alert(1)</script>",
        ].join("\n")}
      />,
    );

    expect(screen.getByText("Results")).toBeInTheDocument();
    expect(screen.getByText("hemoglobin")).toBeInTheDocument();
    expect(screen.getByText("13.8 g/dL")).toBeInTheDocument();
    expect(screen.getAllByRole("list")).toHaveLength(2);
    expect(screen.getByText("Glucose: 92 mg/dL")).toBeInTheDocument();
    expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
  });
});
