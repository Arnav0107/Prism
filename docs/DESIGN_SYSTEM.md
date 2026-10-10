# Prism Design System Specification

## Editorial Financial Prospectus

The Prism interface is designed as an **editorial financial prospectus**, rejecting generic crypto-startup tropes (gradient meshes, purple neon, glassmorphism, emoji badges, and drop shadows) in favor of high-conviction financial publishing.

---

## 1. Visual Signatures & The Bifurcation Motif

The core visual signature of the protocol is the **split-line hairline mark**:
- A single incoming hairline representing an underlying equity share.
- Bifurcates at the vault node into two paths:
  1. **Top path (Ink / Mono):** The **Principal Token (PT)** capturing perpetual capital appreciation.
  2. **Bottom path (Vermilion):** The **Epoch Coupon (EC)** harvesting fixed-term dividend cash flows.

```
       ┌───► [ Principal Token (PT) ] — Perpetual Capital (ERC-20)
───○───┤
       └───► [ Epoch Coupon (EC) ]    — Quarterly Dividend Yield (ERC-1155)
```

---

## 2. Color Palette & Strict Rules

The design system enforces a strict triadic hierarchy: Black, White/Cream, and **ONE accent: Vermilion**.

> **Absolute Rule:** Zero blue anywhere. No gradients. No colored shadows. 1px rules replace heavy borders.

### Paper Theme (Default Light Mode)
| Token | Value | Role |
| :--- | :--- | :--- |
| `--color-bg` | `#F3EFE6` | Archival prospectus paper |
| `--color-surface` | `#FCFAF6` | Elevated tabular cards |
| `--color-text-primary` | `#141412` | High-contrast body & headlines |
| `--color-text-secondary` | `#3D3B35` | Secondary explanations |
| `--color-text-muted` | `#55524A` | Metadata & tabular headers |
| `--color-rule` | `rgba(20, 20, 18, 0.16)` | 1px boundary rules |
| `--color-vermilion` | `#D9481C` | Coupon yield & active highlights |

### Ink Theme (Dark Mode)
| Token | Value | Role |
| :--- | :--- | :--- |
| `--color-bg` | `#0F0F0D` | Deep carbon archival background |
| `--color-surface` | `#171714` | Card surface |
| `--color-text-primary` | `#F3EFE6` | Crisp off-white typography |
| `--color-text-secondary` | `#CFCABD` | Secondary text |
| `--color-text-muted` | `#A8A396` | Tabular labels and borders |
| `--color-rule` | `rgba(243, 239, 230, 0.16)`| 1px boundary rules |
| `--color-vermilion` | `#FF7448` | High-contrast vermilion accent |

---

## 3. Typography Hierarchy

All fonts are self-hosted via `@fontsource` with optimized latin subsets to achieve a sub-60KB total gzip bundle size:

1. **Display Serif:** `Newsreader` (Weights: 400, 400-italic, 600)
   - Used for primary hero headlines, section headings, and emphasis text.
2. **Body Sans:** `Hanken Grotesk` (Weights: 400, 500, 600)
   - Clean, geometric sans-serif for readable financial explanations.
3. **Tabular Monospace:** `IBM Plex Mono` (Weights: 400, 500)
   - Used for all numerical values, token formulas, ticker stats, and section tags.

---

## 4. Spacing Scale & Layout Grid

- **Base Unit:** 8px.
- **Scale:**
  - `--space-1`: 8px
  - `--space-2`: 16px
  - `--space-3`: 24px
  - `--space-4`: 32px
  - `--space-5`: 40px
  - `--space-6`: 48px
  - `--space-8`: 64px
  - `--space-10`: 80px
  - `--space-12`: 96px
- **Container Width:** Max 1200px, centered with responsive horizontal gutters (24px on desktop, 16px on mobile).
- **Grid:** 12-column flexible grid system.

---

## 5. Viewport Screenshots

Screenshots captured across key viewports and themes:

### Desktop Viewport (1440px)
| Theme | Preview |
| :--- | :--- |
| **Paper (Light)** | `docs/screenshots/landing-1440px-paper.png` |
| **Ink (Dark)** | `docs/screenshots/landing-1440px-ink.png` |

### Mobile Viewport (390px)
| Theme | Preview |
| :--- | :--- |
| **Paper (Light)** | `docs/screenshots/landing-390px-paper.png` |
| **Ink (Dark)** | `docs/screenshots/landing-390px-ink.png` |

---

## 6. Accessibility & Performance Testing

- **Target Sizes:** Minimum 44px touch targets on all interactive controls (Buttons, Theme Switcher, Skip Link).
- **Reduced Motion:** Complete respect for `prefers-reduced-motion: reduce` in SVG draw animations and scroll transitions.
- **Bundle Weight:** Total production bundle is **~59.5 KB gzip** (well below the 150 KB gzip budget).
- **Testing:** 100% test pass rate with Vitest & React Testing Library (theme persistence, navigation landmarks, section headers).
