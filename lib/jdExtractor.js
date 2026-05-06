// lib/jdExtractor.js
// Pure function injected into job-board pages via chrome.scripting.executeScript.
// IMPORTANT: this function is serialized to a string and re-injected, so it
// must NOT reference any module-scope variables, imports, or closures —
// everything it needs must live inside the body.

/**
 * Extract a job description from the current page.
 * Returns { text, source } or null when nothing usable was found.
 */
export function extractJDFromPage() {
  const SITE_RULES = [
    {
      match: "linkedin.com",
      selectors: [
        ".jobs-description__content .jobs-box__html-content",
        ".jobs-description__content",
        ".show-more-less-html__markup"
      ]
    },
    {
      match: "seek.com",
      selectors: ['[data-automation="jobAdDetails"]']
    },
    {
      match: "indeed.com",
      selectors: ["#jobDescriptionText"]
    },
    {
      match: "lever.co",
      selectors: [".section-wrapper.posting-page", ".content"]
    },
    {
      match: "greenhouse.io",
      selectors: ["#content #app_body", "#content"]
    },
    {
      match: "ashbyhq.com",
      selectors: ['[class*="JobPosting"]', "main"]
    },
    {
      match: "workable.com",
      selectors: ['[data-ui="job-description"]']
    },
    {
      match: "glassdoor.com",
      selectors: ['[class*="JobDetails_jobDescription"]', "#JobDescriptionContainer"]
    }
  ];

  const host = location.hostname;
  const pickText = (el) => (el?.innerText || "").trim();

  // 1) Site-specific selectors
  for (const rule of SITE_RULES) {
    if (!host.includes(rule.match)) continue;
    for (const sel of rule.selectors) {
      const el = document.querySelector(sel);
      const text = pickText(el);
      if (text.length >= 200) {
        return { text, source: rule.match };
      }
    }
  }

  // 2) User selection (works as override on any site)
  const selection = (window.getSelection?.().toString() || "").trim();
  if (selection.length >= 200) {
    return { text: selection, source: "selection" };
  }

  // 3) Generic fallbacks: <main>, <article>, [role=main]
  const generic = ["main", "article", "[role='main']"];
  for (const sel of generic) {
    const el = document.querySelector(sel);
    const text = pickText(el);
    if (text.length >= 500) {
      return { text, source: "generic" };
    }
  }

  return null;
}
