import React from "react";
import { ThemeProvider } from "./context/ThemeContext";
import { Header } from "./components/Header/Header";
import { Container } from "./components/ui";

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <Header />
      <main id="main-content">
        <Container style={{ paddingTop: "64px", paddingBottom: "64px" }}>
          <h1>A share is two things</h1>
          <p>Splitting tokenized equity into capital appreciation and recurring yield on Monad.</p>
        </Container>
      </main>
    </ThemeProvider>
  );
};
