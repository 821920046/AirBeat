---
name: Retro-Futuristic Terminal
colors:
  surface: '#131314'
  surface-dim: '#131314'
  surface-bright: '#3a393a'
  surface-container-lowest: '#0e0e0f'
  surface-container-low: '#1c1b1c'
  surface-container: '#201f20'
  surface-container-high: '#2a2a2b'
  surface-container-highest: '#353436'
  on-surface: '#e5e2e3'
  on-surface-variant: '#bbc9c7'
  inverse-surface: '#e5e2e3'
  inverse-on-surface: '#313031'
  outline: '#869491'
  outline-variant: '#3c4947'
  surface-tint: '#5adace'
  primary: '#6feee1'
  on-primary: '#003733'
  primary-container: '#4fd1c5'
  on-primary-container: '#005750'
  inverse-primary: '#006a63'
  secondary: '#bcc7de'
  on-secondary: '#263143'
  secondary-container: '#3e495d'
  on-secondary-container: '#aeb9d0'
  tertiary: '#d1d9f3'
  on-tertiary: '#283044'
  tertiary-container: '#b6bdd7'
  on-tertiary-container: '#444c62'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#79f7ea'
  primary-fixed-dim: '#5adace'
  on-primary-fixed: '#00201d'
  on-primary-fixed-variant: '#00504a'
  secondary-fixed: '#d8e3fb'
  secondary-fixed-dim: '#bcc7de'
  on-secondary-fixed: '#111c2d'
  on-secondary-fixed-variant: '#3c475a'
  tertiary-fixed: '#dae2fd'
  tertiary-fixed-dim: '#bec6e0'
  on-tertiary-fixed: '#131b2e'
  on-tertiary-fixed-variant: '#3f465c'
  background: '#131314'
  on-background: '#e5e2e3'
  surface-variant: '#353436'
typography:
  headline-xl:
    fontFamily: Space Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: 0.05em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '500'
    lineHeight: '1.2'
    letterSpacing: 0.1em
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
    letterSpacing: 0em
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
    letterSpacing: 0em
  label-md:
    fontFamily: Space Grotesk
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1.0'
    letterSpacing: 0.2em
  label-sm:
    fontFamily: Space Grotesk
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.0'
    letterSpacing: 0.15em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin: 32px
  container-max: 1280px
---

## Brand & Style

This design system is built on the intersection of vintage computing and high-fidelity modernism. It evokes the atmosphere of a premium mission-control interface—precise, focused, and cinematic. The target audience values technical sophistication and minimalist aesthetics, preferring interfaces that feel like professional instruments rather than consumer toys.

The design style blends **Minimalism** with **Retro-Futurism**. It utilizes a strict structural grid, monospaced-adjacent typography, and a "light-in-the-dark" philosophy where the UI itself acts as the primary light source through subtle neon luminescence and "on air" glow effects.

## Colors

The palette is anchored in deep, light-absorbent tones to create a sense of infinite depth. 
- **Primary:** A vibrant Mint/Teal used exclusively for critical data, active states, and "on air" indicators.
- **Secondary/Tertiary:** Deep Navy and Slate tones that provide structural hierarchy without breaking the dark-room immersion.
- **Neutral:** A Charcoal-Black base used for the primary canvas.

Functional colors (success, error, warning) should be desaturated to maintain the minimalist aesthetic, only becoming "neon" when an alert requires immediate user intervention.

## Typography

The typographic system uses a dual-font approach to balance technical character with readability.
- **Headers & Labels:** Use **Space Grotesk**. For large display headers, a "dot-matrix" or pixelated effect should be applied via CSS masking or specific font-weight variations to mimic vintage digital readouts. High letter-spacing is encouraged for labels to enhance the "instrumental" feel.
- **Body Text:** Use **Inter** for its neutral, utilitarian clarity. It provides a necessary counter-balance to the more aggressive geometric headers, ensuring long-form content (like chat or descriptions) remains legible.

## Layout & Spacing

The layout follows a **Fixed Modular Grid**. Elements are contained within structured blocks that align to a strict 4px baseline. 

A subtle "dot-matrix" background pattern (1px dots spaced every 24px) should be used across the main canvas to reinforce the digital terminal aesthetic. Layout sections are separated by thin, low-opacity borders (0.5pt to 1pt) rather than large gaps of whitespace. Margins are generous to allow the dark theme to "breathe," but internal padding within components is tight and efficient.

## Elevation & Depth

This design system avoids traditional drop shadows. Instead, it conveys depth through **Tonal Layering** and **Luminescence**:
- **Planes:** Higher elevation is represented by lighter shades of Navy/Charcoal, not shadows.
- **Inner Glows:** Active elements (like the "On Air" box or selected buttons) use a subtle 2-4px inner blur of the primary mint color to simulate a cathode-ray tube (CRT) glow.
- **Glassmorphism:** Use very heavy backdrop blurs (30px+) with low-opacity (5-10%) fills for floating overlays or menus, creating a "frosted terminal" effect.

## Shapes

The shape language is predominantly architectural and sharp.
- **Primary Elements:** Use a `0.25rem` (4px) corner radius to soften the edges just enough to feel premium without losing the technical "box" feel.
- **Status Indicators:** "On Air" lights and status pips are circular to contrast against the rectangular grid.
- **Interactive Triggers:** Buttons and inputs should maintain crisp, sharp corners or the minimum `rounded-sm` setting to align with the retro-hardware inspiration.

## Components

### Status Indicators & "On Air" Lighting
The "On Air" indicator is a critical component. It consists of a small Mint Green dot with a `pulse` animation and a secondary text label. The entire container should have a subtle green outer glow (`box-shadow: 0 0 10px rgba(79, 209, 197, 0.3)`).

### Playback Controls
Controls are sleek and wireframe-based. Use 1px stroke icons. The progress bar should be a simple 2px line, with the elapsed portion highlighted in Mint and a small glowing "playhead" dot.

### Structured Chat Interface
The chat interface discards traditional speech bubbles. Instead, it uses a vertical timeline layout. Messages are separated by subtle horizontal lines. Usernames are set in `label-sm` Space Grotesk. Hovering over a message reveals a low-opacity Mint highlight.

### Inputs & Buttons
- **Inputs:** Ghost-style inputs with only a bottom border or a very subtle 1px outline. The cursor should be a solid block (blinking) to mimic terminal inputs.
- **Buttons:** Solid buttons use the primary Mint color with black text for maximum contrast. Secondary buttons are ghost-style with Mint borders and text.