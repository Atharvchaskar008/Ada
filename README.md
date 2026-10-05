# ADA — Autonomous Git Claim & Engineering Credential Verification Engine

ADA is an automated engineering verification platform designed for technical recruiters, engineering leaders, and hiring teams. It validates technical claims stated on candidate resumes against **ground-truth telemetry retrieved from live Git version control records**.

Instead of relying on unverified resume claims or subjective self-assessments, ADA extracts candidate projects, discovers public repositories across the candidate's entire GitHub history, attributes Git commits to the candidate using multi-signal identity matching, and evaluates whether the actual committed source code substance corroborates the claimed technologies, architectures, and metrics.

---

## The Problem ADA Solves

* **Resume Inflation & Generative Overstatement**: Candidates frequently list complex technologies, infrastructure tools, or performance metrics for projects where their actual contribution was trivial, non-existent, or limited to configuration/boilerplate.
* **Flawed Screening Filters**: Traditional Applicant Tracking Systems (ATS) rely on keyword density. Candidates who overstate their experience rank highest, while high-signal engineers who understate get screened out.
* **Manual Technical Due Diligence Bottleneck**: Engineering managers spend hours manually clicking through candidate GitHub profiles, navigating commit logs, and inspecting pull requests to verify authentic authorship.
* **Commercial / NDA Blind Spots**: Real engineering experience often includes proprietary or commercial work without public code. Standard checkers penalize candidates unfairly for lacking public repositories on commercial projects. ADA cleanly isolates commercial claims as `NOT_AUDITABLE` without degrading authenticity scores.

---

## System Architecture

### 1. High-Level Component & Service Topology

```mermaid
graph TB
    subgraph Client ["Frontend Client (Next.js 16 App Router)"]
        Landing["Landing Page<br/>(src/app/page.tsx)"]
        Hero["Hero Section & Intake<br/>(src/components/ui/hero-section.tsx)"]
        Features["Features Breakdown<br/>(src/components/ui/features-section.tsx)"]
        CTA["Call to Action<br/>(src/components/ui/cta-section.tsx)"]
        AuditPage["Audit Route<br/>(src/app/audit/page.tsx)"]
        Dashboard["Minimalist Dashboard<br/>(src/components/audit/AuditDashboard.tsx)"]
    end

    subgraph Backend ["Audit & Telemetry Engine (Express / Node.js)"]
        Server["Express HTTP Router<br/>(backend/server.js)"]
        Multer["In-Memory PDF Stream Ingestion<br/>(Multer MemoryStorage)"]
        PDFParser["Resume Parser<br/>(pdf-parse)"]
        GeminiSvc["Entity Extraction & Grounding<br/>(backend/services/geminiService.js)"]
        GithubSvc["Discovery & Attribution Engine<br/>(backend/services/githubService.js)"]
        FileClassifier["AST & File Complexity Scorer<br/>(backend/services/fileClassifier.js)"]
    end

    subgraph Persistence ["Persistence Layer"]
        Mongo[("MongoDB<br/>ada_talent")]
        FallbackMap[("In-Memory Resilience Cache<br/>(Offline / Dev Fallback)")]
    end

    subgraph External ["External Integrations"]
        GitHubAPI["GitHub REST API v3<br/>(@octokit/rest)"]
        GeminiAPI["Google Gemini 2.5 Flash<br/>(@google/generative-ai)"]
    end

    Hero -->|"Upload Resume (multipart/form-data)"| Server
    Dashboard -->|"Trigger Live Audit / Fetch Status"| Server
    Server --> Multer --> PDFParser
    Server --> GeminiSvc
    Server --> GithubSvc
    GithubSvc --> FileClassifier
    GithubSvc -->|"Paginated Repos & Commit Diffs"| GitHubAPI
    GeminiSvc -->|"Structured Schema & Claim Grounding"| GeminiAPI
    Server -->|"Persist Audit & Candidate Records"| Mongo
    Mongo -.->|"Fallback if Unreachable"| FallbackMap
```

---

### 2. Per-Project Exact Correlation & Telemetry Verification Flow

This core architecture ensures project claims are correlated exclusively to their **exact corresponding repository** rather than aggregated in a generic pool:

```mermaid
flowchart TD
    A["Resume PDF Upload"] --> B["PDF Text & Structure Extraction"]
    B --> C["Project Block Parser"]
    
    C --> D1["Project 1: Primary Repo<br/>(Direct URL or Slug Match)"]
    C --> D2["Project 2: Secondary Project<br/>(Discovered via Catalog)"]
    C --> D3["Project 3: Enterprise / NDA<br/>(No Public Footprint)"]
    
    D1 --> E1["Octokit Scan: Project 1 Repo<br/>(Candidate Commits, Lines, Languages, Diffs)"]
    D2 --> E2["Octokit Scan: Project 2 Repo<br/>(Candidate Commits, Lines, Languages, Diffs)"]
    D3 --> E3["Isolated as NOT_AUDITABLE<br/>(Excluded from Penalty Denominator)"]
    
    E1 --> F["Gemini 2.5 Flash Grounding Engine"]
    E2 --> F
    E3 --> F
    
    F --> G["Minimalist Poppins Dashboard<br/>(Project Card -> Exact Repo -> Verified Telemetry)"]
```

---

### 3. Historical Repository Discovery & Commit Attribution Pipeline

```mermaid
flowchart TD
    A[Candidate Uploads Resume PDF / Text] --> B[Resume Ingestion & Entity Parser]
    B -->|Extracts Handle & Project References| C[GitHub Profile & Repository Discovery]
    C -->|Paginated Fetch up to 300 Repositories| D[Project Name & Root-Stem Matcher]
    D -->|Targeted Project Repositories| E[Live Git Telemetry Engine]
    E -->|Bypasses 'author' API filter| F[Multi-Criteria Commit Attribution]
    F -->|Count Commits, Diffs, Lines, Domains| G[Per-Project Telemetry Aggregator]
    G --> H{Gemini 2.5 Flash / Grounding Engine}
    H -->|Verified / Partially Verified / Unverified / NDA| I[Decision Engine]
    I --> J[Minimalist Executive Dashboard]
```

---

### 4. Strict Git Author Attribution Decision Flow

Attributing code to a candidate requires separating candidate contributions from team members, open-source maintainers, and bots:

```mermaid
flowchart TD
    Start["New Commit from Repository History"] --> CheckLogin{"Does commit have a linked GitHub author login?"}
    
    CheckLogin -- Yes --> LoginMatch{"Does author.login match candidate handle?"}
    LoginMatch -- Yes --> Attributed["ATTRIBUTED<br/>(Direct GitHub Account Match)"]
    LoginMatch -- No --> Foreign["FOREIGN / EXCLUDED<br/>(Belongs to another contributor)"]
    
    CheckLogin -- No (Unlinked Commit) --> TokenCheck{"Do Git author name or email tokens (≥3 chars)<br/>match candidate username or real name?"}
    TokenCheck -- Yes --> AttributedEmail["ATTRIBUTED<br/>(Unlinked Git Committer Match)"]
    
    TokenCheck -- No --> RepoOwnerCheck{"Is candidate the sole owner<br/>of this personal repository?"}
    RepoOwnerCheck -- Yes --> PersonalFallback["ATTRIBUTED<br/>(Personal Repo Unlinked Author Fallback)"]
    RepoOwnerCheck -- No --> UnlinkedForeign["EXCLUDED<br/>(Unattributed third-party committer)"]
```

---

## Verification Methodology & Core Algorithms

### 1. Paginated Historical Repository Discovery

Candidate projects are often built years prior to resume submission. Simple repository list endpoints (`per_page=30`) fail to locate early work if the candidate has accumulated forks or stars since. 

ADA implements **deep paginated discovery** (`discoverCandidateRepositories` in [`backend/services/githubService.js`](file:///c:/Users/athar/OneDrive/Desktop/My%20personal%20Projects%20for%20learning/Ada/Ada/backend/services/githubService.js)):
* Fetches up to `MAX_REPOSITORIES_TO_SCAN` (default `300`) using `per_page=100`.
* Deduplicates repositories across pages.
* Automatically prioritizes explicit repository URLs extracted directly from resume project links.

### 2. Multi-Tier Repository Matching Engine

Project names on resumes rarely match GitHub repository names character-for-character (e.g., "NutanX File System" vs. repo `nutanx`, or "AERIX Drone Platform" vs. `aerix`). ADA uses a 4-tier waterfall matcher (`findMatchingRepository`):

1. **Direct URL Match**: Exact match on extracted project link or hint.
2. **Exact Slug Match**: Case-insensitive comparison after stripping separators (`-`, `_`, `.`).
3. **Word-Boundary Match**: Matches discrete words from the project name against the repository slug.
4. **Token Substring Score**: Evaluates shared token overlap, filtering out common stop words to prevent false positives.

### 3. File-Level Classification & Complexity Weighting

Contributions are not measured merely by raw lines of code. ADA classifies every modified file ([`backend/services/fileClassifier.js`](file:///c:/Users/athar/OneDrive/Desktop/My%20personal%20Projects%20for%20learning/Ada/Ada/backend/services/fileClassifier.js)) into 5 categories:

| Category | File Extensions / Patterns | Weight | Verification Significance |
| :--- | :--- | :---: | :--- |
| **Core Logic** | `.js`, `.ts`, `.py`, `.go`, `.rs`, `.java`, `.cpp`, `.c`, `.rb` | `1.0` | Primary proof of domain implementation |
| **Infrastructure** | `Dockerfile`, `.k8s.yaml`, `terraform/`, `compose.yml` | `0.8` | Proof of deployment and cloud claims |
| **Tests** | `*.test.*`, `*.spec.*`, `__tests__/`, `test/` | `0.7` | Proof of test suite claims |
| **Docs & Config** | `README.md`, `.eslintrc`, `tsconfig.json`, `.gitignore` | `0.2` | Low weight; prevents markdown inflation |
| **Vendor / Dependency**| `package-lock.json`, `yarn.lock`, `vendor/` | `0.0` | Excluded from engineering effort scores |

---

## 4-State Verification Verdict System

Every project on the resume is evaluated into one of four unambiguous states:

```text
┌────────────────────┬────────────────────────────────────────────────────────────────────────┐
│ Verdict State      │ Definition & Trigger Criteria                                          │
├────────────────────┼────────────────────────────────────────────────────────────────────────┤
│ VERIFIED           │ Authentic public repository found. Candidate has verified commits.     │
│                    │ Diff content corroborates core tech stack and claimed architecture.    │
├────────────────────┼────────────────────────────────────────────────────────────────────────┤
│ PARTIALLY_VERIFIED │ Repository found with candidate commits, but certain claimed tools,    │
│                    │ architectural layers, or performance claims lack code evidence.        │
├────────────────────┼────────────────────────────────────────────────────────────────────────┤
│ UNVERIFIED         │ Repository identified, but candidate has 0 attributable commits,       │
│                    │ or code substance directly contradicts claimed implementation role.    │
├────────────────────┼────────────────────────────────────────────────────────────────────────┤
│ NOT_AUDITABLE      │ Commercial enterprise, NDA-bound, or proprietary project with no       │
│                    │ public repository. Excluded from penalizing Authenticity Score.        │
└────────────────────┴────────────────────────────────────────────────────────────────────────┘
```

### Authenticity Score Formula

$$\text{Authenticity Score} = \frac{\sum \text{Score}(\text{auditable project})}{\text{Count}(\text{auditable projects})} \times 100$$

$$\text{Where: } \text{Score}(\text{VERIFIED}) = 1.0, \quad \text{Score}(\text{PARTIALLY\_VERIFIED}) = 0.5, \quad \text{Score}(\text{UNVERIFIED}) = 0.0$$

> **Note:** Projects marked `NOT_AUDITABLE` are excluded from the denominator, ensuring commercial engineers with proprietary backgrounds are never unfairly penalized.

---

## Technology Stack

### Frontend Client
* **Framework**: Next.js 16.2.11 (React 19, TypeScript 5, Turbopack)
* **Styling**: Tailwind CSS v4, PostCSS, Google Poppins typography
* **Icons & Micro-interactions**: Lucide React, Framer Motion
* **Export**: jsPDF (client-side dynamic audit summary export)

### Backend Service
* **Runtime**: Node.js (ES Modules, `type: module`)
* **Web Framework**: Express 4.21.2, CORS, Multer (Memory Storage)
* **Document Processing**: `pdf-parse` (binary buffer extraction)
* **GitHub Integration**: `@octokit/rest` 21.1.1 (GitHub REST API v3)
* **AI & Grounding**: `@google/generative-ai` 0.24.1 (Google Gemini 2.5 Flash)
* **Database & ORM**: MongoDB with Mongoose 9.10.4 (with in-memory fallback)

---

## Project Structure

```text
Ada/
├── .env.example                                 # Root environment configuration template
├── .gitignore                                   # Standard ignore rules (env, node_modules, build artifacts)
├── components.json                              # UI component configuration
├── eslint.config.mjs                            # ESLint 9 configuration
├── next.config.ts                               # Next.js configuration
├── package.json                                 # Root workspace configuration & unified execution scripts
├── postcss.config.mjs                           # PostCSS Tailwind CSS v4 configuration
├── tsconfig.json                                # TypeScript configuration
├── backend/                                     # Express Telemetry & Audit Service
│   ├── .env.example                             # Backend environment template
│   ├── package.json                             # Backend dependencies & test scripts
│   ├── server.js                                # Express server, API routing, MongoDB connection
│   ├── models/
│   │   ├── Audit.js                             # Mongoose schema for audit runs & project claims
│   │   └── Candidate.js                         # Mongoose schema for candidate profiles
│   ├── services/
│   │   ├── fileClassifier.js                    # AST & file-extension complexity scoring
│   │   ├── geminiService.js                     # Gemini entity extraction & telemetry grounding
│   │   └── githubService.js                     # Octokit discovery, matching & attribution logic
│   └── tests/
│       └── discovery_attribution_precision.test.js # 17 automated tests for discovery & attribution
├── docs/                                        # Deep Architectural Documentation & Specifications
│   ├── harness.md                               # Test harness runbooks & verification records
│   └── pipeline.md                              # End-to-end telemetry mapping & matching pipeline
├── public/                                      # Static assets & brand icons
└── src/                                         # Next.js App Router Frontend
    ├── app/
    │   ├── audit/
    │   │   └── page.tsx                         # Verification dashboard route (renders AuditDashboard)
    │   ├── favicon.ico
    │   ├── globals.css                          # Global design system & theme tokens
    │   ├── layout.tsx                           # Root HTML layout with Google Poppins typography
    │   └── page.tsx                             # Landing page (Hero, Features, CTA, Footer)
    ├── components/
    │   ├── audit/
    │   │   └── AuditDashboard.tsx               # Minimalist high-density audit dashboard
    │   └── ui/                                  # Modular UI primitives
    │       ├── cta-section.tsx                  # Call to action section
    │       ├── features-section.tsx             # Verification features & telemetry cards
    │       ├── footer.tsx                       # Global footer component
    │       ├── hero-section.tsx                 # Hero section with intake dropzone & screener
    │       ├── navbar.tsx                       # Navigation bar with branding & login action
    │       ├── smooth-scrolling.tsx             # Lenis smooth-scrolling wrapper
    │       ├── ElectricBorder.tsx / .css        # Visual styling primitives
    │       ├── Galaxy.tsx / .css                # Interactive WebGL background canvas
    │       └── ShapeGrid.tsx                    # Background grid visual effect
    └── lib/
        └── utils.ts                             # Class merge utility (clsx + tailwind-merge)
```

---

## API Reference

### 1. Run Verification Audit
`POST /api/audit`

Accepts a resume PDF via `multipart/form-data` or a JSON payload specifying a candidate GitHub handle.

**Multipart Form Data:**
* `resumePdf`: Candidate PDF file (`application/pdf`).
* `username` *(Optional)*: Override or explicit candidate handle.

### 2. Retrieve Past Audits
`GET /api/audits`
Returns an array of historical candidate audits.

### 3. Retrieve Specific Audit
`GET /api/audits/:id`
Returns a single audit by MongoDB ObjectId.

### 4. System Overview Metrics
`GET /api/stats/overview`
Returns platform aggregates (`totalAudits`, `avgAuthenticityScore`, `verifiedProjectsCount`).

### 5. Health Check
`GET /health`
Returns server status and database connectivity (`status: healthy`, `database: connected`).

---

## Local Setup & Development

### Prerequisites
* **Node.js**: v20.x or higher
* **npm**: v10.x or higher
* **MongoDB**: Local server on port `27017` (Optional; in-memory fallback activates if unavailable)
* **GitHub Personal Access Token**: Read-only `public_repo` scope for high API rate limits
* **Google Gemini API Key**: From Google AI Studio

### Step 1: Clone & Configure Environment

```bash
# Clone the repository
git clone https://github.com/your-username/ada.git
cd ada

# Copy environment templates
cp .env.example .env
cp .env.example backend/.env
```

Edit `.env` and provide your API keys:
```ini
GITHUB_TOKEN=ghp_yourActualGitHubPersonalAccessToken
GEMINI_API_KEY=AIzaSyYourActualGoogleGeminiApiKey
MONGODB_URI=mongodb://127.0.0.1:27017/ada_talent
PORT=5000
```

### Step 2: Install Dependencies

```bash
# Install root (Next.js frontend) dependencies
npm install

# Install backend dependencies
cd backend && npm install && cd ..
```

### Step 3: Run the Test Suite

```bash
# Run backend test suite from root
npm test
```

### Step 4: Run Development Environment

```bash
# Concurrently launches Express backend (port 5000) and Next.js (port 3000)
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to access the landing page and verification dashboard.

---

## Validation & Test Coverage

ADA includes an automated test harness ([`backend/tests/discovery_attribution_precision.test.js`](file:///c:/Users/athar/OneDrive/Desktop/My%20personal%20Projects%20for%20learning/Ada/Ada/backend/tests/discovery_attribution_precision.test.js)) containing 17 rigorous test cases:

```bash
$ npm test

> ada-talent@0.1.0 test
> npm run test --prefix backend

> ada-backend@1.0.0 test
> node tests/discovery_attribution_precision.test.js

=================================================
ADA HISTORICAL REPO DISCOVERY & ATTRIBUTION TESTS
=================================================

--- SUITE 1: Repository Matching & Confidence ---
✅ PASS: Direct URL Match returns DIRECT confidence
✅ PASS: Exact owner/repo Match returns EXACT confidence
✅ PASS: Normalized Match handles hyphen/underscore/case variations
✅ PASS: Rejects unrelated repository names (no false positives)

--- SUITE 2: Git Author Attribution ---
✅ PASS: Attributes commit with matched GitHub author login
✅ PASS: Attributes historical unlinked email matching candidate handle or name tokens
✅ PASS: Attributes commit in candidate-owned single-contributor personal repo
✅ PASS: Rejects unrelated contributor with short substring collision (e.g. 'ann' in 'joann')
✅ PASS: Rejects foreign contributor on candidate repo

--- SUITE 3: Paginated & Historical Repo Discovery ---
✅ PASS: Paginated discovery collects repos beyond page 1 (>100 repos) and deduplicates
✅ PASS: Resume-first discovery resolves explicit repo URL even when not in user list

--- SUITE 4: Grounding & 4-State Verdict Precision ---
✅ PASS: Grounding correctly sets VERIFIED for verified public git evidence
✅ PASS: Grounding categorizes commercial/NDA project as NOT_AUDITABLE without penalizing
✅ PASS: Grounding flags public claim with zero candidate commits as UNVERIFIED
✅ PASS: Authenticity score gives 100% when all auditable projects are VERIFIED (excluding NDA projects)
✅ PASS: Grounding excludes generic skills and retains ONLY candidate projects
✅ PASS: Deterministic grounding engine creates project-only claims with proper score

=================================================
TOTAL TESTS: 17 | PASSED: 17 | FAILED: 0
=================================================
```
Made with love for the honesty

