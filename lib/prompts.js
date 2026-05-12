// lib/prompts.js v0.9
// Bilingual: cover-letter body is always English; all other explanations/reasoning/
// hints/suggestions follow the user's selected `lang` ("en" or "zh").

// Returns the human-readable language directive that we inject into prompts.
function langDirective(lang) {
  if (lang === "zh") {
    return `LANGUAGE FOR EXPLANATIONS, REASONING, HINTS, SUGGESTIONS, REASONS:
- 使用简体中文输出所有解释类字段(reasoning / matchReasoning / suggestion / reason / hint / summary / adjustments)。
- JSON keys 保持英文不要翻译。
- 跳过引用证据(evidence)和技能/技术名称的翻译 — 保留原文。
- "tier" 等枚举值保持英文(low / moderate / strong / very_strong 等)。
- 公司名称、职位名等专有名词保留原文。`;
  }
  return `LANGUAGE FOR EXPLANATIONS, REASONING, HINTS, SUGGESTIONS, REASONS:
- Use English for every explanation field.
- JSON keys remain English.
- Quoted evidence stays in the resume's original language.
- Enum values (tier, type, status, importance, etc.) stay in English.`;
}

// ============== 1. JD Analysis ==============
export const SYSTEM_PROMPT_ANALYZE = `You are a senior technical recruiter specialized in evaluating how well a candidate's resume matches a job description (JD).
You must follow the scoring rubric strictly to ensure consistent and reproducible scores.
Output must be strict JSON only — no markdown code fences, no explanations, no preamble.`;

export function buildAnalyzePrompt(resume, jdText, lang = "en") {
  return `Analyze the following job description (JD) against my resume.

${langDirective(lang)}


[JD]
${jdText}

[My Resume]
${resume}

==== STEP 1: SKILLS AUDIT (do this BEFORE scoring — do not skip) ====
Enumerate every skill, tool, technology, or qualification the JD asks for.
For each, classify:
- required: "must-have" if the JD frames it as required / must / essential / a hard requirement; otherwise "nice-to-have".
- status: "present" (clearly demonstrated in resume), "partial" (mentioned but limited or surface-level), or "missing".
- evidence: a brief quote or paraphrase from the resume (or "" if missing).

This audit drives the scores below. Be honest — a skill is "present" only if there is concrete evidence, not just a related buzzword.

==== STEP 2: SCORING RUBRIC (apply strictly, total <= 100) ====

1. Core Skills (35 points)
   - Start at 35.
   - Each MISSING must-have: −8
   - Each PARTIAL must-have: −4
   - Each MISSING nice-to-have: −2
   - Each PARTIAL nice-to-have: −1
   - Floor at 0.

2. Experience Level (20 points)
   - Full match on years and seniority: 20
   - Below required by ≤1 year OR 1 seniority level gap: 13
   - Below by ≥2 years OR ≥2 seniority level gap: 5
   - Significantly overqualified (5+ years above the senior cap): 14 (mild penalty — risk of rejection as overqualified)

3. Education / Certifications (10 points)
   - Meets all stated education + cert requirements: 10
   - Meets education but missing a stated certification: 6
   - Education below the stated requirement: 3
   - JD does not specify any education/cert requirement: 10 (full marks)

4. Industry / Domain Relevance (15 points)
   - Direct same-industry experience: 15
   - Adjacent / transferable domain: 9
   - Unrelated: 3

5. Location / Work Authorization (10 points)
   - Resume location and authorization are clearly compatible with the JD: 10
   - JD is silent on location/visa: 10 (full marks)
   - Likely incompatible (e.g. onsite-only JD vs remote-only resume, visa sponsorship gap, timezone mismatch): 3
   - Cannot determine from resume alone: 7

6. Soft Skills & Cultural Fit (10 points)
   - Strong concrete evidence (led teams, cross-functional projects, quantified impact): 10
   - Some evidence: 6
   - No clear evidence: 3

Sum the six dimensions. Round to an integer. That is matchScore.

==== STEP 3: INTERVIEW LIKELIHOOD ====
Estimate the real-world probability this resume gets shortlisted for an interview. This is NOT the same as matchScore — it must account for competition and ATS realities.

Start from matchScore, then apply these adjustments (list each one you apply in "adjustments"):
- Highly competitive employer (FAANG / top-tier / well-known unicorn): −15
- Senior / Staff / Principal level role: −5 (broader candidate pool)
- Niche or rare specialization on resume that matches the JD: +5
- Each missing MUST-HAVE skill: −5 additional on top of the rubric penalty
- Resume appears ATS-unfriendly (heavy formatting cues in the text, missing standard sections like "Experience"): −10
- Strong domain referral signal in resume (e.g. employer logos the JD's company is known to source from): +5

Clamp to [0, 100]. Map to tier:
- 0–24: "low"
- 25–49: "moderate"
- 50–74: "strong"
- 75–100: "very_strong"

==== STEP 4: OUTPUT ====
Output strict JSON only, no markdown, no explanations outside the JSON:
{
  "detectedJobTitle": "the actual job title from the JD",
  "detectedCompany": "the company name (or 'unknown' if not found)",
  "keywords": ["8-12 key skills/tools/concepts from the JD"],
  "skillsAudit": [
    {
      "skill": "name of the skill / qualification",
      "required": "must-have | nice-to-have",
      "status": "present | partial | missing",
      "evidence": "brief quote or paraphrase from resume, or empty string if missing"
    }
  ],
  "matchScore": 0-100 integer,
  "scoreBreakdown": {
    "skills": "X/35 - brief explanation",
    "experience": "X/20 - brief explanation",
    "education": "X/10 - brief explanation",
    "industry": "X/15 - brief explanation",
    "authorization": "X/10 - brief explanation",
    "softSkills": "X/10 - brief explanation"
  },
  "matchReasoning": "2-3 sentences summarizing why this score",
  "interviewLikelihood": {
    "score": 0-100 integer,
    "tier": "low | moderate | strong | very_strong",
    "reasoning": "2-3 sentences explaining the gap (or alignment) between matchScore and this likelihood",
    "adjustments": [
      "+5: niche cloud-security specialization is rare for this role",
      "-15: FAANG-tier employer means high applicant volume",
      "-5: 1 must-have skill (Kubernetes) missing"
    ]
  },
  "missingSkills": [
    {
      "skill": "name of the missing skill",
      "importance": "high | medium | low",
      "suggestion": "concrete advice to bridge or highlight this gap",
      "learningResource": {
        "type": "course | docs | book | tutorial",
        "title": "specific named resource (e.g. 'Kubernetes Up & Running', 'Official React Hooks docs', 'fast.ai Practical Deep Learning')",
        "query": "exact search query that reliably surfaces this resource as the top Google hit — usually the title plus author/publisher"
      }
    }
  ],
  "strengths": ["3-5 highlights from the resume that match the JD strongly"]
}

IMPORTANT: For learningResource, do NOT invent URLs. Only fill the three fields above. The frontend builds a Google search link from "query", so the query MUST be specific enough that the top result is the named resource (include author/publisher when ambiguous, e.g. "Designing Data-Intensive Applications Martin Kleppmann" not just "Designing Data-Intensive Applications").`;
}

// ============== 2. Cover Letter (already English) ==============
export const SYSTEM_PROMPT_COVER_LETTER = `You are an experienced career coach helping candidates write professional cover letters.
CRITICAL RULES:
1. Output language: ALWAYS ENGLISH, regardless of the JD's language.
2. Output ONLY the cover letter body — no greeting header (no "Dear..."), no signature block (no "Sincerely..."), no markdown formatting, no preamble.
3. Direct, confident, professional tone. No clichés like "I am writing to apply for...".`;

export function buildCoverLetterPrompt(resume, jdText, analysis, guidance = "") {
  const strengthsText = (analysis?.strengths || []).join("; ");
  const keywordsText = (analysis?.keywords || []).slice(0, 6).join(", ");
  const detectedTitle = analysis?.detectedJobTitle || "(see JD)";
  const detectedCompany = analysis?.detectedCompany || "(see JD)";
  const guidanceBlock = guidance && guidance.trim()
    ? `\n\nUSER GUIDANCE (highest priority — adjust the letter to honour this without breaking the rules above):\n${guidance.trim()}\n`
    : "";

  return `Write a concise, professional cover letter IN ENGLISH (3 paragraphs, under 200 words total).

LANGUAGE: ENGLISH ONLY.

STRUCTURE:
- Para 1 (~40 words): Why this specific role at this company catches your interest
- Para 2 (~120 words): 2-3 specific strengths with concrete examples from your resume
- Para 3 (~30 words): Confident closing with call to action

REQUIREMENTS:
- No greeting line, no signature
- Active voice, specific accomplishments with numbers when possible
- Naturally reference 2-3 keywords from the JD
- No clichés ("I am writing to apply...", "I am passionate about...")

JOB INFO:
Title: ${detectedTitle}
Company: ${detectedCompany}
Full JD: ${jdText}

CANDIDATE RESUME:
${resume}

KEY MATCHING POINTS:
Strengths: ${strengthsText}
Keywords to weave in: ${keywordsText}${guidanceBlock}

Now output ONLY the English cover letter body:`;
}

// ============== 3. Resume Optimization Tips ==============
export const SYSTEM_PROMPT_RESUME_TIPS = `You are a senior resume consultant.
Tone: professional, direct, actionable. Each suggestion must be a concrete rewrite, not vague advice.
Output must be strict JSON only — no markdown.`;

export function buildResumeTipsPrompt(resume, jdText, analysis, atsAssessment, lang = "en") {
  const ats = atsAssessment || {};
  const atsBlock = ats.score != null
    ? `[Deterministic ATS pre-check on the source file]
Starting ATS score: ${ats.score}/100
Structural issues already detected (do NOT rediscover these — start from them and add CONTENT-level issues only):
${(ats.issues || []).map(s => `- ${s}`).join("\n") || "- (none)"}`
    : `[Deterministic ATS pre-check]
Not available — derive atsScore from the resume text alone.`;

  return `Provide concrete rewrite suggestions for my resume against this specific JD.

${langDirective(lang)}
IMPORTANT for rewrite tips:
- "before" and "after" fields hold ACTUAL resume text — keep them in the resume's original language (do not translate the rewritten resume content).
- "reason" / "summary" / "atsIssues" / "location" follow the explanation language above.

[JD]
${jdText}

[My Resume]
${resume}

[Existing analysis]
Match score: ${analysis?.matchScore || "?"}
Strengths: ${(analysis?.strengths || []).join("; ")}
Missing skills: ${(analysis?.missingSkills || []).map(s => s.skill).join(", ")}

${atsBlock}

Provide 4-6 actionable rewrite suggestions. Each must include:
- The exact location/section in the resume to modify
- The specific text to replace it with
- Why this change matters

For atsScore:
- Use the deterministic starting score (above) as your base.
- ONLY deduct further for content-level ATS issues you can see in the resume text itself: missing standard sections (Experience, Education, Skills), buzzword stuffing, lack of keywords from the JD, unusual section headings, no quantified results, etc.
- Repeat the pre-detected structural issues at the top of atsIssues, then append your content-level ones.

Output strict JSON only:
{
  "summary": "one-line overall optimization direction",
  "tips": [
    {
      "type": "rewrite | add | reorder | quantify | remove",
      "location": "section name or original line in resume",
      "before": "original text from resume (or 'NEW' if adding something)",
      "after": "the specific suggested text",
      "reason": "why this change improves the resume for this JD"
    }
  ],
  "atsScore": 0-100 integer measuring ATS-friendliness (start from the pre-check score),
  "atsIssues": ["all ATS-related problems — structural ones first, then content-level"]
}`;
}

// ============== 4. Interview Question Prediction ==============
export const SYSTEM_PROMPT_INTERVIEW = `You are an experienced engineering manager who has conducted hundreds of technical interviews.
Questions must be specific and meaningful, not generic ones like "tell me about yourself".
Each question must be grounded in the actual JD requirements and the candidate's resume background.
Output must be strict JSON only — no markdown.`;

export function buildInterviewPrompt(resume, jdText, analysis, lang = "en") {
  return `Predict the 10 most likely interview questions (8 technical + 2 behavioral) for this role.

${langDirective(lang)}
IMPORTANT for interview Q&A:
- Question text follows the language used to interview candidates. Most companies in the candidate's region interview in English for technical roles unless the JD is clearly written in another language. If the JD is in Chinese, use Chinese for the question text.
- "hint" fields follow the explanation language above.
- "topic" / "framework" stay in their canonical English form (e.g. "System Design", "STAR").

[JD]
${jdText}

[My Resume]
${resume}

[Match analysis]
Match score: ${analysis?.matchScore || "?"}
Missing skills: ${(analysis?.missingSkills || []).map(s => s.skill).slice(0, 5).join(", ")}

Requirements:
- 8 technical questions + 2 behavioral questions
- Technical: anchored to the JD's core stack AND projects/skills mentioned in the resume
- Behavioral: targeted at the role's responsibilities (leadership / collaboration / failures, etc.)
- Difficulty distribution: 2 easy + 5 medium + 3 hard
- Each question must include answering hints

Output strict JSON only:
{
  "technical": [
    {
      "question": "the specific technical question",
      "difficulty": "easy | medium | hard",
      "topic": "the knowledge area being tested (e.g. React Hooks, System Design, Databases)",
      "hint": "2-3 sentence hint on how to approach the answer"
    }
  ],
  "behavioral": [
    {
      "question": "the specific behavioral question",
      "difficulty": "easy | medium | hard",
      "framework": "recommended answer framework (e.g. STAR)",
      "hint": "2-3 sentence hint on how to approach the answer"
    }
  ]
}`;
}
