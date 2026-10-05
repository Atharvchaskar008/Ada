import assert from "assert";
import { GitHubService } from "../services/githubService.js";
import { GeminiAuditService } from "../services/geminiService.js";

async function runTests() {
  console.log("=================================================");
  console.log("ADA HISTORICAL REPO DISCOVERY & ATTRIBUTION TESTS");
  console.log("=================================================\n");

  const gh = new GitHubService();
  const gemini = new GeminiAuditService();

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name}`);
      console.error(err);
      failed++;
    }
  }

  async function asyncTest(name, fn) {
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name}`);
      console.error(err);
      failed++;
    }
  }

  // ==========================================
  // SUITE 1: REPOSITORY MATCHING PRECISION
  // ==========================================
  console.log("--- SUITE 1: Repository Matching & Confidence ---");

  test("Direct URL Match returns DIRECT confidence", () => {
    const candidateRepo = {
      name: "NutanX",
      full_name: "Atharvchaskar008/NutanX",
      html_url: "https://github.com/Atharvchaskar008/NutanX",
    };
    const res = gh.evaluateRepoMatch(candidateRepo, "NutanX", "https://github.com/Atharvchaskar008/NutanX");
    assert.strictEqual(res.matched, true);
    assert.strictEqual(res.confidence, "DIRECT");
  });

  test("Exact owner/repo Match returns EXACT confidence", () => {
    const candidateRepo = {
      name: "NutanX",
      full_name: "Atharvchaskar008/NutanX",
      html_url: "https://github.com/Atharvchaskar008/NutanX",
    };
    const res = gh.evaluateRepoMatch(candidateRepo, "Atharvchaskar008/NutanX");
    assert.strictEqual(res.matched, true);
    assert.strictEqual(res.confidence, "EXACT");
  });

  test("Normalized Match handles hyphen/underscore/case variations", () => {
    const candidateRepo = {
      name: "NutanX",
      full_name: "Atharvchaskar008/NutanX",
      html_url: "https://github.com/Atharvchaskar008/NutanX",
    };
    const variations = ["nutanx", "Nutan-X", "nutan_x", "Nutan X"];
    for (const v of variations) {
      const res = gh.evaluateRepoMatch(candidateRepo, v);
      assert.strictEqual(res.matched, true, `Failed matching variation: ${v}`);
      assert.ok(["EXACT", "NORMALIZED"].includes(res.confidence));
    }
  });

  test("Rejects unrelated repository names (no false positives)", () => {
    const candidateRepo = {
      name: "NutanX",
      full_name: "Atharvchaskar008/NutanX",
      html_url: "https://github.com/Atharvchaskar008/NutanX",
    };
    const unrelated = ["tan", "react-app", "portfolio", "ecommerce", "nutrition-tracker"];
    for (const u of unrelated) {
      const res = gh.evaluateRepoMatch(candidateRepo, u);
      assert.strictEqual(res.matched, false, `Should not match unrelated name: ${u}`);
    }
  });

  // ==========================================
  // SUITE 2: GIT AUTHOR ATTRIBUTION
  // ==========================================
  console.log("\n--- SUITE 2: Git Author Attribution ---");

  test("Attributes commit with matched GitHub author login", () => {
    const commit = {
      author: { login: "Atharvchaskar008" },
      commit: {
        author: { name: "Atharv Chaskar", email: "atharv@example.com" },
      },
    };
    const isCandidate = gh.isCommitByCandidate(commit, "Atharvchaskar008", "Atharv Chaskar");
    assert.strictEqual(isCandidate, true);
  });

  test("Attributes historical unlinked email matching candidate handle or name tokens", () => {
    const commit = {
      author: null, // Unlinked commit (GitHub author is null)
      commit: {
        author: { name: "Atharv Chaskar", email: "atharvchaskar@gmail.com" },
      },
    };
    const isCandidate = gh.isCommitByCandidate(commit, "Atharvchaskar008", "Atharv Chaskar");
    assert.strictEqual(isCandidate, true);
  });

  test("Attributes commit in candidate-owned single-contributor personal repo", () => {
    const commit = {
      author: null,
      commit: {
        author: { name: "atharv-laptop", email: "user@local-machine.local" },
      },
    };
    // In candidate-owned repo where candidate is repository owner
    const isCandidate = gh.isCommitByCandidate(commit, "Atharvchaskar008", "Atharv Chaskar", "Atharvchaskar008");
    assert.strictEqual(isCandidate, true);
  });

  test("Rejects unrelated contributor with short substring collision (e.g. 'ann' in 'joann')", () => {
    const commit = {
      author: { login: "joanna_smith" },
      commit: {
        author: { name: "Joanna Smith", email: "joanna@company.com" },
      },
    };
    // Candidate handle is 'ann'
    const isCandidate = gh.isCommitByCandidate(commit, "ann", "Ann Taylor");
    assert.strictEqual(isCandidate, false, "Substring 'ann' should NOT match 'joanna_smith' or 'Joanna'");
  });

  test("Rejects foreign contributor on candidate repo", () => {
    const commit = {
      author: { login: "foreign_bot_user" },
      commit: {
        author: { name: "External Contributor", email: "external@bot.com" },
      },
    };
    const isCandidate = gh.isCommitByCandidate(commit, "Atharvchaskar008", "Atharv Chaskar", "Atharvchaskar008");
    assert.strictEqual(isCandidate, false);
  });

  // ==========================================
  // SUITE 3: HISTORICAL REPO DISCOVERY LOGIC
  // ==========================================
  console.log("\n--- SUITE 3: Paginated & Historical Repo Discovery ---");

  await asyncTest("Paginated discovery collects repos beyond page 1 (>100 repos) and deduplicates", async () => {
    const mockGh = new GitHubService();
    let pageCount = 0;
    mockGh.octokit = {
      repos: {
        listForUser: async ({ page }) => {
          pageCount++;
          if (page === 1) {
            return {
              data: Array.from({ length: 100 }, (_, i) => ({
                id: i + 1,
                name: `repo-${i + 1}`,
                full_name: `testuser/repo-${i + 1}`,
                owner: { login: "testuser" },
                pushed_at: "2024-01-01T00:00:00Z",
              })),
            };
          } else if (page === 2) {
            return {
              data: [
                {
                  id: 101,
                  name: "nutanx-historical",
                  full_name: "testuser/nutanx-historical",
                  owner: { login: "testuser" },
                  pushed_at: "2021-05-01T00:00:00Z", // very old repository
                },
                {
                  id: 102,
                  name: "repo-archived-2020",
                  full_name: "testuser/repo-archived-2020",
                  owner: { login: "testuser" },
                  archived: true,
                  pushed_at: "2020-03-01T00:00:00Z",
                },
              ],
            };
          }
          return { data: [] };
        },
        get: async () => {
          throw new Error("Not found");
        },
      },
    };

    const repos = await mockGh.listAllUserRepos("testuser");
    assert.strictEqual(repos.length, 102);
    assert.ok(pageCount >= 2);
    assert.strictEqual(repos[100].name, "nutanx-historical");
    assert.strictEqual(repos[101].archived, true);
  });

  await asyncTest("Resume-first discovery resolves explicit repo URL even when not in user list", async () => {
    const mockGh = new GitHubService();
    mockGh.octokit = {
      repos: {
        listForUser: async () => ({ data: [] }),
        get: async ({ owner, repo }) => {
          if (owner.toLowerCase() === "atharvchaskar008" && repo.toLowerCase() === "nutanx") {
            return {
              data: {
                id: 9999,
                name: "NutanX",
                full_name: "Atharvchaskar008/NutanX",
                owner: { login: "Atharvchaskar008" },
                html_url: "https://github.com/Atharvchaskar008/NutanX",
                pushed_at: "2022-01-01T00:00:00Z",
              },
            };
          }
          throw new Error("Not found");
        },
      },
    };

    const resumeProjects = [
      {
        name: "NutanX",
        repoUrl: "https://github.com/Atharvchaskar008/NutanX",
      },
    ];

    const discovered = await mockGh.discoverRepositories("Atharvchaskar008", resumeProjects);
    assert.strictEqual(discovered.length, 1);
    assert.strictEqual(discovered[0].full_name, "Atharvchaskar008/NutanX");
  });

  // ==========================================
  // SUITE 4: FRONTEND VERDICT PRECISION
  // ==========================================
  console.log("\n--- SUITE 4: Grounding & 4-State Verdict Precision ---");

  test("Grounding correctly sets VERIFIED for verified public git evidence", () => {
    const mockTelemetry = {
      projectAudits: [
        {
          projectName: "NutanX",
          found: true,
          repoFullName: "Atharvchaskar008/NutanX",
          candidateCommits: 43,
          linesAdded: 1284,
          linesDeleted: 312,
          languages: { JavaScript: 85, HTML: 10, CSS: 5 },
          matchConfidence: "DIRECT",
        },
      ],
      totalCommits: 43,
      totalLinesTouched: 1596,
      languages: { JavaScript: 85, HTML: 10, CSS: 5 },
    };

    const rawAI = {
      authenticityScore: 90,
      claimsAnalysis: [
        {
          claimedSkill: "NutanX",
          resumeClaim: "Built full web application with 43 commits",
          verdict: "VERIFIED",
          gitReality: "43 candidate-attributed commits found",
        },
      ],
    };

    const grounded = gemini.groundAuditReport(rawAI, mockTelemetry);
    assert.strictEqual(grounded.claimsAnalysis[0].verdict, "VERIFIED");
    assert.strictEqual(grounded.claimsAnalysis[0].confidence, "HIGH");
    assert.ok(grounded.claimsAnalysis[0].evidence.some((e) => e.includes("43 candidate-attributed commits")));
  });

  test("Grounding categorizes commercial/NDA project as NOT_AUDITABLE without penalizing", () => {
    const mockTelemetry = {
      projectAudits: [
        {
          projectName: "Confidential Enterprise Payment Gateway",
          found: false,
          candidateCommits: 0,
        },
      ],
      totalCommits: 0,
    };

    const rawAI = {
      claimsAnalysis: [
        {
          claimedSkill: "Confidential Enterprise Payment Gateway",
          resumeClaim: "Built internal commercial enterprise payment processing gateway under NDA",
          verdict: "UNVERIFIED",
        },
      ],
    };

    const grounded = gemini.groundAuditReport(rawAI, mockTelemetry);
    assert.strictEqual(grounded.claimsAnalysis[0].verdict, "NOT_AUDITABLE");
    assert.strictEqual(grounded.claimsAnalysis[0].confidence, "LOW");
    assert.ok(grounded.claimsAnalysis[0].evidence.some((e) => e.includes("Commercial/NDA")));
  });

  test("Grounding flags public claim with zero candidate commits as UNVERIFIED", () => {
    const mockTelemetry = {
      projectAudits: [
        {
          projectName: "OpenSourceTool",
          found: true,
          repoFullName: "otherorg/OpenSourceTool",
          candidateCommits: 0,
        },
      ],
      totalCommits: 0,
    };

    const rawAI = {
      claimsAnalysis: [
        {
          claimedSkill: "OpenSourceTool",
          resumeClaim: "Lead architect of open source tool",
          verdict: "VERIFIED", // AI hallucination
        },
      ],
    };

    const grounded = gemini.groundAuditReport(rawAI, mockTelemetry);
    assert.strictEqual(grounded.claimsAnalysis[0].verdict, "UNVERIFIED");
    assert.ok(grounded.claimsAnalysis[0].evidence.some((e) => e.includes("0 candidate commits")));
  });

  test("Authenticity score gives 100% when all auditable projects are VERIFIED (excluding NDA projects)", () => {
    const mockTelemetry = {
      projectAudits: [
        {
          projectName: "NutanX",
          found: true,
          repoFullName: "Atharvchaskar008/NutanX",
          candidateCommits: 43,
          linesAdded: 1284,
          linesDeleted: 312,
        },
      ],
      totalCommits: 43,
    };

    const rawAI = {
      claimsAnalysis: [
        {
          claimedSkill: "NutanX",
          resumeClaim: "Built web app with 43 commits",
          verdict: "VERIFIED",
        },
        {
          claimedSkill: "Confidential Bank Portal",
          resumeClaim: "Commercial enterprise financial portal under NDA",
          verdict: "NOT_AUDITABLE",
        },
      ],
    };

    const grounded = gemini.groundAuditReport(rawAI, mockTelemetry);
    // NutanX is VERIFIED (1.0), Bank Portal is NOT_AUDITABLE (excluded from denominator).
    // Auditable = 1, Verified = 1 -> score MUST be 100%!
    assert.strictEqual(grounded.authenticityScore, 100);
    assert.strictEqual(grounded.recommendation, "WORTHY");
  });

  test("Grounding excludes generic skills and retains ONLY candidate projects", () => {
    const mockTelemetry = {
      projectAudits: [
        {
          projectName: "NutanX",
          found: true,
          candidateCommits: 43,
        },
      ],
      totalCommits: 43,
    };

    const rawWithSkills = {
      claimsAnalysis: [
        {
          claimedSkill: "NutanX",
          resumeClaim: "Built NutanX",
          verdict: "VERIFIED",
        },
        {
          claimedSkill: "Docker & Containerization",
          resumeClaim: "Used Docker containers",
          verdict: "UNVERIFIED",
        },
        {
          claimedSkill: "Python & Data Engineering",
          resumeClaim: "Used Python scripts",
          verdict: "UNVERIFIED",
        },
      ],
    };

    const grounded = gemini.groundAuditReport(rawWithSkills, mockTelemetry);
    // Generic skills must be filtered out; ONLY NutanX project remains
    assert.strictEqual(grounded.claimsAnalysis.length, 1);
    assert.strictEqual(grounded.claimsAnalysis[0].claimedSkill, "NutanX");
    assert.strictEqual(grounded.authenticityScore, 100);
  });

  test("Deterministic grounding engine creates project-only claims with proper score", () => {
    const resumeText = `
ATHARV CHASKAR
Software Engineer

PROJECTS:
NutanX | React, Node.js, MongoDB
- Built full-stack collaborative platform with real-time sync.

Commercial Enterprise Billing Tool (Under NDA)
- Engineered high-throughput invoice engine for private enterprise client.
    `;

    const candidateStats = {
      username: "Atharvchaskar008",
      commitsCount: 43,
      totalLinesTouched: 1596,
      projectAudits: [
        {
          projectName: "NutanX",
          repoFullName: "Atharvchaskar008/NutanX",
          candidateCommits: 43,
          linesTouched: 1596,
          primaryLanguage: "JavaScript",
        },
      ],
    };

    const report = gemini.groundCandidateClaimsReal({ resumeText, candidateStats });
    assert.ok(report.claimsAnalysis.length >= 2);
    const nutanxClaim = report.claimsAnalysis.find((c) => c.claimedSkill.includes("NutanX"));
    const ndaClaim = report.claimsAnalysis.find((c) => c.verdict === "NOT_AUDITABLE");

    assert.ok(nutanxClaim, "NutanX project must be present");
    assert.strictEqual(nutanxClaim.verdict, "VERIFIED");
    assert.ok(ndaClaim, "Commercial NDA project must be present");
    assert.strictEqual(ndaClaim.verdict, "NOT_AUDITABLE");
    // Auditable = NutanX (VERIFIED) -> score is 100%!
    assert.strictEqual(report.authenticityScore, 100);
    assert.strictEqual(report.recommendation, "WORTHY");
  });

  // Summary
  console.log("\n=================================================");
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log("=================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error("Test execution failed:", e);
  process.exit(1);
});
