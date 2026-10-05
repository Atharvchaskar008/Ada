"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, ArrowUpRight } from "lucide-react";

const features = [
  { name: "GitHub Intelligence Engine", slug: "github-intelligence" },
  { name: "AI Skill Verification",      slug: "ai-skill-verification" },
  { name: "Hybrid RAG Intelligence",    slug: "hybrid-rag" },
  { name: "AI Hiring Copilot",          slug: "ai-hiring-copilot" },
  { name: "Job-Aware Candidate Ranking",slug: "job-aware-ranking" },
  { name: "Explainable AI Reports",     slug: "explainable-ai" },
];

export function Navbar() {
  const pathname = usePathname();
  const [hoveredFeature, setHoveredFeature] = useState(features[0].name);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Do not render marketing navbar on the dashboard page
  if (pathname && pathname.startsWith("/audit")) {
    return null;
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-transparent backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo Section */}
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold text-red-500 tracking-tight uppercase">
              ADA
            </span>
          </Link>
        </div>

        {/* Desktop Navigation */}
        <div className="hidden md:flex flex-col items-center relative">
          <div className="flex items-center gap-0.5">
            <Link
              href="/"
              className="px-4 py-2 text-sm font-medium text-gray-200 hover:text-white rounded-full transition-colors duration-150"
            >
              Home
            </Link>
            {/* Products Dropdown */}
            <div className="relative group">
              <button className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-full transition-colors duration-150 text-gray-200 hover:text-white">
                <span className="relative z-10">Products</span>
                <ChevronDown className="w-3.5 h-3.5 relative z-10 transition-transform duration-200 group-hover:rotate-180" />
              </button>
              <div className="absolute top-full left-1/2 -translate-x-1/2 pt-5 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-50 transform group-hover:translate-y-0 translate-y-2">
                <div className="relative w-[480px] bg-[#161616] border border-white/[0.08] rounded-3xl p-3 shadow-2xl flex gap-3">
                  <div className="flex-1 flex flex-col gap-1">
                    {features.map((feature) => (
                      <Link
                        key={feature.slug}
                        href={`#${feature.slug}`}
                        className="group/link flex items-center justify-between px-4 py-3 rounded-2xl hover:bg-[#1e1e1e] transition-colors"
                        onMouseEnter={() => setHoveredFeature(feature.name)}
                      >
                        <span className="text-white font-semibold text-sm">{feature.name}</span>
                        <ArrowUpRight className="w-4 h-4 text-gray-600 group-hover/link:text-gray-300 transition-colors" />
                      </Link>
                    ))}
                  </div>
                  <div className="w-[180px] shrink-0 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 overflow-hidden relative flex items-center justify-center">
                    <div className="absolute -bottom-8 -right-8 w-32 h-32 rounded-full border-[12px] border-white/20" />
                    <span className="relative z-10 font-bold text-white/80 text-sm tracking-tight text-center px-3 leading-snug">{hoveredFeature}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Resources Dropdown */}
            <div className="relative group">
              <button className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-full transition-colors duration-150 text-gray-200 hover:text-white">
                <span className="relative z-10">Resources</span>
                <ChevronDown className="w-3.5 h-3.5 relative z-10 transition-transform duration-200 group-hover:rotate-180" />
              </button>
              <div className="absolute top-full left-1/2 -translate-x-1/2 pt-5 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-50 transform group-hover:translate-y-0 translate-y-2">
                <div className="relative w-[520px] bg-[#161616] border border-white/[0.08] rounded-3xl p-3 shadow-2xl flex gap-3 resources-menu">
                  <div className="flex-1 flex flex-col gap-1">
                    <Link
                      href="#policy"
                      className="group/link link-policy flex items-start justify-between p-4 rounded-2xl hover:bg-[#1e1e1e] transition-colors"
                    >
                      <div>
                        <h4 className="text-white font-semibold text-sm mb-1">Policy</h4>
                        <p className="text-gray-400 text-xs leading-relaxed pr-2">Platform rules, compliance, and terms of service.</p>
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-gray-600 group-hover/link:text-gray-400 transition-colors mt-0.5 shrink-0" />
                    </Link>
                    <Link
                      href="#guide"
                      className="group/link link-guide flex items-start justify-between p-4 rounded-2xl hover:bg-[#1e1e1e] transition-colors"
                    >
                      <div>
                        <h4 className="text-white font-semibold text-sm mb-1">Guide</h4>
                        <p className="text-gray-400 text-xs leading-relaxed pr-2">Step-by-step tutorials and best practices.</p>
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-gray-600 group-hover/link:text-gray-400 transition-colors mt-0.5 shrink-0" />
                    </Link>
                    <Link
                      href="#documentation"
                      className="group/link link-documentation flex items-start justify-between p-4 rounded-2xl hover:bg-[#1e1e1e] transition-colors"
                    >
                      <div>
                        <h4 className="text-white font-semibold text-sm mb-1">Documentation</h4>
                        <p className="text-gray-400 text-xs leading-relaxed pr-2">Technical architecture and integration details.</p>
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-gray-600 group-hover/link:text-gray-400 transition-colors mt-0.5 shrink-0" />
                    </Link>
                  </div>
                  
                  {/* Decorative Card */}
                  <div className="w-[200px] shrink-0 rounded-2xl overflow-hidden relative bg-pattern-policy resources-card">
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Login Action Button */}
        <div className="flex items-center gap-3">
          <Link
            href="/audit"
            id="landing-login-btn"
            className="px-5 py-2 text-sm font-semibold rounded-full bg-white text-black hover:bg-neutral-200 transition-all duration-200 shadow-md hover:scale-105 active:scale-95 flex items-center gap-1.5"
          >
            <span>Login</span>
          </Link>

          {/* Mobile Menu Toggle */}
          <button 
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 text-gray-400 hover:text-white transition-colors"
            aria-label="Toggle mobile menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileOpen && (
        <div className="md:hidden bg-[#111111]/95 backdrop-blur-xl border-b border-white/10 px-6 py-4 flex flex-col gap-3">
          <Link 
            href="/" 
            onClick={() => setMobileOpen(false)} 
            className="text-gray-200 hover:text-white text-sm py-1.5 font-medium"
          >
            Home
          </Link>
          <Link 
            href="/audit" 
            onClick={() => setMobileOpen(false)} 
            className="text-gray-200 hover:text-white text-sm py-1.5 font-medium"
          >
            Audit Platform
          </Link>
          <Link 
            href="/audit" 
            onClick={() => setMobileOpen(false)} 
            className="mt-2 text-center py-2.5 rounded-full bg-white text-black font-semibold text-sm shadow-md"
          >
            Login
          </Link>
        </div>
      )}
    </nav>
  );
}
