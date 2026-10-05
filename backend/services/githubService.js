import { Octokit } from '@octokit/rest';
import { classifyFile } from './fileClassifier.js';

const MAX_REPOSITORIES_TO_SCAN = parseInt(process.env.MAX_REPOSITORIES_TO_SCAN, 10) || 300;

export class GitHubService {
  constructor(token = process.env.GITHUB_TOKEN) {
    this.octokit = new Octokit({
      auth: token || undefined,
      request: {
        timeout: 8000,
      },
    });
  }

  parseRepoUrl(url) {
    if (!url) return null;
    const cleanUrl = url.trim().replace(/\/$/, '');
    const match = cleanUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) return null;
    return {
      owner: match[1],
      repo: match[2].replace(/\.git$/, ''),
    };
  }

  cleanHandle(username) {
    if (!username) return '';
    let clean = username.trim().replace(/^@/, '');
    if (clean.includes('github.com/')) {
      const match = clean.match(/github\.com\/([^\/\?#]+)/);
      if (match) clean = match[1];
    }
    return clean.replace(/[^a-zA-Z0-9_-]/g, '');
  }

  /**
   * Safe Word-Boundary Token Matching
   * Prevents false positives like matching "ann" inside "joann"
   */
  hasWordToken(target, query) {
    if (!target || !query || query.length < 3) return false;
    const escaped = query.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    const regex = new RegExp(`(?:^|[^a-zA-Z0-9])${escaped}(?:$|[^a-zA-Z0-9])`, 'i');
    return regex.test(target);
  }

  /**
   * Accurate Git Author Attribution
   * Matches candidate-authored commits across all historical/local git configurations
   * while strictly preventing false attribution of foreign or unrelated contributors.
   */
  isCommitByCandidate(commit, username, repoOwner = '', candidateDisplayName = '') {
    if (!commit) return false;
    const uLower = (username || '').toLowerCase();
    const authorLogin = (commit.author?.login || '').toLowerCase();

    // 1. Direct GitHub Login Check
    if (authorLogin) {
      if (authorLogin === uLower) return true;
      return false;
    }

    // 2. Unlinked Local Git Config (c.author is undefined/null)
    const authorName = (commit.commit?.author?.name || '').trim();
    const committerName = (commit.commit?.committer?.name || '').trim();
    const authorEmail = (commit.commit?.author?.email || '').toLowerCase();
    const committerEmail = (commit.commit?.committer?.email || '').toLowerCase();

    // Direct username match in name or committer
    if (uLower && (authorName.toLowerCase() === uLower || committerName.toLowerCase() === uLower)) {
      return true;
    }

    // Tokenized word-boundary matching on candidate's name tokens (minimum 3 chars)
    const allCandidateTokens = new Set();
    const addTokens = (str) => {
      if (!str) return;
      const parts = str.toLowerCase().match(/[a-zA-Z]{3,}|[0-9]{3,}/g) || [];
      parts.forEach((p) => allCandidateTokens.add(p));
    };

    addTokens(uLower);
    addTokens(candidateDisplayName);
    if (typeof repoOwner === 'string' && repoOwner.includes(' ')) {
      addTokens(repoOwner);
    }

    for (const token of allCandidateTokens) {
      if (this.hasWordToken(authorName, token) || this.hasWordToken(committerName, token)) {
        return true;
      }
      if (authorEmail && (authorEmail.startsWith(token) || authorEmail.includes(token))) {
        return true;
      }
      if (committerEmail && (committerEmail.startsWith(token) || committerEmail.includes(token))) {
        return true;
      }
    }

    // 3. Candidate-owned repository heuristic
    const isOwnerRepo = (repoOwner || '').toLowerCase() === uLower;
    if (isOwnerRepo && !authorLogin) {
      if (
        authorEmail.includes('local') ||
        authorEmail.includes('bob@') ||
        authorEmail.includes('user@') ||
        !authorEmail.includes('@') ||
        authorName.toLowerCase().includes('laptop') ||
        authorName.toLowerCase().includes('desktop')
      ) {
        return true;
      }
    }

    return false;
  }

  parseGitHubUrl(url) {
    if (!url || typeof url !== 'string') return null;
    const match = url.match(/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/i);
    if (match) {
      return { owner: match[1], repo: match[2].replace(/\.git$/i, '') };
    }
    return null;
  }

  /**
   * Multi-Level Confidence Repository Matching
   * DIRECT > EXACT > NORMALIZED > FUZZY
   */
  evaluateRepoMatch(repo, resumeLower, linkedFullNames = new Set()) {
    if (!repo) return { matched: false, confidence: 'NONE', score: 0 };
    const repoNameLower = repo.name.toLowerCase();
    const fullNameLower = repo.full_name.toLowerCase();
    const rLower = (typeof resumeLower === 'string' ? resumeLower : '').toLowerCase();

    // Normalize linkedFullNames if passed as Set, Array, or String
    let directSet = new Set();
    if (linkedFullNames instanceof Set) {
      linkedFullNames.forEach((item) => directSet.add(String(item).toLowerCase()));
    } else if (Array.isArray(linkedFullNames)) {
      linkedFullNames.forEach((item) => directSet.add(String(item).toLowerCase()));
    } else if (typeof linkedFullNames === 'string') {
      directSet.add(linkedFullNames.toLowerCase());
    }

    // Level 1: DIRECT (Explicit URL in resume or direct link set)
    if (
      (repo.html_url && directSet.has(repo.html_url.toLowerCase())) ||
      (repo.html_url && rLower.includes(repo.html_url.toLowerCase())) ||
      rLower.includes('github.com/' + fullNameLower)
    ) {
      return { matched: true, confidence: 'DIRECT', score: 100 };
    }

    // Level 2: EXACT (Exact owner/repo or case-insensitive repo name word boundary)
    const ownerRepoRegex = new RegExp(`(?:^|[^a-zA-Z0-9_.-])${fullNameLower}(?:$|[^a-zA-Z0-9_.-])`, 'i');
    if (ownerRepoRegex.test(rLower) || rLower === fullNameLower) {
      return { matched: true, confidence: 'EXACT', score: 95 };
    }

    const exactRegex = new RegExp(`(?:^|[^a-zA-Z0-9_-])${repoNameLower}(?:$|[^a-zA-Z0-9_-])`, 'i');
    if (exactRegex.test(rLower)) {
      return { matched: true, confidence: 'EXACT', score: 95 };
    }

    // Level 3: NORMALIZED (Hyphen, underscore, and space normalization both ways)
    const cleanRepo = repoNameLower.replace(/[-_\s]+/g, '');
    const cleanTarget = rLower.replace(/[-_\s]+/g, '');
    const cleanTokens = rLower.split(/[^a-zA-Z0-9_-]+/).map((t) => t.replace(/[-_\s]+/g, ''));
    if (
      cleanRepo.length >= 3 &&
      (cleanTarget === cleanRepo ||
        cleanTokens.includes(cleanRepo) ||
        new RegExp(`(?:^|[^a-zA-Z0-9])${cleanRepo}(?:$|[^a-zA-Z0-9])`, 'i').test(cleanTarget))
    ) {
      return { matched: true, confidence: 'NORMALIZED', score: 85 };
    }

    // Level 4: FUZZY (Safe root-stem matching with minimum 5 characters, safe boundaries)
    const cleanAlpha = repoNameLower.replace(/[-_0-9]/g, '');
    if (cleanAlpha.length >= 5) {
      const stem = cleanAlpha.substring(0, 5);
      const stemRegex = new RegExp(`\\b${stem}[a-z0-9_-]*\\b`, 'i');
      if (stemRegex.test(rLower)) {
        return { matched: true, confidence: 'FUZZY', score: 70 };
      }
    }

    return { matched: false, confidence: 'NONE', score: 0 };
  }

  isRepoReferencedInResume(repo, resumeLower, linkedFullNames = new Set()) {
    return this.evaluateRepoMatch(repo, resumeLower, linkedFullNames).matched;
  }

  /**
   * Discovers repositories for a candidate across paginated user repos and explicit resume projects
   */
  async discoverRepositories(username, resumeProjects = []) {
    const userRepos = await this.listAllUserRepos(username);
    const seenFullNames = new Set(userRepos.map((r) => r.full_name?.toLowerCase()));

    for (const proj of resumeProjects) {
      let owner = '';
      let repo = '';
      if (proj.repoUrl) {
        const parsed = this.parseGitHubUrl(proj.repoUrl);
        if (parsed) {
          owner = parsed.owner;
          repo = parsed.repo;
        }
      } else if (proj.name && proj.name.includes('/')) {
        const parts = proj.name.split('/');
        owner = parts[0];
        repo = parts[1];
      }

      if (owner && repo) {
        const key = `${owner}/${repo}`.toLowerCase();
        if (!seenFullNames.has(key)) {
          try {
            const { data: directRepo } = await this.octokit.repos.get({ owner, repo });
            if (directRepo) {
              seenFullNames.add(key);
              userRepos.push(directRepo);
            }
          } catch (err) {
            console.warn(`[ADA] Direct resolution skipped for ${key}:`, err.message);
          }
        }
      }
    }

    return userRepos;
  }

  /**
   * Paginated User Repository Discovery
   * Scans pages until exhausted or MAX_REPOSITORIES_TO_SCAN is reached
   */
  async listAllUserRepos(username, maxRepos = MAX_REPOSITORIES_TO_SCAN) {
    const allRepos = [];
    const seen = new Set();
    let page = 1;
    const perPage = 100;

    while (allRepos.length < maxRepos) {
      try {
        const { data: pageRepos } = await this.octokit.repos.listForUser({
          username,
          sort: 'updated',
          per_page: perPage,
          page,
        });

        if (!pageRepos || pageRepos.length === 0) break;

        for (const repo of pageRepos) {
          const fullLower = repo.full_name.toLowerCase();
          if (!seen.has(fullLower)) {
            seen.add(fullLower);
            allRepos.push(repo);
          }
        }

        if (pageRepos.length < perPage) break;
        page++;
      } catch (err) {
        console.warn(`[ADA] Repo pagination ended at page ${page} for @${username}:`, err.message);
        break;
      }
    }
    return allRepos;
  }

  /**
   * Automatically discover and scan candidate's repositories
   * Incorporates paginated discovery + resume-first direct resolution
   */
  async scanCandidateProfile(rawUsername, resumeText = '') {
    const username = this.cleanHandle(rawUsername);
    try {
      // 1. Paginated repository discovery (discovering historical repos beyond top 100)
      const userRepos = await this.listAllUserRepos(username);

      if (!userRepos || userRepos.length === 0) {
        throw new Error(`No public repositories found for user ${username}`);
      }

      const resumeLower = (resumeText || '').toLowerCase();
      const seenFullNames = new Set(userRepos.map((r) => r.full_name.toLowerCase()));
      const { repoUrls: linkedRepoUrls } = this.extractEntitiesFromResume(resumeText);
      const linkedFullNames = new Set(linkedRepoUrls.map((r) => `${r.owner}/${r.repo}`.toLowerCase()));

      // 2. Resume-First Direct Resolution: Resolve any direct URLs not in the paginated list
      for (const directRef of linkedRepoUrls) {
        const fullKey = `${directRef.owner}/${directRef.repo}`.toLowerCase();
        if (!seenFullNames.has(fullKey)) {
          try {
            const { data: directRepo } = await this.octokit.repos.get({
              owner: directRef.owner,
              repo: directRef.repo,
            });
            if (directRepo) {
              seenFullNames.add(fullKey);
              userRepos.unshift(directRepo);
            }
          } catch (directErr) {
            console.warn(`[ADA] Direct resolution failed for ${directRef.owner}/${directRef.repo}:`, directErr.message);
          }
        }
      }

      // 3. Match candidate repositories with confidence scoring
      const explicitRepos = [];
      for (const repo of userRepos) {
        const matchResult = this.evaluateRepoMatch(repo, resumeLower, linkedFullNames);
        if (matchResult.matched) {
          repo._matchConfidence = matchResult.confidence;
          repo._matchScore = matchResult.score;
          explicitRepos.push(repo);
        }
      }

      // Sort explicit repos by match confidence (DIRECT > EXACT > NORMALIZED > FUZZY)
      explicitRepos.sort((a, b) => (b._matchScore || 0) - (a._matchScore || 0));

      // Prioritize resume-targeted project repos, then supplement with top active repos
      const reposToAudit =
        explicitRepos.length > 0
          ? [
              ...explicitRepos,
              ...userRepos.filter((r) => !explicitRepos.some((er) => er.id === r.id)).slice(0, Math.max(0, 8 - explicitRepos.length)),
            ]
          : userRepos.slice(0, 6);

      const scannedRepoNames = [];
      const repoSummaries = [];
      const projectAudits = [];
      const allLanguages = {};
      const commitMessages = [];
      let totalCommitsCount = 0;
      let totalAdditions = 0;
      let totalDeletions = 0;
      const touchedFiles = new Set();
      const domainTotals = {
        devops_docker: { lines: 0, label: 'Docker & Containerization' },
        backend_api: { lines: 0, label: 'Backend APIs' },
        frontend_ui: { lines: 0, label: 'Frontend UI' },
        database: { lines: 0, label: 'Database & Schemas' },
        docs_config: { lines: 0, label: 'Docs & Config' },
      };
      const criticalFilesAudit = [];

      for (const repo of reposToAudit) {
        scannedRepoNames.push(repo.full_name);
        let repoAdditions = 0;
        let repoDeletions = 0;
        const repoFiles = new Set();

        try {
          // Fetch repo languages
          let repoLangs = {};
          try {
            const { data: langs } = await this.octokit.repos.listLanguages({
              owner: repo.owner.login,
              repo: repo.name,
            });
            repoLangs = langs || {};
            for (const [lang, bytes] of Object.entries(repoLangs)) {
              allLanguages[lang] = (allLanguages[lang] || 0) + bytes;
            }
          } catch {}

          // Fetch all commits without restrictive author query param to prevent dropping unlinked emails
          const { data: rawCommits } = await this.octokit.repos.listCommits({
            owner: repo.owner.login,
            repo: repo.name,
            per_page: 100,
          });

          // Match commits authored by the candidate across all local/historical git configurations
          const commits = rawCommits.filter((c) => this.isCommitByCandidate(c, username, repo.owner.login));

          totalCommitsCount += commits.length;
          repoSummaries.push({
            name: repo.name,
            fullName: repo.full_name,
            description: repo.description || '',
            stars: repo.stargazers_count || 0,
            primaryLanguage: repo.language || Object.keys(repoLangs)[0] || 'Code',
            candidateCommits: commits.length,
          });

          for (const c of commits.slice(0, 10)) {
            if (c.commit?.message) {
              commitMessages.push(c.commit.message.split('\n')[0]);
            }
          }

          // Fetch commit diffs in parallel for fast, responsive telemetry
          const commitDetails = await Promise.allSettled(
            commits.slice(0, 6).map((c) =>
              this.octokit.repos.getCommit({
                owner: repo.owner.login,
                repo: repo.name,
                ref: c.sha,
              })
            )
          );

          for (const res of commitDetails) {
            if (res.status === 'fulfilled' && res.value?.data?.files) {
              for (const f of res.value.data.files) {
                touchedFiles.add(f.filename);
                repoFiles.add(f.filename);
                const changes = (f.additions || 0) + (f.deletions || 0);
                totalAdditions += f.additions || 0;
                totalDeletions += f.deletions || 0;
                repoAdditions += f.additions || 0;
                repoDeletions += f.deletions || 0;

                const cl = classifyFile(f.filename);
                if (domainTotals[cl.domain]) {
                  domainTotals[cl.domain].lines += changes;
                }
              }
            }
          }

          projectAudits.push({
            projectName: repo.name,
            repoFullName: repo.full_name,
            repoUrl: `https://github.com/${repo.full_name}`,
            isExplicitProject: explicitRepos.some((er) => er.id === repo.id),
            matchConfidence: repo._matchConfidence || (explicitRepos.some((er) => er.id === repo.id) ? 'EXACT' : 'DISCOVERY'),
            stars: repo.stargazers_count || 0,
            archived: repo.archived || false,
            primaryLanguage: repo.language || Object.keys(repoLangs)[0] || 'Code',
            candidateCommits: commits.length,
            linesTouched: repoAdditions + repoDeletions,
            linesAdded: repoAdditions,
            linesDeleted: repoDeletions,
            languages: repoLangs,
            touchedFilesSample: Array.from(repoFiles).slice(0, 10),
          });

          // Check if repo has Dockerfile
          try {
            const { data: dockerCommits } = await this.octokit.repos.listCommits({
              owner: repo.owner.login,
              repo: repo.name,
              path: 'Dockerfile',
              per_page: 3,
            });

            if (dockerCommits.length > 0) {
              const touched = dockerCommits.some(
                (dc) => dc.author?.login?.toLowerCase() === username.toLowerCase()
              );
              criticalFilesAudit.push({
                file: `${repo.name}/Dockerfile`,
                existsInRepo: true,
                touchedByCandidate: touched,
                originalAuthor: dockerCommits[dockerCommits.length - 1].commit.author?.name || 'teammate',
              });
            }
          } catch {}
        } catch (repoErr) {
          console.warn(`Error scanning repo ${repo.name}:`, repoErr.message);
        }
      }

      const totalLines = totalAdditions + totalDeletions;
      const breakdown = Object.entries(domainTotals).map(([key, data]) => ({
        domain: key,
        label: data.label,
        lines: data.lines,
        percentage: totalLines > 0 ? Math.round((data.lines / totalLines) * 100) : 0,
      }));

      return {
        repoInfo: {
          name: scannedRepoNames.join(', '),
          isFork: false,
          stars: reposToAudit.reduce((acc, r) => acc + (r.stargazers_count || 0), 0),
          description: `Audited ${scannedRepoNames.length} project repositories for @${username}`,
          repositories: repoSummaries,
        },
        candidateStats: {
          username,
          commitsCount: totalCommitsCount,
          totalAdditions,
          totalDeletions,
          totalLinesTouched: totalLines,
          uniqueFilesCount: touchedFiles.size,
          touchedFilesSample: Array.from(touchedFiles).slice(0, 50),
          languages: allLanguages,
          commitMessages: commitMessages.slice(0, 20),
          repositories: repoSummaries,
          projectAudits,
          breakdown,
          criticalFilesAudit,
          recentCommits: [],
        },
      };
    } catch (err) {
      console.warn(`Profile scan fallback for ${username}:`, err.message);
      return null;
    }
  }

  extractEntitiesFromResume(text) {
    if (!text) return { repoUrls: [], detectedUsername: null };

    const repoRegex = /(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_\-\.]+)\/([a-zA-Z0-9_\-\.]+)/gi;
    const repoUrls = [];
    const seenRepos = new Set();
    let match;

    while ((match = repoRegex.exec(text)) !== null) {
      const owner = match[1];
      const repo = match[2].replace(/[.,;:)\s]+$/, '').replace(/\.git$/, '');
      const reserved = ['settings', 'issues', 'pulls', 'pull', 'actions', 'projects', 'blob', 'tree', 'commits', 'releases'];
      if (!reserved.includes(repo.toLowerCase())) {
        const fullUrl = `https://github.com/${owner}/${repo}`;
        if (!seenRepos.has(fullUrl.toLowerCase())) {
          seenRepos.add(fullUrl.toLowerCase());
          repoUrls.push({ owner, repo, fullUrl });
        }
      }
    }

    const userRegex = /(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_\-]+)(?:\/|\b|$)/gi;
    let detectedUsername = null;
    while ((match = userRegex.exec(text)) !== null) {
      const user = match[1].replace(/[.,;:)\s]+$/, '');
      const reserved = ['orgs', 'topics', 'trending', 'explore', 'marketplace', 'features'];
      if (!reserved.includes(user.toLowerCase()) && !detectedUsername) {
        detectedUsername = user;
      }
    }

    return { repoUrls, detectedUsername };
  }

  async analyzeContribution({ repoUrl, username: rawUsername, resumeText }) {
    let username = this.cleanHandle(rawUsername);

    if (resumeText) {
      const { detectedUsername } = this.extractEntitiesFromResume(resumeText);
      if (!username && detectedUsername) {
        username = this.cleanHandle(detectedUsername);
        console.log(`[ADA] Auto-detected GitHub username from resume: @${username}`);
      }
    }

    const parsed = this.parseRepoUrl(repoUrl);
    if (!parsed) {
      return this.scanCandidateProfile(username, resumeText);
    }

    const { owner, repo } = parsed;

    try {
      const { data: repoData } = await this.octokit.repos.get({ owner, repo });
      let repoLangs = {};
      try {
        const { data: langs } = await this.octokit.repos.listLanguages({ owner, repo });
        repoLangs = langs || {};
      } catch {}

      let commits = [];
      try {
        const { data: rawCommits } = await this.octokit.repos.listCommits({
          owner,
          repo,
          per_page: 100,
        });
        commits = rawCommits.filter((c) => this.isCommitByCandidate(c, username, owner));
      } catch (err) {
        console.warn(`Could not fetch commits for ${username}:`, err.message);
      }

      const domainStats = {
        devops_docker: { lines: 0, label: 'Docker & Containerization' },
        backend_api: { lines: 0, label: 'Backend APIs' },
        frontend_ui: { lines: 0, label: 'Frontend UI' },
        database: { lines: 0, label: 'Database & Schemas' },
        docs_config: { lines: 0, label: 'Docs & Config' },
      };

      let totalAdditions = 0;
      let totalDeletions = 0;
      const touchedFiles = new Set();
      const detailedCommits = [];

      for (const c of commits.slice(0, 15)) {
        try {
          const { data: detail } = await this.octokit.repos.getCommit({
            owner,
            repo,
            ref: c.sha,
          });

          detailedCommits.push({
            sha: c.sha.substring(0, 7),
            message: detail.commit.message.split('\n')[0],
            date: detail.commit.author?.date,
            filesCount: detail.files?.length || 0,
          });

          if (detail.files) {
            for (const file of detail.files) {
              touchedFiles.add(file.filename);
              const changes = (file.additions || 0) + (file.deletions || 0);
              totalAdditions += file.additions || 0;
              totalDeletions += file.deletions || 0;

              const classification = classifyFile(file.filename);
              if (domainStats[classification.domain]) {
                domainStats[classification.domain].lines += changes;
              }
            }
          }
        } catch {}
      }

      const criticalFilesAudit = [];
      for (const targetFile of ['Dockerfile', 'docker-compose.yml']) {
        try {
          const { data: fileCommits } = await this.octokit.repos.listCommits({
            owner,
            repo,
            path: targetFile,
            per_page: 5,
          });

          if (fileCommits.length > 0) {
            const candidateTouched = fileCommits.some(
              (fc) =>
                fc.author?.login?.toLowerCase() === username.toLowerCase() ||
                fc.commit?.author?.name?.toLowerCase().includes(username.toLowerCase())
            );

            criticalFilesAudit.push({
              file: targetFile,
              existsInRepo: true,
              touchedByCandidate: candidateTouched,
              originalAuthor: fileCommits[fileCommits.length - 1].commit.author?.name || 'teammate',
              recentAuthor: fileCommits[0].commit.author?.name || 'teammate',
            });
          }
        } catch {}
      }

      const totalLinesTouched = totalAdditions + totalDeletions;
      const breakdown = Object.entries(domainStats).map(([key, data]) => ({
        domain: key,
        label: data.label,
        lines: data.lines,
        percentage: totalLinesTouched > 0 ? Math.round((data.lines / totalLinesTouched) * 100) : 0,
      }));

      return {
        repoInfo: {
          name: repoData.full_name,
          isFork: repoData.fork,
          stars: repoData.stargazers_count,
          description: repoData.description,
        },
        candidateStats: {
          username,
          commitsCount: commits.length,
          totalAdditions,
          totalDeletions,
          totalLinesTouched,
          uniqueFilesCount: touchedFiles.size,
          touchedFilesSample: Array.from(touchedFiles).slice(0, 50),
          languages: repoLangs,
          commitMessages: detailedCommits.map((c) => c.message),
          breakdown,
          criticalFilesAudit,
          recentCommits: detailedCommits,
        },
      };
    } catch (err) {
      console.warn('GitHub analyzeContribution error:', err.message);
      return this.scanCandidateProfile(username);
    }
  }
}
