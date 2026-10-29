import type { ReactNode } from "react";

/**
 * A deliberately small markdown renderer for model answers. It supports the
 * constructs the prompt is most likely to produce: paragraphs, bold text,
 * inline code, headings, and bullet/numbered lists. It never renders raw HTML.
 */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `${keyPrefix}-inline-${index}`;
    index += 1;

    if (token.startsWith("**")) {
      nodes.push(
        <strong key={key} className="font-semibold text-(--foreground)">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      nodes.push(
        <code
          key={key}
          className="rounded border border-(--border) bg-(--surface-raised) px-1 py-0.5 font-mono text-[0.9em]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));

  return nodes;
}

export function RichText({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];
  let numbers: string[] = [];
  let blockIndex = 0;

  function flushParagraph() {
    if (paragraph.length === 0) return;

    const key = `p-${blockIndex}`;
    blockIndex += 1;
    blocks.push(
      <p key={key} className="whitespace-pre-wrap">
        {inline(paragraph.join(" "), key)}
      </p>,
    );
    paragraph = [];
  }

  function flushBullets() {
    if (bullets.length === 0) return;

    const key = `ul-${blockIndex}`;
    blockIndex += 1;
    blocks.push(
      <ul key={key} className="list-disc space-y-1 pl-5 marker:text-(--accent)">
        {bullets.map((item, index) => (
          <li key={`${key}-${index}`}>
            {inline(item, `${key}-${index}`)}
          </li>
        ))}
      </ul>,
    );
    bullets = [];
  }

  function flushNumbers() {
    if (numbers.length === 0) return;

    const key = `ol-${blockIndex}`;
    blockIndex += 1;
    blocks.push(
      <ol key={key} className="list-decimal space-y-1 pl-5 marker:text-(--accent)">
        {numbers.map((item, index) => (
          <li key={`${key}-${index}`}>
            {inline(item, `${key}-${index}`)}
          </li>
        ))}
      </ol>,
    );
    numbers = [];
  }

  function flushAll() {
    flushParagraph();
    flushBullets();
    flushNumbers();
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushAll();
      continue;
    }

    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      flushAll();
      const key = `h-${blockIndex}`;
      blockIndex += 1;
      blocks.push(
        <p key={key} className="font-medium text-(--foreground)">
          {inline(heading[1], key)}
        </p>,
      );
      continue;
    }

    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      flushNumbers();
      bullets.push(bullet[1]);
      continue;
    }

    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    if (numbered) {
      flushParagraph();
      flushBullets();
      numbers.push(numbered[1]);
      continue;
    }

    flushBullets();
    flushNumbers();
    paragraph.push(line);
  }

  flushAll();

  if (blocks.length === 0) return null;

  return <div className="space-y-3">{blocks}</div>;
}
