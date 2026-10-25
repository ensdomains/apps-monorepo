#!/usr/bin/env node
/**
 * Print the standalone-HCA deployment addresses the manager registers against.
 *
 * These MUST match `@ens-apps/smart-account`'s manifest.ts
 * (`DESTINATION_CONTRACTS[11155111]`) — the source of truth the registration
 * machine reads via `getDestinationContracts`. They are hardcoded here (rather
 * than imported) because that package ships as un-built `.ts` source and is not
 * an e2e dependency; when the deployment changes, update BOTH files together.
 *
 * NOTE: this is the STANDALONE deployment (Circle USDC, new registrar/registry),
 * distinct from `print-token-addresses.mjs` which reads the older ensjs Sepolia
 * set used by the pure-EOA / portal flows.
 *
 * Output (shell-eval friendly):
 *   SH_USDC=0x...
 *   SH_ETH_REGISTRAR=0x...
 *   SH_ETH_REGISTRY=0x...
 *
 * Usage:
 *   eval "$(node e2e/infra/scripts/print-standalone-hca-addresses.mjs)"
 */

// Mirror of @ens-apps/smart-account manifest.ts DESTINATION_CONTRACTS[11155111].
//
// The registrar and registry now come from ensjs in the manifest — the app
// registers, renews and reads on the canonical deployment, not the superseded
// standalone-HCA one.
//
// `usdc` is Circle's Sepolia USDC, not ensjs' MockUSDC: the route pays in the
// token bridges can deliver from L2s.
const STANDALONE = {
  usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
  ethRegistrar: '0xf633e7FC17e2bbE0D0965D18ec1821dcB754a3d3',
  ethRegistry: '0xD4eBcbBdF463C9c45784603Db0dDD499BC44A8B4',
}

process.stdout.write(
  `SH_USDC=${STANDALONE.usdc}\n` +
    `SH_ETH_REGISTRAR=${STANDALONE.ethRegistrar}\n` +
    `SH_ETH_REGISTRY=${STANDALONE.ethRegistry}\n`,
)
