// popup.js v1.2
import {
  ensureMigrated,
  getHistory, clearHistory, removeHistoryEntry,
  getResumes, setActiveResume
} from "./lib/storage.js";
import { formatCost } from "./lib/pricing.js";
import { extractJDFromPage } from "./lib/jdExtractor.js";
import { startJdPicker } from "./lib/jdPicker.js";

const STALE_DAYS = 90;

const states = {
  notConfigured: document.getElementById("not-configured"),
  onboarding: document.getElementById("onboarding"),
  paste: document.getElementById("paste"),
  loading: document.getElementById("loading"),
  error: document.getElementById("error"),
  result: document.getElementById("result")
};

let cachedJDText = null;
let cachedAnalysis = null;
let lastFailedAction = null;  // for retry button

// In-flight guard: prevents a second request from firing while the first is still pending.
const inflight = { analyze: false, coverLetter: false, tips: false, interview: false };

function withGuard(key, fn) {
  return async (...args) => {
    if (inflight[key]) return;
    inflight[key] = true;
    try {
      await fn(...args);
    } finally {
      inflight[key] = false;
    }
  };
}

// ============== Inline notifications ==============
function showToast(message, { tone = "info", duration = 3500 } = {}) {
  const stack = document.getElementById("toast-stack");
  if (!stack) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${tone}`;
  toast.textContent = message;
  stack.appendChild(toast);
  // animate in next frame
  requestAnimationFrame(() => toast.classList.add("toast-visible"));
  const remove = () => {
    toast.classList.remove("toast-visible");
    toast.addEventListener("transitionend", () => toast.remove(), { once: true });
  };
  setTimeout(remove, duration);
  toast.addEventListener("click", remove);
}

function showConfirm(message) {
  return new Promise(resolve => {
    const overlay = document.getElementById("confirm-dialog");
    const msgEl = document.getElementById("confirm-message");
    const okBtn = document.getElementById("confirm-ok");
    const cancelBtn = document.getElementById("confirm-cancel");

    msgEl.textContent = message;
    overlay.classList.remove("hidden");

    const cleanup = (answer) => {
      overlay.classList.add("hidden");
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      overlay.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKey);
      resolve(answer);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onBackdrop = (e) => { if (e.target === overlay) cleanup(false); };
    const onKey = (e) => {
      if (e.key === "Escape") cleanup(false);
      if (e.key === "Enter") cleanup(true);
    };

    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    overlay.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKey);
    setTimeout(() => okBtn.focus(), 0);
  });
}

function showState(name) {
  Object.keys(states).forEach(k => {
    states[k].classList.toggle("hidden", k !== name);
  });
}

const ERROR_ICONS = {
  auth: "🔑",
  rate_limit: "⏳",
  quota: "💳",
  network: "🌐",
  timeout: "⏱️",
  invalid: "🤔",
  too_long: "📏",
  server: "🛠️",
  unknown: "⚠️"
};

const ERROR_TITLES = {
  auth: "Authentication problem",
  rate_limit: "Slow down a bit",
  quota: "Out of credits",
  network: "Connection issue",
  timeout: "Request timed out",
  invalid: "AI returned unexpected output",
  too_long: "Content too long",
  server: "Provider is having issues",
  unknown: "Something went wrong"
};

/**
 * Display an error. err can be:
 * - A serialized AppError {__isAppError, type, message, hint, retryable}
 * - A string (legacy)
 */
function showError(err, retryAction = null) {
  let type = "unknown";
  let message = "";
  let hint = "";
  let retryable = false;

  if (typeof err === "string") {
    message = err;
  } else if (err?.__isAppError) {
    type = err.type;
    message = err.message;
    hint = err.hint || "";
    retryable = err.retryable;
  } else if (err?.message) {
    message = err.message;
  } else {
    message = "Unknown error";
  }

  document.getElementById("error-icon").textContent = ERROR_ICONS[type] || "⚠️";
  document.getElementById("error-title").textContent = ERROR_TITLES[type] || "Error";
  document.getElementById("error-msg").textContent = message;

  const hintEl = document.getElementById("error-hint");
  if (hint) {
    hintEl.textContent = `💡 ${hint}`;
    hintEl.style.display = "block";
  } else {
    hintEl.style.display = "none";
  }

  // Settings button only for auth errors
  const settingsBtn = document.getElementById("error-settings-btn");
  settingsBtn.classList.toggle("hidden", type !== "auth");

  // Retry button if retryable AND we have an action to retry
  const retryBtn = document.getElementById("error-retry-btn");
  if (retryable && retryAction) {
    retryBtn.classList.remove("hidden");
    lastFailedAction = retryAction;
  } else {
    retryBtn.classList.add("hidden");
    lastFailedAction = null;
  }

  showState("error");
}

// ============== Init ==============
async function init() {
  await ensureMigrated();

  // Theme: apply BEFORE first paint
  const { theme = "system" } = await chrome.storage.local.get("theme");
  applyTheme(theme);

  const stored = await chrome.storage.local.get([
    "provider", "claudeApiKey", "claudeModel",
    "openaiApiKey", "openaiModel",
    "onboardingCompleted"
  ]);

  const provider = stored.provider || "claude";
  const apiKey = provider === "openai" ? stored.openaiApiKey : stored.claudeApiKey;
  const model = provider === "openai"
    ? (stored.openaiModel || "gpt-4o-mini")
    : (stored.claudeModel || "claude-sonnet-4-6");

  const { resumes, activeResumeId } = await getResumes();
  const activeResume = resumes.find(r => r.id === activeResumeId) || resumes[0] || null;

  if (!apiKey || !activeResume) {
    showState("notConfigured");
    return;
  }

  if (!stored.onboardingCompleted) {
    showState("onboarding");
    return;
  }

  document.getElementById("provider-tag").textContent =
    `Engine: ${provider === "openai" ? "OpenAI" : "Claude"} · ${model}`;

  await renderResumeSelector(resumes, activeResume.id);
  updateStaleBanner(activeResume.updatedAt);
  await refreshHistoryView();

  showState("paste");

  // If the user finished a click-to-pick session in the page,
  // their captured JD is waiting in storage — drop it into the textarea.
  await consumePendingJd();
}

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

  // For "system", react to OS-level changes while the popup is open.
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

async function renderResumeSelector(resumes, activeId) {
  const select = document.getElementById("resume-select");
  select.innerHTML = "";
  resumes.forEach(r => {
    const opt = document.createElement("option");
    opt.value = r.id;
    opt.textContent = r.label || "Untitled";
    if (r.id === activeId) opt.selected = true;
    select.appendChild(opt);
  });
}

async function onResumeSelectChange(e) {
  const id = e.target.value;
  await setActiveResume(id);
  const { resumes } = await getResumes();
  const picked = resumes.find(r => r.id === id);
  if (picked) {
    updateStaleBanner(picked.updatedAt);
    showToast(`Now using "${picked.label}".`, { tone: "info", duration: 2000 });
  }
}

// ============== Resume staleness banner ==============
function updateStaleBanner(updatedAt) {
  const banner = document.getElementById("resume-stale-banner");
  if (!updatedAt) {
    banner.classList.add("hidden");
    return;
  }
  const days = Math.floor((Date.now() - updatedAt) / (1000 * 60 * 60 * 24));
  if (days < STALE_DAYS) {
    banner.classList.add("hidden");
    return;
  }
  document.getElementById("resume-stale-days").textContent = String(days);
  banner.classList.remove("hidden");
}

// ============== History ==============
async function refreshHistoryView() {
  const history = await getHistory();
  const section = document.getElementById("recent-section");
  const list = document.getElementById("recent-list");

  if (!history.length) {
    section.classList.add("hidden");
    return;
  }
  section.classList.remove("hidden");
  list.innerHTML = "";

  history.forEach(entry => {
    const item = document.createElement("div");
    item.className = "recent-item";

    const meta = document.createElement("div");
    meta.className = "recent-meta";
    const title = document.createElement("div");
    title.className = "recent-title";
    title.textContent = entry.company
      ? `${entry.jobTitle} @ ${entry.company}`
      : entry.jobTitle;
    const sub = document.createElement("div");
    sub.className = "recent-sub";
    sub.textContent = formatHistorySubline(entry);
    meta.appendChild(title);
    meta.appendChild(sub);

    const score = document.createElement("div");
    score.className = "recent-score";
    score.textContent = entry.matchScore != null ? String(entry.matchScore) : "--";

    const delBtn = document.createElement("button");
    delBtn.className = "recent-delete";
    delBtn.title = "Remove this entry";
    delBtn.setAttribute("aria-label", "Remove this entry");
    delBtn.textContent = "×";
    delBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await removeHistoryEntry(entry.id);
      await refreshHistoryView();
    });

    item.appendChild(meta);
    item.appendChild(score);
    item.appendChild(delBtn);
    item.addEventListener("click", () => openHistoryEntry(entry));
    list.appendChild(item);
  });
}

function formatHistorySubline(entry) {
  const parts = [];
  const ago = relativeTime(entry.timestamp);
  if (ago) parts.push(ago);
  const cost = formatCost(entry.costUsd);
  if (cost) parts.push(cost);
  return parts.join(" · ");
}

function relativeTime(ts) {
  if (!ts) return null;
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function openHistoryEntry(entry) {
  cachedJDText = entry.jdText;
  cachedAnalysis = entry.analysis;
  // Re-attach _meta from the stored cost so cost display still shows
  if (cachedAnalysis && !cachedAnalysis._meta) {
    cachedAnalysis._meta = {
      costUsd: entry.costUsd,
      costFormatted: formatCost(entry.costUsd),
      model: entry.model,
      provider: entry.provider
    };
  }
  renderResult(cachedAnalysis);
  resetAllTabs();
  showState("result");
}

async function handleClearHistory() {
  const ok = await showConfirm("Clear all recent analyses?");
  if (!ok) return;
  await clearHistory();
  await refreshHistoryView();
  showToast("History cleared", { tone: "info" });
}

// ============== Auto-fill from active tab ==============
async function autoFillFromTab() {
  const btn = document.getElementById("auto-fill-btn");
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Reading page...";

  const resetBtn = () => { btn.textContent = original; btn.disabled = false; };
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      showToast("No active tab found.", { tone: "warn" });
      resetBtn();
      return;
    }
    if (tab.url?.startsWith("chrome://") || tab.url?.startsWith("chrome-extension://")) {
      showToast("Can't read browser internal pages. Open a real job posting first.", { tone: "warn" });
      resetBtn();
      return;
    }
    const [{ result } = {}] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractJDFromPage
    });

    if (!result?.text) {
      showToast("Couldn't auto-detect a JD. Switching to pick mode — click the JD area on the page.", { tone: "info", duration: 4000 });
      resetBtn();
      // Auto-fall back into manual picker
      setTimeout(() => pickJdManually(), 600);
      return;
    }

    jdInput.value = result.text;
    charCount.textContent = `${result.text.length} characters`;
    btn.textContent = `✓ Filled from ${result.source}`;
    setTimeout(resetBtn, 1500);
  } catch (err) {
    console.error("[JD Analyzer] auto-fill failed", err);
    showToast("Couldn't access this page. Some sites block extensions — copy the JD manually.", { tone: "error", duration: 5000 });
    resetBtn();
  }
}

// ============== Pick manually (click-to-pick) ==============
async function pickJdManually() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    showToast("No active tab found.", { tone: "warn" });
    return;
  }
  if (tab.url?.startsWith("chrome://") || tab.url?.startsWith("chrome-extension://")) {
    showToast("Can't run on browser internal pages.", { tone: "warn" });
    return;
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: startJdPicker
    });
    showToast("Click the JD on the page · ESC to cancel · Reopen this popup when done.", { tone: "info", duration: 4500 });
    // Close popup so the user can interact with the page.
    setTimeout(() => window.close(), 700);
  } catch (err) {
    console.error("[JD Analyzer] pick failed", err);
    showToast("Couldn't start picker. Some sites block extensions.", { tone: "error" });
  }
}

// ============== Consume a JD captured via click-to-pick ==============
async function consumePendingJd() {
  const stored = await chrome.storage.local.get(["pendingJdText", "pendingJdAt", "pendingJdSource"]);
  if (!stored.pendingJdText) return false;
  // Stale after 5 minutes — assume the user abandoned this pick session.
  if (stored.pendingJdAt && Date.now() - stored.pendingJdAt > 5 * 60 * 1000) {
    await chrome.storage.local.remove(["pendingJdText", "pendingJdAt", "pendingJdSource"]);
    return false;
  }
  jdInput.value = stored.pendingJdText;
  charCount.textContent = `${stored.pendingJdText.length} characters`;
  await chrome.storage.local.remove(["pendingJdText", "pendingJdAt", "pendingJdSource"]);
  showToast(`✓ JD captured via picker (${stored.pendingJdText.length.toLocaleString()} chars)`, { tone: "info", duration: 3000 });
  return true;
}

// JD char count
const jdInput = document.getElementById("jd-input");
const charCount = document.getElementById("char-count");
jdInput.addEventListener("input", () => {
  charCount.textContent = `${jdInput.value.length} characters`;
});

// ============== Analyze ==============
async function runAnalysis() {
  const jdText = jdInput.value.trim();
  if (jdText.length < 50) {
    showToast("JD too short. Paste a complete job description (at least 50 characters).", { tone: "warn" });
    return;
  }

  cachedJDText = jdText;
  document.getElementById("loading-msg").textContent = "AI is analyzing the JD...";
  showState("loading");

  const response = await chrome.runtime.sendMessage({
    type: "ANALYZE_JD",
    payload: { jdText }
  });

  if (!response?.success) {
    showError(response?.error || "Analysis failed.", () => runAnalysis());
    return;
  }

  cachedAnalysis = response.data;
  renderResult(cachedAnalysis);
  resetAllTabs();
  showState("result");
  refreshHistoryView();
}

// ============== Render Result ==============
function barTone(pct) {
  if (pct >= 75) return "bar-strong";
  if (pct >= 50) return "bar-okay";
  if (pct >= 25) return "bar-weak";
  return "bar-poor";
}

const LIKELIHOOD_TIERS = {
  low:         { label: "Low",         tone: "tier-low"    },
  moderate:    { label: "Moderate",    tone: "tier-mod"    },
  strong:      { label: "Strong",      tone: "tier-strong" },
  very_strong: { label: "Very strong", tone: "tier-vstrong"}
};

function renderLikelihood(likelihood) {
  const card = document.getElementById("likelihood-card");
  if (!likelihood || typeof likelihood !== "object") {
    card.classList.add("hidden");
    return;
  }
  card.classList.remove("hidden");

  const score = Number.isFinite(likelihood.score) ? likelihood.score : null;
  const tierKey = likelihood.tier || (score == null ? "moderate" : tierFromScore(score));
  const tier = LIKELIHOOD_TIERS[tierKey] || LIKELIHOOD_TIERS.moderate;

  const tierEl = document.getElementById("likelihood-tier");
  tierEl.textContent = tier.label;
  tierEl.className = `likelihood-tier ${tier.tone}`;

  document.getElementById("likelihood-score").textContent = score == null ? "--" : `${score}%`;

  const fill = document.getElementById("likelihood-bar-fill");
  fill.style.width = `${score == null ? 0 : Math.max(0, Math.min(100, score))}%`;
  fill.className = `likelihood-bar-fill ${tier.tone}`;

  document.getElementById("likelihood-reasoning").textContent = likelihood.reasoning || "";

  const adjContainer = document.getElementById("likelihood-adjustments");
  adjContainer.innerHTML = "";
  (likelihood.adjustments || []).forEach(adj => {
    const li = document.createElement("div");
    li.className = "likelihood-adjustment";
    const isPositive = /^\s*\+/.test(String(adj));
    li.classList.add(isPositive ? "adj-positive" : "adj-negative");
    li.textContent = adj;
    adjContainer.appendChild(li);
  });
}

function tierFromScore(s) {
  if (s >= 75) return "very_strong";
  if (s >= 50) return "strong";
  if (s >= 25) return "moderate";
  return "low";
}

const AUDIT_STATUS = {
  present: { icon: "✓", cls: "audit-present" },
  partial: { icon: "~", cls: "audit-partial" },
  missing: { icon: "✗", cls: "audit-missing" }
};

function renderSkillsAudit(audit) {
  const section = document.getElementById("skills-audit-section");
  const container = document.getElementById("skills-audit");
  container.innerHTML = "";

  if (!Array.isArray(audit) || audit.length === 0) {
    section.classList.add("hidden");
    return;
  }
  section.classList.remove("hidden");

  // Sort: must-have first, then by status (missing → partial → present)
  const statusRank = { missing: 0, partial: 1, present: 2 };
  const sorted = [...audit].sort((a, b) => {
    const reqDiff = (a.required === "must-have" ? 0 : 1) - (b.required === "must-have" ? 0 : 1);
    if (reqDiff !== 0) return reqDiff;
    return (statusRank[a.status] ?? 3) - (statusRank[b.status] ?? 3);
  });

  sorted.forEach(item => {
    const row = document.createElement("div");
    const status = AUDIT_STATUS[item.status] || AUDIT_STATUS.missing;
    row.className = `audit-row ${status.cls}`;
    row.innerHTML = `
      <span class="audit-status-icon"></span>
      <div class="audit-body">
        <div class="audit-skill-line">
          <span class="audit-skill"></span>
          <span class="audit-req"></span>
        </div>
        <div class="audit-evidence"></div>
      </div>
    `;
    row.querySelector(".audit-status-icon").textContent = status.icon;
    row.querySelector(".audit-skill").textContent = item.skill || "Unknown";
    const req = row.querySelector(".audit-req");
    req.textContent = item.required === "must-have" ? "must-have" : "nice-to-have";
    req.classList.add(item.required === "must-have" ? "req-must" : "req-nice");
    const ev = row.querySelector(".audit-evidence");
    if (item.evidence) {
      ev.textContent = `“${item.evidence}”`;
    } else {
      ev.style.display = "none";
    }
    container.appendChild(row);
  });
}

function renderResult(data) {
  document.getElementById("score-value").textContent = data.matchScore ?? "--";

  const detectedInfo = document.getElementById("detected-info");
  const titleParts = [];
  if (data.detectedJobTitle) titleParts.push(data.detectedJobTitle);
  if (data.detectedCompany && data.detectedCompany !== "unknown") {
    titleParts.push(`@ ${data.detectedCompany}`);
  }
  detectedInfo.textContent = titleParts.join(" ");

  document.getElementById("score-reasoning").textContent = data.matchReasoning || "";

  // Cost display (best-effort — hidden when unknown)
  const costEl = document.getElementById("cost-display");
  const meta = data._meta;
  if (meta?.costFormatted) {
    const tokens = meta.inputTokens != null && meta.outputTokens != null
      ? ` · ${meta.inputTokens.toLocaleString()} in / ${meta.outputTokens.toLocaleString()} out`
      : "";
    costEl.textContent = `This analysis: ${meta.costFormatted}${tokens}`;
    costEl.classList.remove("hidden");
  } else {
    costEl.classList.add("hidden");
  }

  // Score breakdown
  const breakdownContainer = document.getElementById("score-breakdown");
  breakdownContainer.innerHTML = "";
  const breakdownLabels = {
    skills: "🎯 Skills",
    experience: "📅 Experience",
    education: "🎓 Education",
    industry: "🏢 Industry",
    authorization: "📍 Location / Auth",
    softSkills: "💬 Soft Skills"
  };
  if (data.scoreBreakdown) {
    Object.entries(data.scoreBreakdown).forEach(([key, value]) => {
      const div = document.createElement("div");
      div.className = "breakdown-item";
      const label = breakdownLabels[key] || key;
      const match = String(value).match(/^([\d.]+)\/([\d.]+)\s*-?\s*(.*)$/);
      if (match) {
        const got = parseFloat(match[1]);
        const max = parseFloat(match[2]);
        const pct = max > 0 ? Math.max(0, Math.min(100, (got / max) * 100)) : 0;
        div.innerHTML = `
          <div class="breakdown-row">
            <span class="breakdown-label"></span>
            <span class="breakdown-score"></span>
          </div>
          <div class="breakdown-bar"><div class="breakdown-bar-fill"></div></div>
          <div class="breakdown-note"></div>
        `;
        div.querySelector(".breakdown-label").textContent = label;
        div.querySelector(".breakdown-score").textContent = `${match[1]}/${match[2]}`;
        div.querySelector(".breakdown-bar-fill").style.width = `${pct}%`;
        div.querySelector(".breakdown-bar-fill").classList.add(barTone(pct));
        div.querySelector(".breakdown-note").textContent = match[3];
      } else {
        div.innerHTML = `<span class="breakdown-label"></span> <span></span>`;
        div.querySelector(".breakdown-label").textContent = label;
        div.querySelectorAll("span")[1].textContent = String(value);
      }
      breakdownContainer.appendChild(div);
    });
  }

  // Interview likelihood
  renderLikelihood(data.interviewLikelihood);

  // Skills audit
  renderSkillsAudit(data.skillsAudit);

  // Keywords
  const kwContainer = document.getElementById("keywords");
  kwContainer.innerHTML = "";
  (data.keywords || []).forEach(kw => {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = kw;
    kwContainer.appendChild(tag);
  });

  // Strengths
  const strengthsList = document.getElementById("strengths");
  strengthsList.innerHTML = "";
  (data.strengths || []).forEach(s => {
    const li = document.createElement("li");
    li.textContent = s;
    strengthsList.appendChild(li);
  });

  // Missing
  const missingContainer = document.getElementById("missing-skills");
  missingContainer.innerHTML = "";
  (data.missingSkills || []).forEach(item => {
    const div = document.createElement("div");
    div.className = "skill-item";
    div.innerHTML = `
      <div class="skill-name">
        <span></span>
        <span class="skill-importance importance-${item.importance || 'medium'}"></span>
      </div>
      <div class="skill-suggestion"></div>
      <div class="skill-resource hidden"></div>
    `;
    div.querySelector(".skill-name span:first-child").textContent = item.skill;
    div.querySelector(".skill-importance").textContent =
      ({ high: "High", medium: "Medium", low: "Low" })[item.importance] || "Medium";
    div.querySelector(".skill-suggestion").textContent = item.suggestion || "";

    const lr = item.learningResource;
    if (lr && lr.query && lr.title) {
      const resourceEl = div.querySelector(".skill-resource");
      const typeLabel = ({
        course: "📚 Course",
        docs: "📖 Docs",
        book: "📕 Book",
        tutorial: "🎯 Tutorial"
      })[lr.type] || "📚 Resource";
      const link = document.createElement("a");
      link.href = `https://www.google.com/search?q=${encodeURIComponent(lr.query)}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "skill-resource-link";
      link.textContent = lr.title;

      const label = document.createElement("span");
      label.className = "skill-resource-type";
      label.textContent = typeLabel;

      resourceEl.appendChild(label);
      resourceEl.appendChild(link);
      resourceEl.classList.remove("hidden");
    }

    missingContainer.appendChild(div);
  });
}

// ============== Tabs ==============
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.tab;
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".tab-panel").forEach(p => {
      p.classList.toggle("active", p.id === `tab-${target}`);
    });
  });
});

function resetAllTabs() {
  document.getElementById("cl-empty").classList.remove("hidden");
  document.getElementById("cl-streaming").classList.add("hidden");
  document.getElementById("cl-result").classList.add("hidden");
  document.getElementById("cl-text").textContent = "";
  document.getElementById("cl-text-streaming").textContent = "";
  // Clear both guidance textareas (a new analysis = fresh slate)
  const g1 = document.getElementById("cl-guidance");
  const g2 = document.getElementById("cl-guidance-regen");
  if (g1) { g1.value = ""; document.getElementById("cl-guidance-count").textContent = "0"; }
  if (g2) { g2.value = ""; document.getElementById("cl-guidance-regen-count").textContent = "0"; }

  document.getElementById("tips-empty").classList.remove("hidden");
  document.getElementById("tips-loading").classList.add("hidden");
  document.getElementById("tips-result").classList.add("hidden");

  document.getElementById("interview-empty").classList.remove("hidden");
  document.getElementById("interview-loading").classList.add("hidden");
  document.getElementById("interview-result").classList.add("hidden");
}

// ============== Cover Letter (streaming) ==============
function getCoverLetterGuidance() {
  // If the result panel is visible, prefer its regen textarea; otherwise the empty-state one.
  const result = document.getElementById("cl-result");
  const id = result.classList.contains("hidden") ? "cl-guidance" : "cl-guidance-regen";
  return (document.getElementById(id)?.value || "").trim();
}

function generateCoverLetter() {
  if (inflight.coverLetter) return;
  inflight.coverLetter = true;

  const guidance = getCoverLetterGuidance();

  document.getElementById("cl-empty").classList.add("hidden");
  document.getElementById("cl-result").classList.add("hidden");
  document.getElementById("cl-streaming").classList.remove("hidden");
  const streamingEl = document.getElementById("cl-text-streaming");
  streamingEl.textContent = "";

  const port = chrome.runtime.connect({ name: "cover-letter-stream" });
  const release = () => { inflight.coverLetter = false; };

  port.onDisconnect.addListener(release);
  port.onMessage.addListener((msg) => {
    if (msg.type === "CHUNK") {
      streamingEl.textContent = msg.accumulated;
      streamingEl.scrollTop = streamingEl.scrollHeight;
    } else if (msg.type === "DONE") {
      document.getElementById("cl-streaming").classList.add("hidden");
      document.getElementById("cl-text").textContent = msg.fullText;
      document.getElementById("cl-result").classList.remove("hidden");
      port.disconnect();
    } else if (msg.type === "ERROR") {
      document.getElementById("cl-streaming").classList.add("hidden");
      document.getElementById("cl-empty").classList.remove("hidden");
      // Use full error UI for streaming errors too
      showError(msg.error || "Generation failed.", () => generateCoverLetter());
      port.disconnect();
    }
  });

  port.postMessage({
    type: "START",
    payload: {
      jdText: cachedJDText,
      analysis: cachedAnalysis,
      guidance
    }
  });
}

async function copyCoverLetter() {
  const text = document.getElementById("cl-text").textContent;
  try {
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById("copy-cl-btn");
    const original = btn.textContent;
    btn.textContent = "✓ Copied";
    setTimeout(() => btn.textContent = original, 1500);
  } catch (err) {
    showToast("Copy failed. Select the text manually.", { tone: "error" });
  }
}

// ============== Resume Tips ==============
async function generateResumeTips() {
  document.getElementById("tips-empty").classList.add("hidden");
  document.getElementById("tips-result").classList.add("hidden");
  document.getElementById("tips-loading").classList.remove("hidden");

  const response = await chrome.runtime.sendMessage({
    type: "RESUME_TIPS",
    payload: {
      jdText: cachedJDText,
      analysis: cachedAnalysis
    }
  });

  document.getElementById("tips-loading").classList.add("hidden");

  if (!response?.success) {
    document.getElementById("tips-empty").classList.remove("hidden");
    showError(response?.error || "Generation failed.", () => generateResumeTips());
    return;
  }

  renderTips(response.data);
  document.getElementById("tips-result").classList.remove("hidden");
}

function renderTips(data) {
  document.getElementById("ats-score").textContent = data.atsScore ?? "--";

  const issuesContainer = document.getElementById("ats-issues");
  if (data.atsIssues?.length) {
    const ul = document.createElement("ul");
    data.atsIssues.forEach(issue => {
      const li = document.createElement("li");
      li.textContent = issue;
      ul.appendChild(li);
    });
    issuesContainer.innerHTML = "";
    issuesContainer.appendChild(ul);
  } else {
    issuesContainer.textContent = "No major ATS issues detected ✓";
  }

  document.getElementById("tips-summary").textContent = data.summary || "";

  const tipsList = document.getElementById("tips-list");
  tipsList.innerHTML = "";
  const typeLabels = {
    rewrite: "Rewrite",
    add: "Add",
    quantify: "Quantify",
    reorder: "Reorder",
    remove: "Remove"
  };
  (data.tips || []).forEach(tip => {
    const div = document.createElement("div");
    div.className = "tip-item";
    div.innerHTML = `
      <div class="tip-type-badge tip-type-${tip.type || 'rewrite'}"></div>
      <div class="tip-location"></div>
      <div class="tip-before"></div>
      <div class="tip-after"></div>
      <div class="tip-reason"></div>
    `;
    div.querySelector(".tip-type-badge").textContent = typeLabels[tip.type] || tip.type || "Suggestion";
    div.querySelector(".tip-location").textContent = `📍 ${tip.location || ""}`;

    const beforeEl = div.querySelector(".tip-before");
    if (tip.before && tip.before.toUpperCase() !== "NEW") {
      beforeEl.textContent = tip.before;
    } else {
      beforeEl.style.display = "none";
    }

    div.querySelector(".tip-after").textContent = tip.after || "";
    div.querySelector(".tip-reason").textContent = `💡 ${tip.reason || ""}`;
    tipsList.appendChild(div);
  });
}

// ============== Interview Questions ==============
async function generateInterviewQuestions() {
  document.getElementById("interview-empty").classList.add("hidden");
  document.getElementById("interview-result").classList.add("hidden");
  document.getElementById("interview-loading").classList.remove("hidden");

  const response = await chrome.runtime.sendMessage({
    type: "INTERVIEW_QUESTIONS",
    payload: {
      jdText: cachedJDText,
      analysis: cachedAnalysis
    }
  });

  document.getElementById("interview-loading").classList.add("hidden");

  if (!response?.success) {
    document.getElementById("interview-empty").classList.remove("hidden");
    showError(response?.error || "Generation failed.", () => generateInterviewQuestions());
    return;
  }

  renderInterview(response.data);
  document.getElementById("interview-result").classList.remove("hidden");
}

function renderInterview(data) {
  const technicalContainer = document.getElementById("technical-questions");
  technicalContainer.innerHTML = "";
  (data.technical || []).forEach((q, i) => {
    technicalContainer.appendChild(renderQA(q, i + 1, "technical"));
  });

  const behavioralContainer = document.getElementById("behavioral-questions");
  behavioralContainer.innerHTML = "";
  (data.behavioral || []).forEach((q, i) => {
    behavioralContainer.appendChild(renderQA(q, i + 1, "behavioral"));
  });
}

function renderQA(q, num, type) {
  const div = document.createElement("div");
  div.className = "qa-item";
  const diffLabels = { easy: "Easy", medium: "Medium", hard: "Hard" };

  div.innerHTML = `
    <div class="qa-meta">
      <span class="qa-difficulty"></span>
      ${type === "technical" ? '<span class="qa-topic"></span>' : '<span class="qa-framework"></span>'}
    </div>
    <div class="qa-question"></div>
    <div class="qa-hint"></div>
  `;

  const diffEl = div.querySelector(".qa-difficulty");
  diffEl.textContent = diffLabels[q.difficulty] || "Medium";
  diffEl.classList.add(q.difficulty || "medium");

  if (type === "technical") {
    div.querySelector(".qa-topic").textContent = q.topic || "";
  } else {
    div.querySelector(".qa-framework").textContent = q.framework || "";
  }

  div.querySelector(".qa-question").textContent = `Q${num}. ${q.question}`;
  div.querySelector(".qa-hint").textContent = `💡 ${q.hint || ""}`;
  return div;
}

// ============== Onboarding ==============
let onboardingStep = 1;
const TOTAL_ONBOARDING_STEPS = 4;

function renderOnboardingStep(step) {
  document.querySelectorAll(".onboarding-step").forEach(el => {
    el.classList.toggle("hidden", parseInt(el.dataset.step) !== step);
  });
  document.querySelectorAll(".step-dot").forEach(el => {
    el.classList.toggle("active", parseInt(el.dataset.step) === step);
  });
  // Last step: change button text
  const nextBtn = document.getElementById("onboarding-next");
  nextBtn.textContent = step === TOTAL_ONBOARDING_STEPS ? "Get started 🚀" : "Next →";
}

async function completeOnboarding() {
  await chrome.storage.local.set({ onboardingCompleted: true });
  // Re-init to show paste view
  init();
}

document.getElementById("onboarding-next").addEventListener("click", () => {
  if (onboardingStep < TOTAL_ONBOARDING_STEPS) {
    onboardingStep++;
    renderOnboardingStep(onboardingStep);
  } else {
    completeOnboarding();
  }
});

document.getElementById("onboarding-skip").addEventListener("click", completeOnboarding);

// ============== Bindings ==============
document.getElementById("settings-btn").addEventListener("click", () => chrome.runtime.openOptionsPage());
document.getElementById("open-options").addEventListener("click", () => chrome.runtime.openOptionsPage());
document.getElementById("error-settings-btn").addEventListener("click", () => chrome.runtime.openOptionsPage());
document.getElementById("error-retry-btn").addEventListener("click", () => {
  if (lastFailedAction) {
    const action = lastFailedAction;
    lastFailedAction = null;
    action();
  }
});
document.getElementById("analyze-btn").addEventListener("click", withGuard("analyze", runAnalysis));
document.getElementById("retry-btn").addEventListener("click", () => showState("paste"));
document.getElementById("back-btn").addEventListener("click", () => showState("paste"));

document.getElementById("generate-cl-btn").addEventListener("click", generateCoverLetter);
document.getElementById("regen-cl-btn").addEventListener("click", generateCoverLetter);
document.getElementById("copy-cl-btn").addEventListener("click", copyCoverLetter);

const clGuidance = document.getElementById("cl-guidance");
const clGuidanceCount = document.getElementById("cl-guidance-count");
clGuidance?.addEventListener("input", () => {
  clGuidanceCount.textContent = String(clGuidance.value.length);
});
const clGuidanceRegen = document.getElementById("cl-guidance-regen");
const clGuidanceRegenCount = document.getElementById("cl-guidance-regen-count");
clGuidanceRegen?.addEventListener("input", () => {
  clGuidanceRegenCount.textContent = String(clGuidanceRegen.value.length);
});

document.getElementById("generate-tips-btn").addEventListener("click", withGuard("tips", generateResumeTips));
document.getElementById("generate-interview-btn").addEventListener("click", withGuard("interview", generateInterviewQuestions));

document.getElementById("auto-fill-btn").addEventListener("click", autoFillFromTab);
document.getElementById("pick-jd-btn").addEventListener("click", pickJdManually);
document.getElementById("clear-history-btn").addEventListener("click", handleClearHistory);
document.getElementById("resume-stale-update").addEventListener("click", () => chrome.runtime.openOptionsPage());
document.getElementById("resume-select").addEventListener("change", onResumeSelectChange);
document.getElementById("manage-resumes-btn").addEventListener("click", () => chrome.runtime.openOptionsPage());

init();
