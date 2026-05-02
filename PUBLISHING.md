# Publishing Checklist

This document lists everything you (the author) need to do to publish JD Analyzer to the Chrome Web Store. The codebase is ready — these are the human/external steps.

---

## 1. Replace Placeholder Identity

The following placeholders are used throughout the project. Search-and-replace them with your real values.

| Placeholder | Files |
|---|---|
| `Aaron Tao` | `manifest.json` (author), `LICENSE`, `README.md` |
| `aarontao` (GitHub username) | `manifest.json` (homepage_url), `PRIVACY.md`, `STORE_LISTING.md`, `options.html` (footer link) |
| `jd-analyzer` (repo name) | Same files as above |

Quick command:
```bash
grep -rln "aarontao\|Aaron Tao" --include="*.json" --include="*.md" --include="*.html"
```

---

## 2. Design Professional Icons (REQUIRED)

The current icons (`JD` text on blue) are placeholders and will likely fail Chrome Web Store review aesthetics.

**Required sizes:** 16, 48, 128 px (all PNG, transparent background optional)

**Recommended approach:**
- Use [Figma](https://figma.com) (free) to design a clean logo
- Or use [DALL-E](https://chat.openai.com) / [Midjourney](https://midjourney.com) with a prompt like:
  > "Minimalist app icon for a job-matching browser extension, modern flat design, blue and white, document with checkmark, transparent background, 1024x1024"
- Export at 16/48/128 PNG and replace `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`

**Avoid:**
- Text-only icons (low score)
- Photographs (Chrome rejects)
- Trademark logos (LinkedIn blue is OK as a color but don't use the LinkedIn "in" logo)

---

## 3. Take 5 Screenshots (REQUIRED)

Chrome Web Store requires at least 1, recommends 5. Each must be **1280x800 or 640x400 PNG/JPG**.

**Suggested screenshots:**
1. **Settings page** showing the upload area and provider selection
2. **Result page** showing score card with breakdown
3. **Cover Letter** tab (mid-streaming or completed)
4. **Resume Tips** tab showing before/after rewrites
5. **Interview Questions** tab

**How to capture:**
1. Open the extension in dev mode
2. Use a clean browser profile (no other extension icons cluttering)
3. macOS: `Cmd+Shift+4` for region screenshot
4. Resize to 1280x800 in Preview / Photoshop / GIMP

**Pro tip:** Add a clean colored background and the screenshot in the center using [Canva](https://canva.com) or similar — looks far more professional than raw screenshots.

---

## 4. Promotional Images (Optional but Recommended)

Chrome Web Store offers 3 promo image slots:

| Type | Size | Purpose |
|---|---|---|
| Small | 440×280 | Shown in search results |
| Marquee | 1400×560 | Featured page (you'll likely never get featured but worth having) |

These should NOT be screenshots — they should be designed graphics with the icon, name, and a tagline.

---

## 5. Host the Privacy Policy (REQUIRED)

Chrome Web Store requires a publicly accessible privacy policy URL.

**Easiest option — GitHub Pages:**

```bash
# In your project repo:
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/jd-analyzer.git
git push -u origin main

# On github.com:
# Settings → Pages → Source: Deploy from branch → main → /(root) → Save
```

After ~1 minute, your privacy policy is at:
`https://YOUR_USERNAME.github.io/jd-analyzer/PRIVACY.md`

(GitHub doesn't render .md as HTML by default. To make it render nicely, rename `PRIVACY.md` to `PRIVACY.html` and wrap it in basic HTML, OR use a service like `https://raw.githack.com` to render markdown.)

**Alternative:** Any free hosting works — Netlify, Vercel, your own site.

---

## 6. Register as a Chrome Developer ($5)

1. Go to https://chrome.google.com/webstore/devconsole/
2. Sign in with your Google account
3. Pay one-time $5 USD registration fee
4. Verify your email

---

## 7. Submit for Review

1. Click "New Item" → upload `jd-analyzer-v1.zip`
2. Fill in:
   - **Item description** — copy from `STORE_LISTING.md`
   - **Category:** Productivity
   - **Language:** English
   - **Privacy practices:** declare what you collect (you'll declare "I do not collect user data")
   - **Privacy policy URL** — paste the URL from step 5
   - **Screenshots & promo images** — upload from steps 3 and 4
   - **Single purpose** — copy from `STORE_LISTING.md`
   - **Permissions justification** — copy from `STORE_LISTING.md`
3. Click **Submit for review**

Review typically takes 1-3 business days. Common rejection reasons:
- Unclear single purpose
- Missing/inadequate privacy policy
- Vague permission justifications
- Low-quality icons or screenshots

---

## 8. Post-Launch

After approval:

1. **Add the Chrome Web Store badge** to your README and GitHub repo
2. **Share** — Twitter, Reddit r/SideProject, ProductHunt, dev.to article
3. **Monitor reviews** and respond
4. **Track installs** in the developer console
5. **Iterate** based on real user feedback

---

## Quick Pre-Submission Self-Check

Before you click "Submit", verify:

- [ ] Manifest version, name, description match what you want users to see
- [ ] Icons replaced with professional design (not the JD placeholder)
- [ ] All references to `aarontao` and `Aaron Tao` updated to your real values
- [ ] Privacy Policy is at a publicly accessible URL
- [ ] You've manually tested all 4 features end-to-end:
  - [ ] Analyze a JD
  - [ ] Generate Cover Letter (streaming works)
  - [ ] Generate Resume Tips
  - [ ] Generate Interview Questions
- [ ] Tested at least 3 different JDs from different industries
- [ ] Tested with both Claude AND OpenAI providers
- [ ] Tested with at least 2 different resume file formats (PDF + DOCX)
- [ ] Tested error scenarios (wrong API key, network off, etc.)

Good luck! 🚀
