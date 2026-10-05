"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Upload,
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldAlert,
  FileCode,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  GitCommit,
  Code2,
  FolderGit2,
  GitBranch,
  Terminal,
  Shield,
  Check,
} from "lucide-react";
import jsPDF from "jspdf";

interface ClaimCheck {
  project: string;
  targetRepo?: string;
  claim: string;
  reality: string;
  verdict: "VERIFIED" | "PARTIALLY_VERIFIED" | "UNVERIFIED" | "NOT_AUDITABLE";
  evidence?: string[];
  confidence?: string;
  verified: boolean;
}

interface AuditData {
  candidateName: string;
  username: string;
  decision: "REJECT" | "PROCEED" | "WORTHY";
  summary: string;
  authenticityScore: number;
  claims: ClaimCheck[];
  dominantDomain: string;
  commitsCount: number;
  linesCount: number;
  reposScanned: string;
}

export function AuditDashboard() {
  const [username, setUsername] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [auditResult, setAuditResult] = useState<AuditData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setFileName(file.name);
      setError(null);
    }
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setFileName("");
  };

  const handleRunAudit = async () => {
    if (!selectedFile) {
      setError("Please select or drop a candidate resume PDF.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("resumePdf", selectedFile);
      if (username.trim()) {
        formData.append("username", username.trim());
      }

      const res = await fetch("http://localhost:5000/api/audit", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to audit candidate.");
      }

      const data = await res.json();
      const report = data.auditReport || {};
      const candidateStats = data.candidateStats || {};
      const repoInfo = data.repoInfo || {};

      const claims: ClaimCheck[] = (report.claimsAnalysis || []).map((c: any) => {
        let v: "VERIFIED" | "PARTIALLY_VERIFIED" | "UNVERIFIED" | "NOT_AUDITABLE" = "UNVERIFIED";
        if (c.verdict === "VERIFIED") v = "VERIFIED";
        else if (c.verdict === "PARTIALLY_VERIFIED") v = "PARTIALLY_VERIFIED";
        else if (c.verdict === "NOT_AUDITABLE") v = "NOT_AUDITABLE";
        else v = "UNVERIFIED";

        return {
          project: c.claimedSkill || "Project Claim",
          targetRepo:
            c.targetRepo ||
            candidateStats.projectAudits?.find((p: any) =>
              c.claimedSkill?.toLowerCase().includes(p.projectName?.toLowerCase())
            )?.repoFullName ||
            "",
          claim: c.resumeClaim || "Resume claim",
          reality: c.gitReality || "No git activity found",
          verdict: v,
          evidence:
            Array.isArray(c.evidence) && c.evidence.length > 0
              ? c.evidence
              : [c.gitReality || "No telemetry found"],
          confidence: c.confidence || "MEDIUM",
          verified: v === "VERIFIED",
        };
      });

      const auditableClaims = claims.filter((c) => c.verdict !== "NOT_AUDITABLE");
      const auditableCount = auditableClaims.length;
      let calculatedScore = 100;
      if (auditableCount > 0) {
        const verifiedCount = auditableClaims.filter((c) => c.verdict === "VERIFIED").length;
        const partialCount = auditableClaims.filter((c) => c.verdict === "PARTIALLY_VERIFIED").length;
        calculatedScore = Math.round(((verifiedCount + partialCount * 0.5) / auditableCount) * 100);
      }

      const score = typeof report.authenticityScore === "number" ? report.authenticityScore : calculatedScore;

      let decision: "REJECT" | "PROCEED" | "WORTHY" = "WORTHY";
      if (score < 40 || report.recommendation === "REJECT" || report.recommendation === "HIGH_RISK_REJECT") {
        decision = "REJECT";
      } else if (score < 75 || report.recommendation === "PROCEED" || report.recommendation === "PROCEED_WITH_CAUTION") {
        decision = "PROCEED";
      }

      const primaryDomain =
        candidateStats.breakdown?.[0]?.label ||
        (Object.keys(candidateStats.languages || {})[0]
          ? `${Object.keys(candidateStats.languages)[0]} Engineering`
          : "Core Code");

      setAuditResult({
        candidateName: candidateStats.username || username.trim(),
        username: candidateStats.username || username.trim(),
        decision,
        summary: report.executiveSummary || `${score}% authenticity score verified across candidate's code repositories.`,
        authenticityScore: score,
        claims,
        dominantDomain: primaryDomain,
        commitsCount: candidateStats.commitsCount ?? 0,
        linesCount: candidateStats.totalLinesTouched ?? 0,
        reposScanned: repoInfo.name || "Public Repositories",
      });
    } catch (err: any) {
      setError(err.message || "Audit failed. Please verify the resume PDF or GitHub handle.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!auditResult) return;

    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("ADA TECHNICAL CLAIM AUDIT", 14, 20);

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Candidate: @${auditResult.username}`, 14, 30);
    doc.text(`Authenticity Score: ${auditResult.authenticityScore}% [${auditResult.decision}]`, 14, 37);
    doc.text(`Commits: ${auditResult.commitsCount} | Lines: ${auditResult.linesCount.toLocaleString()}`, 14, 44);

    let y = 56;
    doc.setFont("helvetica", "bold");
    doc.text("Project Claims vs Git Reality:", 14, y);
    y += 8;

    auditResult.claims.forEach((c) => {
      if (y > 260) {
        doc.addPage();
        y = 20;
      }
      doc.setFont("helvetica", "bold");
      doc.text(`[${c.verdict}] ${c.project} ${c.targetRepo ? `(${c.targetRepo})` : ""}`, 14, y);
      doc.setFont("helvetica", "normal");
      const claimLines = doc.splitTextToSize(`Claim: "${c.claim}"`, 175);
      doc.text(claimLines, 14, y + 5);
      y += 5 + claimLines.length * 4.5;

      const evidenceText = (c.evidence || [c.reality]).join(" | ");
      const realityLines = doc.splitTextToSize(`Evidence: ${evidenceText}`, 175);
      doc.text(realityLines, 14, y);
      y += realityLines.length * 4.5;

      const truthLine =
        c.verdict === "VERIFIED"
          ? "Status: The claim made in the resume is true based on Git repository evidence."
          : c.verdict === "PARTIALLY_VERIFIED"
          ? "Status: The claim made in the resume is partially true; some aspects lack Git evidence."
          : c.verdict === "NOT_AUDITABLE"
          ? "Status: Commercial / NDA project; no public repository available to verify."
          : "Status: The claim made in the resume is false or unsupported by Git repository evidence.";

      doc.setFont("helvetica", "bold");
      doc.text(truthLine, 14, y + 4);
      y += 10;
    });

    doc.save(`${auditResult.username}_Audit_Report.pdf`);
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-zinc-800">
      {/* Top Header - Flush at top */}
      <header className="sticky top-0 z-30 w-full border-b border-zinc-800/80 bg-black/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 md:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors border border-transparent hover:border-zinc-800"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </Link>
            <div className="h-4 w-px bg-zinc-800" />
            <div className="flex items-center gap-3">
              <span className="text-xl font-bold tracking-tight text-white font-mono">
                ADA
              </span>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-medium uppercase tracking-wider text-zinc-400 bg-zinc-900 border border-zinc-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>Live Git Screener</span>
              </div>
            </div>
          </div>
          {auditResult && (
            <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-zinc-400 bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-800">
              <span className="text-zinc-600">Candidate:</span>
              <span className="text-zinc-200 font-medium">@{auditResult.username}</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="max-w-7xl mx-auto px-6 md:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Panel: Candidate Intake */}
          <div className="lg:col-span-5 bg-zinc-950 border border-zinc-800/80 rounded-2xl p-7 space-y-6 shadow-xl">
            <div>
              <h2 className="text-lg font-semibold text-white tracking-tight">
                Candidate Verification
              </h2>
              <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                Upload resume PDF to audit claims against live GitHub telemetry and historical commit diffs.
              </p>
            </div>

            {/* GitHub Username Input */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-300">
                GitHub Handle
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 font-mono text-sm">
                  @
                </span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Atharvchaskar008"
                  className="w-full text-sm font-mono bg-black border border-zinc-800 focus:border-zinc-600 rounded-xl pl-8 pr-4 py-3 text-white placeholder-zinc-700 focus:outline-none transition-colors"
                />
              </div>
            </div>

            {/* PDF Upload Dropzone */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-300">
                Resume PDF
              </label>
              <label className="border-2 border-dashed border-zinc-800 hover:border-zinc-700 rounded-xl p-6 flex flex-col items-center justify-center bg-black cursor-pointer transition-colors block text-center group">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="w-10 h-10 rounded-lg bg-zinc-900 flex items-center justify-center mb-2.5 border border-zinc-800">
                  <Upload className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
                </div>
                <span className="text-sm text-zinc-300 font-medium">
                  {fileName || "Select or drop resume PDF"}
                </span>
              </label>

              {fileName && (
                <div className="flex items-center justify-between text-xs px-3.5 py-2.5 bg-zinc-900 rounded-lg border border-zinc-800">
                  <div className="flex items-center gap-2 truncate">
                    <FileCode className="w-4 h-4 text-zinc-400 shrink-0" />
                    <span className="text-zinc-200 truncate font-mono">{fileName}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearFile}
                    className="text-zinc-400 hover:text-white text-xs font-medium transition-colors px-2 py-1"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>

            {error && (
              <div className="p-3.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-rose-400 flex items-start gap-2.5">
                <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <div className="pt-2">
              <button
                onClick={handleRunAudit}
                disabled={isLoading}
                className={`w-full py-3.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2.5 ${
                  isLoading
                    ? "bg-zinc-900 text-zinc-500 cursor-not-allowed border border-zinc-800"
                    : "bg-white hover:bg-zinc-200 text-black active:scale-[0.99]"
                }`}
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Auditing Live Telemetry...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Run Live Git Audit</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Right Panel: Clean Monochromatic Telemetry Dashboard */}
          <div className="lg:col-span-7">
            {auditResult ? (
              <div className="space-y-6">
                {/* Top Metrics Row - Minimalist, Monochromatic Dark Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Score Card */}
                  <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-5 flex flex-col justify-between shadow-lg">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                      Authenticity Score
                    </span>
                    <div className="my-2.5">
                      <span className="text-4xl font-extrabold text-white tracking-tight font-mono">
                        {auditResult.authenticityScore}%
                      </span>
                    </div>
                    <div>
                      {auditResult.decision === "REJECT" && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-medium bg-zinc-900 text-rose-400 border border-zinc-800">
                          <span>High Risk Reject</span>
                        </span>
                      )}
                      {auditResult.decision === "PROCEED" && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-medium bg-zinc-900 text-amber-400 border border-zinc-800">
                          <span>Proceed w/ Caution</span>
                        </span>
                      )}
                      {auditResult.decision === "WORTHY" && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-medium bg-zinc-900 text-emerald-400 border border-zinc-800">
                          <span>Verified Worthy</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Public Commits Card */}
                  <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-5 flex flex-col justify-between shadow-lg">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                      <GitCommit className="w-3.5 h-3.5 text-zinc-400" />
                      Verified Commits
                    </span>
                    <div className="my-2.5">
                      <span className="text-3xl font-extrabold text-white font-mono">
                        {auditResult.commitsCount}
                      </span>
                    </div>
                    <span className="text-xs text-zinc-500 font-mono truncate">
                      @{auditResult.username}
                    </span>
                  </div>

                  {/* Lines Touched Card */}
                  <div className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-5 flex flex-col justify-between shadow-lg">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                      <Code2 className="w-3.5 h-3.5 text-zinc-400" />
                      Lines of Code
                    </span>
                    <div className="my-2.5">
                      <span className="text-3xl font-extrabold text-white font-mono">
                        {auditResult.linesCount.toLocaleString()}
                      </span>
                    </div>
                    <span className="text-xs text-zinc-500 truncate font-mono">
                      {auditResult.dominantDomain}
                    </span>
                  </div>
                </div>

                {/* Project Audit Cards */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <FolderGit2 className="w-4 h-4 text-zinc-400" />
                      <h3 className="text-sm font-semibold tracking-wide text-zinc-300">
                        Audited Projects ({auditResult.claims.length})
                      </h3>
                    </div>
                    <div className="flex items-center gap-2.5 text-xs font-mono">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 text-zinc-300 border border-zinc-800">
                        <Check className="w-3 h-3 text-emerald-400" />
                        {auditResult.claims.filter((c) => c.verdict === "VERIFIED").length} Verified
                      </span>
                      {auditResult.claims.some((c) => c.verdict === "NOT_AUDITABLE") && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800">
                          <Shield className="w-3 h-3" />
                          {auditResult.claims.filter((c) => c.verdict === "NOT_AUDITABLE").length} Commercial/NDA
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    {auditResult.claims.map((c, i) => {
                      const isVerified = c.verdict === "VERIFIED";
                      const isPartial = c.verdict === "PARTIALLY_VERIFIED";
                      const isNda = c.verdict === "NOT_AUDITABLE";
                      const isUnverified = c.verdict === "UNVERIFIED";

                      return (
                        <div
                          key={i}
                          className="bg-zinc-950 border border-zinc-800/80 hover:border-zinc-700/80 rounded-2xl p-6 transition-colors space-y-5 shadow-lg"
                        >
                          {/* Card Header: Project Title, Repo Link, Verdict Badge */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-900">
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="text-base font-bold text-white tracking-tight">
                                {c.project}
                              </span>
                              {c.targetRepo ? (
                                <a
                                  href={`https://github.com/${c.targetRepo}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 transition-colors"
                                >
                                  <GitBranch className="w-3 h-3 text-zinc-500" />
                                  <span>{c.targetRepo}</span>
                                  <ExternalLink className="w-2.5 h-2.5 text-zinc-500" />
                                </a>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-zinc-900 text-zinc-500 border border-zinc-800">
                                  No public repo linked
                                </span>
                              )}
                            </div>

                            {/* Verdict Badges (Minimal, Non-distracting) */}
                            <div>
                              {isVerified && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-900 text-emerald-400 border border-zinc-800">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>VERIFIED</span>
                                </span>
                              )}
                              {isPartial && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-900 text-amber-400 border border-zinc-800">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  <span>PARTIALLY VERIFIED</span>
                                </span>
                              )}
                              {isNda && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-900 text-zinc-400 border border-zinc-800">
                                  <ShieldAlert className="w-3.5 h-3.5" />
                                  <span>COMMERCIAL / NDA</span>
                                </span>
                              )}
                              {isUnverified && (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-900 text-rose-400 border border-zinc-800">
                                  <XCircle className="w-3.5 h-3.5" />
                                  <span>UNVERIFIED</span>
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Two-Tier Content: Resume Claim & Git Telemetry Evidence */}
                          <div className="space-y-3.5">
                            {/* 1. Resume Claim Citation */}
                            <div className="bg-zinc-900/40 border-l-2 border-zinc-700 rounded-r-lg p-3 space-y-1">
                              <span className="text-[10px] font-semibold tracking-wider uppercase text-zinc-400 flex items-center gap-1.5">
                                <FileCode className="w-3 h-3 text-zinc-400" />
                                <span>Resume Claim</span>
                              </span>
                              <p className="text-xs text-zinc-200 leading-relaxed font-sans pl-0.5">
                                "{c.claim}"
                              </p>
                            </div>

                            {/* 2. Grounded Telemetry Evidence */}
                            <div className="bg-black rounded-xl border border-zinc-900 p-4 space-y-2">
                              <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                                  <Terminal className="w-3 h-3 text-zinc-500" />
                                  <span>Git Telemetry Evidence</span>
                                </span>
                                <span className="text-[10px] font-mono text-zinc-600">
                                  Confidence: {c.confidence || "HIGH"}
                                </span>
                              </div>

                              <div className="space-y-1.5 font-mono text-xs">
                                {c.evidence && c.evidence.length > 0 ? (
                                  c.evidence.map((ev, idx) => (
                                    <div
                                      key={idx}
                                      className="flex items-start gap-2 text-zinc-300 leading-relaxed py-0.5"
                                    >
                                      <span className="text-zinc-500 shrink-0 mt-0.5 select-none font-bold">
                                        •
                                      </span>
                                      <span className="break-words">{ev}</span>
                                    </div>
                                  ))
                                ) : (
                                  <div className="text-zinc-500 italic py-1">
                                    {c.reality || "No commit telemetry found."}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* 3. Bottom Conclusion Line: Plain truth assessment */}
                          <div className="pt-3.5 border-t border-zinc-900/90 flex items-center">
                            {isVerified && (
                              <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
                                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                                <span>The claim made in resume is true based on Git repository evidence.</span>
                              </div>
                            )}
                            {isPartial && (
                              <div className="flex items-center gap-2 text-xs text-amber-400/90 font-medium">
                                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
                                <span>The claim made in resume is partially true with incomplete repository code.</span>
                              </div>
                            )}
                            {isUnverified && (
                              <div className="flex items-center gap-2 text-xs text-rose-400 font-medium">
                                <XCircle className="w-4 h-4 shrink-0 text-rose-500" />
                                <span>The claim made in resume is false or unsupported by Git repository code.</span>
                              </div>
                            )}
                            {isNda && (
                              <div className="flex items-center gap-2 text-xs text-zinc-400 font-medium">
                                <ShieldAlert className="w-4 h-4 shrink-0 text-zinc-500" />
                                <span>The claim made in resume is commercial / NDA; no public repository is available to verify.</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* PDF Report Export Button */}
                <button
                  onClick={handleDownloadPdf}
                  className="w-full py-3.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-sm font-semibold border border-zinc-800 shadow-lg flex items-center justify-center gap-2 transition-colors active:scale-[0.99]"
                >
                  <Download className="w-4 h-4 text-zinc-400" />
                  <span>Download Verified Engineering Audit PDF</span>
                </button>
              </div>
            ) : (
              <div className="min-h-[460px] border-2 border-dashed border-zinc-900 rounded-2xl flex flex-col items-center justify-center text-center p-10 bg-zinc-950/40">
                <div className="w-14 h-14 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-3">
                  <FileCode className="w-7 h-7 text-zinc-500" />
                </div>
                <h4 className="text-base font-semibold text-zinc-200">Awaiting Candidate Document</h4>
                <p className="text-xs text-zinc-500 max-w-sm mt-1.5 leading-relaxed">
                  Upload a candidate resume PDF to trigger deep repository discovery, commit telemetry ingestion, and AI claim verification.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default AuditDashboard;
