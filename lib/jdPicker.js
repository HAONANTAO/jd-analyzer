// lib/jdPicker.js
// Pure function injected into the active tab via chrome.scripting.executeScript.
// Same MV3 caveats as jdExtractor.js: no closures, no imports — everything
// the picker needs must live inside the function body.

/**
 * Start an interactive click-to-pick session on the active page.
 *   - Highlights the element under the cursor with a coloured outline.
 *   - On click, captures the element's innerText and saves it to chrome.storage.local
 *     under `pendingJdText` (consumed by popup.js on its next open).
 *   - ESC cancels.
 *   - Idempotent — calling twice does nothing.
 */
export function startJdPicker() {
  if (window.__jdaPickerActive) {
    return { status: "already_active" };
  }
  window.__jdaPickerActive = true;

  const OUTLINE = document.createElement("div");
  Object.assign(OUTLINE.style, {
    position: "fixed",
    pointerEvents: "none",
    border: "2px solid #0a66c2",
    background: "rgba(10, 102, 194, 0.12)",
    zIndex: "2147483646",
    transition: "top 0.04s, left 0.04s, width 0.04s, height 0.04s",
    boxSizing: "border-box",
    display: "none"
  });

  const BANNER = document.createElement("div");
  Object.assign(BANNER.style, {
    position: "fixed",
    top: "16px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: "2147483647",
    background: "#0a66c2",
    color: "#fff",
    padding: "10px 18px",
    borderRadius: "8px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: "13px",
    fontWeight: "500",
    boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
    pointerEvents: "none",
    whiteSpace: "nowrap",
    maxWidth: "90vw",
    overflow: "hidden",
    textOverflow: "ellipsis"
  });

  const setBanner = (text, bg = "#0a66c2") => {
    BANNER.textContent = text;
    BANNER.style.background = bg;
  };
  setBanner("👆 Click the JD area on this page · ESC to cancel");

  document.body.appendChild(OUTLINE);
  document.body.appendChild(BANNER);

  let currentEl = null;

  function moveOutlineTo(el) {
    if (!el || el === BANNER || el === OUTLINE) {
      OUTLINE.style.display = "none";
      currentEl = null;
      return;
    }
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) {
      OUTLINE.style.display = "none";
      currentEl = null;
      return;
    }
    OUTLINE.style.display = "block";
    OUTLINE.style.top = r.top + "px";
    OUTLINE.style.left = r.left + "px";
    OUTLINE.style.width = r.width + "px";
    OUTLINE.style.height = r.height + "px";
    currentEl = el;

    // Live preview of text length in banner
    const len = (el.innerText || "").trim().length;
    if (len < 200) {
      setBanner(`👆 ${len} chars — keep zooming out · ESC to cancel`, "#0a66c2");
    } else {
      setBanner(`✓ ${len.toLocaleString()} chars · click to capture · ESC to cancel`, "#16a34a");
    }
  }

  function onMouseMove(e) {
    // Hide outline first so elementFromPoint doesn't return it
    const prevDisplay = OUTLINE.style.display;
    OUTLINE.style.display = "none";
    const el = document.elementFromPoint(e.clientX, e.clientY);
    OUTLINE.style.display = prevDisplay;
    moveOutlineTo(el);
  }

  function pickElement(el) {
    const text = (el?.innerText || "").trim();
    if (text.length < 100) {
      setBanner(`⚠️ Only ${text.length} chars — pick a larger area · ESC to cancel`, "#d97706");
      return;
    }
    cleanup();
    chrome.storage.local.set({
      pendingJdText: text,
      pendingJdSource: "click-to-pick",
      pendingJdAt: Date.now()
    }, () => {
      const success = document.createElement("div");
      Object.assign(success.style, BANNER.style, {
        background: "#16a34a",
        zIndex: "2147483647"
      });
      success.textContent = `✓ Captured ${text.length.toLocaleString()} chars · Reopen JD Analyzer to use`;
      document.body.appendChild(success);
      setTimeout(() => success.remove(), 4500);
    });
  }

  function onClickCapture(e) {
    if (!currentEl) return;
    if (currentEl === BANNER || currentEl === OUTLINE) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    pickElement(currentEl);
  }

  // Some links navigate on mousedown — intercept it too.
  function onMouseDownCapture(e) {
    if (!currentEl) return;
    if (currentEl === BANNER || currentEl === OUTLINE) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  function onKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();
      cleanup();
      const cancelled = document.createElement("div");
      Object.assign(cancelled.style, BANNER.style, {
        background: "#6b7280",
        zIndex: "2147483647"
      });
      cancelled.textContent = "Cancelled.";
      document.body.appendChild(cancelled);
      setTimeout(() => cancelled.remove(), 1500);
    }
  }

  function cleanup() {
    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("click", onClickCapture, true);
    document.removeEventListener("mousedown", onMouseDownCapture, true);
    document.removeEventListener("keydown", onKey, true);
    OUTLINE.remove();
    BANNER.remove();
    window.__jdaPickerActive = false;
  }

  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("click", onClickCapture, true);
  document.addEventListener("mousedown", onMouseDownCapture, true);
  document.addEventListener("keydown", onKey, true);

  return { status: "started" };
}
