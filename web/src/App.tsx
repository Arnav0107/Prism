import React, { useState, useEffect } from "react";
import { ThemeProvider } from "./context/ThemeContext";
import { Header } from "./components/Header/Header";
import { Hero } from "./components/Hero/Hero";
import { DecompositionSection } from "./components/Sections/DecompositionSection";
import { HowItWorksSection } from "./components/Sections/HowItWorksSection";
import { AuctionSection } from "./components/Sections/AuctionSection";
import { ParticipantsSection } from "./components/Sections/ParticipantsSection";
import { DisclosuresSection } from "./components/Sections/DisclosuresSection";
import { Footer } from "./components/Footer/Footer";
import { PrismApp } from "./app/PrismApp";

export const App: React.FC = () => {
  const [route, setRoute] = useState<string>(() => {
    return typeof window !== "undefined" ? window.location.hash || "#/" : "#/";
  });

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(window.location.hash || "#/");
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const isAppRoute = route.startsWith("#/app") || route === "#app";

  return (
    <ThemeProvider>
      {isAppRoute ? (
        <PrismApp />
      ) : (
        <>
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
        </>
      )}
    </ThemeProvider>
  );
};
