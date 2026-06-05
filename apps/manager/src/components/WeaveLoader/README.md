# WeaveLoader (POC)

Registration loader where the ENS name being registered "fills out" with a woven
**jacquard** shader as progress advances — matching the Figma prototype
("light grey on the name and then it fills with a darker colour").

Ported from the shader sandbox (`github.com/ali-rasheed/test-space`). It's intentionally
**self-contained** so it can be lifted into a package later. Prop-driven for now — no xstate
wiring yet.

## Usage

```tsx
import { WeaveLoader } from '@/components/WeaveLoader'

<WeaveLoader name="erni.eth" progress={0.6} />
```

`progress` (0–1) drives both the woven fill and the default playful step label
(`Reserving your name` → … → `Placing your new identity in your wallet`).

## Pieces

| File | Role |
|------|------|
| `shader/vertex.glsl`, `shader/fragment.glsl` | Verbatim weave shader (WebGL1). |
| `shader/patterns.ts` | Weave drafts + `buildPatternTexture`. |
| `shader/weaveConfig.ts` | DPR, ENS palette RGBA, default uniforms. |
| `shader/useWeaveShader.ts` | GL compile + render loop (ENS-mark / export / recorder stripped). |
| `WeaveCanvas.tsx` | Fills its parent with the animated fabric. |
| `WeaveName.tsx` | Clips the fabric to the name's glyphs; reveals left→right by `progress` (SVG-text mask + `clip-path`). |
| `WeaveLoader.tsx` | Name + progress + step label; honours `prefers-reduced-motion`. |
| `weaveSteps.ts` | Playful step copy + progress→step mapping. |

## How the reveal works

The shader just renders a living woven fabric; the *reveal* is pure CSS. `WeaveName`
draws the name twice from identical SVG geometry: a light-grey base, and a weave-filled
copy masked to the glyphs and clipped left→right via `clip-path: inset(...)`. This keeps
the reveal decoupled from shader internals and trivially driven by a `progress` prop.

## Stories

Storybook: `Components/WeaveLoader` (Idle / Default / Complete / AllSteps / AnimatedLoop /
ReducedMotion / LongName / GarnetColorway) and `Components/WeaveLoader/WeaveCanvas` (raw
fabric variants). Run `pnpm --filter manager storybook`.

## Wiring into the live flow (next step)

Map `registrationMachine` stages → `progress` + step index (see
`RegistrationInProgress/ProgressBar.tsx` `stateMessages` for the existing stage copy),
swap the plain step strings in `weaveSteps.ts` for lingui `msg` descriptors, and render
`<WeaveLoader>` in place of / alongside the current `ProgressBar`.
