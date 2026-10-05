"use client";

import React from 'react';
import { motion } from 'framer-motion';
import ShapeGrid from './ShapeGrid';
import Galaxy from './Galaxy';

export const BrandEndingSection = () => {
  return (
    <section className="relative w-full bg-black min-h-screen flex flex-col items-center justify-center py-32 overflow-hidden">
      {/* Subtle background gradient to match the theme without introducing new colors */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#5B73AE]/5 rounded-full blur-[120px]" />
      </div>

      {/* Galaxy Background for visual continuity from Section 4 */}
      <div className="absolute inset-0 z-[1] pointer-events-none">
        <Galaxy
          className="w-full h-full"
          starSpeed={0.3}
          density={1.5}
          hueShift={0}
          speed={0}
          glowIntensity={0.15}
          saturation={0}
          mouseRepulsion={false}
          repulsionStrength={0}
          twinkleIntensity={0.1}
          rotationSpeed={0}
          transparent
        />
      </div>

      {/* ShapeGrid Background — animated diagonal grid, blends behind content */}
      <div className="absolute inset-0 z-[1] pointer-events-none" style={{ opacity: 0.3 }}>
        <ShapeGrid
          speed={0.5}
          squareSize={40}
          direction="diagonal"
          borderColor="#5B73AE"
          hoverFillColor="#222222"
          shape="square"
          hoverTrailAmount={0}
        />
      </div>

      {/* Top & Bottom dark fades for canvas content blending */}
      <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-black to-transparent pointer-events-none z-[2]" />
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black to-transparent pointer-events-none z-[2]" />

      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 flex flex-col items-center text-center px-6 max-w-4xl mx-auto"
      >
        <h2 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white tracking-tight mb-6">
          Ada — TalentGraph AI
        </h2>
        
        <p className="text-xl md:text-2xl text-gray-400 font-medium mb-12 max-w-2xl">
          Building the future of evidence-based engineering hiring.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
          {/* Primary Button */}
          <button className="group relative px-8 py-4 rounded-full bg-white text-black font-semibold text-lg overflow-hidden transition-transform hover:scale-105 active:scale-95">
            <div className="absolute inset-0 bg-[#5B73AE]/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <span className="relative z-10">Join Us</span>
            <div className="absolute -inset-1 bg-[#5B73AE] blur-lg opacity-0 group-hover:opacity-30 transition-opacity duration-500 rounded-full" />
          </button>

          {/* Secondary Button */}
          <button className="group relative px-8 py-4 rounded-full bg-transparent text-white font-semibold text-lg overflow-hidden transition-transform hover:scale-105 active:scale-95 border border-[#5B73AE]/30 hover:border-[#5B73AE]">
            <div className="absolute inset-0 bg-[#5B73AE]/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <span className="relative z-10">Know More</span>
            <div className="absolute inset-0 rounded-full shadow-[0_0_20px_rgba(91,115,174,0.0)] group-hover:shadow-[0_0_20px_rgba(91,115,174,0.4)] transition-shadow duration-500" />
          </button>
        </div>
      </motion.div>
    </section>
  );
};

export const CtaSection = BrandEndingSection;
