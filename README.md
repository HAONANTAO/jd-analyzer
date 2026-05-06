# JD Analyzer

> Match your resume to any job in seconds. Score, cover letter, resume tips, interview prep — powered by Claude or OpenAI, all in your browser.

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Install-blue?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/ohoogdbggeapnlmhlimpffomihldkcba)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Chrome](https://img.shields.io/badge/Chrome-MV3-green.svg)](manifest.json)
[![Privacy](https://img.shields.io/badge/Privacy-Local--First-success.svg)](PRIVACY.md)

![JD Analyzer demo](demo.gif)

A privacy-first Chrome extension for job seekers. Open any job posting, click *Auto-fill*, and get an actionable analysis powered by your own AI provider — no backend, no tracking, no ads.

## ✨ Features

**Analysis**
- 📊 **Match Score (0-100)** with a transparent 4-dimension rubric (skills · experience · industry · soft skills)
- 📌 **Keyword Extraction** — top skills/tools from the JD
- ✅ **Strength Analysis** — what aligns
- 📉 **Skill Gap Detection** with priority and concrete remediation

**Generators**
- ✍️ **Cover Letter** — streamed in English, 3 paragraphs, copy-ready
- 📝 **Resume Optimization Tips** — line-by-line rewrites + ATS-friendliness score
- 🎤 **Interview Prediction** — 8 technical + 2 behavioral questions with hints

**Workflow** *(new in v1.1)*
- 📋 **One-click JD auto-fill** from LinkedIn, Seek, Indeed, Lever, Greenhouse, Ashby, Workable, Glassdoor (plus selection + generic fallbacks)
- 🕒 **Recent analyses** — last 5 analyses saved locally; click to revisit instantly
- 💰 **Cost transparency** — exact USD cost + token counts after every call
- 🔔 **Resume staleness reminder** when the saved resume is older than 90 days

## 🔒 Privacy

- All data lives **only in your browser** (`chrome.storage.local`)
- Resume and JD text sent **directly** to your chosen AI provider
- No backend, no analytics, no tracking, no ads
- Open source — you can verify everything

See [PRIVACY.md](PRIVACY.md) for details.

## 🚀 Install

### From Chrome Web Store (recommended)

👉 **[Install from Chrome Web Store](https://chromewebstore.google.com/detail/ohoogdbggeapnlmhlimpffomihldkcba)**

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

1. Open a job posting on any site (LinkedIn / Seek / Indeed / company careers page…)
2. Click the JD Analyzer icon → **📋 Auto-fill from this tab** *(or paste manually)* → **Analyze**
3. Review the score, breakdown, and per-call cost
4. Switch tabs as needed:
   - **Cover Letter** — streamed English cover letter
   - **Resume Tips** — concrete rewrites
   - **Interview** — predicted questions
5. Click any item under **Recent** to revisit a past analysis without re-running the AI

## 🏗️ Architecture

```
jd-analyzer/
├── manifest.json              # MV3 config
├── background.js              # Service Worker, AI router
├── popup.html / .css / .js    # Main popup with tabs
├── options.html / .css / .js  # Settings + file upload
├── lib/
│   ├── claudeProvider.js      # Claude API + SSE streaming + token usage
│   ├── openaiProvider.js      # OpenAI API + SSE streaming + token usage
│   ├── prompts.js             # 4 prompt templates
│   ├── resumeParser.js        # PDF/DOCX/TXT parsing
│   ├── errors.js              # Centralized error classification
│   ├── json.js                # Robust JSON extraction from LLM output
│   ├── pricing.js             # Per-model USD cost estimation
│   ├── storage.js             # Schema migration + analysis history
│   └── jdExtractor.js         # Site-specific page extraction
├── vendor/
│   ├── pdf.min.mjs            # pdf.js (Mozilla)
│   ├── pdf.worker.min.mjs
│   └── mammoth.browser.min.js # DOCX parsing
├── tests/                     # vitest unit tests
└── .github/workflows/ci.yml   # GitHub Actions CI
```

## 🛠️ Tech Highlights

- **Manifest V3** Service Worker architecture
- **Adapter pattern** for multi-provider AI abstraction (Claude + OpenAI)
- **Server-Sent Events (SSE)** streaming for long-text generation
- **Fully client-side document parsing** — privacy-preserving
- **Rubric-based scoring** to mitigate LLM output instability
- **Low temperature (T=0.2)** for reproducible scores
- **Robust JSON extraction** with prose-to-JSON fallback + auto retry
- **Per-call cost tracking** by capturing usage from non-streaming and streaming responses
- **Active-tab page extraction** via `chrome.scripting.executeScript` with site-specific selectors
- **Categorized error handling** with actionable recovery hints
- **Storage schema versioning** for safe future migrations
- **37 unit tests** (vitest) + GitHub Actions CI on every push/PR

## 🧪 Development

```bash
git clone https://github.com/aarontao/jd-analyzer.git
cd jd-analyzer

# Run tests
npm install
npm test

# Load unpacked into Chrome:
# chrome://extensions/ → Developer mode → Load unpacked → select this folder
```

## 🗺️ Roadmap

- [x] Auto-extraction from LinkedIn / Seek / Indeed and other major boards *(v1.1)*
- [x] Per-call cost transparency *(v1.1)*
- [x] Local analysis history *(v1.1)*
- [ ] Multi-resume profiles (frontend / backend / fullstack variants)
- [ ] Job application tracker (status, follow-ups, reminders)
- [ ] Export cover letter as formatted PDF
- [ ] Dark mode
- [ ] Localization (zh-CN, ja, etc.)
- [ ] Mock interview chat mode

## 🤝 Contributing

PRs welcome. For major changes, open an issue first. See the [Development](#-development) section for setup.

## 📄 License

MIT — see [LICENSE](LICENSE).

This software bundles:
- [pdf.js](https://github.com/mozilla/pdf.js) (Apache 2.0)
- [mammoth.js](https://github.com/mwilliamson/mammoth.js) (BSD-2-Clause)

## 👤 Author

Aaron Tao — [GitHub](https://github.com/aarontao)

---

Built in Melbourne · 2026 · ☕
