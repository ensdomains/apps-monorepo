import { Link } from '@tanstack/react-router'
import { ArrowLeftIcon, CircleCheckIcon } from 'lucide-react'
import { useState } from 'react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { isAddress } from 'viem'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useChangeResolver } from '@/features/resolver/hooks/useChangeResolver'
import { ChangeResolverTransactionStatus } from './ChangeResolverTransactionStatus'

interface ChangeResolverFormProps {
  readonly name: string
  readonly registryAddress: Address
}

export const ChangeResolverForm = ({
  name,
  registryAddress,
}: ChangeResolverFormProps) => {
  const [resolverAddress, setResolverAddress] = useState('')

  const {
    changeResolverAsync,
    txHash,
    isWriting,
    isConfirming,
    isConfirmed,
    isReverted,
    error,
  } = useChangeResolver({
    name,
    registryAddress,
  })

  const handleSubmit = async () => {
    if (!isAddress(resolverAddress)) {
      return
    }
    try {
      await changeResolverAsync(resolverAddress as Address)
    } catch (err) {
      console.error('Failed to change resolver:', err)
    }
  }

  const isSubmitDisabled =
    resolverAddress.trim() === '' ||
    !isAddress(resolverAddress) ||
    isWriting ||
    isConfirming

  const buttonText = match({ isWriting, isConfirming, isConfirmed })
    .with({ isWriting: true }, () => 'Submitting transaction...')
    .with({ isConfirming: true }, () => 'Confirming...')
    .with({ isConfirmed: true }, () => 'Resolver changed!')
    .otherwise(() => 'Change resolver')

  return (
    <div className="flex flex-col gap-6 p-4 w-full lg:max-w-2xl xl:max-w-5xl mx-auto">
      <Link to="/$name/resolver" params={{ name }}>
        <Button variant="ghost" className="flex items-center gap-2 -ml-2">
          <ArrowLeftIcon className="size-4" />
          Back
        </Button>
      </Link>

      <h1 className="text-[28px] font-medium leading-none">Change resolver</h1>

      <div className="flex flex-col gap-3">
        <Label
          htmlFor="resolver-address"
          info="The address of the resolver contract"
        >
          Contract address
        </Label>
        <Input
          id="resolver-address"
          placeholder="0x..."
          value={resolverAddress}
          onChange={(e) => setResolverAddress(e.target.value)}
        />
      </div>

      <Button
        onClick={handleSubmit}
        disabled={isSubmitDisabled}
        className="w-fit"
      >
        <span className="flex items-center gap-2">
          <CircleCheckIcon className="size-4" />
          {buttonText}
        </span>
      </Button>

      <ChangeResolverTransactionStatus
        txHash={txHash}
        isConfirming={isConfirming}
        isConfirmed={isConfirmed}
        isReverted={isReverted}
        txError={error}
        receiptError={null}
      />
    </div>
  )
}
