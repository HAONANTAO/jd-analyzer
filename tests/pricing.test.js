import { describe, it, expect } from "vitest";
import { estimateCost, formatCost } from "../lib/pricing.js";

describe("estimateCost", () => {
  it("computes Sonnet cost correctly", () => {
    // 10k input @ $3/M + 2k output @ $15/M = 0.03 + 0.03 = $0.06
    const cost = estimateCost("claude-sonnet-4-6", 10_000, 2_000);
    expect(cost).toBeCloseTo(0.06, 5);
  });

  it("computes Haiku cost (cheap)", () => {
    // 10k @ $1 + 2k @ $5 = 0.01 + 0.01 = $0.02
    expect(estimateCost("claude-haiku-4-5", 10_000, 2_000)).toBeCloseTo(0.02, 5);
  });

  it("computes gpt-4o-mini cost", () => {
    // 10k @ $0.15 + 2k @ $0.60 = 0.0015 + 0.0012 = $0.0027
    expect(estimateCost("gpt-4o-mini", 10_000, 2_000)).toBeCloseTo(0.0027, 5);
  });

  it("returns null for unknown model", () => {
    expect(estimateCost("claude-bogus-9-9", 1000, 500)).toBeNull();
  });

  it("returns null when tokens missing", () => {
    expect(estimateCost("claude-sonnet-4-6", null, 500)).toBeNull();
    expect(estimateCost("claude-sonnet-4-6", 1000, undefined)).toBeNull();
  });

  it("supports legacy Sonnet 4.5 alias", () => {
    expect(estimateCost("claude-sonnet-4-5", 10_000, 2_000)).toBeCloseTo(0.06, 5);
  });
});

describe("formatCost", () => {
  it("returns null for null input", () => {
    expect(formatCost(null)).toBeNull();
  });

  it("formats sub-cent values with 4 decimals", () => {
    expect(formatCost(0.0027)).toBe("$0.0027");
  });

  it("formats values under $1 with 3 decimals", () => {
    expect(formatCost(0.06)).toBe("$0.060");
  });

  it("formats values >= $1 with 2 decimals", () => {
    expect(formatCost(1.234)).toBe("$1.23");
  });

  it("uses '<$0.0001' for very small values", () => {
    expect(formatCost(0.00001)).toBe("<$0.0001");
  });
});
