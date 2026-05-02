# JD Analyzer

> Match your resume to any job in seconds. Score, cover letter, resume tips, interview prep — powered by Claude or OpenAI, all in your browser.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Chrome](https://img.shields.io/badge/Chrome-MV3-green.svg)](manifest.json)
[![Privacy](https://img.shields.io/badge/Privacy-Local--First-success.svg)](PRIVACY.md)

A privacy-first Chrome extension for job seekers. Upload your resume, paste any job description, and get an actionable analysis powered by your own AI provider — no backend, no tracking, no ads.

## ✨ Features

- 📊 **Match Score (0-100)** with transparent 4-dimension rubric
- 📌 **Keyword Extraction** — top skills/tools from the JD
- ✅ **Strength Analysis** — what aligns
- 📉 **Skill Gap Detection** with priority and concrete remediation
- ✍️ **Cover Letter** — streamed in English, 3 paragraphs, copy-ready
- 📝 **Resume Optimization Tips** — line-by-line rewrite suggestions + ATS score
- 🎤 **Interview Question Prediction** — 8 technical + 2 behavioral with hints

## 🔒 Privacy

- All data lives **only in your browser** (`chrome.storage.local`)
- Resume and JD text sent **directly** to your chosen AI provider
- No backend, no analytics, no tracking, no ads
- Open source — you can verify everything

See [PRIVACY.md](PRIVACY.md) for details.

## 🚀 Install

### From Chrome Web Store (recommended)

*(coming soon)*

### Developer Mode (manual install)

1. Download the latest release `.zip` and unzip
2. Open `chrome://extensions/`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** → select the unzipped folder

## ⚙️ Setup

1. Click the JD Analyzer icon → ⚙️ **Settings**
2. Choose your AI provider:
   - **Claude** — get an API key at [console.anthropic.com](https://console.anthropic.com/settings/keys)
   - **OpenAI** — get an API key at [platform.openai.com](https://platform.openai.com/api-keys)
3. Upload your resume (PDF / DOCX / TXT / MD)
4. Save

A typical analysis costs **$0.01–0.03** on your provider account.

## 📖 Usage

1. On any job site, **select the JD text → Cmd/Ctrl+C**
2. Click the JD Analyzer icon → **paste** → **Analyze**
3. Review the score and breakdown
4. Switch tabs as needed:
   - **Cover Letter** — streamed English cover letter
   - **Resume Tips** — concrete rewrites
   - **Interview** — predicted questions

## 🏗️ Architecture

```
jd-analyzer/
├── manifest.json              # MV3 config
├── background.js              # Service Worker, AI router
├── popup.html / .css / .js    # Main popup with tabs
├── options.html / .css / .js  # Settings + file upload
├── lib/
│   ├── claudeProvider.js      # Claude API + SSE streaming
│   ├── openaiProvider.js      # OpenAI API + SSE streaming
│   ├── prompts.js             # 4 prompt templates
│   ├── resumeParser.js        # PDF/DOCX/TXT parsing
│   └── errors.js              # Centralized error classification
├── vendor/
│   ├── pdf.min.mjs            # pdf.js (Mozilla)
│   ├── pdf.worker.min.mjs
│   └── mammoth.browser.min.js # DOCX parsing
└── icons/
```

## 🛠️ Tech Highlights

- **Manifest V3** Service Worker architecture
- **Adapter pattern** for multi-provider AI abstraction
- **Server-Sent Events (SSE)** streaming for long-text generation
- **Fully client-side document parsing** — privacy-preserving
- **Rubric-based scoring** to mitigate LLM output instability
- **Low temperature (T=0.2)** for reproducible scores
- **Auto JSON-retry** when AI returns malformed output
- **Categorized error handling** with actionable recovery hints

## 🗺️ Roadmap

- [ ] Multi-resume profiles (frontend / backend / fullstack variants)
- [ ] Job application tracker (status, follow-ups, reminders)
- [ ] Auto-extraction from LinkedIn / Seek pages
- [ ] Export cover letter as formatted PDF
- [ ] Dark mode
- [ ] Localization (zh-CN, ja, etc.)
- [ ] Mock interview chat mode

## 🤝 Contributing

PRs welcome. For major changes, open an issue first.

```bash
git clone https://github.com/aarontao/jd-analyzer.git
cd jd-analyzer
# Load unpacked into Chrome
```

## 📄 License

MIT — see [LICENSE](LICENSE).

This software bundles:
- [pdf.js](https://github.com/mozilla/pdf.js) (Apache 2.0)
- [mammoth.js](https://github.com/mwilliamson/mammoth.js) (BSD-2-Clause)

## 👤 Author

Aaron Tao — [GitHub](https://github.com/aarontao)

---

Built in Melbourne · 2026 · ☕
