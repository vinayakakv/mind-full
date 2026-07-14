# Visual and interaction system

## Desired character

Mindfull should feel calm, composed, private, and delightful. Its atmosphere is
created through typography, rhythm, color, and pacing rather than decorative
wellness imagery.

Avoid:

- Generic dashboard cards and sidebars
- Dense grids of metrics
- Excessive borders and containers
- Large gradients and glass effects
- Oversized rounded rectangles on every surface
- Constant icon use
- Confetti, badges, leaderboards, and guilt-driven streaks
- Wellness clichés and forced cheerfulness

## Component approach

Use React Aria Components for accessible behavior and own the visual layer with
CSS Modules. Do not adopt Mantine or shadcn as the primary design language.

The initial app-owned component set should be small:

- Button and quiet icon button
- Text field and text area
- Choice group and emotion selector
- Dialog or sheet
- Progress indicator
- Navigation link
- Notice/status text
- Markdown reading surface
- Visually hidden and focus utilities

More components are added only when repeated use establishes a real pattern.

## Typography

- A soft serif is used for reflection prompts, journal reading, review content,
  and selected moments of emphasis.
- A clear humanist sans-serif is used for controls, navigation, labels, task
  text, and compact metadata.
- Line length remains comfortable for reading, roughly 60–72 characters for
  long-form text.
- Hierarchy should depend on scale, spacing, and weight before color.

Font files should be self-hosted in the application image so the interface does
not depend on an external font service.

## Themes

Mindfull includes dedicated light and dark themes and a preference to follow the
device system. The preference synchronizes; system resolution occurs per
device.

The palette is time-aware:

- Morning may use warmer light, muted clay, pale botanical color, and gentle
  sunlight tones.
- Evening may use cooler slate, dusk blue, muted plum, and lower luminance.
- Both modes remain recognizably part of the selected light or dark theme.

Color tokens should be semantic rather than named after raw hues:

```css
:root {
  --surface-canvas: ...;
  --surface-raised: ...;
  --text-primary: ...;
  --text-reflection: ...;
  --text-muted: ...;
  --border-subtle: ...;
  --accent-calm: ...;
  --accent-warm: ...;
  --focus-ring: ...;
}
```

Contrast and focus visibility remain accessible even when colors are subtle.

## Layout

- Mobile is the primary composition target.
- Desktop retains a centered, generous reading column instead of filling the
  viewport with panels.
- The Today view can group content through whitespace and headings rather than
  putting every section in a card.
- Check-ins temporarily become the entire focus of the page.
- Settings may be denser than reflection surfaces, but should use the same
  typography and rhythm.

## Motion

Motion is gentle and functional:

- Short fades and small vertical transitions between check-in steps
- A restrained breathing/arrival animation
- Soft completion transitions
- No bouncing, celebratory particles, or long blocking sequences
- Respect `prefers-reduced-motion`

Prefer CSS transitions. Add a motion library only when a defined interaction
cannot remain clear and maintainable with CSS.

## Language

The product voice is concise, warm, and impersonal.

Prefer:

- "What felt meaningful today?"
- "You completed this habit on 4 of the past 7 scheduled days."
- "Inspired by your entry from 8 July."

Avoid:

- "I'm proud of you!"
- "Don't break your streak!"
- "You failed to complete this habit."
- Medical or diagnostic interpretation

Encouragement should be specific and grounded in recorded patterns.

