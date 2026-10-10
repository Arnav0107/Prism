import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "../App";

describe("App Integration & Sections", () => {
  it("renders header, skip link, and hero headline", () => {
    render(<App />);

    // Skip link
    const skipLink = screen.getByText(/skip to main content/i);
    expect(skipLink).toBeInTheDocument();
    expect(skipLink).toHaveAttribute("href", "#main-content");

    // Hero title
    expect(
      screen.getByRole("heading", { level: 1, name: /a share is two things\./i })
    ).toBeInTheDocument();

    // Testnet badge
    expect(screen.getAllByText(/testnet · mock stock/i).length).toBeGreaterThan(0);
  });

  it("renders all five numbered core sections", () => {
    render(<App />);

    // Section 01
    expect(
      screen.getByRole("heading", { level: 2, name: /bifurcation of equity rights/i })
    ).toBeInTheDocument();

    // Section 02
    expect(
      screen.getByRole("heading", { level: 2, name: /settlement mechanics/i })
    ).toBeInTheDocument();

    // Section 03
    expect(
      screen.getByRole("heading", { level: 2, name: /dividend dutch auction/i })
    ).toBeInTheDocument();

    // Section 04
    expect(
      screen.getByRole("heading", { level: 2, name: /participant matrix/i })
    ).toBeInTheDocument();

    // Section 05
    expect(
      screen.getByRole("heading", { level: 2, name: /what is real/i })
    ).toBeInTheDocument();
  });

  it("renders prospectus footer with navigation links and metadata", () => {
    render(<App />);

    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: /prospectus navigation/i })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: /prospectus index/i })).toBeInTheDocument();
    expect(screen.getByText(/spec: prism-metropolis-prospectus-01/i)).toBeInTheDocument();
  });
});
