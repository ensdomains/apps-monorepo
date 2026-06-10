# Weave Loader & Registration Fill Animation

The registration loading experience: the ENS name being registered "fills out" (light
grey → black) as the registration machine progresses, alongside a living woven-fabric
square rendered with a WebGL shader. Matches the Figma design (ENS App Beta, node
`1209-29493`).

## Where it lives

- Components: `src/components/WeaveLoader/`
- Registration integration: `src/features/register-v2/workflow/registering/`
  (`RegisteringStep.tsx`, `components/WeaveRegistration.tsx`, `lib/useForwardProgress.ts`)
- Text transitions: the [`calligraph`](https://github.com/raphaelsalaja/calligraph)
  library (fluid character transitions powered by Motion)

## User-facing flow

1. **Registration starts (notification settings visible).** The header shows only the
   filling name (`NameFill`), centered, with a "Registering name" label above it whose
   trailing dots cycle through a `Calligraph` transition. There is no progress bar — the
   name fill *is* the progress indicator.
2. **"Set up later" / confirm dismissed the notifications step.** The page switches to
   the full-screen `WeaveRegistration` loader: woven houndstooth-shimmer square on the
   left, a changing playful step label (animated by `Calligraph`) and the filling name
   on the right. A secondary description line (e.g. the commitment cooldown countdown)
   renders **below** the whole section so its appearance never shifts the layout.
3. **Completion.** The fill sweeps to 100% within ~1s, then a **Continue** button appears
   below the section. The loader stays until the user clicks it; only then does the
   registration details view replace it.
4. **Failure / user rejection.** The UI machine exits `registering` and the route swaps
   to `FailureStep`, unmounting the loader — the animation halts with it.

## Progress driver: `useForwardProgress`

`lib/useForwardProgress.ts` converts the registration machine's discrete stage progress
(`REGISTRATION_STAGE_PROGRESS`, 0–100) into a continuously forward-moving display value,
driven by `requestAnimationFrame`.

### Why not use the machine progress directly?

The machine's stage percentages are front-loaded against wall-clock time: it reaches
high percentages (e.g. waiting on the registration bundle at 85%) within seconds and
then spends most of the real time waiting there. Showing the raw value makes the name
look instantly filled, then frozen.

### Time-shaped display bands

The display timeline is shaped around the commitment cooldown (the ~60s wait in the
middle of every registration):

| Phase | Machine stages | Display fill |
|---|---|---|
| Pre-cooldown signatures (setup, commit) | 0–44 (`commitmentCooldown`) | 0 → 20% |
| Commitment cooldown (~60s) | sits at 44 | 20 → 80%, paced by the countdown |
| Post-cooldown waits (approval, register, verify) | 46–100 | 80 → 100% |

Machine progress is remapped (`remapToDisplay`) into those bands.

### Movement rules

- **Always starts at 0** and is **monotonic** — never moves backward.
- **Asymptotic approach** (outside the cooldown): closes ~7%/s of the *remaining gap*
  (`GAP_CLOSE_FRACTION_PER_SEC`) toward a cap set 85% of the way to the next machine
  milestone (`displayCap`) — so the fill keeps creeping during long waits but never
  claims progress past the next real checkpoint.
- **Cooldown pacing**: speed is `(80 − current) / remainingSeconds`, landing on exactly
  80% when the cooldown ends (~1%/s for a 60s cooldown). It also absorbs any
  pre-cooldown shortfall.
- **Minimum visible speed**: `max(0.25 %/s, 0.04 chars/s × (100 / nameLength))` so both
  short names and 255-char names keep perceptibly moving.
- **Completion**: time-based sweep (`max((100 − p) × 4, 30) %/s`) so the fill finishes
  well within a second regardless of name length; `fillDone` flips true on arrival and
  gates the Continue button.
- The rAF loop stops on unmount, halting the animation on failure/rejection.

`RegisteringStep` calls it once and feeds both render sites (notifications header and
the big loader), passing `"label.eth".length` and the live cooldown countdown from
`useCountdown(registerReadyTimestamp)`.

## Components

### `NameFill`

Real HTML text that fills with a colour (or any CSS `background`, e.g. a gradient) as
`progress` (0–1) advances left→right. Two identical text layers: the base painted in
`baseColor` (grey, `--color-ens-gray-two`), and the fill layer painted via
`background-clip: text` and clipped by `clip-path: inset(0 X% 0 0)`. Using identical
text + typography keeps the layers in lockstep, and real text honours letter-spacing /
line-height natively.

- `animate` enables a 0.45s CSS transition on clip-path; **disable it when an external
  rAF driver updates `progress` every frame** (as `RegisteringStep` does).
- Long names: pass `className="whitespace-normal break-all"` to allow wrapping (labels
  can be up to 255 chars). Note the clip reveal sweeps all wrapped lines together.

### `WeaveRegistration`

The full-screen registration loader (Figma node `1209-29493`):

- Left: 160px rounded square with `WeaveCanvas` running `HOUNDSTOOTH_SHIMMER_OPTIONS`.
- Right (333px column): step label (32px sans, `--color-ens-quartz-450`, 90% leading,
  −0.8px tracking) over the name (`NameFill`, 31.68px mono, −1.2672px tracking). The
  label is a `Calligraph` (`variant="text"`, `animation="smooth"`, `trend={1}`,
  `autoSize={false}`) so each copy change morphs fluidly — shared characters slide to
  their new positions, entering ones fade in from below. Copy comes from
  `stepLabelForProgress` (`weaveSteps.ts`).
- Below the section: optional `description` (e.g. cooldown countdown) and `footer`
  (e.g. the Continue button) — outside the section so they never push the layout.
- `progress` is 0–100 (matching the UI machine scale).

### `WeaveCanvas` + `shader/`

`WeaveCanvas` fills its parent with the animated woven fabric. It is memoized so parent
re-renders (progress ticks every frame) don't churn the GL canvas.

The shader stack (ported from the shader sandbox, trimmed of export/recorder/ENS-mark
code):

- `shader/vertex.glsl` / `shader/fragment.glsl` — the WebGL1 weave shader, verbatim.
- `shader/patterns.ts` — data-only weave drafts. Each pattern is a tile grid where
  `rows[row][col]` is `0` = warp (vertical thread) on top, `1` = weft (horizontal) on
  top; `row8(n)` expands an 8-bit number into one row (bit 0 = column 0).
  `buildPatternTexture` packs all patterns into a `TILE_MAX`-wide texture the shader
  samples. Add or edit patterns here without touching GLSL.
- `shader/weaveConfig.ts` — ENS palette RGBA (`[palette][shade]`, shades 0–4 = 950, 500,
  100, 400, transparent; palette 4 = Quartz neutrals) and `WEAVE_DEFAULTS` (multi-
  colorway dye-bleed look on by default; shimmer off; stitch reveal disabled because the
  reveal is done in CSS).
- `shader/useWeaveShader.ts` — compiles the program, uploads a fullscreen quad and the
  pattern texture, and runs the render loop. Uniform values are read each frame from a
  ref, so option changes do not tear down the GL context; the program/texture rebuild
  only when shader source or the pattern set changes. Hover/stitch-reveal uniforms are
  held at neutral values.

`presets.ts` exposes `HOUNDSTOOTH_SHIMMER_OPTIONS` (pattern 13 = Houndstooth, all
colorways, shimmer sweep) — the fabric used in the registration square.

### `WeaveName` / `WeaveLoader` (shader-filled name variant)

An alternative treatment where the *fabric itself* fills the glyphs: `nameMask.ts`
renders the name as an SVG data-URI used as a CSS mask (geometry measured with a canvas
so SVG aligns with on-screen text), and `WeaveName` stacks a grey base layer under a
`WeaveCanvas` masked to the glyphs and clipped left→right by progress. `WeaveLoader`
wraps it with the step label and honours `prefers-reduced-motion` (fill snaps instead
of animating). Not currently used in the live registration flow, which uses the simpler
`NameFill`.

### `WeaveProgressBar`

A thin rounded progress bar whose fill is the woven fabric, revealed by clip-path so the
weave keeps its scale rather than stretching. Not used in the live flow (the name fill
replaced it) but kept for reuse.

## Step copy

`weaveSteps.ts` holds the playful step labels ("Reserving your name" → … → "Placing your
new identity in your wallet"). Each step owns a slice of the 0–1 progress range
(`end` = upper bound); `stepLabelForProgress(p)` resolves the active label. These are
plain strings for now — swap to lingui `msg` descriptors when copy is finalized.

## Text transitions (`calligraph`)

The changing copy uses the [`calligraph`](https://github.com/raphaelsalaja/calligraph)
library (already a dependency; also used by `AnimatedPrice` on the pricing page).
`<Calligraph>` diffs its string children on change: shared characters slide to their new
positions, entering characters fade in, exiting ones fade out.

- **Step label** (`WeaveRegistration`): `variant="text"` (default), `animation="smooth"`,
  `trend={1}` (entering chars rise from below), `initial` (animates on first mount),
  `autoSize={false}` (the label wraps inside the fixed 333px column, so the wrapper must
  not animate its width).
- **"Registering name" loop** (notifications header in `RegisteringStep`): Calligraph
  only animates when its children change, so `useTrailingDots` cycles `"" → "." → ".." →
  "..."` every 700ms and the label renders `Registering name` + dots through a
  `Calligraph`, producing a continuous, subtle loop.

## Stories

- `Features/RegisterV2/WeaveRegistration` — Default / Start / Complete /
  CompleteWithContinue / WithCooldown / LongName / SixtyThreeCharName / MaxLengthName /
  AnimatedRegistration / LiveForwardProgress / LiveForwardProgressMaxLength. The
  `LiveForwardProgress*` stories run the real `useForwardProgress` driver against the
  actual machine milestones with a compressed 8s cooldown.
- `Components/WeaveLoader` and `Components/WeaveLoader/WeaveCanvas` — the shader-filled
  variants and raw fabric.

Run with `pnpm --filter manager storybook:dev`.
