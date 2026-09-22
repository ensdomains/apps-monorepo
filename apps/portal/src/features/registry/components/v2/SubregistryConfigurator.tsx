import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { useQuery } from '@tanstack/react-query'
import { ResultAsync } from 'neverthrow'
import { useRef, useState } from 'react'
import { match } from 'ts-pattern'
import { type Address, isAddress, zeroAddress } from 'viem'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  generateSubregistrySalt,
  prepareDeploySubregistryTransaction,
} from '@/features/registry/helpers/deploySubregistry'
import { prepareSetSubregistryTransaction } from '@/features/registry/helpers/setSubregistry'
import { useDeploySubregistry } from '@/features/registry/hooks/useDeploySubregistry'
import { getNameRegistriesQueryOptions } from '@/features/registry/hooks/useNameRegistryDiscovery'
import { useNameResourceId } from '@/features/registry/hooks/useNameResourceId'
import { useSetSubregistry } from '@/features/registry/hooks/useSetSubregistry'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import type { ResourceId } from '@/lib/resource/resourceId'
import { sepoliaWithEns } from '@/lib/wagmi'
import { verifyProxyContract } from '@/utils/blockExplorer/verifyProxyContract'

const DEPLOY_SUBREGISTRY_TX_ID = 'tx-deploy-subregistry'
const SET_SUBREGISTRY_TX_ID = 'tx-set-subregistry'
const SUCCESS_LABEL_DURATION_MS = 5000

const factoryAddress = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensVerifiableFactory',
})

const implAddress = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensUserRegistryImpl',
})

type RegistryOption = 'deploy' | 'use-existing'

export const getCustomRegistryAddressError = (value: string): string | null =>
  match(value)
    .when(
      (v) => v === '' || isAddress(v),
      () => null,
    )
    .when(
      (v) => isAddress(v, { strict: false }),
      () => "That address's checksum doesn't match. Check it for a typo.",
    )
    .otherwise(() => 'Enter a valid contract address.')

const CustomRegistryAddressField = ({
  value,
  onChange,
}: {
  readonly value: string
  readonly onChange: (value: string) => void
}) => {
  const [touched, setTouched] = useState(false)
  const error = touched ? getCustomRegistryAddressError(value) : null

  return (
    <div>
      <Input
        id="contract-address"
        placeholder="Paste contract address"
        value={value}
        aria-invalid={error !== null}
        className="w-full p-3 h-9 bg-background border border-border rounded-md"
        onChange={(e) => onChange(e.target.value.trim())}
        onBlur={() => setTouched(true)}
      />
      {error ? (
        <p className="text-sm mt-1.5 text-destructive">{error}</p>
      ) : null}
    </div>
  )
}

type SubregistryConfiguratorProps = {
  name: string
  onCancel: () => void
  onComplete?: () => void
  /**
   * Run immediately before each write, which is skipped when this resolves
   * `false`. The configure flow uses it to prove the name still has no registry
   * (WEB-1249). Required so that skipping it is a decision a caller writes down:
   * only a flow where replacing the registry is the whole point passes `null`.
   */
  assertWritable: (() => Promise<boolean>) | null
}

/**
 * The form proper, which only exists once the name has a usable on-chain id.
 * Splitting the guard out keeps that id non-null everywhere below.
 */
const SubregistryConfiguratorForm = ({
  name,
  resourceId,
  onCancel,
  onComplete,
  assertWritable,
}: SubregistryConfiguratorProps & { resourceId: ResourceId }) => {
  const [registryOption, setRegistryOption] = useState<RegistryOption>('deploy')
  const [contractAddress, setContractAddress] = useState('')
  const [showSuccessButtonLabel, setShowSuccessButtonLabel] = useState(false)
  // Drawn again at every submit, so a retry after a deploy that landed (but
  // whose set never did) targets a fresh address instead of reverting on the
  // one it already occupies.
  const [deploySalt, setDeploySalt] = useState(generateSubregistrySalt)
  const deployedSubregistryAddressRef = useRef<Address | null>(null)

  const useCustomRegistry = registryOption === 'use-existing'

  const {
    openModal: openTransactionModal,
    closeModal: closeTransactionModal,
    clearTransaction,
  } = useTransactionModal()

  const {
    data: registries,
    isLoading,
    error,
  } = useQuery(getNameRegistriesQueryOptions({ name }))

  const parentRegistry = registries?.at(1) ?? null

  const customSubregistryAddress =
    useCustomRegistry && isAddress(contractAddress) ? contractAddress : null

  const isDeployPath = !customSubregistryAddress

  const {
    deploySubregistryAsync,
    isConfirming: isDeployConfirming,
    hasWallet: hasDeployWallet,
  } = useDeploySubregistry({
    name,
    factoryAddress,
    implAddress,
  })

  const {
    setSubregistry,
    isPending: isSetSubregistryPending,
    isSuccess: isSetSubregistrySuccess,
    hasWallet: hasSetWallet,
  } = useSetSubregistry({
    name,
    resourceId,
    parentRegistry: parentRegistry ?? zeroAddress,
    id: SET_SUBREGISTRY_TX_ID,
  })

  const walletOk = isDeployPath ? hasDeployWallet : hasSetWallet

  const handleDeploySubregistryStart = async () => {
    await ResultAsync.fromPromise(
      deploySubregistryAsync({
        id: DEPLOY_SUBREGISTRY_TX_ID,
        salt: deploySalt,
      }),
      () => undefined,
    ).match(
      (result) => {
        deployedSubregistryAddressRef.current = result.deployedAddress
        void verifyProxyContract(sepoliaWithEns, result.deployedAddress)
      },
      () => undefined,
    )
  }

  // Also never awaited by the modal — see `handleDeploySubregistryStart`.
  const handleSetSubregistryAfterDeployStart = async () => {
    const deployed = deployedSubregistryAddressRef.current
    if (!deployed) return
    if (isSetSubregistryPending || isSetSubregistrySuccess) return
    // Checked again here, not just at submit: the deploy step sits between the
    // two, leaving a whole block time for the slot to be filled.
    if (assertWritable && !(await assertWritable())) return
    setSubregistry(deployed)
  }

  const handleSetSubregistryStart = async () => {
    if (!customSubregistryAddress) return
    if (assertWritable && !(await assertWritable())) return
    setSubregistry(customSubregistryAddress)
  }

  const handleSetSubregistryDone = () => {
    closeTransactionModal()
    clearTransaction()
    setContractAddress('')
    setRegistryOption('deploy')
    deployedSubregistryAddressRef.current = null
    // Reconfigure closes/unmounts immediately; only show the success label
    // when this form stays mounted (initial configure flow).
    if (onComplete) {
      onComplete()
      return
    }
    setShowSuccessButtonLabel(true)
    setTimeout(
      () => setShowSuccessButtonLabel(false),
      SUCCESS_LABEL_DURATION_MS,
    )
  }

  const handleSubmit = async () => {
    if (useCustomRegistry && !isAddress(contractAddress)) return
    // Gates the deploy too, not just the set: there is no reason to pay for a
    // registry that may not legally be pointed at anything.
    if (assertWritable && !(await assertWritable())) return
    setDeploySalt(generateSubregistrySalt())
    openTransactionModal()
  }

  const isSubmitDisabled =
    (useCustomRegistry && !isAddress(contractAddress)) || !walletOk

  const buttonText = match({
    isDeployConfirming,
    isSetSubregistryPending,
    showSuccessButtonLabel,
  })
    .with({ isDeployConfirming: true }, () => 'Deploying...')
    .with({ isSetSubregistryPending: true }, () => 'Setting subregistry...')
    .with({ showSuccessButtonLabel: true }, () => 'Complete!')
    .otherwise(() => 'Deploy')

  if (isLoading) {
    return <LoadingSpinner title="Loading registry information" />
  }

  if (error) {
    return (
      <ErrorMessage
        compact
        description="Error fetching registry data. Please refresh the page."
      />
    )
  }

  if (!parentRegistry || parentRegistry === zeroAddress) return null

  return (
    <>
      <form
        className="flex flex-col gap-5 border border-border rounded-lg p-5"
        onSubmit={(e) => {
          e.preventDefault()
          void handleSubmit()
        }}
      >
        <RadioGroup
          value={registryOption}
          onValueChange={(value) => {
            if (value === 'deploy' || value === 'use-existing') {
              setRegistryOption(value)
            }
          }}
        >
          <div className="flex items-center gap-3">
            <RadioGroupItem value="deploy" id="registry-option-deploy" />
            <Label
              htmlFor="registry-option-deploy"
              className="cursor-pointer text-foreground"
            >
              Deploy a new Permissioned Registry contract
            </Label>
          </div>
          <div className="flex items-center gap-3">
            <RadioGroupItem
              value="use-existing"
              id="registry-option-use-existing"
            />
            <Label
              htmlFor="registry-option-use-existing"
              className="cursor-pointer text-foreground"
            >
              Use a pre-existing registry contract
            </Label>
          </div>
        </RadioGroup>
        {useCustomRegistry ? (
          <CustomRegistryAddressField
            value={contractAddress}
            onChange={setContractAddress}
          />
        ) : null}
        <div className="grid grid-cols-3 gap-2">
          <Button
            type="button"
            variant="outline"
            className="col-span-1"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="default"
            className="col-span-2"
            disabled={isSubmitDisabled}
          >
            {buttonText}
          </Button>
        </div>
      </form>

      <TransactionModal
        transactions={
          isDeployPath
            ? [
                {
                  id: DEPLOY_SUBREGISTRY_TX_ID,
                  title: 'Deploy subregistry',
                  transactionName: `Deploy subregistry for ${name}`,
                  intent: {
                    prepare: ({ walletClient, chainId }) =>
                      prepareDeploySubregistryTransaction({
                        factoryAddress,
                        implAddress,
                        salt: deploySalt,
                        walletClient,
                        chainId,
                      }),
                  },
                  onStart: handleDeploySubregistryStart,
                  onDone: handleSetSubregistryAfterDeployStart,
                },
                {
                  id: SET_SUBREGISTRY_TX_ID,
                  title: 'Set subregistry',
                  transactionName: `Set subregistry for ${name}`,
                  onStart: handleSetSubregistryAfterDeployStart,
                  onDone: handleSetSubregistryDone,
                },
              ]
            : [
                {
                  id: SET_SUBREGISTRY_TX_ID,
                  title: 'Set subregistry',
                  transactionName: `Set custom subregistry for ${name}`,
                  intent: {
                    prepare: customSubregistryAddress
                      ? ({ walletClient, chainId }) =>
                          prepareSetSubregistryTransaction({
                            resourceId,
                            parentRegistry,
                            subregistryAddress: customSubregistryAddress,
                            walletClient,
                            chainId,
                          })
                      : undefined,
                  },
                  onStart: handleSetSubregistryStart,
                  onDone: handleSetSubregistryDone,
                },
              ]
        }
      />
    </>
  )
}

/**
 * The id `setSubregistry` will be addressed with, resolved before the form is
 * built so nothing below re-derives it from the displayed name (WEB-1458).
 * No id means no form, not a guess.
 */
export const SubregistryConfigurator = (
  props: SubregistryConfiguratorProps,
) => {
  // The same discovery query the form runs, so this costs no extra read.
  const { data: registries, isLoading: isRegistriesLoading } = useQuery(
    getNameRegistriesQueryOptions({ name: props.name }),
  )
  const { resourceId, isLoading } = useNameResourceId({
    name: props.name,
    registryAddress: registries?.at(1) ?? undefined,
  })

  if (isRegistriesLoading || isLoading)
    return <LoadingSpinner title="Identifying this name" />

  if (!resourceId)
    return (
      <ErrorMessage
        compact
        description={`The on-chain identity of ${props.name} could not be established, so no registry can be set for it here.`}
      />
    )

  return <SubregistryConfiguratorForm {...props} resourceId={resourceId} />
}
