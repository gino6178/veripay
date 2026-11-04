# Design

Cover is drawn like an instrument's spec sheet at night: a warm graphite ground, one safety-orange signal, white ink, and
measurement as the only ornament. Everything is a part with a number.

## Scene

A 27-year-old in Taipei, on their phone around midnight, five minutes after their scooter was scratched or their laptop
took a coffee. They want to see what happens next, exactly, and when the money arrives. Dark ground, high-contrast ink.

## Color (OKLCH, one theme)

| Token | Value | Role |
|---|---|---|
| `--ground` | `oklch(0.165 0.008 45)` | page |
| `--ground-2` / `-3` | `oklch(0.205 0.009 45)` / `oklch(0.25 0.01 45)` | panels, raised rows |
| `--line` / `--line-strong` | white at 12% / 26% | hairlines, rules, ticks |
| `--ink` / `-2` / `-3` | `oklch(0.965 0.004 45)` / `0.84` / `0.70` | text, all at least 4.5:1 on the ground |
| `--signal` | `oklch(0.72 0.19 42)` | safety orange: the one accent, actions and the money's path |
| `--ok` / `--warn` / `--bad` | green / amber / red | claim outcomes only |

Strategy: restrained. Orange covers under 10% of any screen; it marks what moves (money, actions, the current check).

## Type

- Display: **Big Shoulders Display** 800 (Latin and numerals; Chinese falls to Noto Sans TC 900). Numbers are the hero.
- Text: **Schibsted Grotesk** with Noto Sans TC.
- Data: **Martian Mono** for clause ids, PayPal ids, amounts in tables, timers. Never for prose.

## Components

- Spec rows: label, dotted leader, value. Used for prices, policies, limits.
- Part tag: a clause id in a 1px box, `RT-2.1`.
- Dimension line: ticks and a measured span with its value, for the premium split.
- Registration marks: small corner crosses on the panels that carry money.
- Buttons: 2px radius; the primary action is solid orange with dark ink; secondary is a 1px outline.

## Motion

Exponential ease-out. The claim instrument runs its checks in sequence with a running timer; reveals translate 16px and
fade, on already-visible content. Reduced motion shows the final state at once.
