# Privacy Policy — JD Analyzer

**Last updated:** May 2026

JD Analyzer ("the extension", "we") is a Chrome browser extension that helps job seekers analyze job descriptions against their resume using AI. This document explains what data we handle and how.

## TL;DR

- **We do not collect, store, or transmit your data to our servers.**
- All your data lives **only in your local browser**.
- Your resume and JD text are sent **directly** to the AI provider you choose (Anthropic or OpenAI).
- No analytics, no tracking, no telemetry.

## What Data the Extension Handles

| Data | Where it's stored | Where it's sent |
|---|---|---|
| Resume text (parsed from your uploaded file) | `chrome.storage.local` (your browser) | Your chosen AI provider's API |
| Job description text (pasted by you) | Memory only (cleared when popup closes) | Your chosen AI provider's API |
| API key (Claude or OpenAI) | `chrome.storage.local` (your browser) | The corresponding provider's API for authentication |
| Analysis results, generated cover letters, etc. | Memory only (cleared when popup closes) | Not sent anywhere |

## What We DO NOT Do

- ❌ We do not run any backend server.
- ❌ We do not collect telemetry, analytics, or usage statistics.
- ❌ We do not transmit your resume, API key, or any other data to any server controlled by us.
- ❌ We do not sell, share, or rent your data to anyone.
- ❌ We do not place ads in the extension.

## Third-Party Services

When you click "Analyze" or generate any AI output, the extension makes a direct HTTPS request from your browser to the API provider you configured:

- **Anthropic (Claude)** — see [Anthropic's Privacy Policy](https://www.anthropic.com/legal/privacy)
- **OpenAI** — see [OpenAI's Privacy Policy](https://openai.com/policies/privacy-policy)

Your resume and the JD text are included in these requests. You should review the privacy policy of whichever provider you choose.

## Permissions Used

- `storage` — to save your settings (API key, resume, model preference) locally in your browser.
- `host_permissions` for `api.anthropic.com` and `api.openai.com` — to send analysis requests directly from your browser to these providers.

The extension does **not** request permissions for `<all_urls>` and does **not** read or modify any web pages you visit.

## File Parsing

When you upload a PDF, DOCX, or TXT resume:

- The file is parsed entirely **inside your browser** using bundled libraries (pdf.js, mammoth.js).
- The original file is never uploaded anywhere.
- Only the extracted text is stored locally.

## Your Rights

You can delete all locally stored data at any time by:

1. Right-click the JD Analyzer icon → "Remove from Chrome", or
2. Going to `chrome://extensions/` → JD Analyzer → "Remove", or
3. Opening Settings ⚙️ → manually clearing the API key field and the resume field, then saving.

Removing the extension wipes all `chrome.storage.local` data associated with it.

## Changes to This Policy

If we ever change how data is handled, we will update this document and bump the "Last updated" date. Material changes will be announced in the extension's release notes.

## Contact

If you have questions, please open an issue on GitHub:
https://github.com/aarontao/jd-analyzer/issues

---

*This extension is open source. You can verify all of the above by reading the source code.*
