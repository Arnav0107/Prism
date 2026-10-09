import React from "react";
import { ThemeProvider } from "./context/ThemeContext";
import { Header } from "./components/Header/Header";
import { Hero } from "./components/Hero/Hero";
import { DecompositionSection } from "./components/Sections/DecompositionSection";
import { HowItWorksSection } from "./components/Sections/HowItWorksSection";

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <Header />
      <main id="main-content">
        <Hero />
        <DecompositionSection />
        <HowItWorksSection />
      </main>
    </ThemeProvider>
  );
};
