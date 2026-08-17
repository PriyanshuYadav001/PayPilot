# PayPilot Design Direction

## Three Initial Directions

### Theme Name: Quiet Command Center
Very dark, compact, and data-rich with a restrained mint signal color. Designed to feel like a calm control surface for revenue operations rather than a generic finance dashboard.

**Probability:** 0.07

### Theme Name: Ledger Editorial
A high-contrast graphite and paper-inspired system with editorial typography, strong tabular rhythm, and a more tactile finance-journal feel.

**Probability:** 0.04

### Theme Name: Signal Garden
A lighter, atmospheric interface where collections and follow-ups are represented as living flows, with soft greens and rounded forms.

**Probability:** 0.02

## Chosen Approach: Quiet Command Center

### Design Movement
Contemporary Swiss-influenced information design blended with premium developer-tool ergonomics: restrained, precise, utilitarian, and quietly expressive.

### Core Principles
1. **Signal over decoration:** every accent color, line, and badge communicates state or movement.
2. **Dense but breathable:** compact tables and metrics sit inside deliberate negative space so the app feels operational without feeling cramped.
3. **Soft depth:** use near-black surfaces, hairline borders, subtle shadows, and faint atmospheric layers rather than heavy gradients or ornament.
4. **Confident restraint:** one ownable mint accent is paired with warm white typography and cool slate neutrals; no rainbow charts or loud dashboard chrome.

### Color Philosophy
PayPilot’s signature mint is a positive collection signal: it implies forward movement and a successful handoff without looking like a conventional bank green. Graphite surfaces create focus and trust. Warm off-white text keeps the dark UI human and legible, while dusty blue-gray supports hierarchy without competing with the action color.

### Layout Paradigm
A persistent left rail establishes orientation, while the main workspace uses asymmetric editorial bands: a narrow context header, an intentionally dominant summary region, then split operational surfaces for revenue movement, overdue work, and upcoming actions. Content should align to a shared left edge but avoid a repeated equal-card grid.

### Signature Elements
- A small mint trajectory mark in the brand symbol and selected navigation states.
- Thin data-flow rules and orbit lines used sparingly in charts, backgrounds, and empty states.
- Compact uppercase metadata labels paired with expressive numeric values.

### Interaction Philosophy
Interactions should feel immediate and instrumental. Hovering reveals context rather than spectacle; keyboard shortcuts and command actions should be first-class. Buttons compress slightly on press, drawers slide with purpose, and status changes use color plus text rather than color alone.

### Animation
Use 140–220ms transitions with a strong ease-out curve for hover, focus, menu, and drawer states. Dashboard sections can enter with a subtle 24px upward translate and staggered 35ms intervals. Avoid continuous motion except for a quiet chart shimmer or progress indicator. Respect `prefers-reduced-motion` and make command palette actions instant.

### Typography System
Use **DM Sans** for interface text and **Space Grotesk** for display numbers, page titles, and compact brand moments. Interface text uses 13–15px with 1.45 line-height; primary titles use 28–34px with tight tracking; monetary figures use 24–30px in Space Grotesk with medium weight. Metadata uses 10–11px uppercase with increased letter spacing.

### Brand Essence
PayPilot is the calm revenue operations cockpit for B2B teams who need to turn outstanding invoices into predictable cash flow through disciplined follow-up. Personality: **precise, assured, quietly ambitious**.

### Brand Voice
Headlines are direct and operational. CTAs describe the action and its consequence, never vague momentum. Microcopy is concise, candid, and slightly human.

Example lines:
- “Keep cash moving.”
- “Three invoices need a nudge before Friday.”

### Wordmark & Logo
The mark is a forward chevron intersecting a partial orbit: a visual shorthand for guiding a payment from outstanding to collected. It is geometric, text-free, and designed to remain recognizable at favicon size. The PayPilot wordmark should use Space Grotesk with a custom tightened “P” and “t” relationship rather than a default logo font.

### Signature Brand Color
**Pilot Mint — `#9FE870`**. It is bright enough to signal action on graphite, but softened with yellow-green warmth so it feels ownable and operational instead of electric or fluorescent.

## Implementation Rules

Every edited component and stylesheet should include a short comment referencing the Quiet Command Center direction. The implementation remains frontend-only with realistic mock data. No backend, database, payment processing, AI, WhatsApp, or calling integrations are introduced in this pass.

The first delivery prioritizes a polished dashboard shell and representative route views for Dashboard, Customers, Invoices, Payments, Follow-ups, Communications, Calls, Analytics, Billing, and Settings. Shared layout, navigation, command menu, tables, cards, charts, empty states, and responsive behavior should be implemented as reusable primitives rather than duplicated page markup.

## Style Decisions

- The dashboard uses a dominant cash-movement story with subordinate operational surfaces rather than a repeated equal-card grid.
- Pilot Mint `#9FE870` is reserved for collection movement, selected navigation, primary actions, positive deltas, and the signature trajectory motif; neutral decoration stays graphite or slate.
- PayPilot copy makes actions consequential and operational, using language such as “Draft an invoice,” “Invoices needing motion,” “Collection pulse,” and “Send the next nudge.”
