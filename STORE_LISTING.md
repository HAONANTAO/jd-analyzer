# Chrome Web Store Listing Content

Copy-paste this when submitting to https://chrome.google.com/webstore/devconsole/

---

## Item Name (max 75 chars)

```
JD Analyzer — AI Resume & JD Match
```

(36 chars ✓)

---

## Short Description (max 132 chars)

```
Match your resume to any job in seconds. Get score, gaps, cover letter, resume tips & interview questions.
```

(108 chars ✓)

---

## Detailed Description (max 16,000 chars)

```
Tired of spending hours tailoring your resume for each job application?

JD Analyzer is a privacy-first Chrome extension that helps job seekers analyze any job description against their resume — instantly. Powered by Claude or OpenAI, all data stays in your browser.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 WHAT YOU GET WITH ONE CLICK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Match Score (0-100)
A transparent 4-dimension rubric scores your fit:
• Skills match (40 points)
• Experience level (25 points)
• Industry relevance (20 points)
• Soft skills & culture fit (15 points)

You see exactly where each point comes from — no black box.

📌 JD Keyword Extraction
Identifies the 8-12 most important skills, tools, and concepts from the JD.

✅ Strengths Analysis
Highlights what in your resume aligns strongly with the role.

📉 Gap Detection
Flags missing skills with priority (high/medium/low) and concrete suggestions to bridge each one.

✍️ Cover Letter Generator
Three concise paragraphs in clean English. Streamed in real-time with a typewriter effect. One-click copy.

📝 Resume Optimization Tips
Get 4-6 specific rewrite suggestions — not vague advice. Each tip shows the exact text to change and the better version, plus an ATS-friendliness score.

🎤 Interview Question Prediction
Predicts 8 technical + 2 behavioral questions you're likely to face, complete with difficulty labels and answer hints.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒 PRIVACY-FIRST DESIGN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Your resume, JD text, and API key are stored ONLY in your local browser
• Never transmitted to our servers (we don't have any)
• PDF and DOCX files are parsed entirely in your browser
• No analytics, no tracking, no ads

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔌 BRING YOUR OWN AI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Choose between Claude (Anthropic) and OpenAI (GPT). You provide your own API key — no subscription, no middleman fees. A typical analysis costs $0.01-0.03 on your provider account.

Get a Claude API key: https://console.anthropic.com/
Get an OpenAI API key: https://platform.openai.com/

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 HOW TO USE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Open Settings — choose your AI provider, paste API key, upload resume (PDF/DOCX/TXT)
2. On any job site (LinkedIn, Seek, Indeed, company pages...), copy the JD
3. Click the JD Analyzer icon → paste → Analyze
4. Review score, then generate cover letter / tips / interview questions as needed

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📂 SUPPORTED RESUME FORMATS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• PDF (text-based, not scanned)
• DOCX (Microsoft Word)
• TXT / MD

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 TIPS FOR BEST RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Use a focused, well-formatted resume (1-2 pages)
• Paste the full JD including responsibilities and requirements
• Try the "Resume Tips" tab to identify quick wins before applying

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛠️ OPEN SOURCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The full source code is on GitHub. You can verify the privacy claims, contribute, or fork.

GitHub: https://github.com/aarontao/jd-analyzer

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📧 SUPPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Found a bug? Have a feature request? Open an issue:
https://github.com/aarontao/jd-analyzer/issues
```

---

## Category

Productivity

---

## Language

English (Primary)

---

## Permissions Justification (asked during review)

**`storage`**
"Used to save the user's API key, resume text, model preference, and onboarding state locally in chrome.storage.local. No data leaves the user's browser via storage."

**Host permission `https://api.anthropic.com/*`**
"Required to send analysis requests directly from the browser to Anthropic's Claude API when the user has selected Claude as their AI provider. The user provides their own API key."

**Host permission `https://api.openai.com/*`**
"Required to send analysis requests directly from the browser to OpenAI's API when the user has selected OpenAI as their AI provider. The user provides their own API key."

---

## Single Purpose Description

(Chrome Web Store requires a "single purpose" statement. Use this:)

"JD Analyzer helps job seekers compare their resume to any job description using AI, providing match scoring, gap analysis, cover letter generation, resume optimization tips, and interview question prediction — all using the user's own AI provider API key."

---

## Privacy Policy URL

You need to host PRIVACY.md somewhere public. Recommended: GitHub Pages.

Steps:
1. Push your repo to GitHub: `https://github.com/aarontao/jd-analyzer`
2. Settings → Pages → enable Pages from `main` branch
3. Privacy Policy URL becomes: `https://aarontao.github.io/jd-analyzer/PRIVACY.html`

(Or just the raw .md URL on GitHub also works:
`https://github.com/aarontao/jd-analyzer/blob/main/PRIVACY.md`)
