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
      y += realityLines.length * 4.5 + 6;
    });

    doc.save(`${auditResult.username}_Audit_Report.pdf`);
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-red-500/30">
      {/* Top Header - Fixed at absolute top with zero empty space */}
      <header className="sticky top-0 z-30 w-full border-b border-white/10 bg-black/85 backdrop-blur-2xl">
        <div className="max-w-7xl mx-auto px-6 md:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition-all duration-200 border border-transparent hover:border-white/10"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back</span>
            </Link>
            <div className="h-4 w-px bg-zinc-800" />
            <div className="flex items-center gap-3">
              <span className="text-xl font-black tracking-tight text-red-500 font-mono">
                ADA
              </span>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider text-zinc-300 bg-zinc-900/90 border border-white/10 shadow-inner">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Live Git Screener</span>
              </div>
            </div>
          </div>
          {auditResult && (
            <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-zinc-400 bg-zinc-950 px-3 py-1.5 rounded-xl border border-white/10">
              <span className="text-zinc-600">Candidate:</span>
              <span className="text-white font-medium">@{auditResult.username}</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="max-w-7xl mx-auto px-6 md:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Panel: Candidate Intake & File Dropzone */}
          <div className="lg:col-span-5 bg-gradient-to-b from-zinc-900/60 to-zinc-950/90 border border-white/10 backdrop-blur-xl rounded-2xl p-7 space-y-6 shadow-2xl">
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <span>Candidate Verification</span>
              </h2>
              <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                Upload resume PDF to audit claims against live GitHub telemetry and historical commit diffs.
              </p>
            </div>

            {/* GitHub Username Input */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
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
                  className="w-full text-sm font-mono bg-black/70 border border-white/10 focus:border-red-500/80 rounded-xl pl-8 pr-4 py-3 text-white placeholder-zinc-700 focus:outline-none transition-all duration-200"
                />
              </div>
            </div>

            {/* PDF Upload Dropzone */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Resume PDF
              </label>
              <label className="border-2 border-dashed border-white/10 hover:border-white/20 rounded-2xl p-7 flex flex-col items-center justify-center bg-black/50 hover:bg-black/80 cursor-pointer transition-all duration-300 block text-center group">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="w-12 h-12 rounded-xl bg-zinc-900/90 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300 border border-white/10 shadow-lg">
                  <Upload className="w-5 h-5 text-zinc-300 group-hover:text-white transition-colors" />
                </div>
                <span className="text-sm text-zinc-200 font-medium">
                  {fileName || "Select or drop resume PDF"}
                </span>
              </label>

              {fileName && (
                <div className="flex items-center justify-between text-xs px-4 py-2.5 bg-zinc-900/80 rounded-xl border border-white/10">
                  <div className="flex items-center gap-2 truncate">
                    <FileCode className="w-4 h-4 text-red-400 shrink-0" />
                    <span className="text-zinc-200 truncate font-mono">{fileName}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearFile}
                    className="text-red-400 hover:text-red-300 text-xs font-semibold transition-colors px-2 py-1 rounded hover:bg-red-950/40"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>

            {error && (
              <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-900/60 text-xs text-red-400 flex items-start gap-2.5">
                <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <div className="pt-2">
              <button
                onClick={handleRunAudit}
                disabled={isLoading}
                className={`w-full py-3.5 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2.5 shadow-xl ${
                  isLoading
                    ? "bg-zinc-900 text-zinc-500 cursor-not-allowed border border-white/5"
                    : "bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-red-600/30 hover:shadow-red-600/50 active:scale-[0.99]"
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

          {/* Right Panel: High-End Engineering Telemetry Dashboard */}
          <div className="lg:col-span-7">
            {auditResult ? (
              <div className="space-y-6">
                {/* Top Metrics Row - Glassmorphic Cards with Neon Status Highlights */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Score & Decision Card */}
                  <div className="relative overflow-hidden bg-gradient-to-br from-zinc-900/80 via-zinc-950/90 to-black border border-white/10 rounded-2xl p-5 flex flex-col justify-between shadow-2xl group hover:border-white/20 transition-all duration-300">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/10 rounded-full blur-2xl pointer-events-none" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                      Authenticity Score
                    </span>
                    <div className="my-2.5 flex items-baseline gap-2">
                      <span className="text-4xl font-black text-white tracking-tight font-mono">
                        {auditResult.authenticityScore}%
                      </span>
                    </div>
                    <div>
                      {auditResult.decision === "REJECT" && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-950/80 text-red-400 border border-red-800 shadow-sm">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                          <span>HIGH RISK REJECT</span>
                        </span>
                      )}
                      {auditResult.decision === "PROCEED" && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-950/80 text-amber-400 border border-amber-800 shadow-sm">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                          <span>PROCEED W/ CAUTION</span>
                        </span>
                      )}
                      {auditResult.decision === "WORTHY" && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-800 shadow-sm">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span>VERIFIED WORTHY</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Public Commits Card */}
                  <div className="relative overflow-hidden bg-gradient-to-br from-zinc-900/80 via-zinc-950/90 to-black border border-white/10 rounded-2xl p-5 flex flex-col justify-between shadow-2xl group hover:border-white/20 transition-all duration-300">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                      <GitCommit className="w-3.5 h-3.5 text-zinc-400" />
                      Verified Commits
                    </span>
                    <div className="my-2.5">
                      <span className="text-3xl font-black text-white font-mono">
                        {auditResult.commitsCount}
                      </span>
                    </div>
                    <span className="text-xs text-zinc-400 font-mono truncate">
                      @{auditResult.username}
                    </span>
                  </div>

                  {/* Lines Touched Card */}
                  <div className="relative overflow-hidden bg-gradient-to-br from-zinc-900/80 via-zinc-950/90 to-black border border-white/10 rounded-2xl p-5 flex flex-col justify-between shadow-2xl group hover:border-white/20 transition-all duration-300">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                      <Code2 className="w-3.5 h-3.5 text-zinc-400" />
                      Lines of Code
                    </span>
                    <div className="my-2.5">
                      <span className="text-3xl font-black text-white font-mono">
                        {auditResult.linesCount.toLocaleString()}
                      </span>
                    </div>
                    <span className="text-xs text-zinc-400 truncate font-mono">
                      {auditResult.dominantDomain}
                    </span>
                  </div>
                </div>

                {/* Project Audit Cards with Contemporary UI/UX */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <FolderGit2 className="w-4 h-4 text-red-500" />
                      <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-200">
                        Audited Projects ({auditResult.claims.length})
                      </h3>
                    </div>
                    <div className="flex items-center gap-3 text-xs font-mono">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-800/80">
                        <Check className="w-3 h-3" />
                        {auditResult.claims.filter((c) => c.verdict === "VERIFIED").length} Verified
                      </span>
                      {auditResult.claims.some((c) => c.verdict === "NOT_AUDITABLE") && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-zinc-900 text-zinc-400 border border-zinc-800">
                          <Shield className="w-3 h-3 text-zinc-400" />
                          {auditResult.claims.filter((c) => c.verdict === "NOT_AUDITABLE").length} Commercial / NDA
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    {auditResult.claims.map((c, i) => {
                      // Visual verdict configurations
                      const isVerified = c.verdict === "VERIFIED";
                      const isPartial = c.verdict === "PARTIALLY_VERIFIED";
                      const isNda = c.verdict === "NOT_AUDITABLE";
                      const isUnverified = c.verdict === "UNVERIFIED";

                      const borderTopClass = isVerified
                        ? "border-t-2 border-t-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.06)]"
                        : isPartial
                        ? "border-t-2 border-t-amber-500 shadow-[0_0_30px_rgba(245,158,11,0.06)]"
                        : isNda
                        ? "border-t-2 border-t-zinc-600 shadow-[0_0_30px_rgba(113,113,122,0.06)]"
                        : "border-t-2 border-t-red-500 shadow-[0_0_30px_rgba(239,68,68,0.06)]";

                      return (
                        <div
                          key={i}
                          className={`bg-gradient-to-b from-zinc-900/70 via-zinc-950/90 to-black border border-white/10 hover:border-white/20 rounded-2xl p-6 transition-all duration-300 space-y-5 shadow-xl relative overflow-hidden group ${borderTopClass}`}
                        >
                          {/* Ambient background glow */}
                          {isVerified && (
                            <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
                          )}
                          {isPartial && (
                            <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
                          )}
                          {isUnverified && (
                            <div className="absolute top-0 right-0 w-48 h-48 bg-red-500/5 rounded-full blur-3xl pointer-events-none" />
                          )}

                          {/* Card Header: Project Name, Clickable Repo Pill, Verdict Badge */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-white/5">
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="text-base font-bold text-white tracking-tight">
                                {c.project}
                              </span>
                              {c.targetRepo ? (
                                <a
                                  href={`https://github.com/${c.targetRepo}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-white/10 hover:border-white/25 transition-all duration-200 shadow-sm group/link"
                                >
                                  <GitBranch className="w-3 h-3 text-zinc-500 group-hover/link:text-red-400 transition-colors" />
                                  <span>{c.targetRepo}</span>
                                  <ExternalLink className="w-2.5 h-2.5 text-zinc-500 group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5 transition-transform" />
                                </a>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-zinc-900/50 text-zinc-500 border border-white/5">
                                  No public repo linked
                                </span>
                              )}
                            </div>

                            {/* Contemporary Luminous Verdict Badges */}
                            <div>
                              {isVerified && (
                                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-800/80 shadow-[0_0_15px_rgba(16,185,129,0.15)]">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>VERIFIED</span>
                                </span>
                              )}
                              {isPartial && (
                                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-amber-950/80 text-amber-400 border border-amber-800/80 shadow-[0_0_15px_rgba(245,158,11,0.15)]">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  <span>PARTIALLY VERIFIED</span>
                                </span>
                              )}
                              {isNda && (
                                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-zinc-900/90 text-zinc-400 border border-zinc-700 shadow-sm">
                                  <ShieldAlert className="w-3.5 h-3.5 text-zinc-400" />
                                  <span>COMMERCIAL / NDA</span>
                                </span>
                              )}
                              {isUnverified && (
                                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-red-950/80 text-red-400 border border-red-800/80 shadow-[0_0_15px_rgba(239,68,68,0.15)]">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                                  <XCircle className="w-3.5 h-3.5" />
                                  <span>UNVERIFIED</span>
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Two-Tier Content: Resume Claim Citation & Telemetry Grounded Evidence */}
                          <div className="space-y-3.5">
                            {/* 1. Resume Claim Citation */}
                            <div className="bg-white/[0.02] border-l-2 border-red-500/70 rounded-r-xl p-3.5 space-y-1">
                              <span className="text-[10px] font-bold tracking-wider uppercase text-zinc-400 flex items-center gap-1.5">
                                <FileCode className="w-3 h-3 text-red-400" />
                                <span>Resume Claim</span>
                              </span>
                              <p className="text-xs text-zinc-200 leading-relaxed font-sans pl-0.5">
                                "{c.claim}"
                              </p>
                            </div>

                            {/* 2. Grounded Telemetry Evidence Terminal Box */}
                            <div className="bg-black/80 rounded-xl border border-white/10 p-4 space-y-2.5">
                              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                                  <Terminal className="w-3 h-3 text-zinc-400" />
                                  <span>telemetry.grounding_audit</span>
                                </span>
                                <span className="text-[10px] font-mono text-zinc-500">
                                  confidence: {c.confidence || "HIGH"}
                                </span>
                              </div>

                              <div className="space-y-1.5 font-mono text-xs">
                                {c.evidence && c.evidence.length > 0 ? (
                                  c.evidence.map((ev, idx) => (
                                    <div
                                      key={idx}
                                      className="flex items-start gap-2.5 text-zinc-300 leading-relaxed py-0.5"
                                    >
                                      <span className="text-emerald-400 shrink-0 mt-0.5 select-none font-bold">
                                        ✓
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
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* PDF Report Export Button */}
                <button
                  onClick={handleDownloadPdf}
                  className="w-full py-3.5 bg-gradient-to-r from-zinc-900 to-zinc-950 hover:from-zinc-800 hover:to-zinc-900 text-white rounded-xl text-sm font-semibold border border-white/10 hover:border-white/20 shadow-xl flex items-center justify-center gap-2 transition-all duration-200 active:scale-[0.99]"
                >
                  <Download className="w-4 h-4 text-zinc-400" />
                  <span>Download Verified Engineering Audit PDF</span>
                </button>
              </div>
            ) : (
              <div className="min-h-[460px] border-2 border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center text-center p-10 bg-zinc-950/40 backdrop-blur-xl">
                <div className="w-16 h-16 rounded-2xl bg-zinc-900/80 border border-white/10 flex items-center justify-center mb-4 shadow-xl">
                  <FileCode className="w-8 h-8 text-zinc-500" />
                </div>
                <h4 className="text-base font-bold text-zinc-200">Awaiting Candidate Document</h4>
                <p className="text-xs text-zinc-500 max-w-sm mt-2 leading-relaxed">
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
