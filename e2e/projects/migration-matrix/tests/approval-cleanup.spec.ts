import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { expect, test } from '@playwright/test'
import {
  type Address,
  keccak256,
  parseAbi,
  stringToHex,
  zeroAddress,
} from 'viem'
import { V1_BASE_REGISTRAR } from '../../../fixtures/makeV1Name.js'
import { publicClient } from '../../../helpers/anvil-client.js'

const directories = process.env.APPROVAL_CLEANUP_SOURCE!.split(',')
const abi = parseAbi([
  'function getApproved(uint256 id) view returns(address)',
  'function isApprovedForAll(address owner,address operator) view returns(bool)',
])
const registry = ensL1Contracts[supportedL1Chains.sepolia].ensRegistry.address
const approvalTopic = keccak256(
  stringToHex('ApprovalForAll(address,address,bool)'),
)
const tokenApprovalTopic = keccak256(
  stringToHex('Approval(address,address,uint256)'),
)
for (const directory of directories) {
  for (const file of readdirSync(directory).filter((f) =>
    f.endsWith('.json'),
  )) {
    const saved = JSON.parse(readFileSync(resolve(directory, file), 'utf8'))
    const states =
      saved.finalStates ??
      saved.afterTreeStates ??
      (Array.isArray(saved.after)
        ? saved.after
        : saved.afterState
          ? [{ state: saved.afterState }]
          : [])
    if (
      !saved.completedAt ||
      !states.length ||
      !states.every((n: any) => n.state?.status === 2) ||
      !saved.afterActivity
    )
      continue
    const since = BigInt(saved.beforeActivity?.toBlock ?? 0)
    const approvals = (saved.afterActivity.events ?? []).filter(
      (event: any) =>
        event.address.toLowerCase() === V1_BASE_REGISTRAR.toLowerCase() &&
        event.topics[0] === tokenApprovalTopic &&
        event.topics.length === 4 &&
        BigInt(event.blockNumber) > since &&
        BigInt(event.topics[2]) !== 0n,
    )
    // MigrationHelper NFT approvals are intentionally reusable. The temporary
    // permission is the HCA's V2 ETHRegistry operator grant, observed here from
    // actual logs rather than inferred from the NFT approval recipient.
    const grants = (saved.afterActivity.events ?? []).filter(
      (event: any) =>
        event.address.toLowerCase() === registry.toLowerCase() &&
        event.topics[0] === approvalTopic &&
        BigInt(event.data) === 1n &&
        BigInt(event.blockNumber) > since,
    )
    const scenario = saved.scenario ?? saved.configuration?.config_id ?? file
    const group = basename(dirname(directory))
    test(`approval cleanup ${group} ${scenario}`, async ({}, info) => {
      const blockNumber = BigInt(saved.afterActivity.toBlock)
      const checks: object[] = []
      for (const transaction of approvals) {
        const operator = `0x${transaction.topics[2].slice(-40)}` as Address
        const token = BigInt(transaction.topics[3])
        let approved: Address | 'burned' = zeroAddress
        try {
          approved = await publicClient.readContract({
            address: V1_BASE_REGISTRAR,
            abi,
            functionName: 'getApproved',
            args: [token],
            blockNumber,
          })
        } catch (error) {
          expect(
            String(error),
            'Only an explicit nonexistent-token revert can represent a burned V1 token',
          ).toMatch(
            /nonexistent token|non-existent token|invalid token (id|ID)/i,
          )
          approved = 'burned'
        }
        checks.push({ token: String(token), operator, approved })
        expect
          .soft(
            approved === 'burned' || approved === zeroAddress,
            'No token approval survives migration',
          )
          .toBe(true)
      }
      const checked = new Set<string>()
      for (const grant of grants) {
        const owner = `0x${grant.topics[1].slice(-40)}` as Address
        const operator = `0x${grant.topics[2].slice(-40)}` as Address
        const key = `${owner}:${operator}`
        if (checked.has(key)) continue
        checked.add(key)
        const approved = await publicClient.readContract({
          address: registry,
          abi,
          functionName: 'isApprovedForAll',
          args: [owner, operator],
          blockNumber,
        })
        checks.push({
          contract: registry,
          owner,
          operator,
          approved,
          originalGrant: grant.transactionHash,
        })
        expect
          .soft(
            approved,
            'Observed temporary V2 operator access must be removed at completion',
          )
          .toBe(false)
      }
      const out = resolve(process.env.REPLACEMENT_RESULTS!, 'supplemental')
      mkdirSync(out, { recursive: true })
      const applicable = approvals.length > 0 || grants.length > 0
      writeFileSync(
        resolve(out, `${group}-${scenario}-cleanup.json`),
        JSON.stringify(
          {
            scenario,
            source: resolve(directory, file),
            blockNumber: String(blockNumber),
            checks,
            status: info.errors.length
              ? 'FAIL'
              : applicable
                ? 'PASS'
                : 'NOT APPLICABLE',
            scope: applicable
              ? 'Actual archived state at completion: consumed per-token approvals and removal of observed temporary V2 operator grants. Reusable MigrationHelper NFT operator permissions are not required to be revoked.'
              : 'No per-token BaseRegistrar approval or temporary V2 operator grant occurred after the saved premigration checkpoint in this actual transaction history. No temporary permission of these types required cleanup. Reusable MigrationHelper NFT operator permissions are outside this requirement.',
          },
          null,
          2,
        ),
      )
    })
  }
}
