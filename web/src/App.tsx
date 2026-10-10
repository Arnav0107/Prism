import React from "react";
import { ThemeProvider } from "./context/ThemeContext";
import { Header } from "./components/Header/Header";
import { Hero } from "./components/Hero/Hero";
import { DecompositionSection } from "./components/Sections/DecompositionSection";
import { HowItWorksSection } from "./components/Sections/HowItWorksSection";
import { AuctionSection } from "./components/Sections/AuctionSection";
import { ParticipantsSection } from "./components/Sections/ParticipantsSection";
import { DisclosuresSection } from "./components/Sections/DisclosuresSection";
import { Footer } from "./components/Footer/Footer";

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <Header />
      <main id="main-content">
        <Hero />
        <DecompositionSection />
        <HowItWorksSection />
        <AuctionSection />
        <ParticipantsSection />
        <DisclosuresSection />
      </main>
      <Footer />
    </ThemeProvider>
  );
};
