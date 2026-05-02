// lib/prompts.js v0.8
// All prompts produce English output only.

// ============== 1. JD Analysis ==============
export const SYSTEM_PROMPT_ANALYZE = `You are a senior technical recruiter specialized in evaluating how well a candidate's resume matches a job description (JD).
ALL output must be in English, regardless of the language of the JD or resume.
You must follow the scoring rubric strictly to ensure consistent and reproducible scores.
Output must be strict JSON only — no markdown code fences, no explanations, no preamble.`;

export function buildAnalyzePrompt(resume, jdText) {
  return `Analyze the following job description (JD) against my resume.

[JD]
${jdText}

[My Resume]
${resume}

==== SCORING RUBRIC (must follow strictly) ====
matchScore is an integer from 0 to 100, weighted across 4 dimensions:

1. Core Skill Match (40 points)
   - Number of JD-required core skills clearly present in resume / total JD-required core skills
   - Example: JD requires 5 core skills, resume covers 4 → 32 points

2. Experience Level Match (25 points)
   - Years of experience and seniority alignment
   - Full match: 25 / Below by 1 year: -5 / Below by 2+ years: -15 / Above requirement: full marks

3. Industry / Domain Relevance (20 points)
   - Past projects and companies relative to JD's industry
   - Highly relevant: 20 / Somewhat relevant: 12 / Unrelated: 5

4. Soft Skills & Cultural Fit (15 points)
   - Leadership, communication, collaboration evidence vs. JD requirements
   - Strong evidence: 15 / Some evidence: 8 / No evidence: 3

Round total to integer.
==== END RUBRIC ====

Output strict JSON only, no markdown:
{
  "detectedJobTitle": "the actual job title from the JD",
  "detectedCompany": "the company name (or 'unknown' if not found)",
  "keywords": ["8-12 key skills/tools/concepts from the JD"],
  "matchScore": 0-100 integer,
  "scoreBreakdown": {
    "skills": "X/40 - brief explanation",
    "experience": "X/25 - brief explanation",
    "industry": "X/20 - brief explanation",
    "softSkills": "X/15 - brief explanation"
  },
  "matchReasoning": "2-3 sentences summarizing why this score",
  "missingSkills": [
    {
      "skill": "name of the missing skill",
      "importance": "high | medium | low",
      "suggestion": "concrete advice to bridge or highlight this gap"
    }
  ],
  "strengths": ["3-5 highlights from the resume that match the JD strongly"]
}`;
}

// ============== 2. Cover Letter (already English) ==============
export const SYSTEM_PROMPT_COVER_LETTER = `You are an experienced career coach helping candidates write professional cover letters.
CRITICAL RULES:
1. Output language: ALWAYS ENGLISH, regardless of the JD's language.
2. Output ONLY the cover letter body — no greeting header (no "Dear..."), no signature block (no "Sincerely..."), no markdown formatting, no preamble.
3. Direct, confident, professional tone. No clichés like "I am writing to apply for...".`;

export function buildCoverLetterPrompt(resume, jdText, analysis) {
  const strengthsText = (analysis?.strengths || []).join("; ");
  const keywordsText = (analysis?.keywords || []).slice(0, 6).join(", ");
  const detectedTitle = analysis?.detectedJobTitle || "(see JD)";
  const detectedCompany = analysis?.detectedCompany || "(see JD)";

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
Keywords to weave in: ${keywordsText}

Now output ONLY the English cover letter body:`;
}

// ============== 3. Resume Optimization Tips ==============
export const SYSTEM_PROMPT_RESUME_TIPS = `You are a senior resume consultant.
ALL output must be in English.
Tone: professional, direct, actionable. Each suggestion must be a concrete rewrite, not vague advice.
Output must be strict JSON only — no markdown.`;

export function buildResumeTipsPrompt(resume, jdText, analysis) {
  return `Provide concrete rewrite suggestions for my resume against this specific JD.

[JD]
${jdText}

[My Resume]
${resume}

[Existing analysis]
Match score: ${analysis?.matchScore || "?"}
Strengths: ${(analysis?.strengths || []).join("; ")}
Missing skills: ${(analysis?.missingSkills || []).map(s => s.skill).join(", ")}

Provide 4-6 actionable rewrite suggestions. Each must include:
- The exact location/section in the resume to modify
- The specific text to replace it with
- Why this change matters

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
  "atsScore": 0-100 integer measuring ATS-friendliness,
  "atsIssues": ["list of specific ATS-related problems with the resume"]
}`;
}

// ============== 4. Interview Question Prediction ==============
export const SYSTEM_PROMPT_INTERVIEW = `You are an experienced engineering manager who has conducted hundreds of technical interviews.
ALL output must be in English.
Questions must be specific and meaningful, not generic ones like "tell me about yourself".
Each question must be grounded in the actual JD requirements and the candidate's resume background.
Output must be strict JSON only — no markdown.`;

export function buildInterviewPrompt(resume, jdText, analysis) {
  return `Predict the 10 most likely interview questions (8 technical + 2 behavioral) for this role.

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
