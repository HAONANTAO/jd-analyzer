// lib/pricing.js
// USD per million tokens. Update when providers change rates.
// Last verified: 2026-05.

const PRICING = {
  // Claude (Anthropic)
  "claude-sonnet-4-6": { input: 3,  output: 15 },
  "claude-opus-4-7":   { input: 15, output: 75 },
  "claude-haiku-4-5":  { input: 1,  output: 5  },
  // Older aliases — Anthropic still resolves these
  "claude-sonnet-4-5": { input: 3,  output: 15 },
  "claude-opus-4-5":   { input: 15, output: 75 },

  // OpenAI
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  "gpt-4o":      { input: 5,    output: 15   },
  "gpt-4-turbo": { input: 10,   output: 30   }
};

/**
 * Returns USD cost for a single call, or null if pricing unknown.
 */
export function estimateCost(model, inputTokens, outputTokens) {
  const rates = PRICING[model];
  if (!rates) return null;
  if (inputTokens == null || outputTokens == null) return null;
  return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
}

/**
 * Format USD for display. Returns null when input is null.
 */
export function formatCost(usd) {
  if (usd == null) return null;
  if (usd < 0.0001) return "<$0.0001";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}
