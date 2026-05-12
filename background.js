// background.js v1.2
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
import { tryParseJSON } from "./lib/json.js";
import { estimateCost, formatCost } from "./lib/pricing.js";
import { ensureMigrated, appendHistory, makeHistoryEntry, getActiveResume } from "./lib/storage.js";
import { deriveAtsAssessment } from "./lib/resumeParser.js";

ensureMigrated().catch(err => console.warn("[JD Analyzer] migration failed", err));

// Read provider config + resume directly from storage so secrets never travel through messages.
async function loadContext() {
  const stored = await chrome.storage.local.get([
    "provider", "claudeApiKey", "claudeModel",
    "openaiApiKey", "openaiModel", "explanationLanguage"
  ]);
  const provider = stored.provider || "claude";
  const apiKey = provider === "openai" ? stored.openaiApiKey : stored.claudeApiKey;
  const model = provider === "openai"
    ? (stored.openaiModel || "gpt-4o-mini")
    : (stored.claudeModel || "claude-sonnet-4-6");
  const explanationLanguage = stored.explanationLanguage || "en";

  const activeResume = await getActiveResume();

  if (!apiKey) throw new AppError(ErrorType.AUTH, "API key not set.", { hint: "Open Settings ⚙️ to add your API key." });
  if (!activeResume?.content) throw new AppError(ErrorType.AUTH, "Resume not uploaded.", { hint: "Open Settings ⚙️ to upload your resume." });

  return {
    provider,
    apiKey,
    model,
    explanationLanguage,
    resume: activeResume.content,
    resumeMeta: {
      label: activeResume.label,
      fileType: activeResume.fileType,
      atsSignals: activeResume.atsSignals || null
    }
  };
}

function buildMeta(ctx, usage) {
  const cost = estimateCost(ctx.model, usage?.inputTokens, usage?.outputTokens);
  return {
    provider: ctx.provider,
    model: ctx.model,
    inputTokens: usage?.inputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
    costUsd: cost,
    costFormatted: formatCost(cost)
  };
}

async function callAI(ctx, system, user, maxTokens) {
  const params = { apiKey: ctx.apiKey, model: ctx.model, system, user, maxTokens };
  return ctx.provider === "openai" ? callOpenAI(params) : callClaude(params);
}

async function callAIStream(ctx, system, user, maxTokens, onChunk) {
  const params = { apiKey: ctx.apiKey, model: ctx.model, system, user, maxTokens, onChunk };
  return ctx.provider === "openai" ? callOpenAIStream(params) : callClaudeStream(params);
}

/**
 * Call AI and parse JSON. If parse fails, retry once with stricter instruction.
 * Returns { data, usage } from the LAST attempt (so we don't double-count tokens).
 */
async function callAIWithJSONRetry(ctx, system, user, maxTokens) {
  let lastError;
  let lastUsage = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { text, usage } = await callAI(ctx, system, user, maxTokens);
    lastUsage = usage;
    try {
      const data = tryParseJSON(text);
      return { data, usage };
    } catch (err) {
      lastError = err;
      if (attempt === 0) {
        user = `${user}\n\nIMPORTANT: Your previous response was not valid JSON. Output ONLY a valid JSON object, with no markdown fences, no explanations, no extra text before or after.`;
        continue;
      }
    }
  }
  throw fromException(new Error(`Invalid JSON: ${lastError?.message}`));
}

// ============== Task handlers ==============
async function handleAnalyze({ jdText }) {
  const ctx = await loadContext();
  const { data, usage } = await callAIWithJSONRetry(
    ctx,
    SYSTEM_PROMPT_ANALYZE,
    buildAnalyzePrompt(ctx.resume, jdText, ctx.explanationLanguage),
    3800
  );
  const meta = buildMeta(ctx, usage);

  // Persist to history (best-effort, don't fail the request if storage write fails)
  try {
    await appendHistory(makeHistoryEntry({
      jdText, analysis: data,
      provider: ctx.provider, model: ctx.model,
      costUsd: meta.costUsd
    }));
  } catch (err) {
    console.warn("[JD Analyzer] history write failed", err);
  }

  return { ...data, _meta: meta };
}

async function handleResumeTips({ jdText, analysis }) {
  const ctx = await loadContext();
  const atsAssessment = deriveAtsAssessment(ctx.resumeMeta?.atsSignals);
  const { data, usage } = await callAIWithJSONRetry(
    ctx,
    SYSTEM_PROMPT_RESUME_TIPS,
    buildResumeTipsPrompt(ctx.resume, jdText, analysis, atsAssessment, ctx.explanationLanguage),
    2500
  );
  return { ...data, _meta: buildMeta(ctx, usage), _atsPreCheck: atsAssessment };
}

async function handleInterview({ jdText, analysis }) {
  const ctx = await loadContext();
  const { data, usage } = await callAIWithJSONRetry(
    ctx,
    SYSTEM_PROMPT_INTERVIEW,
    buildInterviewPrompt(ctx.resume, jdText, analysis, ctx.explanationLanguage),
    3000
  );
  return { ...data, _meta: buildMeta(ctx, usage) };
}

async function handleCoverLetterStream(payload, port) {
  const { jdText, analysis, guidance } = payload;
  try {
    const ctx = await loadContext();
    const { text: fullText, usage } = await callAIStream(
      ctx,
      SYSTEM_PROMPT_COVER_LETTER,
      buildCoverLetterPrompt(ctx.resume, jdText, analysis, guidance),
      800,
      (chunk, accumulated) => {
        try {
          port.postMessage({ type: "CHUNK", chunk, accumulated });
        } catch (e) {
          // popup closed, ignore
        }
      }
    );
    port.postMessage({ type: "DONE", fullText, _meta: buildMeta(ctx, usage) });
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
