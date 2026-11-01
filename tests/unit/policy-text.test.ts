import { describe, expect, it } from "vitest";
import { DEFAULT_POLICIES, POLICY_SLUGS } from "@/content/policies";
import { parsePolicyText, policyToText } from "@/lib/policy-text";

describe("policy text format", () => {
  it("parses intro, numbered sections, paragraphs and bullets in order", () => {
    const parsed = parsePolicyText([
      "Intro line one",
      "continues here.",
      "",
      "## First",
      "Para A.",
      "- one",
      "- two",
      "Para B after the list.",
      "",
      "##   ",
      "## Second",
      "* star bullet",
    ].join("\r\n"));
    expect(parsed).toEqual({
      intro: [{ kind: "p", text: "Intro line one continues here." }],
      sections: [
        { heading: "First", blocks: [
          { kind: "p", text: "Para A." },
          { kind: "ul", items: ["one", "two"] },
          { kind: "p", text: "Para B after the list." },
        ] },
        { heading: "Second", blocks: [{ kind: "ul", items: ["star bullet"] }] },
      ],
    });
  });

  it("round-trips: text → structure → text → same structure", () => {
    for (const slug of POLICY_SLUGS) {
      const once = parsePolicyText(DEFAULT_POLICIES[slug].text);
      expect(parsePolicyText(policyToText(once))).toEqual(once);
    }
  });

  it("built-in drafts have an intro and several sections, and treat markup as text", () => {
    for (const slug of POLICY_SLUGS) {
      const p = parsePolicyText(DEFAULT_POLICIES[slug].text);
      expect(p.intro.length).toBeGreaterThan(0);
      expect(p.sections.length).toBeGreaterThanOrEqual(5);
    }
    const html = parsePolicyText("<script>alert(1)</script>");
    expect(html.intro).toEqual([{ kind: "p", text: "<script>alert(1)</script>" }]);
  });
});
