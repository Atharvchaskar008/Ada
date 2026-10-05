"use client";

import React from 'react';
import Galaxy from './Galaxy';
import ElectricBorder from './ElectricBorder';
import { GitBranch, ShieldCheck, Database, Sparkles, BarChart2, FileText } from 'lucide-react';

const features = [
  {
    icon: GitBranch,
    title: 'GitHub Intelligence Engine',
    description:
      'Analyze repositories using Tree-sitter, AST Parsing, Static Analysis, and Commit Graph Analysis to understand real engineering contributions beyond commits and stars.',
    badge: 'Repository Intelligence',
  },
  {
    icon: ShieldCheck,
    title: 'AI Skill Verification',
    description:
      'Cross-verify resume claims against GitHub repositories, architecture, and technical implementations to generate Evidence Confidence Scores that remove hiring guesswork.',
    badge: 'Evidence Verification',
  },
  {
    icon: Database,
    title: 'Hybrid RAG Intelligence',
    description:
      'Build semantic embeddings of repositories using Hybrid RAG and GraphRAG to retrieve the most relevant engineering evidence for every candidate evaluation.',
    badge: 'AI Knowledge Layer',
  },
  {
    icon: Sparkles,
    title: 'AI Hiring Copilot',
    description:
      'Recruiters simply describe the engineer they need in natural language and Ada intelligently discovers the best evidence-backed candidates from your entire talent pool.',
    badge: 'Natural Language Search',
  },
  {
    icon: BarChart2,
    title: 'Job-Aware Ranking',
    description:
      'Rank candidates using Engineering Quality, Project Complexity, Semantic Similarity, and Job Relevance instead of brittle ATS keyword matching that misses great engineers.',
    badge: 'Smart Ranking',
  },
  {
    icon: FileText,
    title: 'Explainable AI Reports',
    description:
      'Generate transparent hiring reports containing strengths, weaknesses, technical evidence, job fit rationale, and AI-generated interview questions tailored per candidate.',
    badge: 'Explainable AI',
  },
];

export const GalaxyCardsSection = () => {
  return (
    <section
      className="relative w-full overflow-hidden bg-black"
      style={{ minHeight: '100vh' }}
    >
      {/* Galaxy Background */}
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
      >
        <Galaxy
          className="w-full h-full"
          starSpeed={0.5}
          density={2.8}
          hueShift={0}
          speed={0}
          glowIntensity={0.2}
          saturation={0}
          mouseRepulsion={false}
          repulsionStrength={0}
          twinkleIntensity={0.15}
          rotationSpeed={0}
          transparent
        />
      </div>

      {/* Top transition: deep layered red light bleed simulating the nebula carrying over */}
      <div className="absolute top-0 left-0 right-0 h-64 bg-gradient-to-b from-[#FF4444]/10 via-[#FF4444]/3 to-transparent pointer-events-none z-10" />
      <div className="absolute top-[-100px] left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[radial-gradient(ellipse_at_top,rgba(255,68,68,0.12),transparent_70%)] pointer-events-none z-10 mix-blend-screen" />
      
      {/* Top & Bottom dark fades for canvas content blending */}
      <div className="absolute top-0 left-0 right-0 h-48 bg-gradient-to-b from-black via-black/80 to-transparent pointer-events-none z-20" />
      <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-black to-transparent pointer-events-none z-20" />

      {/* Content */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 md:px-12 lg:px-16 py-28 md:py-40">
        {/* Section Header — DO NOT MODIFY */}
        <div className="text-center mb-16 md:mb-20" style={{ marginBottom: '64px' }}>
          <span
            className="inline-block text-xs font-semibold tracking-[0.3em] uppercase mb-5"
            style={{ color: '#5B73AE' }}
          >
            Features
          </span>
          <h2
            className="text-4xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-[1.1] mb-7"
            style={{ fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif" }}
          >
            Engineering Intelligence
            <br />
            <span style={{ color: '#5B73AE' }}>Built for Modern Hiring</span>
          </h2>
          <p
            className="text-base md:text-lg leading-relaxed mx-auto max-w-2xl"
            style={{ color: 'rgba(255,255,255,0.45)', fontFamily: "'Inter', system-ui, sans-serif" }}
          >
            Ada verifies engineering talent using real technical evidence —
            transforming GitHub repositories, resumes, and projects into
            explainable hiring intelligence.
          </p>
        </div>

        {/* Cards Grid — 3×2 */}
        <div className="galaxy-cards-grid">
          {features.map((feature, idx) => {
            const IconComponent = feature.icon;
            return (
              <div key={idx} className="galaxy-feature-card group">
                <ElectricBorder
                  color="#5B73AE"
                  speed={0.4}
                  chaos={0.015}
                  borderRadius={20}
                  className="galaxy-eb-wrapper"
                  style={{ width: '100%', height: '100%', display: 'flex' }}
                >
                  <div className="galaxy-card-inner">
                    {/* Icon */}
                    <div className="galaxy-card-icon">
                      <IconComponent
                        size={20}
                        strokeWidth={1.6}
                        style={{ color: '#5B73AE' }}
                      />
                    </div>

                    {/* Title */}
                    <h3 className="galaxy-card-title">{feature.title}</h3>

                    {/* Description */}
                    <p className="galaxy-card-desc">{feature.description}</p>

                    {/* Badge */}
                    <div className="galaxy-card-badge">
                      <span>{feature.badge}</span>
                    </div>
                  </div>
                </ElectricBorder>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export const FeaturesSection = GalaxyCardsSection;
