import { HeroSection } from "@/components/home/hero-section";
import { FrontpageLiveSections } from "@/components/home/frontpage-live-sections";

export default function Home() {
  return (
    <div className="flex flex-col">
      <HeroSection />
      <div className="container mx-auto max-w-screen-2xl px-4 py-8 space-y-12">
        <FrontpageLiveSections />
      </div>
    </div>
  );
}
