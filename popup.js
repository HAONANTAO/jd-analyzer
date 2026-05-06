// popup.js v1.1
import { getHistory, clearHistory } from "./lib/storage.js";
import { formatCost } from "./lib/pricing.js";
import { extractJDFromPage } from "./lib/jdExtractor.js";

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
  const stored = await chrome.storage.local.get([
    "provider", "claudeApiKey", "claudeModel",
    "openaiApiKey", "openaiModel", "resume",
    "onboardingCompleted", "resumeUpdatedAt"
  ]);

  const provider = stored.provider || "claude";
  const apiKey = provider === "openai" ? stored.openaiApiKey : stored.claudeApiKey;
  const model = provider === "openai"
    ? (stored.openaiModel || "gpt-4o-mini")
    : (stored.claudeModel || "claude-sonnet-4-6");

  if (!apiKey || !stored.resume) {
    showState("notConfigured");
    return;
  }

  if (!stored.onboardingCompleted) {
    showState("onboarding");
    return;
  }

  document.getElementById("provider-tag").textContent =
    `Engine: ${provider === "openai" ? "OpenAI" : "Claude"} · ${model}`;

  updateStaleBanner(stored.resumeUpdatedAt);
  await refreshHistoryView();

  showState("paste");
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

  history.slice(0, 5).forEach(entry => {
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

    item.appendChild(meta);
    item.appendChild(score);
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
  if (!confirm("Clear all recent analyses?")) return;
  await clearHistory();
  await refreshHistoryView();
}

// ============== Auto-fill from active tab ==============
async function autoFillFromTab() {
  const btn = document.getElementById("auto-fill-btn");
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Reading page...";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      alert("No active tab found.");
      return;
    }
    if (tab.url?.startsWith("chrome://") || tab.url?.startsWith("chrome-extension://")) {
      alert("Can't read browser internal pages. Open a real job posting first.");
      return;
    }
    const [{ result } = {}] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractJDFromPage
    });

    if (!result?.text) {
      alert("Couldn't auto-detect a JD on this page.\n\nTip: highlight the JD text first, then click Auto-fill again — selection is used as a fallback.");
      return;
    }

    jdInput.value = result.text;
    charCount.textContent = `${result.text.length} characters`;
    btn.textContent = `✓ Filled from ${result.source}`;
    setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1500);
  } catch (err) {
    console.error("[JD Analyzer] auto-fill failed", err);
    alert("Couldn't access this page. Some sites block extensions — copy the JD manually.");
    btn.textContent = original;
    btn.disabled = false;
  }
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
    alert("JD too short. Please paste a complete job description (at least 50 characters).");
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
    industry: "🏢 Industry",
    softSkills: "💬 Soft Skills"
  };
  if (data.scoreBreakdown) {
    Object.entries(data.scoreBreakdown).forEach(([key, value]) => {
      const div = document.createElement("div");
      div.className = "breakdown-item";
      const label = breakdownLabels[key] || key;
      const match = String(value).match(/^([\d.]+\/[\d.]+)\s*-?\s*(.*)$/);
      if (match) {
        div.innerHTML = `<span class="breakdown-label"></span><span class="breakdown-score"></span><div style="margin-top:2px;color:#6b7280;"></div>`;
        div.querySelector(".breakdown-label").textContent = label;
        div.querySelector(".breakdown-score").textContent = match[1];
        div.querySelector("div").textContent = match[2];
      } else {
        div.innerHTML = `<span class="breakdown-label"></span> <span></span>`;
        div.querySelector(".breakdown-label").textContent = label;
        div.querySelectorAll("span")[1].textContent = String(value);
      }
      breakdownContainer.appendChild(div);
    });
  }

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
    `;
    div.querySelector(".skill-name span:first-child").textContent = item.skill;
    div.querySelector(".skill-importance").textContent =
      ({ high: "High", medium: "Medium", low: "Low" })[item.importance] || "Medium";
    div.querySelector(".skill-suggestion").textContent = item.suggestion || "";
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

  document.getElementById("tips-empty").classList.remove("hidden");
  document.getElementById("tips-loading").classList.add("hidden");
  document.getElementById("tips-result").classList.add("hidden");

  document.getElementById("interview-empty").classList.remove("hidden");
  document.getElementById("interview-loading").classList.add("hidden");
  document.getElementById("interview-result").classList.add("hidden");
}

// ============== Cover Letter (streaming) ==============
function generateCoverLetter() {
  document.getElementById("cl-empty").classList.add("hidden");
  document.getElementById("cl-result").classList.add("hidden");
  document.getElementById("cl-streaming").classList.remove("hidden");
  const streamingEl = document.getElementById("cl-text-streaming");
  streamingEl.textContent = "";

  const port = chrome.runtime.connect({ name: "cover-letter-stream" });

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
      analysis: cachedAnalysis
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
    alert("Copy failed. Please select the text manually.");
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
document.getElementById("analyze-btn").addEventListener("click", runAnalysis);
document.getElementById("retry-btn").addEventListener("click", () => showState("paste"));
document.getElementById("back-btn").addEventListener("click", () => showState("paste"));

document.getElementById("generate-cl-btn").addEventListener("click", generateCoverLetter);
document.getElementById("regen-cl-btn").addEventListener("click", generateCoverLetter);
document.getElementById("copy-cl-btn").addEventListener("click", copyCoverLetter);

document.getElementById("generate-tips-btn").addEventListener("click", generateResumeTips);
document.getElementById("generate-interview-btn").addEventListener("click", generateInterviewQuestions);

document.getElementById("auto-fill-btn").addEventListener("click", autoFillFromTab);
document.getElementById("clear-history-btn").addEventListener("click", handleClearHistory);
document.getElementById("resume-stale-update").addEventListener("click", () => chrome.runtime.openOptionsPage());

init();
