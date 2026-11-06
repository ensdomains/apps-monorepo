# Linear release tracking

Staging and production use separate continuous pipelines. A continuous pipeline
records each CI sync as a completed release; it does not require releases from
`main`. See [Linear Releases](https://linear.app/docs/releases).

## Pending setup

Aaron must provide **pipeline access keys**, rather than personal API tokens.
Keep this change in draft until the pipelines and secrets are ready.

In Linear Settings → Releases:

1. Rename the existing ENS App, Explorer and API Worker pipelines to identify
   staging/Sepolia, and turn off their production designation. Keep their keys:
   `LINEAR_RELEASE_MANAGER`, `LINEAR_RELEASE_PORTAL`, `LINEAR_RELEASE_API_WORKER`.
2. Create separate continuous production pipelines for the same three products.
   Store their keys as repository Actions secrets:

   | Product | Production secret |
   | --- | --- |
   | ENS App | `LINEAR_RELEASE_MANAGER_PRODUCTION` |
   | Explorer | `LINEAR_RELEASE_PORTAL_PRODUCTION` |
   | API Worker | `LINEAR_RELEASE_API_WORKER_PRODUCTION` |

3. Review release-completion status automations. Staging completion must not
   mark an issue shipped to production. Leave QA/status behavior unchanged until
   the team explicitly agrees to a production-only automation.
4. In metadata-service-v2, create separate staging and production pipelines and
   configure the secrets listed in that repository's release documentation.

Pipeline setup and status automation are workspace settings; this PR does not
change them. Existing SHA releases remain in the staging pipeline history.

## CI behavior

`linear-releases.yml` continues recording each push to `main` in staging. This
records merges; it does not wait for the external staging deployment to finish.

Each production tag workflow calls `linear-production-release.yml` only after
its deployment and GitHub release creation succeed. The sync uses the tag for
both name and version, the previous successfully released same-app tag as its
exclusive baseline, and the same app/shared path filters as staging. Generated
notes and links to the GitHub release and workflow are attached to Linear.

A missing production key emits a warning and returns `pending-key`; deployment
still succeeds. A configured sync failure fails the tracking job, while Slack
still reports the actual deployment outcome and warns that Linear needs retrying.
Successful syncs add the Linear release link to the Slack post.

The first production release without an earlier successful tag initializes the
baseline with an empty issue list. Explicit baselines also record redeploys with
no new commits. For a divergent hardfork branch, sync scans from the merge base
with the previous production tag and emits a warning. This attributes added
commits on the new branch; it does not describe changes removed by switching
branches. Explorer's `ens.eth` contenthash still requires Safe execution after
Swarm upload; a successful CI release does not prove that execution happened.

## Retry or backfill without deploying

After the workflow is available on `main`, run **Linear Production Release** from
GitHub Actions, select the app, and enter an existing successfully deployed tag.
This only syncs Linear. It verifies the published GitHub release, rebuilds the
commit baseline, and reuses that release's published notes. The tooling checkout
uses the workflow revision so older deploy tags can be synced too.

Retrying the same version targets that release rather than making another one.
Replay missed tags in chronological order, including any deploy whose tracking
failed before a later deploy succeeded. Rerunning only the failed tracking job
of the original run also works while its release-notes artifact is retained.

## Verification

Run `node --test scripts/*.test.mjs`. CI runs these tests as part of quality
checks. For workflow validation, actionlint v1.7.12 needs
`-ignore '^unexpected key "queue"'` because it predates GitHub's supported
[`queue: max` property](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency).

Once keys are installed, verify staging and production independently with a
real deployment: a merge must only appear in staging; a successful tag deploy
must create one production release with the expected issues and Slack link.
Check a failed deploy creates no production Linear release, and retry a sync
to confirm it updates the same version. No live sync was performed while keys
were pending.
