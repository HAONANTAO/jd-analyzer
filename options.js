// options.js v0.9
import { CLAUDE_MODELS } from "./lib/claudeProvider.js";
import { OPENAI_MODELS } from "./lib/openaiProvider.js";
import { parseResumeFile, deriveAtsAssessment } from "./lib/resumeParser.js";
import {
  ensureMigrated,
  getResumes,
  upsertResume,
  deleteResume,
  setActiveResume
} from "./lib/storage.js";

// ============== Provider/model UI ==============
function fillModelSelect(selectEl, models) {
  selectEl.innerHTML = "";
  models.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.label;
    selectEl.appendChild(opt);
  });
}
fillModelSelect(document.getElementById("claude-model"), CLAUDE_MODELS);
fillModelSelect(document.getElementById("openai-model"), OPENAI_MODELS);

function switchProvider(provider) {
  document.getElementById("claude-section").classList.toggle("hidden", provider !== "claude");
  document.getElementById("openai-section").classList.toggle("hidden", provider !== "openai");
}

document.querySelectorAll('input[name="provider"]').forEach(radio => {
  radio.addEventListener("change", (e) => switchProvider(e.target.value));
});

// ============== Theme (applied immediately so the page itself respects it) ==============
let systemThemeMq = null;
function applyTheme(theme) {
  const t = theme || "system";
  document.documentElement.setAttribute("data-theme", t);

  const resolveDark = () => {
    if (t === "dark") return true;
    if (t === "light") return false;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  };
  document.documentElement.classList.toggle("theme-dark", resolveDark());

  if (systemThemeMq) {
    systemThemeMq.onchange = null;
    systemThemeMq = null;
  }
  if (t === "system" && window.matchMedia) {
    systemThemeMq = window.matchMedia("(prefers-color-scheme: dark)");
    systemThemeMq.onchange = (e) => {
      document.documentElement.classList.toggle("theme-dark", e.matches);
    };
  }
}

document.querySelectorAll('input[name="theme"]').forEach(radio => {
  radio.addEventListener("change", (e) => applyTheme(e.target.value));
});

// ============== Resume editor (single-form workflow) ==============
const editor = document.getElementById("resume-editor");
const resumeListEl = document.getElementById("resume-list");
const resumeEmptyEl = document.getElementById("resume-empty");
const editorTitle = document.getElementById("editor-title");
const labelInput = document.getElementById("editor-label");
const resumeTextarea = document.getElementById("resume");
const resumeStats = document.getElementById("resume-stats");
const uploadArea = document.getElementById("upload-area");
const fileInput = document.getElementById("file-input");
const uploadPrompt = document.getElementById("upload-prompt");
const uploadStatus = document.getElementById("upload-status");
const atsPrecheckEl = document.getElementById("ats-precheck");

let editingId = null;
let pendingFileMeta = { fileName: "", fileType: "", atsSignals: null };

function updateResumeStats() {
  resumeStats.textContent = `Characters: ${resumeTextarea.value.length}`;
}
resumeTextarea.addEventListener("input", () => {
  updateResumeStats();
  // Typing manually invalidates structural signals from any previously parsed file.
  if (pendingFileMeta.atsSignals) {
    pendingFileMeta = { fileName: pendingFileMeta.fileName, fileType: "text", atsSignals: null };
    renderAtsPrecheck(null);
  }
});

function showUploadStatus(html, cls = "") {
  uploadPrompt.classList.add("hidden");
  uploadStatus.classList.remove("hidden");
  uploadStatus.innerHTML = html;
  uploadArea.className = "upload-area " + cls;
}

function resetUploadArea() {
  uploadPrompt.classList.remove("hidden");
  uploadStatus.classList.add("hidden");
  uploadStatus.innerHTML = "";
  uploadArea.className = "upload-area";
}

function renderAtsPrecheck(signals) {
  if (!signals) {
    atsPrecheckEl.classList.add("hidden");
    atsPrecheckEl.innerHTML = "";
    return;
  }
  const assessment = deriveAtsAssessment(signals);
  const toneClass = assessment.score >= 80 ? "ats-pre-good"
    : assessment.score >= 60 ? "ats-pre-okay"
    : "ats-pre-bad";
  atsPrecheckEl.className = `ats-precheck ${toneClass}`;
  atsPrecheckEl.innerHTML = `
    <div class="ats-pre-header">
      <span>ATS structural pre-check</span>
      <strong></strong>
    </div>
    <ul></ul>
  `;
  atsPrecheckEl.querySelector("strong").textContent = `${assessment.score}/100`;
  const ul = atsPrecheckEl.querySelector("ul");
  assessment.issues.forEach(i => {
    const li = document.createElement("li");
    li.textContent = i;
    ul.appendChild(li);
  });
  atsPrecheckEl.classList.remove("hidden");
}

async function handleFile(file) {
  if (!file) return;
  showUploadStatus(`<div>📄 Parsing <span class="file-name">${file.name}</span>...</div>`);

  try {
    const result = await parseResumeFile(file);
    resumeTextarea.value = result.text;
    updateResumeStats();
    pendingFileMeta = {
      fileName: result.fileName,
      fileType: result.fileType,
      atsSignals: result.atsSignals
    };

    showUploadStatus(`
      <div>✅ Parsed successfully</div>
      <div class="file-name">${result.fileName}</div>
      <div class="file-meta">${result.fileType.toUpperCase()} · ${result.text.length} characters extracted</div>
    `, "success");
    renderAtsPrecheck(result.atsSignals);

    // Auto-suggest a label if empty
    if (!labelInput.value.trim()) {
      labelInput.value = result.fileName.replace(/\.[^.]+$/, "").slice(0, 60);
    }
  } catch (err) {
    console.error(err);
    showUploadStatus(`
      <div>❌ Parse failed</div>
      <div class="upload-error">${err.message}</div>
    `, "error");
    renderAtsPrecheck(null);
  }
}

uploadArea.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) handleFile(file);
});
uploadArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadArea.classList.add("dragover");
});
uploadArea.addEventListener("dragleave", () => uploadArea.classList.remove("dragover"));
uploadArea.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadArea.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

function openEditor(resume) {
  editor.classList.remove("hidden");
  if (resume) {
    editingId = resume.id;
    editorTitle.textContent = "Edit resume";
    labelInput.value = resume.label || "";
    resumeTextarea.value = resume.content || "";
    pendingFileMeta = {
      fileName: resume.fileName || "",
      fileType: resume.fileType || "",
      atsSignals: resume.atsSignals || null
    };
    if (resume.fileName) {
      showUploadStatus(`
        <div>📄 Current source file:</div>
        <div class="file-name">${resume.fileName}</div>
        <div class="file-meta">${(resume.content || "").length} characters · click to replace</div>
      `, "success");
    } else {
      resetUploadArea();
    }
    renderAtsPrecheck(resume.atsSignals);
  } else {
    editingId = null;
    editorTitle.textContent = "Add resume";
    labelInput.value = "";
    resumeTextarea.value = "";
    pendingFileMeta = { fileName: "", fileType: "", atsSignals: null };
    resetUploadArea();
    renderAtsPrecheck(null);
  }
  updateResumeStats();
  labelInput.focus();
  editor.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeEditor() {
  editor.classList.add("hidden");
  editingId = null;
}

async function saveEditor() {
  const label = labelInput.value.trim() || "Untitled resume";
  const content = resumeTextarea.value.trim();
  if (!content) {
    showSaveStatus("Resume content is empty — paste or upload something first.", "error");
    return;
  }
  if (content.length < 200) {
    showSaveStatus(`Resume looks too short (${content.length} chars). Anything under 200 chars usually means a parsing failure — please re-upload.`, "error");
    return;
  }

  const payload = {
    id: editingId,
    label,
    content,
    fileName: pendingFileMeta.fileName,
    fileType: pendingFileMeta.fileType,
    atsSignals: pendingFileMeta.atsSignals
  };

  const { id: savedId } = await upsertResume(payload);
  // First resume becomes active automatically.
  const { resumes, activeResumeId } = await getResumes();
  if (!activeResumeId && resumes.length === 1) {
    await setActiveResume(resumes[0].id);
  }
  // If we just edited the currently-active resume, keep it active.
  if (editingId && editingId === activeResumeId) {
    await setActiveResume(editingId);
  }
  // If this is brand new and there was no active before, mark it active.
  if (!editingId && !activeResumeId) {
    await setActiveResume(savedId);
  }

  closeEditor();
  await renderResumeList();
  showSaveStatus("Resume saved.", "ok");
}

document.getElementById("add-resume-btn").addEventListener("click", () => openEditor(null));
document.getElementById("editor-close").addEventListener("click", closeEditor);
document.getElementById("editor-cancel").addEventListener("click", closeEditor);
document.getElementById("editor-save").addEventListener("click", saveEditor);

// ============== Resume list ==============
function relativeTime(ts) {
  if (!ts) return "";
  const days = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

async function renderResumeList() {
  const { resumes, activeResumeId } = await getResumes();
  resumeListEl.innerHTML = "";

  if (!resumes.length) {
    resumeEmptyEl.classList.remove("hidden");
    return;
  }
  resumeEmptyEl.classList.add("hidden");

  resumes.forEach(r => {
    const row = document.createElement("div");
    row.className = "resume-row" + (r.id === activeResumeId ? " resume-active" : "");
    row.innerHTML = `
      <label class="resume-active-radio">
        <input type="radio" name="active-resume" ${r.id === activeResumeId ? "checked" : ""}>
      </label>
      <div class="resume-row-meta">
        <div class="resume-row-label"></div>
        <div class="resume-row-sub"></div>
      </div>
      <div class="resume-row-actions">
        <button class="link-btn resume-edit">Edit</button>
        <button class="link-btn resume-delete">Delete</button>
      </div>
    `;
    row.querySelector(".resume-row-label").textContent = r.label || "Untitled";
    const subParts = [
      r.fileName || "(text)",
      `${(r.content || "").length} chars`,
      `updated ${relativeTime(r.updatedAt)}`
    ];
    if (r.atsSignals) {
      const a = deriveAtsAssessment(r.atsSignals);
      subParts.push(`ATS ${a.score}/100`);
    }
    row.querySelector(".resume-row-sub").textContent = subParts.join(" · ");

    row.querySelector('input[type="radio"]').addEventListener("change", async () => {
      await setActiveResume(r.id);
      await renderResumeList();
    });
    row.querySelector(".resume-edit").addEventListener("click", () => openEditor(r));
    row.querySelector(".resume-delete").addEventListener("click", async () => {
      const ok = confirm(`Delete resume "${r.label}"?`);
      if (!ok) return;
      await deleteResume(r.id);
      await renderResumeList();
    });

    resumeListEl.appendChild(row);
  });
}

// ============== Load + Save settings (provider/keys/preferences only — resumes save themselves) ==============
const saveStatusEl = document.getElementById("save-status");
function showSaveStatus(msg, tone) {
  saveStatusEl.textContent = msg;
  saveStatusEl.style.color = tone === "error" ? "#b91c1c" : tone === "ok" ? "#15803d" : "";
  if (tone !== "error") {
    setTimeout(() => { saveStatusEl.textContent = ""; saveStatusEl.style.color = ""; }, 3500);
  }
}

async function loadSettings() {
  await ensureMigrated();

  const saved = await chrome.storage.local.get([
    "provider", "claudeApiKey", "claudeModel",
    "openaiApiKey", "openaiModel",
    "explanationLanguage", "theme"
  ]);

  const provider = saved.provider || "claude";
  document.querySelector(`input[name="provider"][value="${provider}"]`).checked = true;
  switchProvider(provider);

  document.getElementById("claude-api-key").value = saved.claudeApiKey || "";
  document.getElementById("claude-model").value = saved.claudeModel || "claude-sonnet-4-6";
  document.getElementById("openai-api-key").value = saved.openaiApiKey || "";
  document.getElementById("openai-model").value = saved.openaiModel || "gpt-4o-mini";

  const lang = saved.explanationLanguage || "en";
  document.querySelector(`input[name="explanationLanguage"][value="${lang}"]`).checked = true;

  const theme = saved.theme || "system";
  document.querySelector(`input[name="theme"][value="${theme}"]`).checked = true;
  applyTheme(theme);

  await renderResumeList();
}

async function saveSettings() {
  const provider = document.querySelector('input[name="provider"]:checked').value;
  const claudeKey = document.getElementById("claude-api-key").value.trim();
  const openaiKey = document.getElementById("openai-api-key").value.trim();
  const activeKey = provider === "openai" ? openaiKey : claudeKey;

  if (!activeKey) {
    showSaveStatus(`Please enter an API key for ${provider === "openai" ? "OpenAI" : "Claude"}.`, "error");
    return;
  }

  const data = {
    provider,
    claudeApiKey: claudeKey,
    claudeModel: document.getElementById("claude-model").value,
    openaiApiKey: openaiKey,
    openaiModel: document.getElementById("openai-model").value,
    explanationLanguage: document.querySelector('input[name="explanationLanguage"]:checked').value,
    theme: document.querySelector('input[name="theme"]:checked').value
  };

  await chrome.storage.local.set(data);
  showSaveStatus("✓ Settings saved.", "ok");
}

document.getElementById("save-btn").addEventListener("click", saveSettings);

loadSettings();
