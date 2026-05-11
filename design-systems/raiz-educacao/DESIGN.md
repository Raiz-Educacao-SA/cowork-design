# rAIz Educacao

> Category: Enterprise education
> Surface: web

Quiet, operational UI system for Raiz education workflows. Use it for dashboards, copilots, workspace tools, data review screens, school operations, and enterprise education apps.

## Brand Tokens

- Primary orange: `#F7941D`
- Orange hover: `#D97B10`
- Orange soft: `#FEF3E2`
- Secondary teal: `#5BB5A2`
- Teal hover: `#3D9A87`
- Teal soft: `#EAF6F3`
- App background: `#F8F9FA`
- Surface: `#FFFFFF`
- Foreground: `#1A202C`
- Secondary text: `#4A5568`
- Muted text: `#718096`
- Border: `#E2E8F0`
- Sidebar background: `#1E2433`
- Sidebar hover: `#2D3548`

## Typography

- Use IBM Plex Sans for interface text.
- Use IBM Plex Mono for code, IDs, logs, SQL, and numeric tables.
- Prefer compact hierarchy: page titles around 20px, card titles around 14px, body text 14-16px.
- Do not use oversized marketing hero type inside dashboards or tools.
- Keep letter spacing at `0` except for small section labels.

## Layout

- Build dense but calm operational screens.
- Prefer full-width work surfaces over decorative cards.
- Use cards only for repeated items, modals, and genuinely framed tools.
- Keep card radius at 8px or less.
- Do not nest cards inside cards.
- Keep toolbars stable with fixed icon button dimensions and 44px minimum touch targets.
- Avoid large decorative gradients, orbs, blobs, bokeh, and visual noise.

## Components

- Buttons: primary actions use orange sparingly; secondary actions are neutral.
- Icon buttons must have labels or tooltips.
- Forms should use clear labels, validation text, and predictable focus rings.
- Tables should favor scanability, fixed columns where useful, and tabular numbers.
- Status uses semantic color plus text, never color alone.
- Navigation should feel utilitarian and predictable.

## Accessibility

- Focus ring: `2px solid #F7941D`.
- Minimum contrast target: WCAG AA.
- Touch target minimum: 44px.
- Use aria labels for icon-only controls.
- Preserve keyboard navigation and visible focus in all tool surfaces.

## Motion

- Prefer 150-300ms opacity or transform transitions.
- Respect reduced motion.
- Do not animate layout in ways that shift user focus or resize controls.

## Generation Guidance

When generating a design with this system:

1. Use Portuguese copy by default for user-facing interface text.
2. Favor operational clarity over decorative presentation.
3. Make the first screen usable immediately.
4. Keep Raiz orange as an accent, not as a dominant wash.
5. Use teal for secondary emphasis and relationship/context cues.
6. Avoid one-note palettes and avoid dark blue/slate dominance.
