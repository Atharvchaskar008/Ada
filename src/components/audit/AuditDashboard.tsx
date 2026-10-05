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
    <div className="min-h-screen bg-black text-white font-sans pt-16">
      {/* Top Header */}
      <header className="border-b border-zinc-900 bg-black/95 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </Link>
            <div className="h-4 w-px bg-zinc-800" />
            <div className="flex items-center gap-3">
              <span className="text-xl font-black tracking-tight text-red-500 font-mono">
                ADA
              </span>
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300 bg-zinc-900 px-2.5 py-1 rounded-md border border-zinc-800">
                Live Git Claim Screener
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="max-w-7xl mx-auto px-8 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Panel: Candidate Intake & File Dropzone */}
          <div className="lg:col-span-5 bg-zinc-950 border border-zinc-900 rounded-2xl p-8 space-y-7 shadow-xl">
            <div>
              <h2 className="text-lg font-semibold text-white tracking-tight">Candidate Verification</h2>
              <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                Upload candidate resume PDF. Project repositories are discovered across historical commits and audited against live Git telemetry.
              </p>
            </div>

            {/* GitHub Username Input */}
            <div className="space-y-2.5">
              <label className="text-xs font-medium text-zinc-300 flex items-center justify-between">
                <span>GitHub Handle</span>
                <span className="text-[11px] text-zinc-500 font-normal">Auto-detected if on resume</span>
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. Atharvchaskar008"
                className="w-full text-sm font-mono bg-black border border-zinc-800 rounded-xl px-4 py-3.5 text-white placeholder-zinc-700 focus:outline-none focus:border-red-500/80 transition-colors"
              />
            </div>

            {/* PDF Upload Dropzone */}
            <div className="space-y-2.5">
              <label className="text-xs font-medium text-zinc-300">Resume PDF</label>
              <label className="border-2 border-dashed border-zinc-800 hover:border-zinc-700 rounded-2xl p-8 flex flex-col items-center justify-center bg-black cursor-pointer transition-colors block text-center group">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="w-12 h-12 rounded-xl bg-zinc-900 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform border border-zinc-800/80">
                  <Upload className="w-6 h-6 text-zinc-400" />
                </div>
                <span className="text-sm text-zinc-200 font-medium">
                  {fileName || "Select or drop resume PDF"}
                </span>
                <span className="text-xs text-zinc-500 mt-1.5">
                  Direct project repository URLs are resolved automatically
                </span>
              </label>

              {fileName && (
                <div className="flex items-center justify-between text-xs px-4 py-2.5 bg-zinc-900 rounded-xl border border-zinc-800">
                  <span className="text-zinc-200 truncate max-w-[240px] font-mono">{fileName}</span>
                  <button
                    type="button"
                    onClick={handleClearFile}
                    className="text-red-400 hover:text-red-300 text-xs font-medium transition-colors"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>

            {error && (
              <div className="p-4 rounded-xl bg-red-950/60 border border-red-900/80 text-xs text-red-400">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <div className="pt-2">
              <button
                onClick={handleRunAudit}
                disabled={isLoading}
                className={`w-full py-4 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2.5 ${
                  isLoading
                    ? "bg-zinc-900 text-zinc-500 cursor-not-allowed border border-zinc-800"
                    : "bg-red-600 hover:bg-red-500 text-white shadow-xl shadow-red-600/25 active:scale-[0.99]"
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

          {/* Right Panel: Minimalist High-Density Dashboard */}
          <div className="lg:col-span-7">
            {auditResult ? (
              <div className="space-y-6">
                {/* Top Metrics Row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Score & Verdict Card */}
                  <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5 flex flex-col justify-between">
                    <span className="text-[11px] font-medium tracking-wider uppercase text-zinc-500">
                      Authenticity Score
                    </span>
                    <div className="my-2">
                      <span className="text-4xl font-extrabold text-white tracking-tight">
                        {auditResult.authenticityScore}%
                      </span>
                    </div>
                    <div>
                      {auditResult.decision === "REJECT" && (
                        <span className="inline-block px-3 py-1 rounded-lg text-xs font-semibold bg-red-950 text-red-400 border border-red-900">
                          REJECT
                        </span>
                      )}
                      {auditResult.decision === "PROCEED" && (
                        <span className="inline-block px-3 py-1 rounded-lg text-xs font-semibold bg-yellow-950 text-yellow-400 border border-yellow-900">
                          PROCEED
                        </span>
                      )}
                      {auditResult.decision === "WORTHY" && (
                        <span className="inline-block px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-900">
                          WORTHY
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Public Commits Card */}
                  <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5 flex flex-col justify-between">
                    <span className="text-[11px] font-medium tracking-wider uppercase text-zinc-500 flex items-center gap-1.5">
                      <GitCommit className="w-3.5 h-3.5 text-zinc-400" />
                      Verified Commits
                    </span>
                    <div className="my-2">
                      <span className="text-3xl font-extrabold text-white font-mono">
                        {auditResult.commitsCount}
                      </span>
                    </div>
                    <span className="text-xs text-zinc-400 font-mono truncate">
                      @{auditResult.username}
                    </span>
                  </div>

                  {/* Lines Touched Card */}
                  <div className="bg-zinc-950 border border-zinc-900 rounded-2xl p-5 flex flex-col justify-between">
                    <span className="text-[11px] font-medium tracking-wider uppercase text-zinc-500 flex items-center gap-1.5">
                      <Code2 className="w-3.5 h-3.5 text-zinc-400" />
                      Lines of Code
                    </span>
                    <div className="my-2">
                      <span className="text-3xl font-extrabold text-white font-mono">
                        {auditResult.linesCount.toLocaleString()}
                      </span>
                    </div>
                    <span className="text-xs text-zinc-400 truncate">
                      {auditResult.dominantDomain}
                    </span>
                  </div>
                </div>

                {/* Project Audit Cards */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-sm font-semibold text-zinc-300">
                      Audited Projects ({auditResult.claims.length})
                    </h3>
                    <div className="flex items-center gap-3 text-xs font-mono text-zinc-500">
                      <span className="text-emerald-400">
                        {auditResult.claims.filter((c) => c.verdict === "VERIFIED").length} Verified
                      </span>
                      {auditResult.claims.some((c) => c.verdict === "NOT_AUDITABLE") && (
                        <span className="text-zinc-400">
                          {auditResult.claims.filter((c) => c.verdict === "NOT_AUDITABLE").length} Commercial/NDA
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3.5">
                    {auditResult.claims.map((c, i) => (
                      <div
                        key={i}
                        className="bg-zinc-950 border border-zinc-900 hover:border-zinc-800 rounded-2xl p-5 transition-colors space-y-4 shadow-sm"
                      >
                        {/* Project Header + Verdict Badge */}
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="text-base font-bold text-white tracking-tight">
                              {c.project}
                            </span>
                            {c.targetRepo && (
                              <a
                                href={`https://github.com/${c.targetRepo}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono bg-zinc-900 text-zinc-300 hover:text-white border border-zinc-800 transition-colors"
                              >
                                <span>{c.targetRepo}</span>
                                <ExternalLink className="w-3 h-3 text-zinc-500" />
                              </a>
                            )}
                          </div>

                          {/* 4-State Verdict Badges */}
                          <div>
                            {c.verdict === "VERIFIED" && (
                              <span className="shrink-0 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-900 flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>VERIFIED</span>
                              </span>
                            )}
                            {c.verdict === "PARTIALLY_VERIFIED" && (
                              <span className="shrink-0 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-950/80 text-amber-400 border border-amber-900 flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>PARTIALLY VERIFIED</span>
                              </span>
                            )}
                            {c.verdict === "NOT_AUDITABLE" && (
                              <span className="shrink-0 px-2.5 py-1 rounded-md text-xs font-semibold bg-zinc-900 text-zinc-400 border border-zinc-700 flex items-center gap-1.5">
                                <ShieldAlert className="w-3.5 h-3.5 text-zinc-400" />
                                <span>NOT AUDITABLE (COMMERCIAL / NDA)</span>
                              </span>
                            )}
                            {c.verdict === "UNVERIFIED" && (
                              <span className="shrink-0 px-2.5 py-1 rounded-md text-xs font-semibold bg-red-950/80 text-red-400 border border-red-900 flex items-center gap-1.5">
                                <XCircle className="w-3.5 h-3.5" />
                                <span>UNVERIFIED</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Claim -> Evidence Structured Presentation */}
                        <div className="space-y-2.5 text-xs">
                          <div>
                            <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 block mb-0.5">
                              Claim
                            </span>
                            <p className="text-sm text-zinc-200 leading-relaxed font-sans">
                              "{c.claim}"
                            </p>
                          </div>

                          <div>
                            <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 block mb-1">
                              Evidence
                            </span>
                            <div className="bg-black rounded-xl p-3.5 border border-zinc-900 space-y-1.5 font-mono text-zinc-300">
                              {c.evidence && c.evidence.length > 0 ? (
                                c.evidence.map((ev, idx) => (
                                  <div key={idx} className="flex items-start gap-2">
                                    <span className="text-zinc-600 select-none">•</span>
                                    <span>{ev}</span>
                                  </div>
                                ))
                              ) : (
                                <div className="text-zinc-400">{c.reality}</div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* PDF Report Export */}
                <button
                  onClick={handleDownloadPdf}
                  className="w-full py-3.5 bg-zinc-950 hover:bg-zinc-900 text-white rounded-xl text-sm font-semibold border border-zinc-800 flex items-center justify-center gap-2 transition-colors"
                >
                  <Download className="w-4 h-4 text-zinc-400" />
                  <span>Download Audit PDF Report</span>
                </button>
              </div>
            ) : (
              <div className="min-h-[440px] border-2 border-dashed border-zinc-900 rounded-2xl flex flex-col items-center justify-center text-center p-10 bg-zinc-950/30">
                <div className="w-14 h-14 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-center mb-3">
                  <FileCode className="w-7 h-7 text-zinc-500" />
                </div>
                <h4 className="text-base font-semibold text-zinc-200">Awaiting Resume Document</h4>
                <p className="text-xs text-zinc-500 max-w-sm mt-1.5 leading-relaxed">
                  Upload a PDF resume to audit project claims against live commit telemetry on GitHub.
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
