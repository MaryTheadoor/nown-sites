# cards modules

The "content cards": self-contained tiles that hold one data payload each.

| Tile | Purpose | Notes |
|---|---|---|
| `content-card` | Generic text + image card | `.tile-card` |
| `media` | Image/photo card | `.media` + `aspect-ratio` |
| `video` | Embedded video card | lazy, `aspect-ratio` |
| `gallery` | Image grid card | auto-fit grid |
| `feature` | Value-prop card (icon + heading + body) | `.tile-feature` |
| `team` / `profile` | Person card | `.tile-team` |
| `testimonial` | Social-proof card | `.tile-testimonial` |
| `quote` | Pull-quote card | |
| `product` | Product card + buy button | `data-sku`/`data-price` (Snipcart/Stripe) |
| `menu` | Restaurant menu card | menu items list |
| `pricing` | Tier card | `.tile-price` |
| `faq` | Accordion card | `<details>`-based |
| `social` | Social links card | |

See `docs/MODULE-SPEC.md` for the compliance rules.
