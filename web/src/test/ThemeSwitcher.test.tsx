import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "../context/ThemeContext";
import { ThemeSwitcher } from "../components/ThemeSwitcher/ThemeSwitcher";

describe("ThemeSwitcher & ThemeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("renders theme switcher buttons with accessible labels and attributes", () => {
    render(
      <ThemeProvider>
        <ThemeSwitcher />
      </ThemeProvider>
    );

    const paperBtn = screen.getByRole("button", { name: /switch to paper theme/i });
    const inkBtn = screen.getByRole("button", { name: /switch to ink theme/i });

    expect(paperBtn).toBeInTheDocument();
    expect(inkBtn).toBeInTheDocument();
  });

  it("toggles theme and persists to localStorage and data-theme attribute", () => {
    render(
      <ThemeProvider>
        <ThemeSwitcher />
      </ThemeProvider>
    );

    const inkBtn = screen.getByRole("button", { name: /switch to ink theme/i });
    fireEvent.click(inkBtn);

    expect(document.documentElement.getAttribute("data-theme")).toBe("ink");
    expect(localStorage.getItem("prism-theme")).toBe("ink");
    expect(inkBtn).toHaveAttribute("aria-pressed", "true");

    const paperBtn = screen.getByRole("button", { name: /switch to paper theme/i });
    fireEvent.click(paperBtn);

    expect(document.documentElement.getAttribute("data-theme")).toBe("paper");
    expect(localStorage.getItem("prism-theme")).toBe("paper");
    expect(paperBtn).toHaveAttribute("aria-pressed", "true");
  });
});
