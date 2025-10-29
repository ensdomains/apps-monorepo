"use client";

import { useWallet } from "@getpara/react-sdk";
import { useViemAccount } from "@getpara/react-sdk/evm/hooks";
import { type RhinestoneAccount, RhinestoneSDK, walletClientToAccount, wrapParaAccount } from "@rhinestone/sdk";
import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from "react";
import { type Account, createPublicClient, formatUnits, http } from "viem";
import { sepolia } from "viem/chains";
import { useWalletClient } from "wagmi";
// import { useParaAccount } from "@/features/wallet/hooks/useParaAccount";
import { SUPPORTED_TOKENS } from "@/features/register/services/nameChainContractService";
import { ERC20_ABI } from "../ens.abi";
import { getTxHashResult } from "./utils";

// Create standalone public client for balance fetching
const SEPOLIA_RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com'

export const customSepolia = {
  ...sepolia,
  rpcUrls: {
    default: {
      http: [SEPOLIA_RPC_URL],
    },
    public: {
      http: [SEPOLIA_RPC_URL],
    },
  },
};
const publicClient = createPublicClient({
  chain: customSepolia,
  transport: http(SEPOLIA_RPC_URL),
})

export interface RhinestoneAccountState {
  rhinestoneAccount: RhinestoneAccount | null;
  accountAddress: string | null;
  isLoading: boolean;
  error: string | null;
}

export function useRhinestoneAccount() {
  const { data: wallet } = useWallet();
  const { viemAccount } = useViemAccount();
  const { data: wagmiWalletClient } = useWalletClient();
  const isReady = !!viemAccount || !!wallet || !!wagmiWalletClient;
  const [state, setState] = useState<RhinestoneAccountState>({
    rhinestoneAccount: null,
    accountAddress: null,
    isLoading: false,
    error: null,
  });

  // ETH Balance for EOA
  const { data: eoaEthBalance, isLoading: isLoadingEoaEth } = useQuery({
    queryKey: ['eoaEthBalance', wallet?.address],
    queryFn: async () => {
      if (!wallet?.address) return null
      try {
        const balance = await publicClient.getBalance({
          address: wallet.address as `0x${string}`
        })
        return {
          balance: balance.toString(),
          formattedBalance: `${parseFloat(formatUnits(balance, 18)).toFixed(4)} ETH`,
        }
      } catch (_error) {
        return null
      }
    },
    enabled: isReady && !!wallet?.address,
    refetchInterval: 30000,
    retry: 1,
    retryDelay: 5000,
  })

  // ETH Balance for Smart Account
  const { data: smartAccountEthBalance, isLoading: isLoadingSmartAccountEth } = useQuery({
    queryKey: ['smartAccountEthBalance', state.accountAddress],
    queryFn: async () => {
      if (!state.accountAddress) return null
      try {
        const balance = await publicClient.getBalance({
          address: state.accountAddress as `0x${string}`
        })
        return {
          balance: balance.toString(),
          formattedBalance: `${parseFloat(formatUnits(balance, 18)).toFixed(4)} ETH`,
        }
      } catch (_error) {
        return null
      }
    },
    enabled: isReady && !!state.accountAddress,
    refetchInterval: 30000,
    retry: 1,
    retryDelay: 5000,
  })

  const { data: stablecoinBalances = [], isLoading: isLoadingBalances } = useQuery({
    queryKey: ['stablecoinBalances', state.accountAddress],
    queryFn: async () => {
      if (!state.accountAddress) return []

      try {
        const balances = []

        // Fetch balances for all supported tokens
        for (const [tokenName, tokenAddress] of Object.entries(SUPPORTED_TOKENS)) {
          try {
            const balance = await publicClient.readContract({
              address: tokenAddress,
              abi: ERC20_ABI,
              functionName: 'balanceOf',
              args: [state.accountAddress as `0x${string}`]
            })

            const decimals = await publicClient.readContract({
              address: tokenAddress,
              abi: ERC20_ABI,
              functionName: 'decimals'
            })

            balances.push({
              address: tokenAddress,
              symbol: tokenName,
              balance: balance.toString(),
              formattedBalance: `${formatUnits(balance, decimals)} ${tokenName}`,
            })
          } catch (_error) {
            console.error(`Failed to fetch ${tokenName} balance:`, _error)
            // Continue with other tokens
          }
        }

        return balances
      } catch (_error) {
        return []
      }
    },
    enabled: isReady && !!state.accountAddress,
    refetchInterval: 30000,
    retry: 1,
    retryDelay: 5000,
  })

  const initializeRhinestoneAccount = useCallback(async () => {
    // Check wallet connection
    if (!isReady) {
      console.log("❌ Rhinestone initialization skipped - wallet not connected");
      setState((prev) => ({
        ...prev,
        rhinestoneAccount: null,
        accountAddress: null,
        error: null,
      }));
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const apiKey = import.meta.env.VITE_RHINESTONE_API_KEY;

      if (!apiKey) {
        throw new Error("❌ Rhinestone API key not configured in environment variables");
      }

      let accountToUse: Account;

      if (viemAccount) {
        accountToUse = wrapParaAccount(viemAccount, wallet?.id);
      } else if (wagmiWalletClient) {

        accountToUse = walletClientToAccount(wagmiWalletClient);
      } else {
        throw new Error("❌ No wallet client available");
      }

      const sdk = new RhinestoneSDK({
        apiKey,
        bundler: {
          type: "pimlico",
          apiKey: import.meta.env.VITE_PIMLICO_API_KEY,
        }
      });

      // const sessionOwnerAccount = privateKeyToAccount(generatePrivateKey())

      // // create session owner account
      // const session: Session = {
      //   owners: {
      //     type: 'ecdsa',
      //     accounts: [sessionOwnerAccount],
      //   }

      // }

      // Create smart account with the appropriate account (Para wrapped or direct)
      const rhinestoneAccount = await sdk.createAccount({
        owners: {
          type: "ecdsa" as const,
          accounts: [accountToUse],
        },
      });

      const accountAddress = rhinestoneAccount.getAddress();

      setState((prev) => ({
        ...prev,
        rhinestoneAccount,
        accountAddress,
        isLoading: false,
        error: null,
      }));
    } catch (error) {
      console.error("Failed to initialize Rhinestone account:", error);

      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: String(error),
      }));
    }
  }, [isReady, viemAccount, wallet, wagmiWalletClient]);

  const sendTransaction = useCallback(
    async (calls: any[]): Promise<any> => {
      if (!state.rhinestoneAccount) {
        throw new Error("Rhinestone account not initialized");
      }

      try {
        console.log("🚀 Sending transaction with calls:", calls);

        // Use sendUserOperation like the working POC
        const result = await state.rhinestoneAccount.sendUserOperation({
          chain: customSepolia,
          calls: calls
        });

        console.log("📋 Transaction result:", result);
        console.log("📋 Result keys:", Object.keys(result || {}));

        // Handle null result
        if (!result) {
          throw new Error('Transaction returned null - transaction may have failed');
        }

        // Extract transaction hash using multiple fallback methods (like working POC)
        const txHash =
          (result as any).fillTransactionHash ||
          (result as any).transaction?.hash ||
          (result as any).hash ||
          (result as any).txHash ||
          (result as any).fill?.hash ||
          getTxHashResult(result) ||
          null;

        console.log("✅ Transaction submitted:", txHash);

        // Wait for transaction execution using Rhinestone's waitForExecution
        console.log("⏳ Waiting for transaction execution...");
        const executionResult = await state.rhinestoneAccount.waitForExecution(result);
        console.log("✅ Transaction execution confirmed!", executionResult);

        // Additional verification: Check if the transaction was actually successful
        if (executionResult && (executionResult as any).status === 'reverted') {
          throw new Error('Transaction was reverted');
        }

        return {
          transaction: result,
          result: executionResult,
          fillTransactionHash: txHash,
        };
      } catch (error) {
        console.error("Transaction failed:", error);
        throw error;
      }
    },
    [state.rhinestoneAccount]
  );

  useEffect(() => {
    initializeRhinestoneAccount();
  }, [initializeRhinestoneAccount]);

  return {
    ...state,
    address: wallet?.address,
    isConnected: !!wallet,
    sendTransaction,
    stablecoinBalances,
    isLoadingBalances,
    eoaEthBalance,
    smartAccountEthBalance,
    isLoadingEoaEth,
    isLoadingSmartAccountEth,
  };
}
