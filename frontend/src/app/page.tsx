import { HeroSection } from "@/components/home/hero-section";
import { FeaturedCharacters } from "@/components/home/featured-characters";
import { ProcessingCharacters } from "@/components/home/processing-characters";

export default function Home() {
  return (
    <div className="flex flex-col">
      <HeroSection />
      <div className="container mx-auto max-w-screen-2xl px-4 py-8 space-y-12">
        <ProcessingCharacters />
        <FeaturedCharacters />
      </div>
    </div>
  );
}
