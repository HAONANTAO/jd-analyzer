// content.js — v1.3 (in-page analysis)
// Injects an "Analyze JD" launcher on LinkedIn job pages. Clicking it extracts
// the JD, sends it to the existing background ANALYZE_JD handler, and renders
// the result in a small in-page panel — no popup needed.
//
// Deliberately self-contained:
//   - classic script (NOT a module), wrapped in an IIFE
//   - reuses the EXISTING background ANALYZE_JD handler (zero background.js changes)
//   - no new permissions, read-only DOM access, user-triggered only

(() => {
  if (window.__JDA_V13_LOADED__) return;
  window.__JDA_V13_LOADED__ = true;

  const BTN_ID = "jda-v13-launcher";
  const PANEL_ID = "jda-v13-panel";
  const MIN_JD_CHARS = 200;

  // LinkedIn rotates exact class names; use attribute-contains selectors plus an
  // "About the job" heading heuristic so extraction survives DOM reshuffles.
  const LINKEDIN_SELECTORS = [
    "#job-details",
    "[class*='jobs-description__content']",
    "[class*='jobs-box__html-content']",
    "[class*='jobs-description-content']",
    "[class*='show-more-less-html']",
    "[class*='jobs-description']"
  ];

  function extractJD() {
    for (const sel of LINKEDIN_SELECTORS) {
      const el = document.querySelector(sel);
      const text = (el?.innerText || "").trim();
      if (text.length >= MIN_JD_CHARS) return { text, source: "linkedin" };
    }
    const headings = Array.from(document.querySelectorAll("h1, h2, h3"));
    const aboutHeading = headings.find(h => /about the job/i.test(h.textContent || ""));
    if (aboutHeading) {
      let container = aboutHeading.parentElement;
      for (let i = 0; i < 5 && container; i++) {
        const text = (container.innerText || "").trim();
        if (text.length >= MIN_JD_CHARS) return { text, source: "linkedin-heading" };
        container = container.parentElement;
      }
    }
    const selection = (window.getSelection?.().toString() || "").trim();
    if (selection.length >= MIN_JD_CHARS) return { text: selection, source: "selection" };
    return null;
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
  }

  // ============== Toast ==============
  function toast(message, isError) {
    const t = document.createElement("div");
    t.textContent = message;
    t.style.cssText = [
      "position:fixed", "bottom:74px", "right:20px", "z-index:2147483647",
      "max-width:280px", "padding:10px 14px", "border-radius:8px",
      "font:13px/1.4 -apple-system,system-ui,sans-serif",
      "color:#fff", "box-shadow:0 4px 16px rgba(0,0,0,0.25)",
      `background:${isError ? "#b91c1c" : "#0a66c2"}`,
      "opacity:0", "transition:opacity 160ms ease"
    ].join(";");
    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.opacity = "1"; });
    setTimeout(() => {
      t.style.opacity = "0";
      t.addEventListener("transitionend", () => t.remove(), { once: true });
    }, 3200);
  }

  // ============== Panel ==============
  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;
    panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.style.cssText = [
      "position:fixed", "bottom:74px", "right:20px", "z-index:2147483647",
      "width:340px", "max-height:72vh", "overflow:hidden",
      "display:flex", "flex-direction:column",
      "background:#fff", "border:1px solid #e5e7eb", "border-radius:12px",
      "box-shadow:0 8px 32px rgba(0,0,0,0.2)",
      "font:13px/1.5 -apple-system,system-ui,sans-serif", "color:#1a1a1a"
    ].join(";");
    document.body.appendChild(panel);
    return panel;
  }

  function closePanel() {
    document.getElementById(PANEL_ID)?.remove();
  }

  function panelHeader() {
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;
                  padding:12px 14px;border-bottom:1px solid #e5e7eb;flex-shrink:0;">
        <span style="font-weight:600;color:#0a66c2;">JD Analyzer</span>
        <button id="jda-v13-close" type="button"
          style="border:none;background:none;cursor:pointer;font-size:18px;
                 line-height:1;color:#6b7280;padding:2px 6px;">&times;</button>
      </div>`;
  }

  function wireClose(panel) {
    panel.querySelector("#jda-v13-close")?.addEventListener("click", closePanel);
  }

  function renderLoading(panel) {
    panel.innerHTML = panelHeader() + `
      <div style="padding:28px 14px;text-align:center;color:#4b5563;">
        <div style="width:28px;height:28px;margin:0 auto 12px;border:3px solid #e5e7eb;
                    border-top-color:#0a66c2;border-radius:50%;
                    animation:jda-spin 0.8s linear infinite;"></div>
        Analyzing JD…
        <div style="font-size:11px;color:#9ca3af;margin-top:6px;">Usually 5–15 seconds</div>
      </div>
      <style>@keyframes jda-spin{to{transform:rotate(360deg)}}</style>`;
    wireClose(panel);
  }

  function renderError(panel, message, hint) {
    panel.innerHTML = panelHeader() + `
      <div style="padding:16px 14px;">
        <div style="color:#b91c1c;font-weight:600;margin-bottom:6px;">${esc(message)}</div>
        ${hint ? `<div style="color:#6b7280;font-size:12px;">${esc(hint)}</div>` : ""}
      </div>`;
    wireClose(panel);
  }

  // Small uppercase section label, reused across the panel.
  function sectionLabel(text) {
    return `<div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;
            color:#6b7280;margin:0 0 6px;">${esc(text)}</div>`;
  }

  function renderResult(panel, data) {
    const title = [data.detectedJobTitle, data.detectedCompany && data.detectedCompany !== "unknown"
      ? `@ ${data.detectedCompany}` : ""].filter(Boolean).join(" ");
    const il = data.interviewLikelihood || {};
    const bd = data.scoreBreakdown || {};
    const strengths = data.strengths || [];
    const missing = (data.missingSkills || []).slice(0, 5);
    const adjustments = il.adjustments || [];
    const tierColor = { low: "#b91c1c", moderate: "#c77e20", strong: "#10726b", very_strong: "#15803d" };

    // 6-dimension score breakdown — each value is a string like "X/35 - explanation".
    const BD_LABELS = {
      skills: "Skills", experience: "Experience", education: "Education",
      industry: "Industry", authorization: "Authorization", softSkills: "Soft skills"
    };
    const bdRows = Object.keys(BD_LABELS).filter(k => bd[k]).map(k => `
      <div style="margin-bottom:7px;">
        <strong style="font-size:12px;">${esc(BD_LABELS[k])}</strong>
        <div style="color:#6b7280;font-size:12px;line-height:1.45;">${esc(bd[k])}</div>
      </div>`).join("");

    panel.innerHTML = panelHeader() + `
      <div style="padding:14px;overflow-y:auto;">
        ${title ? `<div style="font-weight:600;font-size:14px;margin-bottom:10px;">${esc(title)}</div>` : ""}

        <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:4px;">
          <span style="font-size:32px;font-weight:700;color:#0a66c2;">${esc(data.matchScore ?? "--")}</span>
          <span style="color:#6b7280;">/ 100 match</span>
        </div>
        ${data.matchReasoning ? `<div style="color:#4b5563;font-size:12px;margin-bottom:14px;">${esc(data.matchReasoning)}</div>` : ""}

        ${bdRows ? sectionLabel("Score breakdown") + `<div style="margin-bottom:14px;">${bdRows}</div>` : ""}

        ${strengths.length ? sectionLabel("Strengths") + `
          <ul style="margin:0 0 14px;padding-left:18px;color:#15803d;">
            ${strengths.map(s => `<li style="margin-bottom:4px;color:#1a1a1a;">${esc(s)}</li>`).join("")}
          </ul>` : ""}

        ${il.score != null ? `
          <div style="padding:10px 12px;background:#f8f9fb;border-radius:8px;margin-bottom:14px;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;margin-bottom:3px;">Interview likelihood</div>
            <div style="font-weight:600;color:${tierColor[il.tier] || "#1a1a1a"};">
              ${esc(il.score)}/100 · ${esc((il.tier || "").replace("_", " "))}
            </div>
            ${il.reasoning ? `<div style="color:#6b7280;font-size:12px;margin-top:4px;">${esc(il.reasoning)}</div>` : ""}
            ${adjustments.length ? `<div style="margin-top:8px;display:flex;flex-direction:column;gap:3px;">
              ${adjustments.map(a => {
                const neg = /^\s*[-−–]/.test(String(a));
                return `<div style="font-size:12px;color:${neg ? "#b91c1c" : "#15803d"};">${esc(a)}</div>`;
              }).join("")}
            </div>` : ""}
          </div>` : ""}

        ${missing.length ? sectionLabel("Top gaps") + `
          <ul style="margin:0 0 14px;padding-left:18px;color:#1a1a1a;">
            ${missing.map(m => `<li style="margin-bottom:6px;">
              <strong>${esc(m.skill)}</strong>
              <span style="color:#9ca3af;">· ${esc(m.importance || "")}</span>
              ${m.suggestion ? `<div style="color:#6b7280;font-size:12px;margin-top:2px;">${esc(m.suggestion)}</div>` : ""}
            </li>`).join("")}
          </ul>` : ""}

        <div style="border-top:1px solid #e5e7eb;padding-top:10px;color:#9ca3af;font-size:11px;">
          Open the JD Analyzer popup for cover letter, resume tips & interview prep.
        </div>
      </div>`;
    wireClose(panel);
  }

  // ============== Analyze flow ==============
  async function onClick() {
    const jd = extractJD();
    if (!jd) {
      toast("No job description found on this page. Try selecting the JD text first.", true);
      return;
    }
    const panel = ensurePanel();
    renderLoading(panel);
    try {
      const resp = await chrome.runtime.sendMessage({
        type: "ANALYZE_JD",
        payload: { jdText: jd.text }
      });
      if (!resp) {
        renderError(panel, "No response from the extension",
          "The background service worker may be asleep. Try clicking Analyze again.");
        return;
      }
      if (!resp.success) {
        renderError(panel, resp.error?.message || "Analysis failed",
          resp.error?.hint || "Open the JD Analyzer popup to check your settings.");
        return;
      }
      renderResult(panel, resp.data);
      // Hand the result to the popup (best-effort) so opening it shows the same
      // analysis instead of a blank paste screen — no re-analysis, no extra cost.
      try {
        await chrome.storage.local.set({
          pendingAnalysis: { jdText: jd.text, analysis: resp.data, at: Date.now() }
        });
      } catch (_) { /* non-fatal — the panel already shows the result */ }
    } catch (err) {
      const invalidated = /context invalidated|message port closed/i.test(err?.message || "");
      renderError(panel,
        invalidated ? "Extension was just reloaded" : (err?.message || "Something went wrong"),
        invalidated
          ? "Refresh this page (⌘R / Ctrl+R) so the extension reconnects, then try again."
          : "Try again, or open the JD Analyzer popup.");
    }
  }

  // ============== Launcher ==============
  function injectLauncher() {
    if (document.getElementById(BTN_ID)) return;
    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.textContent = "✦ Analyze JD";
    btn.title = "Analyze this job description with JD Analyzer";
    btn.style.cssText = [
      "position:fixed", "bottom:20px", "right:20px", "z-index:2147483647",
      "padding:10px 16px", "border:none", "border-radius:999px",
      "font:600 13px/1 -apple-system,system-ui,sans-serif",
      "color:#fff", "background:#0a66c2", "cursor:pointer",
      "box-shadow:0 4px 14px rgba(10,102,194,0.4)",
      "transition:transform 120ms ease, background 120ms ease"
    ].join(";");
    btn.addEventListener("mouseenter", () => { btn.style.background = "#004182"; btn.style.transform = "translateY(-1px)"; });
    btn.addEventListener("mouseleave", () => { btn.style.background = "#0a66c2"; btn.style.transform = "none"; });
    btn.addEventListener("click", onClick);
    document.body.appendChild(btn);
  }

  injectLauncher();
})();
