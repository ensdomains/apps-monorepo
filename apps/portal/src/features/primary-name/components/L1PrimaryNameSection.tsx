import { useEffect, useState } from 'react'
import type { Address } from 'viem'
import { sepolia } from 'viem/chains'
import {
  useConnection,
  useEnsName,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'
import { Button } from '@/components/ui/button'
import { NameAvatar } from '@/features/profile/components/NameAvatar'
import { useL1PrimaryNameMutations } from '../hooks/useL1PrimaryNameMutations'
import { ResetPrimaryNameDialog } from './ResetPrimaryNameDialog'
import { SelectPrimaryNameDialog } from './SelectPrimaryNameDialog'

interface L1PrimaryNameSectionProps {
  address: Address
  /** Whether the connected wallet owns this address (can set/reset) */
  canManage: boolean
}

export function L1PrimaryNameSection({
  address,
  canManage,
}: L1PrimaryNameSectionProps) {
  const { data: primaryName } = useEnsName({ address })
  const { isConnected } = useConnection()
  const { chain } = useConnection()
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain()
  const [selectOpen, setSelectOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)

  const isWrongChain = chain?.id !== sepolia.id

  const {
    getSetPrimaryNameRequest,
    getResetPrimaryNameRequest,
    invalidatePrimaryNameQueries,
    isReady,
  } = useL1PrimaryNameMutations()

  const { writeContractAsync } = useWriteContract()
  const [setTxHash, setSetTxHash] = useState<`0x${string}` | undefined>()
  const [resetTxHash, setResetTxHash] = useState<`0x${string}` | undefined>()

  const { isLoading: isSetPending, isSuccess: isSetSuccess } =
    useWaitForTransactionReceipt({ hash: setTxHash })
  const { isLoading: isResetPending, isSuccess: isResetSuccess } =
    useWaitForTransactionReceipt({ hash: resetTxHash })

  useEffect(() => {
    if (isSetSuccess) {
      invalidatePrimaryNameQueries()
      setSetTxHash(undefined)
    }
  }, [isSetSuccess, invalidatePrimaryNameQueries])

  useEffect(() => {
    if (isResetSuccess) {
      invalidatePrimaryNameQueries()
      setResetTxHash(undefined)
    }
  }, [isResetSuccess, invalidatePrimaryNameQueries])

  const handleSelectName = async (name: string) => {
    if (isWrongChain) {
      try {
        switchChain({ chainId: sepolia.id })
      } catch (err) {
        console.error('Failed to switch network', err)
      }
      return
    }
    try {
      const request = getSetPrimaryNameRequest(name)
      const hash = await writeContractAsync(
        request as Parameters<typeof writeContractAsync>[0],
      )
      setSetTxHash(hash)
      setSelectOpen(false)
    } catch (err) {
      console.error('Failed to set primary name:', err)
    }
  }

  const handleResetConfirm = async () => {
    if (isWrongChain) {
      try {
        switchChain({ chainId: sepolia.id })
      } catch (err) {
        console.error('Failed to switch network', err)
      }
      return
    }
    try {
      const request = getResetPrimaryNameRequest(address)
      const hash = await writeContractAsync(
        request as Parameters<typeof writeContractAsync>[0],
      )
      setResetTxHash(hash)
      setResetOpen(false)
    } catch (err) {
      console.error('Failed to reset primary name:', err)
    }
  }

  const isPending = isSetPending || isResetPending || isSwitchingChain

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-6">
      <div className="flex flex-row items-center justify-between">
        <h2 className="text-lg font-medium">Primary name (L1)</h2>
        {primaryName && (
          <div className="flex items-center gap-2">
            <NameAvatar
              name={primaryName}
              width="24px"
              height="24px"
              rounded="rounded-sm"
            />
            <span className="font-mono text-sm">{primaryName}</span>
          </div>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Your primary name is the ENS name that resolves when someone looks up
        your address. This uses the L1 (Ethereum) reverse registrar.
      </p>
      {canManage && isConnected && (
        <div className="flex flex-row gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() =>
              isWrongChain
                ? switchChain({ chainId: sepolia.id })
                : setSelectOpen(true)
            }
            disabled={!isReady || isPending}
          >
            {isPending
              ? 'Processing...'
              : isWrongChain
                ? 'Switch to Sepolia'
                : 'Set primary name'}
          </Button>
          {primaryName && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                isWrongChain
                  ? switchChain({ chainId: sepolia.id })
                  : setResetOpen(true)
              }
              disabled={!isReady || isPending}
            >
              {isWrongChain ? 'Switch to Sepolia' : 'Reset primary name'}
            </Button>
          )}
        </div>
      )}
      {canManage && !isConnected && (
        <p className="text-sm text-muted-foreground">
          Connect your wallet to set or reset your primary name.
        </p>
      )}

      <SelectPrimaryNameDialog
        address={address}
        open={selectOpen}
        onOpenChange={setSelectOpen}
        onSelect={handleSelectName}
        currentPrimaryName={primaryName ?? null}
      />
      <ResetPrimaryNameDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        primaryName={primaryName ?? ''}
        onConfirm={handleResetConfirm}
        isPending={isResetPending}
      />
    </div>
  )
}
