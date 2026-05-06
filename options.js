// options.js v0.8
import { CLAUDE_MODELS } from "./lib/claudeProvider.js";
import { OPENAI_MODELS } from "./lib/openaiProvider.js";
import { parseResumeFile } from "./lib/resumeParser.js";

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

const resumeTextarea = document.getElementById("resume");
const resumeStats = document.getElementById("resume-stats");
function updateResumeStats() {
  resumeStats.textContent = `Characters: ${resumeTextarea.value.length}`;
}
resumeTextarea.addEventListener("input", updateResumeStats);

// ============== File upload ==============
const uploadArea = document.getElementById("upload-area");
const fileInput = document.getElementById("file-input");
const uploadPrompt = document.getElementById("upload-prompt");
const uploadStatus = document.getElementById("upload-status");

function showUploadStatus(html, cls = "") {
  uploadPrompt.classList.add("hidden");
  uploadStatus.classList.remove("hidden");
  uploadStatus.innerHTML = html;
  uploadArea.className = "upload-area " + cls;
}

async function handleFile(file) {
  if (!file) return;
  showUploadStatus(`<div>📄 Parsing <span class="file-name">${file.name}</span>...</div>`);

  try {
    const result = await parseResumeFile(file);
    resumeTextarea.value = result.text;
    updateResumeStats();

    showUploadStatus(`
      <div>✅ Parsed successfully</div>
      <div class="file-name">${result.fileName}</div>
      <div class="file-meta">${result.fileType.toUpperCase()} · ${result.text.length} characters extracted</div>
    `, "success");
  } catch (err) {
    console.error(err);
    showUploadStatus(`
      <div>❌ Parse failed</div>
      <div class="upload-error">${err.message}</div>
    `, "error");
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

// ============== Load & Save ==============
async function loadSettings() {
  const saved = await chrome.storage.local.get([
    "provider", "claudeApiKey", "claudeModel",
    "openaiApiKey", "openaiModel", "resume", "resumeFileName"
  ]);

  const provider = saved.provider || "claude";
  document.querySelector(`input[name="provider"][value="${provider}"]`).checked = true;
  switchProvider(provider);

  document.getElementById("claude-api-key").value = saved.claudeApiKey || "";
  document.getElementById("claude-model").value = saved.claudeModel || "claude-sonnet-4-6";
  document.getElementById("openai-api-key").value = saved.openaiApiKey || "";
  document.getElementById("openai-model").value = saved.openaiModel || "gpt-4o-mini";
  document.getElementById("resume").value = saved.resume || "";
  updateResumeStats();

  if (saved.resumeFileName) {
    showUploadStatus(`
      <div>📄 Current resume:</div>
      <div class="file-name">${saved.resumeFileName}</div>
      <div class="file-meta">${(saved.resume || "").length} characters · click to re-upload</div>
    `, "success");
  }
}

async function saveSettings() {
  const provider = document.querySelector('input[name="provider"]:checked').value;
  const fileName = fileInput.files[0]?.name || (await chrome.storage.local.get("resumeFileName")).resumeFileName || "";

  // Get the active provider's API key based on selection
  const claudeKey = document.getElementById("claude-api-key").value.trim();
  const openaiKey = document.getElementById("openai-api-key").value.trim();
  const resume = document.getElementById("resume").value.trim();

  // Validate: must have at least the selected provider's API key
  const activeKey = provider === "openai" ? openaiKey : claudeKey;
  const status = document.getElementById("save-status");

  if (!activeKey) {
    status.textContent = "⚠️ Please enter an API key for " + (provider === "openai" ? "OpenAI" : "Claude");
    status.style.color = "#b91c1c";
    setTimeout(() => { status.textContent = ""; status.style.color = ""; }, 3000);
    return;
  }

  if (!resume) {
    status.textContent = "⚠️ Please upload or paste your resume";
    status.style.color = "#b91c1c";
    setTimeout(() => { status.textContent = ""; status.style.color = ""; }, 3000);
    return;
  }

  // Only bump resumeUpdatedAt when the resume text actually changed.
  const prev = await chrome.storage.local.get(["resume", "resumeUpdatedAt"]);
  const resumeUpdatedAt = (prev.resume === resume && prev.resumeUpdatedAt)
    ? prev.resumeUpdatedAt
    : Date.now();

  const data = {
    provider,
    claudeApiKey: claudeKey,
    claudeModel: document.getElementById("claude-model").value,
    openaiApiKey: openaiKey,
    openaiModel: document.getElementById("openai-model").value,
    resume,
    resumeFileName: fileName,
    resumeUpdatedAt
  };

  await chrome.storage.local.set(data);

  status.textContent = "✓ Saved! Click the toolbar icon to start analyzing.";
  status.style.color = "#15803d";
  setTimeout(() => { status.textContent = ""; status.style.color = ""; }, 4000);
}

document.getElementById("save-btn").addEventListener("click", saveSettings);

loadSettings();
