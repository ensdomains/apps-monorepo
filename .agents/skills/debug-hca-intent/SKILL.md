---
name: debug-hca-intent
description: Debug a Rhinestone HCA registration intent that fails simulation, including InvalidSignature from the orchestrator. Use when an intent simulation fails or before changing commit or reveal calldata.
---

Read `packages/smart-account/DEBUGGING_INTENTS.md` and follow it. The notes below are the part people get wrong; the doc has the replay steps.

- `InvalidSignature()` from the orchestrator is a wrapper. Get the inner revert before assuming the signature is wrong.
- Replay the failed intent with `cast call --trace` and the state overrides from the error payload. The doc says which override flag to use.
- Check validator error selectors and the policy's exact-calldata checks.
- Build a real signed intent outside the app when you need to reproduce the failure end to end.

Do this any time a registration intent fails simulation, and before changing the shape of a call in the commit/reveal batch.
