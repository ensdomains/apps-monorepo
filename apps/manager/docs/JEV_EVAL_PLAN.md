# Jev evaluation plan for Manager name search

Status: the approved 30-case baseline ran against `jev-1.13.0` and matched 29 cases. The 23-case challenge experiment matched 21 cases after adding Chrono-based relative-time parsing; the two remaining failures are typo cases.

This belongs in `apps/manager/docs/` because Jev is only used by the Manager dashboard. Repository instructions, READMEs, tests, CI, environment examples, and telemetry were reviewed at `c30f356cd`.

## 1. Existing Jev call sites

### Current flow

```text
NamesTable search text
  -> interpretNameSearch TanStack server function
  -> POST https://api.typesafe.ai/v1/systemone
  -> parseJevNameSearchResponse
  -> Chrono relative-time parsing when expiry is `expiring`
  -> SmartNameFilters or fallback
  -> buildDashboardSearchResults
  -> displayed and bulk-selectable names
```

| File | Role |
| --- | --- |
| `components/NamesTable.tsx` | Triggers on Enter, suppresses stale responses, and handles UI fallback. |
| `service/interpretNameSearch.ts` | Reads the server secret and maps internal results to the browser contract. |
| `service/executeJevNameSearch.ts` | Shared production/eval operation that validates input, calls TypeSafe, preserves evidence, and parses filters. |
| `service/jevNameSearchRouting.ts` | Owns the shared production/eval UI routing heuristic without pulling server parsing into the client bundle. |
| `service/jevNameSearch.ts` | Builds versioned questions and converts answers into `SmartNameFilters` with rejection reasons. |
| `service/jevNameSearchTime.ts` | Uses Chrono to convert one future relative-duration expression into `withinDays`; calendar expressions remain unsupported. |
| `evals/jev-name-search/run.ts` | Runs approved cases through the shared operation and writes a baseline report. |
| `smartNameSearch.ts` | Applies filters and sorting to loaded V1/V2 records. |
| `service/jevNameSearch.test.ts` | Tests synthetic Jev answers. |
| `smartNameSearch.test.ts` | Tests deterministic filter execution. |

The app uses TypeScript, pnpm 10.27, Vitest 4, and native `fetch`; no TypeSafe SDK is installed. It requests `jev-latest`, currently documented as `jev-1.13.0`, with an 8-second timeout and no retry.

Both the UI and server require `import.meta.env.DEV`, so deployed production builds make no Jev calls.

### Request and parsing

The request sends only the trimmed 2-to-160-character query:

```ts
{
  model: 'jev-latest',
  state: query,
  questions: { /* 2 Noul, 7 Choice */ },
}
```

Questions and options are static. No Score or dynamic-label question exists.

| Question | Output |
| --- | --- |
| `fully_supported` | Noul; must be `>= 0.30` |
| `unsupported_requirement` | Noul; must be `< 0.85` |
| `expiry` | `any`, `expiring`, `active`, `expired`, `in-grace`, `past-grace`, `non-expiring` |
| `role` | `any`, `owner`, `manager` |
| `version` | `any`, `v1`, `v2` |
| `upgrade` | `any`, `eligible`, `ineligible` |
| `favorite` | `any`, `yes`, `no` |
| `primary` | `any`, `yes`, `no` |
| `sort` | `any`, name/created/expiry ascending or descending |

All Choice answers are required. A non-`any` choice below `0.35` confidence becomes `any`. The parser then applies deterministic wording and consistency rules. Explicit wording often overrides Jev; role and version can only be created by deterministic rules. When the resolved expiry is `expiring`, Chrono converts one future relative duration, such as “in two weeks,” into `withinDays`. Vague wording keeps the 30-day default; calendar expressions are rejected.

The wrapper returns:

- `ok` for accepted filters;
- `unsupported` for rejected or malformed answers;
- `unavailable` for missing configuration, non-2xx, timeout, invalid JSON, or fetch failure.

Ordinary name search remains the fallback.

## 2. Risks and missing observability

### Main risks

- The support Nouls are near-inverses but can disagree. `0.30` and `0.84` pass together.
- `any` conflates “not requested” with low confidence.
- Expiry options overlap: `expiring` is `active`; grace states are `expired`.
- Jev and regexes compete as interpreters, making failures hard to attribute.
- Role and version questions add little because regexes own their outputs.
- Some favorite or primary cues can be silently omitted.
- The moving `jev-latest` alias is not recorded.
- Wrong filters affect displayed rows and bulk-selection scope.
- Filtering can run before every V2 page is loaded.
- Missing primary data can make `primary: yes` match nothing and `primary: no` match everything.

### Missing evidence

The Jev path records none of the following:

- returned model version;
- state, question, deterministic-rule, or threshold-policy version;
- exact question/options hash;
- full probabilities, confidence, or Noul values;
- parser override or rejection reason;
- selected action and fallback;
- latency, usage, HTTP category, or provider request ID.

Cloudflare observability is enabled globally, but this path emits no dedicated telemetry.

Existing tests cover parser and filtering behavior with inline synthetic answers. There is no server-wrapper test, HTTP mock, labeled corpus, calibration report, model comparison, or smart-search UI test. No checked-in workflow calls Jev or references its secret.

`JEV_API_KEY` is read from the Cloudflare server environment. Never place it in browser variables, fixtures, logs, command arguments, or artifacts.

## 3. Classifier families to evaluate

The overall result is multilabel across facets, though each Choice returns one option.

| Family | Purpose | Main error cost | Deterministic role and likely errors |
| --- | --- | --- | --- |
| Support | Decide whether the whole request is representable. | False positive applies partial filters; false negative falls back. Favor precision because fallback is cheap. | Regexes catch some unsupported terms. Risks: inverse-question disagreement and untested thresholds. |
| Expiry/grace | Select expiry state; local code extracts `withinDays`. | Wrong membership can affect bulk selection. | Most explicit phrases are deterministic. Risks: overlapping labels, negation, grace boundaries, unsupported dates. |
| Role/version | Restrict wallet role and ENS generation. | Wrong output hides relevant names. | Regexes already own both. Test removing these Jev questions. |
| Upgrade | Select migration eligibility. | Wrong migration subset. | Direct phrases are deterministic. Risks: negation, unknown eligibility, V2 combinations, missing data. |
| Favorite/primary | Select user-specific status. | Wrong personal subset. | Direct wording is deterministic. Risks: missing local data and silently omitted cues. |
| Sort | Select field and direction. | Wrong ordering; membership unchanged. | Most wording is deterministic. Risks: vague `latest`, `first`, or `last`. |
| Final action | Produce filters, fallback, rows, order, and selectable names. | This is the release decision. | Errors may come from state, questions, labels, model, thresholds, regexes, or routing. |

Evaluate model-only answers separately from final action. Deterministic overrides can hide model errors, while correct model answers can be discarded by regex policy.

## 4. Base dataset

Start with 20 to 30 supported queries that vary filter intent, language form, composition, polarity, and time expression. These are synthetic candidates, not ground truth, until a human approves them.

```ts
type BaseCase = {
  id: string
  reviewStatus: 'pending' | 'approved' | 'rejected'
  query: string
  dimensions: {
    facets: string[]
    syntax: 'fragment' | 'command' | 'question'
    cueStyle: 'canonical' | 'paraphrase'
    composition: 'single' | 'combined'
    surfacePolarity: string
    timeFeatures: string[]
  }
  expectedRoute: 'interpret' | 'literal_name_search'
  expectedAction: 'apply_filters' | 'fallback_unsupported' | null
  expectedFilters: SmartNameFilters | null
  reviewNotes: string
}
```

The 30 approved pilot cases live in `apps/manager/evals/jev-name-search/base-candidates.json`. Run them with `pnpm --filter manager eval:jev-name-search`; reports are written under `evals/jev-name-search/results/`. The first baseline passed 29 of 30.

A separate 23-case candidate set in `challenge-candidates.json` covers equivalent requests at different lengths, selected synthetic typos, and numeric, relative, and calendar-based time expressions. Seven one-word typo cases that could not pass the production routing heuristic were removed. These labels remain pending human review. Run it with `pnpm --filter manager eval:jev-name-search -- challenge-candidates.json --include-pending`. The runner grades the production UI routing heuristic before deciding whether to call Jev.

## 5. Test layers, metrics, and threshold policy

### A. Offline contract tests

No network calls.

- Assert exact state, questions, options, versions, and hashes.
- Use realistic typed responses with model ID, usage, probabilities, and confidence.
- Test malformed answers, unknown options, invalid distributions, missing fields, and all threshold boundaries.
- Test deterministic phrases, negation, conflicts, day boundaries, and unsupported constraints.
- Test missing key, timeout, non-2xx, invalid JSON, and contract errors through a fake transport.
- Test final routing, rows, sorting, stale responses, partial data, and bulk-selection scope.

### B. Live labeled evals

- Call the shared `executeJevNameSearch` operation used by production, not a duplicate client.
- Preserve model version, raw answers, usage, policy versions, and parser reasons in each report.
- Use reviewed, non-sensitive fixtures with human adjudication.
- Tune only on development data; run held-out tests after freezing policy.
- Pin the incumbent model and compare candidates in shadow runs.
- Run manually or in trusted scheduled CI, never on forked pull requests.

### C. Robustness and metamorphic tests

Test instruction paraphrases, option reordering, irrelevant state, missing evidence, ambiguous boundaries, overlapping or incomplete labels, missing correct options, and model-version changes.

A missing correct option must cause fallback, not the closest wrong label. Report action invariance, label flips, confidence changes, abstention changes, and distribution divergence.

### Metrics

- Noul: precision, recall, specificity, confusion matrix, Brier score, log loss, calibration, and coverage/error under abstention.
- Choice: accuracy, per-class precision/recall, macro F1, confusion matrix, multiclass log loss, calibration, and coverage/error under gating.
- Score, if added: ordinal and threshold accuracy plus downstream decision metrics; do not treat expected score as a calibrated continuous value.
- Final action: exact filter match, per-facet match, false-filter rate, accepted-action precision, coverage, fallback accuracy, result-set precision/recall/Jaccard, sorting, and bulk-selection errors.
- Operations: call counts, failures, tokens, cost, and latency percentiles by model.

### Threshold policy

The current `0.30`, `0.85`, and `0.35` values are unvalidated.

1. Version model, questions, deterministic rules, and thresholds together.
2. Tune joint support gates and per-facet Choice gates on development data only.
3. Keep provider confidence, top probability, and top-two margin separate.
4. Fall back on missing evidence, disagreement, incomplete options, or missing local data.
5. Proposed release target: at least 98% accepted-action precision, one-sided 95% Wilson lower bound of at least 95%, no high-cost error, and at least 200 independent accepted cases in both development and test.
6. Freeze policy before held-out evaluation. Later changes require a new version and cohort.

## 6. Implementation status

Implemented for the pilot:

- shared `executeJevNameSearch` production/eval operation;
- question and policy versions plus parser rejection reasons;
- 30 approved supported-query cases;
- 23 pending text-length, typo, and time-expression challenge cases;
- Chrono-based relative-duration conversion gated by the resolved `expiring` facet;
- production UI routing checks in the eval runner;
- opt-in `eval:jev-name-search` script and JSON report;
- offline wrapper tests using fake HTTP responses.

Deferred until after baseline review: unsupported and ambiguous cases, UI tests, broader downstream fixtures, model comparison, and trusted CI.

## 7. Expected API calls and cost

The first baseline made 30 calls to `jev-1.13.0` and used 39,533 input tokens plus 10,832 free output tokens. At the published price of $0.042 per million input tokens, the estimated model charge was about $0.0017. Median latency was 235 ms and p95 was 564 ms. The Chrono challenge run made 23 calls and passed 21 cases; all six numeric, week, and hour duration cases passed, while both unsupported calendar expressions and the calendar-period case correctly fell back. Recheck [pricing](https://docs.typesafe.ai/models) before later runs.

## 8. Open questions for approval

1. Is this intended to remain development-only or move toward production?
2. What precision, coverage, and high-cost error limits are required?
3. What precedence should overlapping expiry labels use?
4. Should combined roles or versions mean union, intersection, or fallback?
5. What is the maximum `withinDays` value?
6. Should explicit grammar skip Jev, especially for role and version?
7. Should `not_requested`, `ambiguous`, `unsupported`, and `other` be distinct?
8. Should the app pin a model instead of using `jev-latest`?
9. What should happen when primary data is missing or V2 pages are still loading?
10. May approved redacted production queries be used, and where may responses and probabilities be retained?
11. Should malformed provider output map to `unavailable` instead of `unsupported`?
12. Who owns label adjudication and release approval?

The next action is human review of the pending challenge labels, especially calendar-relative time expressions, before making live calls.
