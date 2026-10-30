import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Render model answers as safe, styled markdown. Raw HTML is never rendered
 * (react-markdown escapes it by default), links are shown as plain text (the
 * model must not emit URLs), and GFM tables render as real <table> elements
 * inside a horizontal-scroll wrapper for narrow screens.
 */
export function RichText({ text }: { text: string }) {
  return (
    <div className="rich-text">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children }) => <>{children}</>,
          table: ({ children }) => (
            <div className="overflow-x-auto rounded-lg border border-(--border)">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
