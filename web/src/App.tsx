import React from "react";
import { ThemeProvider } from "./context/ThemeContext";
import { Header } from "./components/Header/Header";
import { Hero } from "./components/Hero/Hero";

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <Header />
      <main id="main-content">
        <Hero />
      </main>
    </ThemeProvider>
  );
};
