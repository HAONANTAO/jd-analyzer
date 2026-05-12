// lib/storage.js
// Centralized chrome.storage.local access: schema migration + analysis history.

export const SCHEMA_VERSION = 3;

function makeResumeId() {
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Run any pending migrations and stamp the current schema version.
 * Safe to call repeatedly. Idempotent.
 */
export async function ensureMigrated() {
  const stored = await chrome.storage.local.get(null);
  if (stored.schemaVersion === SCHEMA_VERSION) return;

  // v0/undefined → v1: original release shape (no migrations needed, just stamp).
  // v1 → v2: introduced analysisHistory + resumeUpdatedAt (additive).
  // v2 → v3: single `resume` string → `resumes[]` array, with `activeResumeId`.
  //          Legacy keys `resume` / `resumeFileName` / `resumeUpdatedAt` are kept
  //          in place as a safety net for one release; new code reads from `resumes`.
  const patch = { schemaVersion: SCHEMA_VERSION };

  if (!Array.isArray(stored.resumes) && typeof stored.resume === "string" && stored.resume.trim()) {
    const id = makeResumeId();
    patch.resumes = [{
      id,
      label: stored.resumeFileName?.replace(/\.[^.]+$/, "") || "My resume",
      content: stored.resume,
      fileName: stored.resumeFileName || "",
      fileType: stored.resumeFileType || "",
      atsSignals: null,
      updatedAt: stored.resumeUpdatedAt || Date.now()
    }];
    patch.activeResumeId = id;
  } else if (!Array.isArray(stored.resumes)) {
    patch.resumes = [];
    patch.activeResumeId = null;
  }

  await chrome.storage.local.set(patch);
}

// ============== Resumes ==============

export async function getResumes() {
  const { resumes = [], activeResumeId = null } = await chrome.storage.local.get(["resumes", "activeResumeId"]);
  return { resumes, activeResumeId };
}

export async function getActiveResume() {
  const { resumes, activeResumeId } = await getResumes();
  if (!resumes.length) return null;
  return resumes.find(r => r.id === activeResumeId) || resumes[0];
}

export async function upsertResume({ id, label, content, fileName, fileType, atsSignals }) {
  const { resumes } = await getResumes();
  const now = Date.now();
  let next;
  let newId = id;
  if (id) {
    const idx = resumes.findIndex(r => r.id === id);
    if (idx === -1) throw new Error(`Resume ${id} not found`);
    const prev = resumes[idx];
    next = resumes.slice();
    next[idx] = {
      ...prev,
      label: label ?? prev.label,
      content: content ?? prev.content,
      fileName: fileName ?? prev.fileName,
      fileType: fileType ?? prev.fileType,
      atsSignals: atsSignals !== undefined ? atsSignals : prev.atsSignals,
      updatedAt: content !== undefined && content !== prev.content ? now : prev.updatedAt
    };
  } else {
    newId = makeResumeId();
    next = [...resumes, {
      id: newId,
      label: label || "Untitled resume",
      content: content || "",
      fileName: fileName || "",
      fileType: fileType || "",
      atsSignals: atsSignals || null,
      updatedAt: now
    }];
  }
  await chrome.storage.local.set({ resumes: next });
  return { id: newId, resumes: next };
}

export async function deleteResume(id) {
  const { resumes, activeResumeId } = await getResumes();
  const next = resumes.filter(r => r.id !== id);
  const patch = { resumes: next };
  if (activeResumeId === id) {
    patch.activeResumeId = next[0]?.id || null;
  }
  await chrome.storage.local.set(patch);
  return patch;
}

export async function setActiveResume(id) {
  await chrome.storage.local.set({ activeResumeId: id });
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

export async function removeHistoryEntry(id) {
  const { [HISTORY_KEY]: history = [] } = await chrome.storage.local.get(HISTORY_KEY);
  const next = history.filter(h => h.id !== id);
  await chrome.storage.local.set({ [HISTORY_KEY]: next });
  return next;
}
