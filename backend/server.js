import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config();

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import mongoose from 'mongoose';
import { GitHubService } from './services/githubService.js';
import { GeminiAuditService } from './services/geminiService.js';
import { Audit } from './models/Audit.js';
import { Candidate } from './models/Candidate.js';
import { PDFParse } from 'pdf-parse';

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ada_talent';

app.use(cors());
app.use(express.json());

let isMongoConnected = false;
const inMemoryAudits = [];

mongoose
  .connect(MONGODB_URI, { serverSelectionTimeoutMS: 2000 })
  .then(() => {
    isMongoConnected = true;
    console.log('Connected to MongoDB successfully.');
  })
  .catch(() => {
    isMongoConnected = false;
    console.warn('Using in-memory store for audits (MongoDB daemon not active).');
  });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const githubService = new GitHubService(process.env.GITHUB_TOKEN);
const geminiService = new GeminiAuditService(process.env.GEMINI_API_KEY);

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Ada HR Audit Engine (MERN)',
    mongoConnected: isMongoConnected,
    geminiConfigured: !!process.env.GEMINI_API_KEY,
    githubConfigured: !!process.env.GITHUB_TOKEN,
  });
});

// 5 Real Test Candidate Profiles (Audited live against GitHub)
app.get('/api/presets', (req, res) => {
  res.json([
    {
      id: 'atharv',
      name: '1. Atharv Chaskar (Full-Stack & Systems)',
      tag: 'WORTHY',
      color: 'emerald',
      candidateName: 'Atharv Chaskar',
      username: 'Atharvchaskar008',
      repoUrl: '',
      resumeText: `Atharv Chaskar - Full-Stack & Systems Engineer
Projects:
1. Argus & Depscan: Built backend security scanners and vulnerability analyzers in Python and JavaScript.
2. TamperSafe: Engineered system integrity monitoring and tamper protection mechanisms.
3. Web Platforms: Developed responsive web applications in React and Next.js.`,
    },
    {
      id: 'antirez',
      name: '2. Salvatore Sanfilippo (Redis Creator)',
      tag: 'WORTHY',
      color: 'emerald',
      candidateName: 'Salvatore Sanfilippo',
      username: 'antirez',
      repoUrl: 'https://github.com/redis/redis',
      resumeText: `Salvatore Sanfilippo - Principal Systems Architect & Creator
Projects:
1. Redis: Designed core in-memory key-value database engine in C. Implemented single-threaded event loop, AOF persistence, master-replica replication, and memory eviction algorithms.
2. Systems Optimization: Reduced latency under high-concurrency workloads.`,
    },
    {
      id: 'gaearon',
      name: '3. Dan Abramov (Redux / React Core)',
      tag: 'WORTHY',
      color: 'emerald',
      candidateName: 'Dan Abramov',
      username: 'gaearon',
      repoUrl: 'https://github.com/reduxjs/redux',
      resumeText: `Dan Abramov - Frontend Systems Engineer
Projects:
1. Redux: Co-created Redux state container for JavaScript apps. Implemented store dispatch pipeline, reducer composition, middleware architecture, and time-travel debugging.`,
    },
    {
      id: 'sindresorhus',
      name: '4. Sindre Sorhus (Node.js Libraries)',
      tag: 'WORTHY',
      color: 'emerald',
      candidateName: 'Sindre Sorhus',
      username: 'sindresorhus',
      repoUrl: 'https://github.com/sindresorhus/got',
      resumeText: `Sindre Sorhus - Open-Source Engineer
Projects:
1. Got: Engineered human-friendly and powerful HTTP request library for Node.js. Built promise-based retry logic, stream handling, and pagination.`,
    },
    {
      id: 'docker-imposter-test',
      name: '5. DevOps Imposter (Exaggeration Test)',
      tag: 'REJECT',
      color: 'red',
      candidateName: 'Imposter Candidate',
      username: 'Atharvchaskar008',
      repoUrl: '',
      resumeText: `Lead Cloud & Kubernetes Architect
Projects:
1. Enterprise Cloud: Architected enterprise multi-cluster Kubernetes deployments and automated Docker CI/CD pipelines. 100% of my time was spent orchestrating containers and cloud infrastructure.`,
    },
  ]);
});

// List Recent Audits (MongoDB)
app.get('/api/audits', async (req, res) => {
  try {
    if (isMongoConnected) {
      const audits = await Audit.find().sort({ createdAt: -1 }).limit(20);
      return res.json(audits);
    }
    res.json(inMemoryAudits);
  } catch {
    res.status(500).json({ error: 'Failed to fetch audits' });
  }
});

// 100% Real Live Audit Route
app.post('/api/audit', upload.single('resumePdf'), async (req, res) => {
  try {
    let resumeText = req.body.resumeText;
    const { username, repoUrl, geminiApiKey } = req.body;

    // 1. Parse Resume (PDF or Text)
    if (req.file) {
      try {
        const parser = new PDFParse({ data: req.file.buffer });
        const parsedPdf = await parser.getText();
        resumeText = parsedPdf?.text || '';
      } catch (pdfErr) {
        console.warn('PDFParse primary parser error, using buffer scanner:', pdfErr.message);
        const raw = req.file.buffer.toString('binary');
        const textMatches = raw.match(/[A-Za-z0-9\s.,;:/\-_()]{4,}/g);
        resumeText = textMatches ? textMatches.join(' ') : '';
        if (!resumeText) {
          return res.status(400).json({ error: `Could not parse PDF: ${pdfErr.message}` });
        }
      }
    }

    if (!resumeText || !resumeText.trim()) {
      return res.status(400).json({ error: 'Please provide a PDF resume or resume text.' });
    }

    let cleanUsername = username ? username.trim().replace(/^@/, '') : '';
    if (cleanUsername.includes('github.com/')) {
      const parts = cleanUsername.split('github.com/')[1].split('/')[0];
      cleanUsername = parts.replace(/[^a-zA-Z0-9_-]/g, '');
    }

    if (!cleanUsername && resumeText) {
      const { detectedUsername } = githubService.extractEntitiesFromResume(resumeText);
      if (detectedUsername) {
        cleanUsername = detectedUsername;
      }
    }

    if (!cleanUsername) {
      return res.status(400).json({ error: 'Please provide a candidate GitHub username or include your GitHub link in the resume.' });
    }

    // 2. Real Live GitHub Telemetry Scan (Repository auto-discovered from resume)
    console.log(`[ADA AUDIT] Running real live GitHub scan for @${cleanUsername}...`);
    const ghResult = await githubService.analyzeContribution({
      username: cleanUsername,
      resumeText,
    });

    if (!ghResult || !ghResult.candidateStats) {
      return res.status(404).json({
        error: `Could not retrieve public repositories or commits for @${cleanUsername} on GitHub. Please verify the handle.`,
      });
    }

    const { repoInfo, candidateStats } = ghResult;
    console.log(
      `[ADA AUDIT] Retrieved real Git telemetry: ${candidateStats.commitsCount} commits, ${candidateStats.totalLinesTouched} lines touched across ${repoInfo.name}`
    );

    // 3. Grounded RAG Audit against real Git facts
    const auditReport = await geminiService.runAudit({
      resumeText,
      candidateStats,
      repoInfo,
      customApiKey: geminiApiKey,
    });

    const claims = (auditReport.claimsAnalysis || []).map((c) => {
      const matchedProject = candidateStats.projectAudits?.find((p) =>
        c.claimedSkill?.toLowerCase().includes(p.projectName.toLowerCase())
      );
      return {
        skill: c.claimedSkill,
        targetRepo: c.targetRepo || matchedProject?.repoFullName || null,
        claim: c.resumeClaim,
        reality: c.gitReality,
        verdict: c.verdict || (c.verified ? 'VERIFIED' : 'UNVERIFIED'),
        confidence: c.confidence || 'HIGH',
        evidence: Array.isArray(c.evidence) && c.evidence.length > 0 ? c.evidence : [c.gitReality],
        verified: c.verdict === 'VERIFIED',
      };
    });

    const auditableClaims = claims.filter((c) => c.verdict !== 'NOT_AUDITABLE');
    const auditableCount = auditableClaims.length;
    let finalScore = 100;
    if (auditableCount > 0) {
      const verifiedCount = auditableClaims.filter((c) => c.verdict === 'VERIFIED').length;
      const partialCount = auditableClaims.filter((c) => c.verdict === 'PARTIALLY_VERIFIED').length;
      finalScore = Math.round(((verifiedCount + partialCount * 0.5) / auditableCount) * 100);
    }

    let decision = 'WORTHY';
    if (finalScore < 40) {
      decision = 'REJECT';
    } else if (finalScore < 75) {
      decision = 'PROCEED';
    }

    auditReport.authenticityScore = finalScore;
    auditReport.recommendation = decision;

    const auditRecord = {
      candidateName: cleanUsername,
      githubUsername: candidateStats.username,
      decision,
      verifiedCount: auditableClaims.filter((c) => c.verdict === 'VERIFIED').length,
      totalClaimsCount: claims.length || 1,
      authenticityScore: finalScore,
      claims,
      gitTelemetry: {
        commitsCount: candidateStats.commitsCount,
        linesCount: candidateStats.totalLinesTouched,
        primaryDomain: candidateStats.breakdown?.[0]?.label || 'Code',
        dockerLines: candidateStats.breakdown?.find((b) => b.domain === 'devops_docker')?.lines || 0,
        reposScanned: [repoInfo.name],
      },
      createdAt: new Date(),
    };

    // 4. MERN Database Persistence
    if (isMongoConnected) {
      try {
        const saved = await Audit.create(auditRecord);
        auditRecord._id = saved._id;
        await Candidate.findOneAndUpdate(
          { githubUsername: candidateStats.username },
          { name: cleanUsername, latestDecision: decision, $inc: { auditsCount: 1 } },
          { upsert: true, returnDocument: 'after' }
        );
      } catch (dbErr) {
        console.warn('Could not save to MongoDB:', dbErr.message);
      }
    } else {
      auditRecord._id = `audit_${Date.now()}`;
      inMemoryAudits.unshift(auditRecord);
    }

    // 5. Send Real Response
    res.json({
      success: true,
      repoInfo,
      candidateStats,
      auditReport,
      persistedAudit: auditRecord,
    });
  } catch (error) {
    console.error('Audit execution error:', error);
    res.status(500).json({ error: error.message || 'Failed to complete candidate audit.' });
  }
});

app.listen(PORT, () => {
  console.log(`Ada HR Audit Engine (MERN) listening on port ${PORT}`);
});
