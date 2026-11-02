import { describe, expect, it } from "vitest";
import { answerText, fieldKey, parseFields, validateResponse, VENDOR_TEMPLATE, type FormField } from "@/lib/forms";

const FORM_ID = "11111111-2222-4333-8444-555555555555";
const fields: FormField[] = [
  { key: "name", type: "short_text", label: "Your name", required: true },
  { key: "email", type: "email", label: "Email", required: true },
  { key: "kind", type: "select", label: "Kind", required: true, options: ["Food", "Art"] },
  { key: "days", type: "checkboxes", label: "Days", options: ["Sat", "Sun"] },
  { key: "agree", type: "yes", label: "I agree", required: true },
  { key: "photos", type: "file", label: "Photos" },
];
const file = (over: Partial<{ path: string; contentType: string; size: number }> = {}) => JSON.stringify({
  path: `pending/${FORM_ID}/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/booth.jpg`, filename: "booth.jpg", contentType: "image/jpeg", size: 1000, ...over,
});

describe("form fields", () => {
  it("the vendor template is valid", () => {
    expect(parseFields(VENDOR_TEMPLATE).ok).toBe(true);
  });
  it("requires a required email question, choices for choice questions, unique keys", () => {
    expect(parseFields([{ key: "a", type: "short_text", label: "A" }])).toMatchObject({ ok: false, message: expect.stringMatching(/Email question/) });
    expect(parseFields([{ key: "e", type: "email", label: "E" }])).toMatchObject({ ok: false, message: expect.stringMatching(/must be required/) });
    expect(parseFields([{ key: "e", type: "email", label: "E", required: true }, { key: "c", type: "radio", label: "Pick", options: [] }]))
      .toMatchObject({ ok: false, message: "“Pick” needs at least one choice." });
    expect(parseFields([{ key: "e", type: "email", label: "E", required: true }, { key: "e", type: "short_text", label: "Dup" }])).toMatchObject({ ok: false });
    expect(parseFields([{ key: "e", type: "email", label: "E", required: true }, { key: "x", type: "bogus", label: "X" }]).ok).toBe(false);
  });
  it("makes readable unique keys", () => {
    expect(fieldKey("What do you sell?", new Set())).toBe("what_do_you_sell");
    expect(fieldKey("Email", new Set(["email"]))).toBe("email_2");
    expect(fieldKey("2024 revenue", new Set())).toBe("q_2024_revenue");
  });
});

describe("validating a response", () => {
  it("accepts a good response, normalises email, drops unknown fields", () => {
    const r = validateResponse(fields, { name: " Ana ", email: "ANA@Example.test", kind: "Food", days: ["Sat"], agree: "on", photos: [file()], hacker: "x" }, FORM_ID);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toEqual({ name: "Ana", email: "ana@example.test", kind: "Food", days: ["Sat"], agree: true, photos: ["booth.jpg"] });
    expect(r.email).toBe("ana@example.test");
    expect(r.name).toBe("Ana");
    expect(r.files.photos[0].path).toMatch(/^pending\//);
  });
  it("reports each problem next to its question", () => {
    const r = validateResponse(fields, { email: "nope", kind: "Cars", days: ["Mon"] }, FORM_ID);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fieldErrors).toEqual({
      name: "“Your name” is required.", email: "Enter a valid email address.", kind: "Please choose from the list.",
      days: "Please choose from the list.", agree: "“I agree” is required.",
    });
  });
  it("only accepts uploads the server issued for this form, of allowed types and sizes", () => {
    const base = { name: "A", email: "a@example.test", kind: "Art", agree: "on" };
    for (const bad of [
      file({ path: `pending/99999999-2222-4333-8444-555555555555/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/x.jpg` }),
      file({ path: `../../etc/passwd` }),
      file({ contentType: "text/html" }),
      file({ size: 11 * 1024 * 1024 }),
      "not json",
    ]) {
      const r = validateResponse(fields, { ...base, photos: [bad] }, FORM_ID);
      expect(r.ok).toBe(false);
    }
  });
  it("formats answers for display", () => {
    expect(answerText(true)).toBe("Yes");
    expect(answerText(["Sat", "Sun"])).toBe("Sat, Sun");
    expect(answerText(undefined)).toBe("");
  });
});
