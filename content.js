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

  // Holds the JD text from the last successful analysis so the on-demand
  // "Advanced" cards (red flags, etc.) can re-use it without re-extracting.
  let lastJdText = null;

  // ============== Design tokens ==============
  // One small palette, used everywhere — keeps the panel "clean professional"
  // and makes future tweaks a single-place change.
  const T = {
    ink:      "#18181b",   // primary text
    inkSoft:  "#3f3f46",   // secondary text
    inkMute:  "#71717a",   // body / muted
    inkFaint: "#a1a1aa",   // captions, disclaimers
    accent:   "#2563eb",   // single accent
    surface:  "#f4f4f5",   // inset surface (cards within the panel)
    line:     "#e4e4e7",   // hairline borders
    ok:       "#15803d",
    warn:     "#b45309",
    bad:      "#dc2626",
    radius:   "12px",
    radiusSm: "8px",
    shadow:   "0 16px 40px -12px rgba(24,24,27,0.22), 0 2px 6px -2px rgba(24,24,27,0.08)",
    font:     "-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif"
  };

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
      "max-width:280px", "padding:11px 14px", `border-radius:${T.radiusSm}`,
      `font:13px/1.45 ${T.font}`,
      `color:#fff`, "box-shadow:0 8px 24px -6px rgba(24,24,27,0.35)",
      `background:${isError ? T.bad : T.ink}`,
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
      "width:344px", "max-height:74vh", "overflow:hidden",
      "display:flex", "flex-direction:column",
      `background:#fff`, `border:1px solid ${T.line}`, `border-radius:${T.radius}`,
      `box-shadow:${T.shadow}`,
      `font:13px/1.55 ${T.font}`, `color:${T.ink}`,
      "-webkit-font-smoothing:antialiased"
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
                  padding:13px 16px;border-bottom:1px solid ${T.line};flex-shrink:0;">
        <span style="font-weight:650;font-size:13px;letter-spacing:-0.01em;color:${T.ink};">
          <span style="color:${T.accent};">✦</span> JD Analyzer
        </span>
        <button id="jda-v13-close" type="button" aria-label="Close"
          style="border:none;background:none;cursor:pointer;font-size:17px;
                 line-height:1;color:${T.inkFaint};padding:3px 5px;border-radius:6px;">&times;</button>
      </div>`;
  }

  function wireClose(panel) {
    panel.querySelector("#jda-v13-close")?.addEventListener("click", closePanel);
  }

  function renderLoading(panel) {
    panel.innerHTML = panelHeader() + `
      <div style="padding:32px 16px;text-align:center;color:${T.inkMute};">
        <div style="width:26px;height:26px;margin:0 auto 14px;border:2.5px solid ${T.line};
                    border-top-color:${T.accent};border-radius:50%;
                    animation:jda-spin 0.7s linear infinite;"></div>
        <div style="font-size:13px;color:${T.inkSoft};">Analyzing JD…</div>
        <div style="font-size:11px;color:${T.inkFaint};margin-top:5px;">Usually 5–15 seconds</div>
      </div>
      <style>@keyframes jda-spin{to{transform:rotate(360deg)}}</style>`;
    wireClose(panel);
  }

  function renderError(panel, message, hint) {
    panel.innerHTML = panelHeader() + `
      <div style="padding:18px 16px;">
        <div style="color:${T.bad};font-weight:600;font-size:13px;margin-bottom:6px;">${esc(message)}</div>
        ${hint ? `<div style="color:${T.inkMute};font-size:12px;line-height:1.5;">${esc(hint)}</div>` : ""}
      </div>`;
    wireClose(panel);
  }

  // Small uppercase section label, reused across the panel.
  function sectionLabel(text) {
    return `<div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;
            color:${T.inkFaint};margin:0 0 7px;">${esc(text)}</div>`;
  }

  // Shared inset-card style for sub-results (interview "why", red flags, salary).
  const cardStyle =
    `padding:11px 13px;background:${T.surface};border-radius:${T.radiusSm};` +
    `border:1px solid ${T.line};`;

  // Human-readable label for where the JD text came from — lets the user
  // spot a bad extraction (e.g. grabbed nav/footer) at a glance.
  const SOURCE_LABELS = {
    linkedin: "LinkedIn JD section",
    "linkedin-heading": "About-the-job heading",
    selection: "your text selection"
  };

  function renderResult(panel, data, jd) {
    const title = [data.detectedJobTitle, data.detectedCompany && data.detectedCompany !== "unknown"
      ? `@ ${data.detectedCompany}` : ""].filter(Boolean).join(" ");
    const il = data.interviewLikelihood || {};
    const bd = data.scoreBreakdown || {};
    const strengths = data.strengths || [];
    const missing = (data.missingSkills || []).slice(0, 5);
    const adjustments = il.adjustments || [];
    const tierColor = { low: T.bad, moderate: T.warn, strong: "#0e7490", very_strong: T.ok };

    // 6-dimension score breakdown — each value is a string like "X/35 - explanation".
    // We show only the "X/35" part inline — the explanations were too verbose.
    const BD_LABELS = {
      skills: "Skills", experience: "Experience", education: "Education",
      industry: "Industry", authorization: "Authorization", softSkills: "Soft"
    };
    const bdCompact = Object.keys(BD_LABELS).filter(k => bd[k]).map(k => {
      const scorePart = String(bd[k]).split(/\s+[-–—]\s+/)[0].trim();
      return `<span style="white-space:nowrap;"><strong style="font-weight:600;">${esc(BD_LABELS[k])}</strong> ` +
             `<span style="color:${T.inkMute};">${esc(scorePart)}</span></span>`;
    }).join(`<span style="color:${T.line};"> · </span>`);

    panel.innerHTML = panelHeader() + `
      <div style="padding:16px;overflow-y:auto;">
        ${title ? `<div style="font-weight:650;font-size:15px;line-height:1.35;letter-spacing:-0.01em;color:${T.ink};margin-bottom:3px;">${esc(title)}</div>` : ""}
        ${jd ? `<div style="font-size:10px;color:${T.inkFaint};margin-bottom:14px;">extracted ${jd.text.length.toLocaleString()} chars · ${esc(SOURCE_LABELS[jd.source] || jd.source)}</div>` : ""}

        <div style="display:flex;margin-bottom:10px;">
          <div style="flex:1;">
            <div style="display:flex;align-items:baseline;gap:3px;">
              <span style="font-size:32px;font-weight:700;letter-spacing:-0.02em;color:${T.ink};">${esc(data.matchScore ?? "--")}</span>
              <span style="color:${T.inkFaint};font-size:13px;">/100</span>
            </div>
            <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:${T.inkFaint};">Resume match</div>
          </div>
          ${il.score != null ? `
          <div style="flex:1;border-left:1px solid ${T.line};padding-left:16px;">
            <div style="display:flex;align-items:baseline;gap:2px;">
              <span style="font-size:32px;font-weight:700;letter-spacing:-0.02em;color:${tierColor[il.tier] || T.ink};">${esc(il.score)}</span>
              <span style="color:${T.inkFaint};font-size:13px;">%</span>
            </div>
            <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:${T.inkFaint};">Interview chance</div>
          </div>` : ""}
        </div>
        ${data.matchReasoning ? `<div style="color:${T.inkMute};font-size:12px;line-height:1.5;margin-bottom:16px;">${esc(data.matchReasoning)}</div>` : ""}

        ${bdCompact ? sectionLabel("Score breakdown") + `<div style="font-size:12px;line-height:2;margin-bottom:16px;color:${T.ink};">${bdCompact}</div>` : ""}

        ${strengths.length ? sectionLabel("Strengths") + `
          <ul style="margin:0 0 16px;padding:0;list-style:none;">
            ${strengths.map(s => `<li style="position:relative;padding-left:15px;margin-bottom:5px;color:${T.ink};line-height:1.5;">
              <span style="position:absolute;left:0;color:${T.ok};">✓</span>${esc(s)}
            </li>`).join("")}
          </ul>` : ""}

        ${(il.reasoning || adjustments.length) ? `
          <div style="${cardStyle}margin-bottom:16px;">
            ${sectionLabel("Why this interview chance")}
            ${il.reasoning ? `<div style="color:${T.inkMute};font-size:12px;line-height:1.5;">${esc(il.reasoning)}</div>` : ""}
            ${adjustments.length ? `<div style="margin-top:8px;display:flex;flex-direction:column;gap:4px;">
              ${adjustments.map(a => {
                const neg = /^\s*[-−–]/.test(String(a));
                return `<div style="font-size:12px;line-height:1.4;color:${neg ? T.bad : T.ok};">${esc(a)}</div>`;
              }).join("")}
            </div>` : ""}
          </div>` : ""}

        ${missing.length ? sectionLabel("Top gaps") + `
          <ul style="margin:0 0 16px;padding:0;list-style:none;">
            ${missing.map(m => `<li style="margin-bottom:8px;line-height:1.5;">
              <strong style="font-weight:600;color:${T.ink};">${esc(m.skill)}</strong>
              <span style="color:${T.inkFaint};font-size:11px;"> · ${esc(m.importance || "")}</span>
              ${m.suggestion ? `<div style="color:${T.inkMute};font-size:12px;margin-top:1px;">${esc(m.suggestion)}</div>` : ""}
            </li>`).join("")}
          </ul>` : ""}

        ${sectionLabel("Advanced — click to run (1 extra call each)")}
        <div id="jda-v13-advanced" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">
          <button type="button" data-feature="red_flags"
            style="padding:6px 12px;border:1px solid ${T.line};border-radius:7px;
                   background:#fff;color:${T.inkSoft};font:550 12px/1 ${T.font};cursor:pointer;
                   transition:background 120ms ease,border-color 120ms ease;">
            🚩 Red flags
          </button>
          <button type="button" data-feature="salary_check"
            style="padding:6px 12px;border:1px solid ${T.line};border-radius:7px;
                   background:#fff;color:${T.inkSoft};font:550 12px/1 ${T.font};cursor:pointer;
                   transition:background 120ms ease,border-color 120ms ease;">
            💰 Salary check
          </button>
        </div>
        <div id="jda-v13-adv-output" style="margin-bottom:16px;"></div>

        <div style="border-top:1px solid ${T.line};padding-top:11px;color:${T.inkFaint};font-size:11px;line-height:1.5;">
          Open the JD Analyzer popup for cover letter, resume tips &amp; interview prep.
        </div>
      </div>`;
    wireClose(panel);
    wireAdvanced(panel);
  }

  // ============== Advanced (on-demand) cards ==============
  function wireAdvanced(panel) {
    const bar = panel.querySelector("#jda-v13-advanced");
    const out = panel.querySelector("#jda-v13-adv-output");
    if (!bar || !out) return;
    // Subtle hover on the pill buttons.
    bar.querySelectorAll("[data-feature]").forEach(b => {
      b.addEventListener("mouseenter", () => { if (!b.disabled) { b.style.background = T.surface; b.style.borderColor = T.inkFaint; } });
      b.addEventListener("mouseleave", () => { b.style.background = "#fff"; b.style.borderColor = T.line; });
    });
    bar.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("[data-feature]");
      if (!btn || btn.disabled) return;
      const feature = btn.getAttribute("data-feature");
      if (!lastJdText) {
        out.innerHTML = `<div style="color:${T.bad};font-size:12px;">No JD loaded — run Analyze JD first.</div>`;
        return;
      }
      btn.disabled = true;
      const originalLabel = btn.textContent;
      btn.textContent = "Running…";
      out.innerHTML = `<div style="color:${T.inkMute};font-size:12px;">Analyzing…</div>`;
      try {
        const resp = await chrome.runtime.sendMessage({
          type: "PRO_FEATURE",
          payload: { feature, jdText: lastJdText }
        });
        if (!resp) {
          out.innerHTML = `<div style="color:${T.bad};font-size:12px;">No response — try again.</div>`;
        } else if (!resp.success) {
          out.innerHTML = `<div style="color:${T.bad};font-size:12px;">${esc(resp.error?.message || "Failed")}</div>`;
        } else if (feature === "red_flags") {
          renderRedFlags(out, resp.data);
        } else if (feature === "salary_check") {
          renderSalary(out, resp.data);
        }
      } catch (err) {
        const invalidated = /context invalidated|message port closed/i.test(err?.message || "");
        out.innerHTML = `<div style="color:${T.bad};font-size:12px;">${
          invalidated ? "Extension was reloaded — refresh this page (⌘R) and try again."
                      : esc(err?.message || "Something went wrong")
        }</div>`;
      } finally {
        btn.disabled = false;
        btn.textContent = originalLabel;
      }
    });
  }

  function renderRedFlags(out, data) {
    const flags = data.flags || [];
    const sevColor = { high: T.bad, medium: T.warn, low: T.inkMute };
    out.innerHTML = `
      <div style="${cardStyle}">
        ${sectionLabel("Red flags")}
        ${data.summary ? `<div style="color:${T.inkSoft};font-size:12px;line-height:1.5;margin-bottom:8px;">${esc(data.summary)}</div>` : ""}
        ${flags.length ? `<ul style="margin:0;padding:0;list-style:none;">
          ${flags.map(f => `<li style="margin-bottom:6px;color:${T.ink};font-size:12px;line-height:1.5;">
            <strong style="color:${sevColor[f.severity] || T.ink};font-weight:600;">${esc((f.severity || "").toUpperCase())}</strong>
            · ${esc(f.text)}
          </li>`).join("")}
        </ul>` : `<div style="color:${T.ok};font-size:12px;">No notable red flags. ✓</div>`}
      </div>`;
  }

  function renderSalary(out, data) {
    const verdictColor = {
      below_market: T.bad, at_market: "#0e7490",
      above_market: T.ok, not_stated: T.inkMute, unclear: T.inkMute
    };
    const verdictLabel = {
      below_market: "Below market", at_market: "At market",
      above_market: "Above market", not_stated: "Not stated in JD", unclear: "Unclear"
    };
    out.innerHTML = `
      <div style="${cardStyle}">
        ${sectionLabel("Salary check")}
        <div style="font-weight:600;font-size:13px;color:${verdictColor[data.verdict] || T.ink};margin-bottom:7px;">
          ${esc(verdictLabel[data.verdict] || data.verdict || "—")}
        </div>
        ${data.stated ? `<div style="font-size:12px;line-height:1.5;margin-bottom:3px;color:${T.ink};"><strong style="font-weight:600;">JD states:</strong> ${esc(data.stated)}</div>` : ""}
        ${data.marketEstimate ? `<div style="font-size:12px;line-height:1.5;margin-bottom:6px;color:${T.ink};"><strong style="font-weight:600;">Market estimate:</strong> ${esc(data.marketEstimate)}</div>` : ""}
        ${data.note ? `<div style="color:${T.inkMute};font-size:12px;line-height:1.5;">${esc(data.note)}</div>` : ""}
        <div style="color:${T.inkFaint};font-size:10px;margin-top:7px;">Estimate from the model's general knowledge — not live market data.</div>
      </div>`;
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
      lastJdText = jd.text; // enable the Advanced cards to reuse this JD
      renderResult(panel, resp.data, jd);
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
      "padding:10px 16px", "border:none", "border-radius:10px",
      `font:600 13px/1 ${T.font}`, "letter-spacing:-0.01em",
      `color:#fff`, `background:${T.ink}`, "cursor:pointer",
      "box-shadow:0 8px 24px -6px rgba(24,24,27,0.4)",
      "transition:transform 120ms ease, background 120ms ease"
    ].join(";");
    btn.addEventListener("mouseenter", () => { btn.style.background = T.accent; btn.style.transform = "translateY(-1px)"; });
    btn.addEventListener("mouseleave", () => { btn.style.background = T.ink; btn.style.transform = "none"; });
    btn.addEventListener("click", onClick);
    document.body.appendChild(btn);
  }

  function removeLauncher() {
    document.getElementById(BTN_ID)?.remove();
  }

  // ============== SPA-aware mounting ==============
  // LinkedIn is a single-page app: navigating between jobs (or in from the feed)
  // does NOT reload the page, so the content script only runs once. We watch for
  // client-side navigations and show/hide the launcher accordingly — the user
  // never has to refresh the page.

  function isJobPage() {
    return /\/jobs\//.test(location.pathname) ||
           new URLSearchParams(location.search).has("currentJobId");
  }

  // Identifies "which job" we're on, so we can tell a real job change apart from
  // LinkedIn's noisy spurious pushState calls (filters, tracking params, etc.).
  function jobKey() {
    const m = location.pathname.match(/\/jobs\/view\/(\d+)/);
    if (m) return "view:" + m[1];
    const cj = new URLSearchParams(location.search).get("currentJobId");
    if (cj) return "current:" + cj;
    return location.pathname;
  }

  let lastJobKey = jobKey();

  function syncLauncher() {
    if (isJobPage()) injectLauncher();
    else removeLauncher();
  }

  function onLocationChange() {
    const key = jobKey();
    if (key !== lastJobKey) {
      // Moved to a different job (or off jobs entirely): the open panel and the
      // cached JD are now stale — drop them so nothing shows wrong data.
      lastJobKey = key;
      closePanel();
      lastJdText = null;
    }
    syncLauncher();
  }

  // Detect SPA navigation: patch history.pushState/replaceState + listen to popstate.
  (function watchSpaNav() {
    const fire = () => window.dispatchEvent(new Event("jda:locationchange"));
    for (const method of ["pushState", "replaceState"]) {
      const original = history[method];
      history[method] = function (...args) {
        const result = original.apply(this, args);
        fire();
        return result;
      };
    }
    window.addEventListener("popstate", fire);
    let debounce = null;
    window.addEventListener("jda:locationchange", () => {
      clearTimeout(debounce);
      debounce = setTimeout(onLocationChange, 300); // LinkedIn fires several in a row
    });
  })();

  syncLauncher();
})();
