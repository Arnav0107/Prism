import React from "react";
import { ThemeProvider } from "./context/ThemeContext";
import { ThemeSwitcher } from "./components/ThemeSwitcher/ThemeSwitcher";
import { Container } from "./components/ui";

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <header style={{ padding: "16px 0" }}>
        <Container style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Prism</span>
          <ThemeSwitcher />
        </Container>
      </header>
      <main>
        <Container>
          <h1>Prism</h1>
          <p>Tokenized equity stripping on Monad.</p>
        </Container>
      </main>
    </ThemeProvider>
  );
};
