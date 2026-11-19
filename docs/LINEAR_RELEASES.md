# Linear releases

ENS App, Explorer, and API Worker each use separate continuous pipelines for
Sepolia and production.

- **Sepolia** syncs on pushes to `main`, independently of Cloudflare's staging
  deployment. A Linear entry confirms the merge.
- **Production** syncs after the tag deploy succeeds and the GitHub release is
  published. Linear uses the deploy tag as the version and scans app and shared
  changes since the previous successful tag for that app. Slack links to the
  Linear release when sync succeeds.

Explorer's `ens.eth` continues serving the previous build until the Safe
executes the contenthash update.

If Slack reports a Linear sync failure after a successful deploy, rerun the
failed sync job while its notes artifact is available. To retry or backfill, run
**Linear Production Release** in GitHub Actions with the app and a published
production tag. This creates or updates the tag's Linear record without redeploying.
Backfill multiple tags oldest first.
