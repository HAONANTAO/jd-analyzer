// lib/resumeParser.js
// Resume parser, supports PDF/DOCX/TXT/MD

import * as pdfjsLib from "../vendor/pdf.min.mjs";

// Configure pdf.js worker path (Chrome extensions need absolute URL)
pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("vendor/pdf.worker.min.mjs");

/**
 * Parse a PDF buffer and extract all text
 * @param {ArrayBuffer} buffer
 * @returns {Promise<string>}
 */
async function parsePdf(buffer) {
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Join all text items with spaces
    const pageText = content.items
      .map(item => item.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push(pageText);
  }
  return pages.join("\n\n");
}

/**
 * Parse a DOCX buffer
 * @param {ArrayBuffer} buffer
 * @returns {Promise<string>}
 */
async function parseDocx(buffer) {
  // mammoth is a global from mammoth.browser.min.js
  if (typeof window.mammoth === "undefined") {
    throw new Error("mammoth.js not loaded. Please check the vendor directory.");
  }
  const result = await window.mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
}

/**
 * Parse plain text (TXT/MD)
 */
function parseText(buffer) {
  const decoder = new TextDecoder("utf-8");
  return decoder.decode(buffer);
}

/**
 * Main entry: routes to the right parser based on file extension
 * @param {File} file
 * @returns {Promise<{ text: string, fileName: string, fileType: string }>}
 */
export async function parseResumeFile(file) {
  const fileName = file.name;
  const lowerName = fileName.toLowerCase();
  const buffer = await file.arrayBuffer();

  let text;
  let fileType;

  if (lowerName.endsWith(".pdf")) {
    fileType = "pdf";
    text = await parsePdf(buffer);
  } else if (lowerName.endsWith(".docx")) {
    fileType = "docx";
    text = await parseDocx(buffer);
  } else if (lowerName.endsWith(".doc")) {
    throw new Error("Legacy .doc format is not supported. Please save as .docx or PDF and try again.");
  } else if (lowerName.endsWith(".txt") || lowerName.endsWith(".md")) {
    fileType = "text";
    text = parseText(buffer);
  } else {
    throw new Error(`Unsupported file format: ${fileName}\nSupported: .pdf / .docx / .txt / .md`);
  }

  // Cleanup: remove excessive blank lines
  text = text.replace(/\n{3,}/g, "\n\n").trim();

  if (text.length < 50) {
    throw new Error("Extracted text is too short (<50 characters). This may be a scanned PDF.\nPlease ensure the text is selectable, or use DOCX/TXT format instead.");
  }

  return { text, fileName, fileType };
}
