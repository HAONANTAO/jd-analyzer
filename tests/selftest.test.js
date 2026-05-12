// Self-test for v1.2 changes.
// Static verification of:
//   - HTML IDs referenced by JS actually exist
//   - JS imports actually resolve to exports
//   - prompt builders return well-formed strings with key markers
//   - storage migration handles fresh/legacy/v3 inputs
//   - resumeParser ATS assessment scoring works for sample signals
//   - CSS classes referenced from JS exist somewhere in CSS

import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf-8");

// ============== Helpers ==============
function htmlIds(html) {
  const ids = new Set();
  const re = /\bid=["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(html))) ids.add(m[1]);
  return ids;
}
function jsGetElementByIds(js) {
  const ids = new Set();
  // matches getElementById("foo"), document.querySelector("#foo")
  const re1 = /getElementById\(["']([^"']+)["']\)/g;
  const re2 = /querySelector\(["']#([^"'\s>:.[\]]+)["']\)/g;
  let m;
  while ((m = re1.exec(js))) ids.add(m[1]);
  while ((m = re2.exec(js))) ids.add(m[1]);
  return ids;
}

function exportsOf(js) {
  const names = new Set();
  // export function foo / export const foo / export {foo, bar}
  const reFn = /export\s+(?:async\s+)?function\s+([a-zA-Z0-9_$]+)/g;
  const reConst = /export\s+const\s+([a-zA-Z0-9_$]+)/g;
  const reBlock = /export\s*\{\s*([^}]+)\s*\}/g;
  let m;
  while ((m = reFn.exec(js))) names.add(m[1]);
  while ((m = reConst.exec(js))) names.add(m[1]);
  while ((m = reBlock.exec(js))) {
    m[1].split(",").map(s => s.trim().split(/\s+as\s+/)[0]).forEach(s => names.add(s));
  }
  return names;
}

function namedImports(js, fromSpecifier) {
  // import { a, b } from "..."
  const re = new RegExp(`import\\s*\\{([^}]+)\\}\\s*from\\s*["'][^"']*${fromSpecifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "g");
  const out = new Set();
  let m;
  while ((m = re.exec(js))) {
    m[1].split(",").map(s => s.trim().split(/\s+as\s+/)[0]).forEach(s => out.add(s));
  }
  return out;
}

// ============== popup.html ↔ popup.js ID cross-reference ==============
describe("popup: every getElementById resolves to a real id", () => {
  const html = read("popup.html");
  const js = read("popup.js");
  const haveIds = htmlIds(html);
  const wantIds = jsGetElementByIds(js);
  const missing = [...wantIds].filter(id => !haveIds.has(id));

  it("no broken IDs", () => {
    expect(missing, `Missing in popup.html: ${missing.join(", ")}`).toEqual([]);
  });
});

describe("options: every getElementById resolves to a real id", () => {
  const html = read("options.html");
  const js = read("options.js");
  const haveIds = htmlIds(html);
  const wantIds = jsGetElementByIds(js);
  const missing = [...wantIds].filter(id => !haveIds.has(id));

  it("no broken IDs", () => {
    expect(missing, `Missing in options.html: ${missing.join(", ")}`).toEqual([]);
  });
});

// ============== Module imports actually exist ==============
describe("imports across files resolve", () => {
  const storage = exportsOf(read("lib/storage.js"));
  const prompts = exportsOf(read("lib/prompts.js"));
  const pricing = exportsOf(read("lib/pricing.js"));
  const parser = exportsOf(read("lib/resumeParser.js"));
  const errors = exportsOf(read("lib/errors.js"));
  const json = exportsOf(read("lib/json.js"));

  const popup = read("popup.js");
  const options = read("options.js");
  const background = read("background.js");

  it("popup.js imports from storage.js are real exports", () => {
    const want = namedImports(popup, "/storage.js");
    const missing = [...want].filter(n => !storage.has(n));
    expect(missing, `Missing: ${missing.join(", ")}`).toEqual([]);
  });

  it("options.js imports from storage.js are real exports", () => {
    const want = namedImports(options, "/storage.js");
    const missing = [...want].filter(n => !storage.has(n));
    expect(missing, `Missing: ${missing.join(", ")}`).toEqual([]);
  });

  it("options.js imports from resumeParser.js are real exports", () => {
    const want = namedImports(options, "/resumeParser.js");
    const missing = [...want].filter(n => !parser.has(n));
    expect(missing, `Missing: ${missing.join(", ")}`).toEqual([]);
  });

  it("background.js imports from storage.js are real exports", () => {
    const want = namedImports(background, "/storage.js");
    const missing = [...want].filter(n => !storage.has(n));
    expect(missing, `Missing: ${missing.join(", ")}`).toEqual([]);
  });

  it("background.js imports from prompts.js are real exports", () => {
    const want = namedImports(background, "/prompts.js");
    const missing = [...want].filter(n => !prompts.has(n));
    expect(missing, `Missing: ${missing.join(", ")}`).toEqual([]);
  });

  it("background.js imports from resumeParser.js are real exports", () => {
    const want = namedImports(background, "/resumeParser.js");
    const missing = [...want].filter(n => !parser.has(n));
    expect(missing, `Missing: ${missing.join(", ")}`).toEqual([]);
  });

  // sanity
  it("exports populated", () => {
    expect(storage.size).toBeGreaterThan(3);
    expect(prompts.size).toBeGreaterThan(3);
    expect(parser.size).toBeGreaterThan(0);
    expect(pricing.size).toBeGreaterThan(0);
    expect(errors.size).toBeGreaterThan(0);
    expect(json.size).toBeGreaterThan(0);
  });
});

// ============== Prompt builders ==============
describe("prompts produce well-formed strings", () => {
  let prompts;
  beforeEach(async () => {
    prompts = await import("../lib/prompts.js");
  });

  it("buildAnalyzePrompt in English includes the 6 rubric dimensions, skillsAudit and interviewLikelihood", () => {
    const p = prompts.buildAnalyzePrompt("resume text", "jd text", "en");
    expect(p).toMatch(/Core Skills \(35/);
    expect(p).toMatch(/Experience Level \(20/);
    expect(p).toMatch(/Education \/ Certifications \(10/);
    expect(p).toMatch(/Industry \/ Domain Relevance \(15/);
    expect(p).toMatch(/Location \/ Work Authorization \(10/);
    expect(p).toMatch(/Soft Skills.*\(10/);
    expect(p).toMatch(/skillsAudit/);
    expect(p).toMatch(/interviewLikelihood/);
    expect(p).toMatch(/learningResource/);
    expect(p).toMatch(/Use English for every explanation field/);
  });

  it("buildAnalyzePrompt in Chinese switches the explanation directive", () => {
    const p = prompts.buildAnalyzePrompt("resume", "jd", "zh");
    expect(p).toMatch(/使用简体中文/);
    expect(p).not.toMatch(/Use English for every explanation field/);
  });

  it("buildCoverLetterPrompt with no guidance still works", () => {
    const p = prompts.buildCoverLetterPrompt("resume", "jd", { strengths: ["a"], keywords: ["b"] });
    expect(p).toMatch(/cover letter IN ENGLISH/);
    expect(p).not.toMatch(/USER GUIDANCE/);
  });

  it("buildCoverLetterPrompt injects guidance when present", () => {
    const p = prompts.buildCoverLetterPrompt("resume", "jd", {}, "Emphasize Stripe work");
    expect(p).toMatch(/USER GUIDANCE/);
    expect(p).toMatch(/Emphasize Stripe work/);
  });

  it("buildResumeTipsPrompt embeds ATS pre-check when available", () => {
    const p = prompts.buildResumeTipsPrompt("resume", "jd", {}, { score: 70, issues: ["Multi-column"] }, "en");
    expect(p).toMatch(/Starting ATS score: 70\/100/);
    expect(p).toMatch(/Multi-column/);
  });

  it("buildResumeTipsPrompt falls back when no ATS check is provided", () => {
    const p = prompts.buildResumeTipsPrompt("resume", "jd", {}, null, "en");
    expect(p).toMatch(/Not available — derive atsScore/);
  });

  it("buildInterviewPrompt accepts lang", () => {
    const en = prompts.buildInterviewPrompt("r", "j", {}, "en");
    const zh = prompts.buildInterviewPrompt("r", "j", {}, "zh");
    expect(en).toMatch(/Use English/);
    expect(zh).toMatch(/简体中文/);
  });
});

// ============== Storage migration ==============
describe("storage v2 → v3 migration", () => {
  let mockStore;

  beforeEach(() => {
    mockStore = {};
    globalThis.chrome = {
      storage: {
        local: {
          get: async (keys) => {
            if (keys === null || keys === undefined) return { ...mockStore };
            if (Array.isArray(keys)) {
              const out = {};
              for (const k of keys) if (k in mockStore) out[k] = mockStore[k];
              return out;
            }
            if (typeof keys === "string") {
              return keys in mockStore ? { [keys]: mockStore[keys] } : {};
            }
            return {};
          },
          set: async (patch) => {
            Object.assign(mockStore, patch);
          }
        }
      }
    };
  });

  it("fresh install: creates empty resumes[] and no active id", async () => {
    const { ensureMigrated, getResumes } = await import("../lib/storage.js?fresh");
    await ensureMigrated();
    const { resumes, activeResumeId } = await getResumes();
    expect(resumes).toEqual([]);
    expect(activeResumeId).toBeNull();
    expect(mockStore.schemaVersion).toBe(3);
  });

  it("legacy user with resume string gets wrapped + activated", async () => {
    mockStore.schemaVersion = 2;
    mockStore.resume = "Aaron Tao\nSenior Engineer\n10 years experience...";
    mockStore.resumeFileName = "aaron_v3.pdf";
    mockStore.resumeUpdatedAt = 1700000000000;

    const { ensureMigrated, getResumes, getActiveResume } = await import("../lib/storage.js?legacy");
    await ensureMigrated();
    const { resumes, activeResumeId } = await getResumes();
    expect(resumes).toHaveLength(1);
    expect(resumes[0].content).toBe(mockStore.resume);
    expect(resumes[0].label).toBe("aaron_v3"); // extension stripped
    expect(resumes[0].fileName).toBe("aaron_v3.pdf");
    expect(resumes[0].updatedAt).toBe(1700000000000);
    expect(activeResumeId).toBe(resumes[0].id);
    expect(mockStore.schemaVersion).toBe(3);

    const active = await getActiveResume();
    expect(active.id).toBe(resumes[0].id);
  });

  it("v3 user is left untouched (idempotent)", async () => {
    mockStore.schemaVersion = 3;
    mockStore.resumes = [{ id: "r_existing", label: "Existing", content: "x".repeat(300), updatedAt: 1 }];
    mockStore.activeResumeId = "r_existing";

    const { ensureMigrated, getResumes } = await import("../lib/storage.js?v3");
    await ensureMigrated();
    const { resumes, activeResumeId } = await getResumes();
    expect(resumes).toHaveLength(1);
    expect(resumes[0].id).toBe("r_existing");
    expect(activeResumeId).toBe("r_existing");
  });
});

// ============== Resume CRUD ==============
describe("resume upsert / delete / setActive", () => {
  let mockStore;
  beforeEach(() => {
    mockStore = { schemaVersion: 3, resumes: [], activeResumeId: null };
    globalThis.chrome = {
      storage: {
        local: {
          get: async (keys) => {
            if (Array.isArray(keys)) {
              const out = {};
              for (const k of keys) if (k in mockStore) out[k] = mockStore[k];
              return out;
            }
            return keys in mockStore ? { [keys]: mockStore[keys] } : {};
          },
          set: async (patch) => { Object.assign(mockStore, patch); }
        }
      }
    };
  });

  it("creates, lists, activates, then deletes", async () => {
    const mod = await import("../lib/storage.js?crud");
    const { upsertResume, getResumes, setActiveResume, deleteResume } = mod;

    const a = await upsertResume({ label: "Frontend", content: "react ts" });
    const b = await upsertResume({ label: "Backend", content: "go postgres" });
    expect(a.id).not.toBe(b.id);

    await setActiveResume(b.id);
    let state = await getResumes();
    expect(state.resumes).toHaveLength(2);
    expect(state.activeResumeId).toBe(b.id);

    // editing existing
    await upsertResume({ id: a.id, label: "Frontend (TS)" });
    state = await getResumes();
    expect(state.resumes.find(r => r.id === a.id).label).toBe("Frontend (TS)");

    // delete active → second one becomes active automatically
    await deleteResume(b.id);
    state = await getResumes();
    expect(state.resumes).toHaveLength(1);
    expect(state.activeResumeId).toBe(a.id);
  });
});

// ============== ATS assessment ==============
describe("deriveAtsAssessment", () => {
  let derive;
  beforeEach(async () => {
    // resumeParser imports pdf.js + uses chrome.runtime.getURL at module load
    globalThis.chrome = { runtime: { getURL: (p) => p } };
    const mod = await import("../lib/resumeParser.js?ats");
    derive = mod.deriveAtsAssessment;
  });

  it("returns null score when given no signals", () => {
    const r = derive(null);
    expect(r.score).toBeNull();
    expect(r.issues).toEqual([]);
  });

  it("clean PDF: full marks", () => {
    const r = derive({ kind: "pdf", columns: 1, imageOnlyPages: 0, pages: 2, textItemCount: 400 });
    expect(r.score).toBe(100);
    expect(r.issues[0]).toMatch(/No obvious structural ATS issues/);
  });

  it("2-column PDF: heavy penalty", () => {
    const r = derive({ kind: "pdf", columns: 2, imageOnlyPages: 0, pages: 2, textItemCount: 400 });
    expect(r.score).toBe(70);
    expect(r.issues.some(s => /Multi-column/.test(s))).toBe(true);
  });

  it("image-only page is flagged", () => {
    const r = derive({ kind: "pdf", columns: 1, imageOnlyPages: 1, pages: 2, textItemCount: 400 });
    expect(r.score).toBe(75);
    expect(r.issues.some(s => /image-based/.test(s))).toBe(true);
  });

  it("DOCX with tables and images", () => {
    const r = derive({ kind: "docx", hasTables: true, tableCount: 3, hasImages: true, imageCount: 1 });
    expect(r.score).toBe(70);
    expect(r.issues.some(s => /table/.test(s))).toBe(true);
    expect(r.issues.some(s => /image/.test(s))).toBe(true);
  });

  it("plain text: full marks", () => {
    const r = derive({ kind: "text", columns: 1, hasTables: false, hasImages: false });
    expect(r.score).toBe(100);
  });
});

// ============== jdPicker public surface ==============
describe("jdPicker module", () => {
  it("exports a startJdPicker function", async () => {
    // Module body references chrome.* / window / document at call time only;
    // importing it should be safe.
    globalThis.chrome = { storage: { local: { set: () => {} } } };
    globalThis.window = {};
    const mod = await import("../lib/jdPicker.js?picker");
    expect(typeof mod.startJdPicker).toBe("function");
  });

  it("popup.js imports startJdPicker", () => {
    const popupJs = read("popup.js");
    expect(popupJs).toMatch(/import\s*\{[^}]*startJdPicker[^}]*\}\s*from\s*["'][^"']*jdPicker/);
  });

  it("popup.html has the pick-jd-btn element", () => {
    const html = read("popup.html");
    expect(html).toMatch(/id=["']pick-jd-btn["']/);
  });
});

// ============== CSS class references from JS exist in CSS ==============
describe("CSS classes referenced from JS exist in CSS", () => {
  const popupJs = read("popup.js");
  const popupCss = read("popup.css");
  const popupHtml = read("popup.html");

  // Collect class tokens referenced from JS via classList.add/remove/toggle/className/innerHTML
  function jsReferencedClasses(js) {
    const out = new Set();
    const re1 = /classList\.(?:add|remove|toggle)\(["']([^"']+)["']/g;
    const re2 = /className\s*=\s*["']([^"']+)["']/g;
    const re3 = /["']([a-zA-Z][a-zA-Z0-9_-]*(?:\s+[a-zA-Z][a-zA-Z0-9_-]*)*)["']/g;
    let m;
    while ((m = re1.exec(js))) m[1].split(/\s+/).forEach(c => out.add(c));
    while ((m = re2.exec(js))) m[1].split(/\s+/).forEach(c => out.add(c));
    return out;
  }
  function cssDefinedClasses(css) {
    const out = new Set();
    const re = /\.([a-zA-Z][a-zA-Z0-9_-]*)/g;
    let m;
    while ((m = re.exec(css))) out.add(m[1]);
    return out;
  }
  function htmlClasses(html) {
    const out = new Set();
    const re = /\bclass=["']([^"']+)["']/g;
    let m;
    while ((m = re.exec(html))) m[1].split(/\s+/).forEach(c => out.add(c));
    return out;
  }

  it("popup CSS defines (or HTML uses) all class names that JS adds/toggles", () => {
    const referenced = jsReferencedClasses(popupJs);
    const cssClasses = cssDefinedClasses(popupCss);
    const htmlOnly = htmlClasses(popupHtml);
    // Things that are dynamic states like "hidden", "active", "streaming" are also in HTML; allow either.
    const missing = [...referenced].filter(c => c && !cssClasses.has(c) && !htmlOnly.has(c));
    // Exclusions: control words that are not CSS-styled (rare)
    const allowed = new Set([]);
    const real = missing.filter(c => !allowed.has(c));
    expect(real, `Unknown classes used from popup.js: ${real.join(", ")}`).toEqual([]);
  });
});
