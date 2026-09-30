# Fonts

The ABC / Dinamo faces (ABC Monument Grotesk, ABC Monument Grotesk Mono,
ABC Monument Grotesk Semi Mono, ABC Marist) are **not** stored in this repo.
Their license does not permit redistribution in an open source repository, so
they are loaded at runtime from:

    https://fonts.ens.dev/fonts/...

See `src/styles/fonts.css` for the `@font-face` rules and `src/worker/csp.ts`
for the `font-src` allowance.

**Do not add WOFF2 copies of these families here.** The whole point is that the
bytes stay out of the repository. The paths are immutable-cached for a year, so
replacing a face means a new path, not a re-upload.

## Exception: the OG TTF files

`og/*.ttf` are still vendored. satori cannot read the WOFF2 faces, so the OG
renderer needs real TrueType files in the Worker bundle, and fonts.ens.dev
only serves WOFF2. These are covered by the font carve-out in the root `LICENSE`.
