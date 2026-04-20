# Code Review Guidelines

## Authoritative Sources

- **STYLEGUIDE.md** — the complete coding standards. Read this in full before reviewing.
  Every rule in it matters.
- **CLAUDE.md** files — project and package-level instructions, including
  `packages/transaction-manager/CLAUDE.md` for neverthrow + XState patterns.

## Severity Mapping

Map STYLEGUIDE.md rule severities to review comment severities:

- **STYLEGUIDE 🔴 Must** → Flag as important. Always flag violations.
- **STYLEGUIDE 🟡 Default** → Flag as a nit. Acknowledge that pragmatic exceptions
  are acceptable when justified with a code comment in the source.
- **STYLEGUIDE 🟢 Guideline** → Only flag if violated repeatedly across the PR
  or if it significantly hurts readability.

## Documented Exceptions

The STYLEGUIDE.md "Breaking the Rules" section allows any rule to be intentionally
broken when justified with a code comment. Before flagging a violation, check whether
the author left a justifying comment. If so, do not flag it.

## Comment Style

- Reference the specific STYLEGUIDE.md section name when flagging a violation
- Include a brief code suggestion showing the correct pattern
- Never post praise or positive observations as inline comments
- Positive observations belong only in the summary comment
- Be concise and actionable

## What to Skip

- Crowdin-generated translation files
- Generated code or auto-formatted files
- Lock file changes (unless introducing security vulnerabilities)
- Formatting-only changes already handled by Biome
- React Strict Mode double-execution behavior — never flag this as a bug,
  never suggest caching or flags to prevent it

## Monorepo Awareness

- Changes should stay within the relevant `apps/` directory unless genuinely shared
- Shared code under `packages/` should be justified
- Check package-specific CLAUDE.md files for additional context
