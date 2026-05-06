// lib/json.js
// Robust JSON extraction from LLM output. LLMs sometimes wrap JSON in
// ```json fences or in surrounding prose. Extracted into its own module so
// it can be unit-tested without pulling in the chrome runtime.

/**
 * Parse JSON from a possibly-noisy LLM response.
 * 1. Strip ```json ``` fences.
 * 2. Try JSON.parse on the cleaned text.
 * 3. Fallback: extract from first '{' to last '}'.
 * Throws the original parse error if nothing works.
 */
export function tryParseJSON(text) {
  const cleaned = String(text).replace(/```json\s*|\s*```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw err;
  }
}
