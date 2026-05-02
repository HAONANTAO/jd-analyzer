// lib/claudeProvider.js v0.9
import { fromHttpError, fromException } from "./errors.js";

const API_URL = "https://api.anthropic.com/v1/messages";
const REQUEST_TIMEOUT_MS = 60_000;

export const CLAUDE_MODELS = [
  { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5 (Recommended)" },
  { id: "claude-opus-4-5", label: "Claude Opus 4.5 (Most capable)" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 (Fast & cheap)" }
];

const HEADERS = (apiKey) => ({
  "Content-Type": "application/json",
  "x-api-key": apiKey,
  "anthropic-version": "2023-06-01",
  "anthropic-dangerous-direct-browser-access": "true"
});

async function fetchWithTimeout(url, options, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function callClaude({ apiKey, model, system, user, maxTokens = 2000, temperature = 0.2 }) {
  let response;
  try {
    response = await fetchWithTimeout(API_URL, {
      method: "POST",
      headers: HEADERS(apiKey),
      body: JSON.stringify({
        model, max_tokens: maxTokens, temperature, system,
        messages: [{ role: "user", content: user }]
      })
    });
  } catch (err) {
    throw fromException(err, "Claude");
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw fromHttpError(response.status, errText, "Claude");
  }

  const data = await response.json();
  const text = data.content?.[0]?.text;
  if (!text) {
    throw fromException(new Error("Empty response"), "Claude");
  }
  return text;
}

export async function callClaudeStream({ apiKey, model, system, user, maxTokens = 2000, temperature = 0.2, onChunk }) {
  let response;
  try {
    response = await fetchWithTimeout(API_URL, {
      method: "POST",
      headers: HEADERS(apiKey),
      body: JSON.stringify({
        model, max_tokens: maxTokens, temperature, system, stream: true,
        messages: [{ role: "user", content: user }]
      })
    }, 90_000); // streaming gets longer timeout
  } catch (err) {
    throw fromException(err, "Claude");
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw fromHttpError(response.status, errText, "Claude");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]" || !data) continue;
        try {
          const json = JSON.parse(data);
          if (json.type === "content_block_delta" && json.delta?.type === "text_delta") {
            const chunk = json.delta.text;
            fullText += chunk;
            if (onChunk) onChunk(chunk, fullText);
          }
        } catch (err) {
          // ignore non-JSON lines
        }
      }
    }
  } catch (err) {
    throw fromException(err, "Claude");
  }

  return fullText;
}
