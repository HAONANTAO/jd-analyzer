// lib/storage.js
// Centralized chrome.storage.local access: schema migration + analysis history.

export const SCHEMA_VERSION = 2;

/**
 * Run any pending migrations and stamp the current schema version.
 * Safe to call repeatedly. Idempotent.
 */
export async function ensureMigrated() {
  const { schemaVersion } = await chrome.storage.local.get("schemaVersion");
  if (schemaVersion === SCHEMA_VERSION) return;

  // v0/undefined → v1: original release shape (no migrations needed, just stamp).
  // v1 → v2: introduces analysisHistory + resumeUpdatedAt. Both are additive,
  //          so legacy users get them populated lazily on next save.
  await chrome.storage.local.set({ schemaVersion: SCHEMA_VERSION });
}

const HISTORY_KEY = "analysisHistory";
const HISTORY_LIMIT = 8;

/**
 * Build a history entry from a finished analysis. Stored in memory + chrome.storage.
 */
export function makeHistoryEntry({ jdText, analysis, model, provider, costUsd }) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    jobTitle: analysis?.detectedJobTitle || "Untitled role",
    company: analysis?.detectedCompany && analysis.detectedCompany !== "unknown"
      ? analysis.detectedCompany
      : null,
    matchScore: analysis?.matchScore ?? null,
    provider,
    model,
    costUsd: costUsd ?? null,
    jdText,
    analysis
  };
}

export async function appendHistory(entry) {
  const { [HISTORY_KEY]: history = [] } = await chrome.storage.local.get(HISTORY_KEY);
  const next = [entry, ...history].slice(0, HISTORY_LIMIT);
  await chrome.storage.local.set({ [HISTORY_KEY]: next });
  return next;
}

export async function getHistory() {
  const { [HISTORY_KEY]: history = [] } = await chrome.storage.local.get(HISTORY_KEY);
  return history;
}

export async function clearHistory() {
  await chrome.storage.local.set({ [HISTORY_KEY]: [] });
}
