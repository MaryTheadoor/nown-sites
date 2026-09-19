# Nowndigital.app → S.I.T.E.S tiles (page map)

Source-of-truth mapping of the **Nown Digital** agency site to framework tiles.
The site is currently a Google Sites build; this is the target structure for the
first spec-compliant **prototype rebuild** (Firebase primary, Sites optional).

> Manifest: `nowndigital.manifest.json` (validates against `ai-skill/sites-schema.json`).

## Nav dock
`Home · About · SITES · Services · Portfolio · R&D · Apps(external: apps.nown.digital) · Theme(toggle)`.
Out-of-band CTA: `Get a Free Consultation` → Calendly.

## Section → tile mapping

| # | Section / copy | Tile | Notes |
|---|---|---|---|
| 1 | "Your Vision, Built with Care." / "Sovereign Internet Topology Engines for Creators & Business." | **hero** | CTA → Calendly consultation |
| 2 | "Our Why" (mission: no agency traps, true digital independence) | **feature** | |
| 3 | "Powered by LazerFlow Intelligence" (IST, self-healing systems) | **feature** | CTA → R&D lab |
| 4 | "The Nown SITES Protocol" → Custom-Tailored Suit, True Ownership | **feature** | CTA → /sites |
| 5 | "From Minecraft to Main Street" (founder story) | **content-card** | CTA → /about |
| 6 | "Our Services" → Website Development, Branding & Design, Printing & Consulting | **feature** | 3-up grid; CTA → /services |
| 7 | "Our Work" (dynamic portfolio, "Loading Projects…") | **gallery/media** | JS-loaded projects; CTA → /portfolio |
| 8 | "Let's Build Something Together" (Mary Theadoor, 📞 970-903-0369, ✉️ hello@example.com, 🌐 NownDigital.app, Save Contact) | **contact** | + optional contact-form/booking |
| 9 | Footer: © 2025 Nown Digital · Nown Family Ltd. · Legal | **footer** | |
| 10 | "Interactive Web Apps" (Tools/Games/AI; Business Card Generator, Meditation App, Brick Breaker) | **gallery/media** | CTA → apps.nown.digital |
| 11 | "Nown Institute for Science & Technology (NIST)" — "Exploring the Physics of Information" | **hero** | |
| 12 | "Information Substrate Theory (IST)" | **content-card** | research blurb |
| 13 | "Powered by LazerFlow Intelligence" | **feature** | CTA → lazerflow.com |

## Contact / conversion
- Phone: 970-903-0369 · Email: hello@example.com · Domain: NownDigital.app
- Booking: `calendly.com/example/free-consultation`
- Contact card uses privacy-first embed (Formspree/Tally/StaticForms) — no backend.

## Notes
- `R&D: The Nown Institute` is an umbrella for the NIST / IST / LazerFlow sections.
- `apps.nown.digital` and `lazerflow.com` are external properties; link out, don't embed.
- Theme palette from `theme.colors` (framework defaults teal/gold/plum); refine per brand.
