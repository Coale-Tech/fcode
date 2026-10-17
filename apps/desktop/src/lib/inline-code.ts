/** A run of plain user text, or one single-line `code span` (raw keeps the backticks). */
export type InlineCodePart = { code: boolean; text: string; raw: string };

const CODE_SPAN = /`([^`\n]+)`/g;

/** Splits plain text on single-backtick code spans, the way chat prose renders them. */
export function splitInlineCode(text: string): InlineCodePart[] {
  const parts: InlineCodePart[] = [];
  let last = 0;
  for (const match of text.matchAll(CODE_SPAN)) {
    const start = match.index ?? 0;
    if (start > last) {
      const plain = text.slice(last, start);
      parts.push({ code: false, text: plain, raw: plain });
    }
    parts.push({ code: true, text: match[1] ?? "", raw: match[0] });
    last = start + match[0].length;
  }
  if (last < text.length) {
    const plain = text.slice(last);
    parts.push({ code: false, text: plain, raw: plain });
  }
  return parts;
}
