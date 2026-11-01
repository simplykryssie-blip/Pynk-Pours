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

describe("policies pasted from a document", () => {
  it("treats standalone, in-order '1. Title' lines as headings and '*' as bullets", async () => {
    const { parsePolicyText } = await import("@/lib/policy-text");
    const c = parsePolicyText("Intro.\r\n\r\n1. Information We Collect\r\n\r\n* Your name\r\n* Email\r\n\r\n2. Payment Information\r\n\r\nPaid via Stripe.\r\n\r\n4. Skipped Number\r\n\r\n3. Steps:\r\n\r\n1. Not a heading again");
    expect(c.intro).toEqual([{ kind: "p", text: "Intro." }]);
    expect(c.sections.map((s) => s.heading)).toEqual(["Information We Collect", "Payment Information"]);
    expect(c.sections[0].blocks).toEqual([{ kind: "ul", items: ["Your name", "Email"] }]);
    // Out-of-order numbers and lines ending in punctuation stay as text.
    expect(c.sections[1].blocks.map((b) => (b.kind === "p" ? b.text : ""))).toEqual(["Paid via Stripe.", "4. Skipped Number", "3. Steps:", "1. Not a heading again"]);
  });
  it("a numbered line inside a paragraph is not a heading", async () => {
    const { parsePolicyText } = await import("@/lib/policy-text");
    const c = parsePolicyText("We do two things:\n1. Sell tickets\n\nDone.");
    expect(c.sections).toEqual([]);
  });
});
