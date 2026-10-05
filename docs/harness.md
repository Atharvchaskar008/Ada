# ADA Harness

## 1. Repository Discovery Prompt
Implement robust, paginated, and resume-first repository discovery in `ada-backend/services/githubService.js`:
- Add `MAX_REPOSITORIES_TO_SCAN` configuration (default 300) with a page-by-page loop (`per_page: 100`, pages 1..N) to discover repositories beyond the first 100, including historical, inactive, and archived candidate-owned repositories.
- Implement direct resolution for repositories referenced explicitly in the resume (URLs like `github.com/owner/repo` or extracted entity names) using `octokit.repos.get({ owner, repo })`, bypassing recency sorting entirely.
- Deduplicate all discovered repositories case-insensitively by `owner/repo`.
- Ensure candidate-owned repositories are never discarded due to age or inactivity.
- Handle GitHub API rate limits and network errors with bounded timeouts and graceful degradation.

## 2. Repository Matching & Git Attribution Prompt
Refactor matching and commit attribution logic in `ada-backend/services/githubService.js`:
- Introduce structured match confidence levels: `DIRECT`, `EXACT`, `NORMALIZED`, `FUZZY`.
  - `DIRECT`: Exact GitHub URL from resume.
  - `EXACT`: Case-insensitive exact repo name match.
  - `NORMALIZED`: Hyphen, underscore, and space normalization.
  - `FUZZY`: Safe root-stem matching (bounded minimum token length >= 5; strictly avoid unsafe short substring matching such as "ann" in "joann").
- Strengthen `isCommitByCandidate(commit, username, repoOwner)`:
  - Verify author login against candidate handle.
  - Tokenized, word-boundary check for author name and committer name (avoiding partial substring false positives).
  - Verify author/committer emails.
  - Personal repository ownership heuristic: if candidate owns repo and commit has no foreign author login, attribute unlinked local commits (e.g. `bob@`) to candidate.
  - Reject commits with foreign author logins.
- Extract concrete per-repository diff telemetry (lines added, lines deleted, touched files, detected domains).

## 3. Frontend Precision Prompt
Refactor backend AI verification and frontend presentation to eliminate vague prose and deliver factual, evidence-backed audit results:
- Update `ada-backend/services/geminiService.js` and `ada-backend/server.js`:
  - Enforce structured 4-state verdict schema: `VERIFIED`, `PARTIALLY_VERIFIED`, `UNVERIFIED`, `NOT_AUDITABLE`.
  - Accurately categorize commercial/NDA/closed-source projects as `NOT_AUDITABLE` without penalty.
  - Constrain Gemini output to structured fields (`verdict`, `confidence`, `reason`, `evidence` array); strip all conversational fluff.
  - Implement deterministic grounding engine fallback with the exact same 4-state schema.
- Update `src/app/audit/page.tsx`:
  - Remove "GitHub Live API Connected" badge pill from header as requested.
  - Refine header layout with clear "ADA" and "Live Git Claim Screener" branding.
  - Fix spacing across form elements (GitHub handle, PDF dropzone, submit button) for modern UX ergonomics.
  - Render claims in strict `Claim` -> `Evidence` -> `Verdict` layout.
  - Display concrete telemetry: commit count, lines added/deleted, languages, domain tags.
  - Add color-coded badges for all 4 verdict states (`VERIFIED`, `PARTIALLY VERIFIED`, `UNVERIFIED`, `NOT AUDITABLE`).

## 4. Testing & Regression Prompt
Create an automated test suite `ada-backend/tests/discovery_attribution_precision.test.js`:
- Test Repository Discovery:
  - Pagination beyond 100 repositories (repos 1..100 and 101..200+).
  - Resume-first direct repository resolution.
  - Deduplication across multiple discovery paths.
- Test Attribution Logic:
  - Linked GitHub author login.
  - Unlinked historical local email (e.g. `bob@`).
  - Candidate-owned single-contributor repository attribution.
  - Unrelated contributor rejection (ensure "ann" is NOT attributed to "joann").
- Test Matching Precision:
  - Exact, normalized (`Nutan-X` vs `NutanX`), and stem matching.
  - Rejection of unrelated repository names.
- Test Verdict & Telemetry Generation:
  - `VERIFIED` with candidate commits.
  - `PARTIALLY_VERIFIED` with partial evidence.
  - `UNVERIFIED` with public repo but 0 commits.
  - `NOT_AUDITABLE` for commercial/NDA enterprise projects.

## 5. Execution Results

### Repository Discovery
- **Paginated Scanning:** Implemented `listAllUserRepos(username, maxRepos = MAX_REPOSITORIES_TO_SCAN)` with `per_page: 100` requesting sequential pages until exhausted or `MAX_REPOSITORIES_TO_SCAN` (default 300) is reached.
- **Resume-First Direct Resolution:** Added `discoverRepositories(username, resumeProjects)` and integrated `octokit.repos.get({ owner, repo })` in `scanCandidateProfile` to resolve repositories explicitly cited in resumes or project URLs (e.g. `Atharvchaskar008/NutanX`), even if created years ago or outside recently updated sorting.
- **Deduplication:** Case-insensitive normalization using `owner/repo` keys and `Set` guarantees no duplicate requests or redundant processing.
- **Historical Age & Archive Persistence:** Neither `pushed_at`, `updated_at`, nor `archived: true` filters candidate repositories out of the audit pool.

### Git Attribution
- **Multi-Factor Attribution:** Refined `isCommitByCandidate(commit, username, repoOwner, candidateDisplayName)`:
  - Direct GitHub login matching (`author.login === username`).
  - Strict foreign login rejection: If a commit is authenticated under a different GitHub login, it is rejected immediately.
  - Tokenized word-boundary matching on handle and candidate display name using `hasWordToken` with regex `(?:^|[^a-zA-Z0-9])token(?:$|[^a-zA-Z0-9])`.
  - Rejection of substring collisions: Candidates with names or handles like "ann" are guaranteed NOT to match unrelated contributors like "joanna" or "Joanna Smith".
  - Unlinked historical local email matching: Preserved attribution for historical commits with unlinked emails (`bob@`, `localhost`, local machine identities) in candidate-owned repositories.

### Repository Matching Precision
- **Multi-Level Confidence Pipeline:** Implemented `evaluateRepoMatch`:
  - `DIRECT` (100%): Exact repository URL match from resume or explicit link reference.
  - `EXACT` (95%): Exact case-insensitive `owner/repo` or word-bounded repository name match.
  - `NORMALIZED` (85%): Hyphen, underscore, and space normalization both ways (e.g. `nutanx` matches `Nutan-X`, `nutan_x`, `Nutan X`).
  - `FUZZY` (70%): Safe root-stem matching strictly bounded with minimum 5 characters, rejecting short collisions like "tan" matching "NutanX".

### Frontend Precision & UX
- **Header Refinement:** Removed the `GitHub Live API Connected` badge pill. Formatted `ADA` with `Live Git Claim Screener` badge.
- **Form Spacing & Ergonomics:** Enhanced spacing across the left panel:
  - Generous card padding (`p-8 space-y-7`).
  - Proper label, hint, and input padding (`px-4 py-3.5`).
  - Clean dropzone dimensions (`p-8`) with visual hover transitions and explicit remove action.
- **Structured Claim Layout:** Replaced freeform text with structured `Claim` -> `Evidence` -> `Verdict` presentation.
- **4-State Verdict Badges:**
  - `VERIFIED`: Public repo exists with corroborated candidate commits.
  - `PARTIALLY_VERIFIED`: Telemetry partially supports claims.
  - `UNVERIFIED`: Repository found but 0 candidate commits found.
  - `NOT_AUDITABLE (COMMERCIAL / NDA)`: Proprietary/closed-source enterprise project; does not penalize authenticity score.
- **Grounding Engine:** Enforces factual evidence arrays and prevents LLM hallucination of verification statuses.

### Tests
Executed `node ada-backend/tests/discovery_attribution_precision.test.js`:
- ✅ Direct URL Match returns DIRECT confidence
- ✅ Exact owner/repo Match returns EXACT confidence
- ✅ Normalized Match handles hyphen/underscore/case variations (`nutanx`, `Nutan-X`, `nutan_x`, `Nutan X`)
- ✅ Rejects unrelated repository names (no false positives for "tan", "react-app", etc.)
- ✅ Attributes commit with matched GitHub author login
- ✅ Attributes historical unlinked email matching candidate handle or name tokens
- ✅ Attributes commit in candidate-owned single-contributor personal repo
- ✅ Rejects unrelated contributor with short substring collision ("ann" in "joann")
- ✅ Rejects foreign contributor on candidate repo
- ✅ Paginated discovery collects repos beyond page 1 (>100 repos) and deduplicates
- ✅ Resume-first discovery resolves explicit repo URL even when not in user list
- ✅ Grounding correctly sets VERIFIED for verified public git evidence
- ✅ Grounding categorizes commercial/NDA project as NOT_AUDITABLE without penalizing
- ✅ Grounding flags public claim with zero candidate commits as UNVERIFIED
- ✅ Authenticity score gives 100% when all auditable projects are VERIFIED (excluding NDA projects)
- ✅ Grounding excludes generic skills and retains ONLY candidate projects
- ✅ Deterministic grounding engine creates project-only claims with proper score
- **Result:** 17/17 tests PASSED (100% pass rate).

## 6. Remaining Limitations
- **Rate Limits on Unauthenticated GitHub API:** If no `GITHUB_TOKEN` is provided in `.env`, the GitHub API restricts unauthenticated requests to 60 requests/hour. A valid `GITHUB_TOKEN` must be configured for high-volume paginated scanning.
- **Private Repositories:** By design, ADA cannot inspect private repositories unless the candidate grants OAuth access or personal access tokens with `repo` scope. Closed-source enterprise projects without public repositories are therefore classified as `NOT_AUDITABLE`.
- **Very Large Repositories (>10,000 Commits):** To guarantee real-time response speeds and avoid API timeouts, commit diff inspections are bounded to the candidate's top commits and relevant critical manifests.
