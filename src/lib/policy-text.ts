/**
 * Plain-text format for policies edited in the dashboard. Deliberately tiny, and
 * never rendered as HTML:
 *
 *   Paragraphs are separated by a blank line.
 *   "## Heading" starts a numbered section.
 *   Lines starting with "- " are bullet points.
 *
 * Text before the first heading is the introduction. Order is preserved.
 */

export type PolicyBlock = { kind: "p"; text: string } | { kind: "ul"; items: string[] };
export interface PolicySection { heading: string; blocks: PolicyBlock[] }
export interface PolicyContent { intro: PolicyBlock[]; sections: PolicySection[] }

export function parsePolicyText(text: string): PolicyContent {
  const out: PolicyContent = { intro: [], sections: [] };
  let target = out.intro;
  let paragraph: string[] = [];
  let list: string[] | null = null;

  const flushParagraph = () => {
    const p = paragraph.join(" ").replace(/\s+/g, " ").trim();
    paragraph = [];
    if (p) target.push({ kind: "p", text: p });
  };
  const flushList = () => {
    if (list?.length) target.push({ kind: "ul", items: list });
    list = null;
  };

  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (/^##(\s|$)/.test(line)) {
      flushParagraph();
      flushList();
      const heading = line.slice(2).trim();
      if (!heading) continue;
      const section: PolicySection = { heading, blocks: [] };
      out.sections.push(section);
      target = section.blocks;
    } else if (/^[-*•]\s+/.test(line)) {
      flushParagraph();
      const item = line.replace(/^[-*•]\s+/, "").trim();
      if (item) (list ??= []).push(item);
    } else if (line === "") {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return out;
}

export function policyToText(content: PolicyContent): string {
  const block = (b: PolicyBlock) => (b.kind === "p" ? b.text : b.items.map((i) => `- ${i}`).join("\n"));
  const parts = [...content.intro.map(block)];
  for (const s of content.sections) parts.push(`## ${s.heading}`, ...s.blocks.map(block));
  return parts.join("\n\n") + "\n";
}
