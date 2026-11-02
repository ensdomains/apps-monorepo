import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import type { MigrationApproval } from './migrationApprovals'
import { planSetupBundles, type SetupStep } from './planSetupBundles'

const CONTRACT: Address = '0x0000000000000000000000000000000000000001'
const OPERATOR: Address = '0x0000000000000000000000000000000000000002'

const tokenApproval = (tokenId: bigint): MigrationApproval => ({
  kind: 'erc721-token',
  id: 'base-registrar:hca-token',
  contractAddress: CONTRACT,
  operatorAddress: OPERATOR,
  tokenId,
})

const stepTypes = (bundles: readonly (readonly SetupStep[])[]) =>
  bundles.map((bundle) => bundle.map(({ type }) => type))

describe('planSetupBundles', () => {
  it.each([
    {
      isHcaDeployed: false,
      isDeploymentPlanned: true,
      expected: [['deploy-hca', 'approval']],
    },
    // A retry finds the HCA its earlier attempt deployed.
    {
      isHcaDeployed: true,
      isDeploymentPlanned: true,
      expected: [['done', 'approval']],
    },
    {
      isHcaDeployed: true,
      isDeploymentPlanned: false,
      expected: [['approval']],
    },
    // The plan saw a deployed HCA that now has no code: deploy it anyway.
    {
      isHcaDeployed: false,
      isDeploymentPlanned: false,
      expected: [['deploy-hca', 'approval']],
    },
  ])(
    'leads with the deployment step (deployed=$isHcaDeployed, planned=$isDeploymentPlanned)',
    ({ isHcaDeployed, isDeploymentPlanned, expected }) => {
      expect(
        stepTypes(
          planSetupBundles({
            isHcaDeployed,
            isDeploymentPlanned,
            missingApprovals: [tokenApproval(1n)],
          }),
        ),
      ).toEqual(expected)
    },
  )

  it('keeps granted approvals in place so bundles match the preview', () => {
    const missingApprovals = Array.from({ length: 12 }, (_, index) =>
      index < 9 ? undefined : tokenApproval(BigInt(index + 1)),
    )

    expect(
      stepTypes(
        planSetupBundles({
          isHcaDeployed: true,
          isDeploymentPlanned: true,
          missingApprovals,
        }),
      ),
    ).toEqual([
      Array<string>(10).fill('done'),
      Array<string>(3).fill('approval'),
    ])
  })

  it('plans no bundles when there is no setup', () => {
    expect(
      planSetupBundles({
        isHcaDeployed: true,
        isDeploymentPlanned: false,
        missingApprovals: [],
      }),
    ).toEqual([])
  })
})
