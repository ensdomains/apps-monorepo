---
name: writing-tests
description: Required before writing or editing tests for a behaviour change. Use when a ticket changes runtime behaviour, or when writing a test, fixture, snapshot, or vitest file.
---

Every test must be able to fail when real behaviour breaks. Fewer, sharper tests beat many shallow ones.

A runtime behaviour change is not done until focused tests sit next to the code and have been run. Keep every existing case. Add the new case beside it. Do not replace an old case (for example a 10-day case) with the new one.

## Don't write

- **Tests of dead code.** If nothing outside tests imports a function, delete the function rather than testing it. Don't export a helper only so a test can reach it; test it through the live entry point. knip can see export-only-to-tests usage, but CI does not fail on knip yet (the step in `.github/workflows/test.yml` is still commented out).
- **Tests of the mock.** Asserting a value the mock itself returned, or that a mocked child component rendered its props, proves nothing.
- **Tests of libraries or the compiler.** Don't re-test viem, zod/valibot, neverthrow, clsx/tailwind-merge, TanStack, `Intl`/`Date`, or properties TypeScript already enforces (shapes, `typeof`, type-level `Equals`).
- **Tests that can't fail.** Examples: `expect(x).toBeDefined()` after a `getBy*`, `length > 0`, an un-awaited `waitFor`, an `if` around the assertion, "is deterministic"/"is pure", or a constant asserted against a copy of itself.
- **Pins of constants, copy, or styling.** Tailwind class strings, label text, address tables, `staleTime` values. Pin these only when the value is a deliberate decision a review should catch.
- **The same behaviour twice.** Test logic once, at the lowest layer that owns it. Hooks, components and wrappers then get one wiring test, not a replay of the helper's input table. Same for a pure util in an app and a package: test it where it lives. Before adding a case, check it hits a branch no existing case covers.

## Shape

- Prefer `it.each` tables over copy-pasted `it` blocks that differ only by input.
- Prefer file-local builders (`run(overrides)`, `makeX()`) over repeating the same args object.
- Reuse existing fixtures (`@ens-apps/migration/test-fixtures`, `src/test-utils`) rather than redefining them.
- Keep one test file per module.

## After you add or change a test

Break the code it covers once, run the test, and confirm it fails. Then restore the code and confirm the test passes. For a bug fix, the failing run happens on the unfixed code before the fix.

Run `pnpm exec vitest run --maxWorkers=4 <paths>` from the app or package directory. Do not run the full suite unless asked.
