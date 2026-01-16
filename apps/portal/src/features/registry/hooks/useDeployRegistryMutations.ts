import {
  deploySubregistryWriteParameters,
  setSubregistryWriteParameters,
} from '@ensdomains/ensjs/wallet'
import { useEffect } from 'react'
import type { Address } from 'viem'
import { zeroAddress } from 'viem'
import { sepolia } from 'viem/chains'
import {
  useWaitForTransactionReceipt,
  useWalletClient,
  useWriteContract,
} from 'wagmi'

interface UseDeployRegistryMutationsParams {
  name: string
  factoryAddress: Address
  implAddress: Address
  currentNameRegistry: Address | null
  protocolVersion: 'ENSv1' | 'ENSv2' | null
}

export const useDeployRegistryMutations = ({
  name,
  factoryAddress,
  implAddress,
  currentNameRegistry,
  protocolVersion,
}: UseDeployRegistryMutationsParams) => {
  const { data: walletClient } = useWalletClient({ chainId: sepolia.id })

  // Deploy subregistry mutation
  const {
    writeContractAsync,
    data: deployTxHash,
    isPending: isWriting,
    error: writeError,
  } = useWriteContract()

  const {
    data: deployReceipt,
    isLoading: isConfirming,
    isSuccess: isConfirmed,
  } = useWaitForTransactionReceipt({
    hash: deployTxHash,
  })

  // Set subregistry mutation
  const {
    writeContractAsync: writeSetSubregistryAsync,
    data: setSubregistryTxHash,
    isPending: isSettingSubregistry,
    error: setSubregistryError,
  } = useWriteContract()

  const {
    data: setSubregistryReceipt,
    isLoading: isConfirmingSetSubregistry,
    isSuccess: isSetSubregistryReceiptReceived,
    error: setSubregistryReceiptError,
  } = useWaitForTransactionReceipt({
    hash: setSubregistryTxHash,
  })

  // Derived states
  const isSetSubregistryConfirmed =
    isSetSubregistryReceiptReceived &&
    setSubregistryReceipt?.status === 'success'

  const isSetSubregistryReverted =
    isSetSubregistryReceiptReceived &&
    setSubregistryReceipt?.status === 'reverted'

  const label = name.split('.')[0]

  const writeParams =
    walletClient && implAddress
      ? deploySubregistryWriteParameters(walletClient, {
          factoryAddress,
          implAddress,
        })
      : null

  // Automatically call setSubregistry when deploy is confirmed
  useEffect(() => {
    if (
      !isConfirmed ||
      !deployReceipt ||
      !walletClient ||
      !currentNameRegistry
    ) {
      return
    }

    const deployedAddress =
      deployReceipt.contractAddress || deployReceipt.logs[0]?.address

    if (
      !deployedAddress ||
      protocolVersion === 'ENSv1' ||
      currentNameRegistry === zeroAddress
    ) {
      return
    }

    const setSubregistryParams = setSubregistryWriteParameters(walletClient, {
      registryAddress: currentNameRegistry as Address,
      label,
      subregistryAddress: deployedAddress,
    })

    writeSetSubregistryAsync({
      address: setSubregistryParams.address,
      abi: setSubregistryParams.abi,
      functionName: setSubregistryParams.functionName,
      args: setSubregistryParams.args,
      gas: 500000n,
    })
  }, [
    isConfirmed,
    deployReceipt,
    walletClient,
    currentNameRegistry,
    label,
    writeSetSubregistryAsync,
    protocolVersion,
  ])

  const deploySubregistry = async () => {
    if (!writeParams) {
      return
    }
    await writeContractAsync({
      address: writeParams.address,
      abi: writeParams.abi,
      functionName: writeParams.functionName,
      args: writeParams.args,
    })
  }

  return {
    // Deploy mutation
    deploySubregistry,
    deployTxHash,
    isWriting,
    isConfirming,
    isConfirmed,
    deployError: writeError ?? null,

    // Set subregistry mutation
    setSubregistryTxHash,
    isSettingSubregistry,
    isConfirmingSetSubregistry,
    isSetSubregistryConfirmed,
    isSetSubregistryReverted,
    setSubregistryError: setSubregistryError ?? null,
    setSubregistryReceiptError: setSubregistryReceiptError ?? null,

    // Wallet state
    hasWallet: !!walletClient,
  }
}
