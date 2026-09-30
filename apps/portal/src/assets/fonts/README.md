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

## The OG image fonts

The Open Graph renderer uses Geist and Geist Mono, which are open source (SIL
Open Font License 1.1) and committed under `og/`, with the license text in
`og/LICENSE-OFL.txt`. satori cannot read WOFF2, so it needs these TrueType files
in the Worker bundle.
