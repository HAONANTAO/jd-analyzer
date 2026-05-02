// background.js v0.9
import { callClaude, callClaudeStream } from "./lib/claudeProvider.js";
import { callOpenAI, callOpenAIStream } from "./lib/openaiProvider.js";
import {
  SYSTEM_PROMPT_ANALYZE,
  SYSTEM_PROMPT_COVER_LETTER,
  SYSTEM_PROMPT_RESUME_TIPS,
  SYSTEM_PROMPT_INTERVIEW,
  buildAnalyzePrompt,
  buildCoverLetterPrompt,
  buildResumeTipsPrompt,
  buildInterviewPrompt
} from "./lib/prompts.js";
import { AppError, ErrorType, fromException, serializeError } from "./lib/errors.js";

async function callAI(config, system, user, maxTokens) {
  const { provider, apiKey, model } = config;
  if (!apiKey) throw new AppError(ErrorType.AUTH, "API key not set.", { hint: "Open Settings ⚙️ to add your API key." });
  if (!model) throw new AppError(ErrorType.AUTH, "Model not selected.", { hint: "Open Settings ⚙️ to choose a model." });
  const params = { apiKey, model, system, user, maxTokens };
  return provider === "openai" ? callOpenAI(params) : callClaude(params);
}

async function callAIStream(config, system, user, maxTokens, onChunk) {
  const { provider, apiKey, model } = config;
  if (!apiKey) throw new AppError(ErrorType.AUTH, "API key not set.", { hint: "Open Settings ⚙️ to add your API key." });
  if (!model) throw new AppError(ErrorType.AUTH, "Model not selected.", { hint: "Open Settings ⚙️ to choose a model." });
  const params = { apiKey, model, system, user, maxTokens, onChunk };
  return provider === "openai" ? callOpenAIStream(params) : callClaudeStream(params);
}

function tryParseJSON(text) {
  const cleaned = text.replace(/```json\s*|\s*```/g, "").trim();
  return JSON.parse(cleaned);
}

/**
 * Call AI and parse JSON. If parse fails, retry once with stricter instruction.
 */
async function callAIWithJSONRetry(config, system, user, maxTokens) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await callAI(config, system, user, maxTokens);
    try {
      return tryParseJSON(text);
    } catch (err) {
      lastError = err;
      // Only retry once
      if (attempt === 0) {
        // Reinforce JSON-only instruction on retry
        user = `${user}\n\nIMPORTANT: Your previous response was not valid JSON. Output ONLY a valid JSON object, with no markdown fences, no explanations, no extra text before or after.`;
        continue;
      }
    }
  }
  // Both attempts failed
  throw fromException(new Error(`Invalid JSON: ${lastError?.message}`));
}

// ============== Task handlers ==============
async function handleAnalyze({ config, resume, jdText }) {
  return callAIWithJSONRetry(config, SYSTEM_PROMPT_ANALYZE, buildAnalyzePrompt(resume, jdText), 2500);
}

async function handleResumeTips({ config, resume, jdText, analysis }) {
  return callAIWithJSONRetry(config, SYSTEM_PROMPT_RESUME_TIPS, buildResumeTipsPrompt(resume, jdText, analysis), 2500);
}

async function handleInterview({ config, resume, jdText, analysis }) {
  return callAIWithJSONRetry(config, SYSTEM_PROMPT_INTERVIEW, buildInterviewPrompt(resume, jdText, analysis), 3000);
}

async function handleCoverLetterStream(payload, port) {
  const { config, resume, jdText, analysis } = payload;
  try {
    const fullText = await callAIStream(
      config,
      SYSTEM_PROMPT_COVER_LETTER,
      buildCoverLetterPrompt(resume, jdText, analysis),
      800,
      (chunk, accumulated) => {
        try {
          port.postMessage({ type: "CHUNK", chunk, accumulated });
        } catch (e) {
          // popup closed, ignore
        }
      }
    );
    port.postMessage({ type: "DONE", fullText });
  } catch (err) {
    port.postMessage({ type: "ERROR", error: serializeError(err) });
  }
}

// ============== Message routing ==============
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      let data;
      if (request.type === "ANALYZE_JD") {
        data = await handleAnalyze(request.payload);
      } else if (request.type === "RESUME_TIPS") {
        data = await handleResumeTips(request.payload);
      } else if (request.type === "INTERVIEW_QUESTIONS") {
        data = await handleInterview(request.payload);
      } else {
        throw new AppError(ErrorType.UNKNOWN, `Unknown request type: ${request.type}`);
      }
      sendResponse({ success: true, data });
    } catch (err) {
      console.error("[JD Analyzer]", err);
      sendResponse({ success: false, error: serializeError(err) });
    }
  })();
  return true;
});

// Long-lived connection: used for Cover Letter streaming
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "cover-letter-stream") {
    port.onMessage.addListener((msg) => {
      if (msg.type === "START") {
        handleCoverLetterStream(msg.payload, port);
      }
    });
  }
});
