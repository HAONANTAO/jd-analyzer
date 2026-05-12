// lib/resumeParser.js
// Resume parser, supports PDF/DOCX/TXT/MD.
// Also surfaces structural ATS signals (columns, tables, images, embedded objects)
// so we can give an honest atsScore instead of one based purely on the flattened text.

import * as pdfjsLib from "../vendor/pdf.min.mjs";

// Configure pdf.js worker path (Chrome extensions need absolute URL)
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("vendor/pdf.worker.min.mjs");

/**
 * Detect multi-column layout in a single PDF page using x-position clustering.
 * Items are positioned via their transform matrix (idx 4 = x, 5 = y).
 * We bucket items by left-x and count how many distinct vertical "columns" exist.
 */
function detectColumnsForPage(items, pageWidth) {
  if (!items.length || !pageWidth) return 1;
  const xs = items.map(it => it.transform?.[4] ?? 0).filter(x => x >= 0 && x <= pageWidth);
  if (xs.length < 20) return 1;

  // Bucket by ~6% of page width
  const bucketSize = Math.max(pageWidth * 0.06, 20);
  const buckets = new Map();
  xs.forEach(x => {
    const b = Math.floor(x / bucketSize);
    buckets.set(b, (buckets.get(b) || 0) + 1);
  });

  // A "column start" is a bucket with at least 8% of items and noticeably more
  // than its left neighbour (so we don't count text that just happens to wrap).
  const total = xs.length;
  const minHits = Math.max(8, total * 0.08);
  const peakBuckets = [];
  for (const [b, count] of buckets) {
    if (count < minHits) continue;
    const leftCount = buckets.get(b - 1) || 0;
    if (count >= leftCount * 1.5) peakBuckets.push(b);
  }

  // Collapse adjacent peaks (e.g. b=5 and b=6 are the same column edge)
  peakBuckets.sort((a, b) => a - b);
  let cols = 0;
  let lastB = -10;
  for (const b of peakBuckets) {
    if (b - lastB > 1) cols++;
    lastB = b;
  }
  return Math.max(1, cols);
}

async function parsePdf(buffer) {
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages = [];
  let totalItems = 0;
  let maxColumnsAcrossPages = 1;
  let imageMarkerHits = 0;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    const cols = detectColumnsForPage(content.items, viewport.width);
    if (cols > maxColumnsAcrossPages) maxColumnsAcrossPages = cols;

    // Image-only pages or sections leave very few text items relative to page area.
    // We treat <10 text items on a "normal-sized" page as a strong image-only signal.
    if (content.items.length < 10 && viewport.width * viewport.height > 200_000) {
      imageMarkerHits++;
    }

    totalItems += content.items.length;
    const pageText = content.items
      .map(item => item.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push(pageText);
  }

  return {
    text: pages.join("\n\n"),
    atsSignals: {
      kind: "pdf",
      pages: pdf.numPages,
      columns: maxColumnsAcrossPages,
      imageOnlyPages: imageMarkerHits,
      hasTables: null,
      hasImages: imageMarkerHits > 0,
      textItemCount: totalItems
    }
  };
}

async function parseDocx(buffer) {
  if (typeof window === "undefined" || typeof window.mammoth === "undefined") {
    throw new Error("mammoth.js not loaded. Please check the vendor directory.");
  }
  // We do two passes: HTML for structural inspection, raw text for the model input.
  const html = await window.mammoth.convertToHtml({ arrayBuffer: buffer });
  const raw = await window.mammoth.extractRawText({ arrayBuffer: buffer });

  const htmlStr = html.value || "";
  const tables = (htmlStr.match(/<table[\s>]/gi) || []).length;
  const images = (htmlStr.match(/<img[\s>]/gi) || []).length;

  return {
    text: raw.value || "",
    atsSignals: {
      kind: "docx",
      pages: null,
      columns: null,
      imageOnlyPages: 0,
      hasTables: tables > 0,
      tableCount: tables,
      hasImages: images > 0,
      imageCount: images
    }
  };
}

function parseText(buffer) {
  const decoder = new TextDecoder("utf-8");
  return {
    text: decoder.decode(buffer),
    atsSignals: {
      kind: "text",
      pages: null,
      columns: 1,
      imageOnlyPages: 0,
      hasTables: false,
      hasImages: false
    }
  };
}

/**
 * Turn raw signals into a list of human-readable issues + a coarse 0–100 score.
 * This stays purely deterministic — the LLM does NOT decide ATS-friendliness any more,
 * it just gets these facts and rolls them into its analysis output.
 */
export function deriveAtsAssessment(signals) {
  if (!signals) return { score: null, issues: [] };

  const issues = [];
  let score = 100;

  if (signals.kind === "pdf") {
    if (signals.columns >= 2) {
      issues.push(`Multi-column layout (${signals.columns} columns detected) — many ATS parse this top-to-bottom and mangle the order.`);
      score -= 30;
    }
    if (signals.imageOnlyPages > 0) {
      issues.push(`${signals.imageOnlyPages} page(s) appear to be image-based — ATS cannot read them.`);
      score -= 25;
    }
    if (signals.textItemCount > 0 && signals.pages > 0 && signals.textItemCount / signals.pages < 40) {
      issues.push("Very low text density per page — may indicate icons, graphics, or text-as-image content.");
      score -= 10;
    }
  } else if (signals.kind === "docx") {
    if (signals.hasTables) {
      issues.push(`Document uses ${signals.tableCount} table(s) — most ATS flatten table cells into one line and lose structure.`);
      score -= 20;
    }
    if (signals.hasImages) {
      issues.push(`Document contains ${signals.imageCount} image(s) — ATS cannot read text inside images.`);
      score -= 10;
    }
  }

  if (issues.length === 0) {
    issues.push("No obvious structural ATS issues detected in the source file.");
  }

  return { score: Math.max(0, Math.min(100, score)), issues };
}

/**
 * Main entry: routes to the right parser based on file extension.
 * @param {File} file
 * @returns {Promise<{ text: string, fileName: string, fileType: string, atsSignals: object }>}
 */
export async function parseResumeFile(file) {
  const fileName = file.name;
  const lowerName = fileName.toLowerCase();
  const buffer = await file.arrayBuffer();

  let parsed;
  let fileType;

  if (lowerName.endsWith(".pdf")) {
    fileType = "pdf";
    parsed = await parsePdf(buffer);
  } else if (lowerName.endsWith(".docx")) {
    fileType = "docx";
    parsed = await parseDocx(buffer);
  } else if (lowerName.endsWith(".doc")) {
    throw new Error("Legacy .doc format is not supported. Please save as .docx or PDF and try again.");
  } else if (lowerName.endsWith(".txt") || lowerName.endsWith(".md")) {
    fileType = "text";
    parsed = parseText(buffer);
  } else {
    throw new Error(`Unsupported file format: ${fileName}\nSupported: .pdf / .docx / .txt / .md`);
  }

  // Cleanup: remove excessive blank lines
  const text = (parsed.text || "").replace(/\n{3,}/g, "\n\n").trim();

  if (text.length < 200) {
    throw new Error(
      `Extracted only ${text.length} characters — this is almost certainly a parse failure.\n\n` +
      `Common causes:\n` +
      `• Scanned PDF (image-based, no selectable text)\n` +
      `• Resume rendered as a single image\n` +
      `• Heavily styled DOCX with text in shapes/text-boxes\n\n` +
      `Fix: open the file, try selecting the text manually. If you can't select it, ` +
      `re-export from your editor as a text-based PDF, or save as .txt and try again.`
    );
  }

  return { text, fileName, fileType, atsSignals: parsed.atsSignals };
}
