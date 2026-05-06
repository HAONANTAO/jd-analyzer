import { describe, it, expect } from "vitest";
import { makeHistoryEntry } from "../lib/storage.js";

describe("makeHistoryEntry", () => {
  it("captures core fields with sane defaults", () => {
    const entry = makeHistoryEntry({
      jdText: "looking for a frontend dev",
      analysis: { detectedJobTitle: "Frontend Engineer", detectedCompany: "Acme", matchScore: 82 },
      provider: "claude",
      model: "claude-sonnet-4-6",
      costUsd: 0.018
    });
    expect(entry.jobTitle).toBe("Frontend Engineer");
    expect(entry.company).toBe("Acme");
    expect(entry.matchScore).toBe(82);
    expect(entry.provider).toBe("claude");
    expect(entry.costUsd).toBe(0.018);
    expect(entry.id).toMatch(/^\d+-[a-z0-9]+$/);
    expect(entry.timestamp).toBeGreaterThan(0);
  });

  it("falls back to 'Untitled role' when no title detected", () => {
    const entry = makeHistoryEntry({
      jdText: "...", analysis: {}, provider: "claude", model: "x", costUsd: null
    });
    expect(entry.jobTitle).toBe("Untitled role");
    expect(entry.company).toBeNull();
    expect(entry.matchScore).toBeNull();
  });

  it("treats 'unknown' company as no company", () => {
    const entry = makeHistoryEntry({
      jdText: "...",
      analysis: { detectedJobTitle: "Eng", detectedCompany: "unknown" },
      provider: "claude", model: "x", costUsd: null
    });
    expect(entry.company).toBeNull();
  });
});
