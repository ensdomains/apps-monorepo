#!/usr/bin/env node
/**
 * Print the standalone-HCA deployment addresses the manager registers against.
 * Uses the same shared Sepolia deployment table as the smart-account manifest.
 *
 * Usage:
 *   eval "$(node e2e/infra/scripts/print-standalone-hca-addresses.mjs)"
 */
import { ensContracts } from '@ens-apps/config/ensContracts'
import { supportedL1Chains } from '@ensdomains/ensjs/chain'

const sepolia = ensContracts[supportedL1Chains.sepolia]

process.stdout.write(
  `SH_USDC=${sepolia.usdc.address}\n` +
    `SH_ETH_REGISTRAR=${sepolia.ensEthRegistrar.address}\n` +
    `SH_ETH_REGISTRY=${sepolia.ensRegistry.address}\n`,
)
