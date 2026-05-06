import { describe, it, expect } from "vitest";
import { tryParseJSON } from "../lib/json.js";

describe("tryParseJSON", () => {
  it("parses raw JSON", () => {
    expect(tryParseJSON('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips ```json fences", () => {
    const wrapped = '```json\n{"score": 87, "ok": true}\n```';
    expect(tryParseJSON(wrapped)).toEqual({ score: 87, ok: true });
  });

  it("strips bare ``` fences without the json tag", () => {
    expect(tryParseJSON('```\n{"a":2}\n```')).toEqual({ a: 2 });
  });

  it("falls back to first-{ to last-} when wrapped in prose", () => {
    const noisy = 'Sure! Here is the analysis:\n{"matchScore":80,"keywords":["aws","react"]}\nLet me know if you need anything else.';
    expect(tryParseJSON(noisy)).toEqual({ matchScore: 80, keywords: ["aws", "react"] });
  });

  it("handles nested braces in fallback", () => {
    const noisy = 'Result: {"a":{"b":1},"c":2} done.';
    expect(tryParseJSON(noisy)).toEqual({ a: { b: 1 }, c: 2 });
  });

  it("throws when nothing parseable exists", () => {
    expect(() => tryParseJSON("totally not json")).toThrow();
  });

  it("throws when only an opening brace is present", () => {
    expect(() => tryParseJSON("{ partial")).toThrow();
  });
});
