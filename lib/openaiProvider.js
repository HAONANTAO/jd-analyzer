// lib/openaiProvider.js v0.9
import { fromHttpError, fromException } from "./errors.js";

const API_URL = "https://api.openai.com/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 60_000;

export const OPENAI_MODELS = [
  { id: "gpt-4o-mini", label: "GPT-4o-mini (Recommended, fast & cheap)" },
  { id: "gpt-4o", label: "GPT-4o (Stronger, pricier)" },
  { id: "gpt-4-turbo", label: "GPT-4 Turbo" }
];

const HEADERS = (apiKey) => ({
  "Content-Type": "application/json",
  "Authorization": `Bearer ${apiKey}`
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

export async function callOpenAI({ apiKey, model, system, user, maxTokens = 2000, temperature = 0.2 }) {
  let response;
  try {
    response = await fetchWithTimeout(API_URL, {
      method: "POST",
      headers: HEADERS(apiKey),
      body: JSON.stringify({
        model, max_tokens: maxTokens, temperature,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      })
    });
  } catch (err) {
    throw fromException(err, "OpenAI");
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw fromHttpError(response.status, errText, "OpenAI");
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) {
    throw fromException(new Error("Empty response"), "OpenAI");
  }
  return text;
}

export async function callOpenAIStream({ apiKey, model, system, user, maxTokens = 2000, temperature = 0.2, onChunk }) {
  let response;
  try {
    response = await fetchWithTimeout(API_URL, {
      method: "POST",
      headers: HEADERS(apiKey),
      body: JSON.stringify({
        model, max_tokens: maxTokens, temperature, stream: true,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      })
    }, 90_000);
  } catch (err) {
    throw fromException(err, "OpenAI");
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw fromHttpError(response.status, errText, "OpenAI");
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
          const chunk = json.choices?.[0]?.delta?.content;
          if (chunk) {
            fullText += chunk;
            if (onChunk) onChunk(chunk, fullText);
          }
        } catch (err) {
          // ignore
        }
      }
    }
  } catch (err) {
    throw fromException(err, "OpenAI");
  }

  return fullText;
}
