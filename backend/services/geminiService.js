import { GoogleGenerativeAI } from '@google/generative-ai';

export class GeminiAuditService {
  constructor(apiKey = process.env.GEMINI_API_KEY) {
    this.apiKey = apiKey;
  }

  async runAudit({ resumeText, candidateStats, repoInfo, customApiKey }) {
    const key = customApiKey || this.apiKey;
    if (key) {
      try {
        const genAI = new GoogleGenerativeAI(key);
        const prompt = `
You are ADA, an evidence-based technical project claim auditor for engineering hiring.

CRITICAL INSTRUCTION:
Verify ONLY the distinct candidate PROJECTS mentioned in the resume.
DO NOT audit generic skills, languages, or tools (e.g., do NOT evaluate 'JavaScript', 'Python', 'Docker', 'HTML/CSS', 'CI/CD', 'Git', 'Agile', 'Teamwork' as claims).
Every single entry in "claimsAnalysis" MUST be a concrete candidate PROJECT (e.g. "NutanX", "Enterprise Payment Platform", etc.).

RESUME TEXT:
${resumeText}

PER-PROJECT GITHUB TELEMETRY:
Candidate: @${candidateStats?.username || 'candidate'}
Projects Audited:
${JSON.stringify(candidateStats?.projectAudits || candidateStats?.repositories || [], null, 2)}

Aggregated GitHub Stats:
Total Commits: ${candidateStats?.commitsCount || 0}
Total Lines Touched: ${candidateStats?.totalLinesTouched || 0}
Languages: ${JSON.stringify(candidateStats?.languages || {})}

VERDICT DEFINITIONS:
- "VERIFIED": Public repository exists and candidate has verified commits corroborating the technical project claims.
- "PARTIALLY_VERIFIED": Public repository exists and candidate has verified commits, but some claimed technologies or scope are only partially represented.
- "UNVERIFIED": Public repository exists or was matched, but candidate has 0 verified commits in it.
- "NOT_AUDITABLE": Project is commercial, client work, internal company tool, or under NDA where public code is not expected. (Do NOT treat this as dishonest or unverified; commercial projects do NOT reduce authenticity score).

RULES:
1. Every claim MUST be a distinct candidate PROJECT.
2. Every claim must have factual, concise telemetry in "gitReality" (e.g. "43 candidate-attributed commits • HTML/CSS/JavaScript • 1,596 lines touched").
3. No conversational fluff or generic praise ("demonstrates strong technical capabilities..."). Be purely factual.

Return STRICT JSON:
{
  "recommendation": "WORTHY" | "PROCEED" | "REJECT",
  "authenticityScore": number,
  "claimsAnalysis": [
    {
      "claimedSkill": "Project Name (e.g. NutanX)",
      "targetRepo": "owner/repo" or null,
      "resumeClaim": "Exact sentence or bullet from resume describing this project",
      "gitReality": "Factual evidence string (e.g. 43 candidate-attributed commits • HTML/CSS/JS)",
      "verdict": "VERIFIED" | "PARTIALLY_VERIFIED" | "UNVERIFIED" | "NOT_AUDITABLE",
      "confidence": "HIGH" | "MEDIUM" | "LOW",
      "reason": "Concise factual reason based on Git telemetry",
      "evidence": ["Factual bullet 1", "Factual bullet 2"]
    }
  ]
}
`;

        for (const modelName of ['gemini-2.5-flash', 'gemini-1.5-flash']) {
          try {
            const model = genAI.getGenerativeModel({
              model: modelName,
              generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.1,
              },
            });

            const result = await model.generateContent(prompt);
            const parsed = JSON.parse(result.response.text());
            if (parsed?.claimsAnalysis && parsed.claimsAnalysis.length > 0) {
              return this.groundAuditReport(parsed, candidateStats);
            }
          } catch (modelErr) {
            console.warn(`Gemini (${modelName}) warning:`, modelErr.message);
          }
        }
      } catch (err) {
        console.warn('Gemini client setup error:', err.message);
      }
    }

    // Ground candidate project claims deterministically against live GitHub telemetry
    return this.groundCandidateClaimsReal({ resumeText, candidateStats, repoInfo });
  }

  /**
   * Ground AI-Generated Report against authoritative GitHub Telemetry
   * Filters to PROJECTS ONLY, validates candidate commits, handles commercial/NDA,
   * and calculates authoritative authenticity score.
   */
  groundAuditReport(rawReport, candidateStats) {
    if (!rawReport || !Array.isArray(rawReport.claimsAnalysis)) {
      return rawReport;
    }

    const projectAudits = candidateStats?.projectAudits || [];
    
    // Filter out generic skill claims (e.g. 'Docker & Containerization', 'Python & Data Engineering', 'CI/CD', etc.)
    const genericSkillRegex = /\b(docker|containerization|security|ci\/cd|cloud infrastructure|python|data engineering|frontend ui|backend architecture|database & schemas|systems & low-level|core engineering|overall project contribution)\b/i;

    const projectClaims = rawReport.claimsAnalysis.filter((c) => {
      const title = (c.claimedSkill || '').trim();
      const hasMatchedRepo = projectAudits.some(
        (p) =>
          (p.projectName && title.toLowerCase().includes(p.projectName.toLowerCase())) ||
          (p.projectName && p.projectName.toLowerCase().includes(title.toLowerCase()))
      );
      if (hasMatchedRepo) return true;
      return !genericSkillRegex.test(title);
    });

    const groundedClaims = projectClaims.map((claim) => {
      const pName = (claim.claimedSkill || '').toLowerCase();
      const claimText = (claim.resumeClaim || '').toLowerCase();
      const matchedProject = projectAudits.find(
        (p) =>
          (p.projectName && pName.includes(p.projectName.toLowerCase())) ||
          (p.projectName && (p.projectName.toLowerCase().includes(pName) || claimText.includes(p.projectName.toLowerCase()))) ||
          (p.repoFullName && claimText.includes(p.repoFullName.toLowerCase()))
      );

      const isCommercialOrNda = /\b(commercial|confidential|enterprise client|under nda|nda|proprietary|closed[- ]source|internal tool|client project)\b/i.test(
        claimText + ' ' + pName
      );

      let verdict = claim.verdict || 'UNVERIFIED';
      let confidence = claim.confidence || 'MEDIUM';
      let evidence = Array.isArray(claim.evidence) && claim.evidence.length > 0 ? [...claim.evidence] : [];

      if (isCommercialOrNda && (!matchedProject || !matchedProject.candidateCommits)) {
        verdict = 'NOT_AUDITABLE';
        confidence = 'LOW';
        if (evidence.length === 0) {
          evidence = ['Commercial/NDA closed-source project scope', 'No public GitHub telemetry required under NDA'];
        }
      } else if (matchedProject && matchedProject.candidateCommits > 0) {
        verdict = matchedProject.candidateCommits >= 5 ? 'VERIFIED' : 'PARTIALLY_VERIFIED';
        confidence = matchedProject.matchConfidence === 'DIRECT' || matchedProject.candidateCommits >= 5 ? 'HIGH' : 'MEDIUM';
        if (evidence.length === 0) {
          evidence = [
            `${matchedProject.candidateCommits} candidate-attributed commits`,
            matchedProject.languages ? `${Object.keys(matchedProject.languages).join('/')} files detected` : 'Code files detected',
          ];
        }
      } else if (matchedProject && matchedProject.candidateCommits === 0) {
        verdict = 'UNVERIFIED';
        confidence = 'HIGH';
        evidence = ['Public repository found, but 0 candidate commits detected'];
      }

      return {
        ...claim,
        verdict,
        confidence,
        evidence: evidence.length > 0 ? evidence : [claim.gitReality || 'No telemetry found'],
      };
    });

    // Authoritative authenticity score calculation across auditable projects only
    const auditable = groundedClaims.filter((c) => c.verdict !== 'NOT_AUDITABLE');
    let authenticityScore = 100;
    if (auditable.length > 0) {
      const verifiedCount = auditable.filter((c) => c.verdict === 'VERIFIED').length;
      const partialCount = auditable.filter((c) => c.verdict === 'PARTIALLY_VERIFIED').length;
      authenticityScore = Math.round(((verifiedCount + partialCount * 0.5) / auditable.length) * 100);
    }

    let recommendation = 'WORTHY';
    if (authenticityScore < 40) recommendation = 'REJECT';
    else if (authenticityScore < 75) recommendation = 'PROCEED';

    return {
      ...rawReport,
      authenticityScore,
      recommendation,
      claimsAnalysis: groundedClaims,
    };
  }

  /**
   * 100% Real, Dynamic Project Grounding Engine
   * Evaluates ONLY candidate PROJECTS against live GitHub telemetry.
   * Eliminates generic skills to guarantee accurate authenticity scoring.
   */
  groundCandidateClaimsReal({ resumeText, candidateStats, repoInfo }) {
    const rawSentences = this.extractCandidateClaimSentences(resumeText);
    const claimsAnalysis = [];

    const stats = candidateStats || {};
    const username = stats.username || 'candidate';
    const repos = stats.projectAudits || [];

    // 1. Audit each candidate project from telemetry
    for (const repo of repos) {
      const projName = repo.projectName || repo.name || 'Project';
      const pLower = projName.toLowerCase();

      // Find matching sentence describing this project in resumeText
      const matchingSentence = rawSentences.find((s) => {
        const sLower = s.toLowerCase();
        return sLower.includes(pLower) || (pLower.length >= 5 && sLower.includes(pLower.substring(0, 5)));
      });

      const repoCommits = repo.candidateCommits ?? 0;
      const lines = repo.linesTouched ?? ((repo.linesAdded || 0) + (repo.linesDeleted || 0));
      const lang = repo.primaryLanguage || (repo.languages && Object.keys(repo.languages)[0]) || 'Code';

      let verdict = 'UNVERIFIED';
      if (repoCommits >= 5) {
        verdict = 'VERIFIED';
      } else if (repoCommits > 0) {
        verdict = 'PARTIALLY_VERIFIED';
      }

      const evidence = repoCommits > 0
        ? [
            `${repoCommits} candidate-attributed commits`,
            `Primary language: ${lang}`,
            `${lines.toLocaleString()} lines of code touched`,
          ]
        : [
            `Public repository found, but 0 candidate-attributed commits detected`,
          ];

      claimsAnalysis.push({
        claimedSkill: projName,
        targetRepo: repo.repoFullName || repo.fullName || `${username}/${projName}`,
        resumeClaim: matchingSentence || `Candidate built and maintained ${projName} application.`,
        gitReality: `${repoCommits} candidate-attributed commits • ${lang} • ${lines.toLocaleString()} lines touched`,
        verdict,
        confidence: repoCommits > 0 ? (repo.matchConfidence === 'DIRECT' ? 'HIGH' : 'MEDIUM') : 'HIGH',
        reason: repoCommits > 0
          ? `${repoCommits} commits confirmed authored by @${username}`
          : `Repository matched on GitHub but 0 commits authored by @${username}`,
        evidence,
      });
    }

    // 2. Detect Commercial / NDA projects in resume that are closed-source
    const commercialSentences = rawSentences.filter((s) =>
      /\b(commercial|confidential|enterprise client|under nda|nda|proprietary|closed[- ]source|internal tool|client project)\b/i.test(s)
    );

    for (const cSentence of commercialSentences) {
      const alreadyCovered = claimsAnalysis.some((c) => c.resumeClaim === cSentence);
      if (!alreadyCovered) {
        const parts = cSentence.split(/[:\-|–]/);
        const titleCandidate = parts[0]?.trim();
        const title = titleCandidate && titleCandidate.length <= 40 ? titleCandidate : 'Commercial Enterprise Project';

        claimsAnalysis.push({
          claimedSkill: title,
          targetRepo: null,
          resumeClaim: cSentence,
          gitReality: 'Commercial / Closed-Source project under NDA. Public Git repository unavailable.',
          verdict: 'NOT_AUDITABLE',
          confidence: 'MEDIUM',
          reason: 'Proprietary enterprise project without public code under NDA.',
          evidence: ['Commercial enterprise project scope', 'No public GitHub repository required under NDA'],
        });
      }
    }

    // Fallback if no projects were identified
    if (claimsAnalysis.length === 0) {
      const hasCommits = (stats.commitsCount || 0) > 0;
      claimsAnalysis.push({
        claimedSkill: repoInfo?.name || 'Primary Project',
        targetRepo: repoInfo?.name || `${username}/project`,
        resumeClaim: 'Primary software engineering project and repository development.',
        gitReality: hasCommits
          ? `Verified ${stats.commitsCount} commits and ${stats.totalLinesTouched} lines touched.`
          : `0 commits found for @${username} on GitHub.`,
        verdict: hasCommits ? 'VERIFIED' : 'UNVERIFIED',
        confidence: 'HIGH',
        reason: hasCommits ? 'Public commits verified' : 'No commits found',
        evidence: [hasCommits ? `${stats.commitsCount} commits verified` : '0 commits found'],
      });
    }

    // Calculate authenticity score strictly across auditable projects
    const auditable = claimsAnalysis.filter((c) => c.verdict !== 'NOT_AUDITABLE');
    let authenticityScore = 100;
    if (auditable.length > 0) {
      const verifiedCount = auditable.filter((c) => c.verdict === 'VERIFIED').length;
      const partialCount = auditable.filter((c) => c.verdict === 'PARTIALLY_VERIFIED').length;
      authenticityScore = Math.round(((verifiedCount + partialCount * 0.5) / auditable.length) * 100);
    }

    let recommendation = 'WORTHY';
    if (authenticityScore < 40) recommendation = 'REJECT';
    else if (authenticityScore < 75) recommendation = 'PROCEED';

    const reposScannedCount = repos.length || 1;
    const executiveSummary =
      recommendation === 'REJECT'
        ? `Candidate @${username} exhibits significant discrepancies between claimed projects and actual Git telemetry. Scanned public repositories lack verifiable code contributions.`
        : recommendation === 'PROCEED'
        ? `Candidate @${username} demonstrates partial alignment with resume projects (${authenticityScore}% verified). Core code contributions are corroborated.`
        : `Candidate @${username} exhibits strong authenticity (${authenticityScore}% verified). Project claims are solidly corroborated by author commit logs and source code across public repositories.`;

    return {
      recommendation,
      authenticityScore,
      executiveSummary,
      claimsAnalysis,
    };
  }

  /**
   * Helper: Extracts distinct, clean sentences / bullet points from raw resume text
   */
  extractCandidateClaimSentences(rawText) {
    if (!rawText) return [];

    // Split on newlines, bullet symbols, and numbered list markers
    const lines = rawText
      .split(/\r?\n|•|·|▪|●|[\u2022\u2023\u25E6\u2043\u2219]/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const candidates = [];

    for (const line of lines) {
      // Clean leading dashes, asterisks, numbers like "1.", "1)", etc.
      const cleaned = line.replace(/^[-*–—\d\.\)\s]+/, '').trim();

      // Skip common non-claim headers or noise
      if (cleaned.length < 15) continue;
      if (
        /^(education|skills|experience|projects|certifications|summary|profile|contact|phone|email|languages|interests)$/i.test(
          cleaned
        )
      ) {
        continue;
      }
      if (/^https?:\/\//i.test(cleaned)) continue;
      if (/^(github|project|repo|website|linkedin|portfolio)\s*[:\-]\s*https?:\/\//i.test(cleaned)) continue;
      if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(cleaned)) continue;

      // If line is very long (a whole paragraph without linebreaks), split by sentence boundaries
      if (cleaned.length > 220) {
        const subSentences = cleaned.match(/[^.!?]+[.!?]+(\s+|$)/g) || [cleaned];
        for (const s of subSentences) {
          const sClean = s.trim();
          if (sClean.length >= 15 && sClean.length <= 250) {
            candidates.push(sClean);
          }
        }
      } else {
        candidates.push(cleaned);
      }
    }

    // Return top 8 meaningful claims
    return candidates.slice(0, 8);
  }
}
