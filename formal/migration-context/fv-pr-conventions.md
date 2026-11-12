# Nov 4 2026 draft FV PRs (ensdomains/apps-monorepo), via cursor-github + git show

All by storywithoutend, draft, open, created 2026-11-04 (UTC+8 evening).
- #1713 (for #1640) review/pr1640-formal-verification 7572346c7: formal/pr-1640-safe-renewal/SafeRenewalRoute.tla + Current/Hardened/No*.cfg, formal/verify-pr-1640.sh (+ .test.py), formal/PR-1640-FINDINGS.md; exhaustive real-code matrix (36 combos of resolveRenewalSigner/getRenewalPaymentRoute); 2 intentional failing regression tests; "Production files changed: none".
- #1714 (for #1694) review/pr1694-formal-verification e8e890ea5: formal/pr-1694-renewal/RenewalConsent.tla + cfgs, verify-pr-1694.sh, FINDINGS; exhaustive two-token consent matrix vs real TS; 1 intentional failure.
- #1715 (for #1703) review/pr1703-formal-verification c6f9a2261: formal/pr-1703-registration/RegistrationOwnerSetup.tla + cfgs, verify-pr-1703.sh; diff vs merge-base with origin/main is 33 files (+2980/-155) and includes production files (registrationUi.machine.ts, HcaFundingApprovalDialog.tsx, transaction-manager registration.funding.ts, warp-* actors). Most likely because the branch stacks on the PR #1703 head rather than main (the other three FV branches change only formal/test/verification files: 16, 13, 15 files). Not verified further.
- #1717 (for #1708) formal/pr1708-payment-behaviour 3b5dca657: newer layout apps/manager/verification/registration-payment/ (RegistrationPayment.tla, .cfg, Hardened.cfg, No*.cfg mutation configs, RegistrationPayment.view.mjs, verify-sensitivity.sh, verify-source-map.mjs with SYNC_COMMIT provenance), .pi/skills/verify-manager-registration-payment/SKILL.md (coverage record), 3 intentionally red Vitest tests kept in normal suite ("Do not skip, isolate, weaken, or invert").

Conventions:
- TLA+ model per behaviour; Current.cfg expected to FAIL with counterexample; Hardened.cfg must PASS; each No<Guard>.cfg is a sensitivity/mutation config that must fail its *named* invariant with TLC exit code 12 (parser/JVM/other failures rejected).
- Runner script pins TLC 1.7.4 (sha256) + Java temurin-25 via mise; FORMAL_OUT_DIR; unique run dir.
- Exhaustive real-code checks: enumerate the full input matrix against real TS functions in Vitest.
- Additive-only: no production changes, no existing assertions changed; regression tests intentionally red; PR body has "Regression check" (callers checked / assertions changed / production files changed / user-visible behaviour).
- Source provenance: verify-source-map.mjs pins covered files to SYNC_COMMIT; update procedure in README.
- Model abstracts React commits, query updates, effects, await continuations as independently ordered actions.
