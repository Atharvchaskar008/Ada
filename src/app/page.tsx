import { HeroSection } from "@/components/ui/hero-section";
import { FeaturesSection } from "@/components/ui/features-section";
import { CtaSection } from "@/components/ui/cta-section";
import { Footer } from "@/components/ui/footer";

export default function Home() {
  return (
    <main className="bg-black text-white selection:bg-red-500/30">
      <HeroSection />
      <FeaturesSection />
      <CtaSection />
      <Footer />
    </main>
  );
}
