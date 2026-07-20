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

## Modal boundary

Modals are reserved for short, bounded actions that make sense in the context
of the page beneath them. The whole action should be understandable at a glance
and normally end when it is saved or cancelled. Add measurement is one such
action. The active check-in is a deliberate focused-flow exception.

Use a routed page when an experience contains a collection to manage, long
reading, reordering, nested add/edit/detail states, or enough work that a stable
URL and normal document scrolling are useful. Habit management lives at
`/habits/manage`; the rolling habit record and individual statistics retain
their own routed pages. Body-metric management lives at `/health/metrics`.
Completed check-ins and other summaries remain reading pages.

Every true modal uses React Aria behavior for focus containment, Escape,
restoration, and background inertness. A large panel is not made a modal merely
to avoid adding a route.

## Typography

- A soft serif is used for reflection prompts, journal reading, review content,
  and selected moments of emphasis.
- The compact wordmark uses a quiet, self-hosted cursive face. Script type does
  not extend into headings, reflection text, or controls. Its visual spelling,
  `mindfulll`, adds a final loop while the product name remains Mindfull.
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
Normal-sized secondary text and interactive hover colors maintain at least a
4.5:1 contrast ratio across the canvas, reading surfaces, and the strongest
allowed ambient field. Decorative accent colors are not used as text colors.
Decorative dividers may remain quieter, while control outlines, selected-state
borders, focus rings, and progress indicators maintain at least 3:1 contrast
against adjacent colors.

An optional ambient color field draws from the calm, graphic character of the
Zune desktop software: broad asymmetric gradient planes, richer coral, plum,
amber, teal, and indigo, and generous areas of quiet canvas. It avoids visible
blobs and decorative particles. Fine, oversized contour lines provide a trace
of abstract background artwork without becoming a foreground illustration.
The field shifts between warm morning and cooler evening palettes, continues
behind translucent navigation, and never carries meaning. The synchronized
setting offers Gentle, Still, and Off; Gentle is the default. Animation pauses
during focused writing and check-ins, and reduced-motion always receives the
still treatment.

## Layout

- Mobile is the primary composition target.
- Desktop retains a centered, generous reading column instead of filling the
  viewport with panels.
- The Today view can group content through whitespace and headings rather than
  putting every section in a card.
- Check-ins temporarily become the entire focus of the page.
- Check-in dialogs contain keyboard focus. Each new step receives focus on its
  heading, and closing the flow restores focus to the invitation that opened it.
- Settings may be denser than reflection surfaces, but should use the same
  typography and rhythm.
- Primary navigation contains Today, History, and Reflect. Settings uses a
  consistently placed icon button with an accessible name and focus treatment.
- The compact app header remains sticky on long pages. It uses a translucent
  canvas surface and subtle divider so content can pass beneath it without
  becoming difficult to read.
- On mobile, the top bar is reserved for the wordmark, sync state, and settings;
  Today, History, and Reflect remain in a fixed bottom bar. The two bars never
  repeat the same action.
- Healthy mobile sync states collapse to a legible status mark. Syncing,
  offline, and error states keep their short text because they may need action.
- Mobile Today establishes one clear first action and lets secondary check-ins,
  empty states, and optional Health content recede. History and Reflect use
  compact introductions so their records and reflection cards appear in the
  first viewport.
- On mobile, a journal compose action floats above the bottom navigation. On
  wider screens it may include the short label Write.
- A floating action should remain visually quiet: one action, no speed dial,
  no attention-seeking pulse, and no collision with navigation or content.
- Journal writing uses the document as its only vertical scroll surface. The
  writing area grows with the entry, and its Finish action steps away while the
  on-screen keyboard is open so the active text remains unobstructed. The mobile
  navigation also withdraws while typing and returns when the keyboard closes.
- History uses a single reading column grouped by date, not a dashboard grid.

## Motion

Motion is gentle and functional:

- Short fades and small vertical transitions between check-in steps
- A restrained breathing/arrival animation
- Soft completion transitions
- No bouncing, celebratory particles, or long blocking sequences
- Respect `prefers-reduced-motion`
- Ambient color movement uses long, quiet cycles and never pulses for attention

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
