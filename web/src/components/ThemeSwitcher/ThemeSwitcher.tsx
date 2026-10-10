import React from "react";
import { useTheme } from "@/context/ThemeContext";
import "./ThemeSwitcher.css";

export const ThemeSwitcher: React.FC = () => {
  const { theme, setTheme } = useTheme();

  return (
    <div
      className="prism-theme-switcher"
      role="group"
      aria-label="Theme selection"
    >
      <button
        type="button"
        className={`prism-theme-btn ${theme === "paper" ? "prism-theme-btn--active" : ""}`}
        onClick={() => setTheme("paper")}
        aria-pressed={theme === "paper"}
        aria-label="Switch to paper theme (light)"
      >
        <span className="prism-theme-btn__indicator" aria-hidden="true">
          {theme === "paper" ? "●" : "○"}
        </span>
        <span>Paper</span>
      </button>

      <span className="prism-theme-switcher__divider" aria-hidden="true">
        /
      </span>

      <button
        type="button"
        className={`prism-theme-btn ${theme === "ink" ? "prism-theme-btn--active" : ""}`}
        onClick={() => setTheme("ink")}
        aria-pressed={theme === "ink"}
        aria-label="Switch to ink theme (dark)"
      >
        <span className="prism-theme-btn__indicator" aria-hidden="true">
          {theme === "ink" ? "●" : "○"}
        </span>
        <span>Ink</span>
      </button>
    </div>
  );
};
