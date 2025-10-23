"use client";

import { type RhinestoneAccount, RhinestoneSDK, walletClientToAccount } from "@rhinestone/sdk";
import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from "react";
import { Account, formatUnits } from "viem";
import { customSepolia } from "@/lib/wagmi";
import { useWalletClient } from "wagmi";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { SUPPORTED_TOKENS } from "@/features/register/services/nameChainContractService";
import { publicClient } from "@/lib/wagmi";
import { ERC20_ABI } from "../ens.abi";
import { getTxHashResult } from "./utils";

const createCustomAccount = (viemAccount: Account, walletClient: any): Account => {
  return {
    ...viemAccount,
    address: walletClient.account.address,
    type: 'json-rpc',
    async signMessage({ message }: { message: any }) {
      // Use the wallet client's signMessage directly
      console.log('signMessage', message);
      return await walletClient.signMessage({
        account: walletClient.account,
        message,
      });
    },
    async signTypedData(typedData: any) {
      // Critical: Use wallet client's signTypedData directly
      console.log('signTypedData', typedData);
      return await walletClient.signTypedData({
        account: walletClient.account,
        ...typedData,
      });
    },
    async signTransaction(transaction: any) {
      console.log('signTransaction', transaction);
      return await walletClient.signTransaction({
        account: walletClient.account,
        ...transaction,
      });
    },
  } as unknown as Account;
};
export interface RhinestoneAccountState {
  rhinestoneAccount: RhinestoneAccount | null;
  accountAddress: string | null;
  isLoading: boolean;
  error: string | null;
}

export function useRhinestoneAccount() {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const { data: walletClient } = useWalletClient();

  const connectedWallet = wallets.find((wallet) => wallet.address);
  const address = connectedWallet?.address;
  const isConnected = authenticated && ready && !!address;
  const [state, setState] = useState<RhinestoneAccountState>({
    rhinestoneAccount: null,
    accountAddress: null,
    isLoading: false,
    error: null,
  });

  const { data: stablecoinBalances = [], isLoading: isLoadingBalances } = useQuery({
    queryKey: ['stablecoinBalances', state.accountAddress],
    queryFn: async () => {
      if (!state.accountAddress) return []

      try {
        const balances = await Promise.all([
          // USDC Balance
          publicClient.readContract({
            address: SUPPORTED_TOKENS.USDC,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [state.accountAddress as `0x${string}`]
          }).then(async (balance: bigint) => {
            const decimals = await publicClient.readContract({
              address: SUPPORTED_TOKENS.USDC,
              abi: ERC20_ABI,
              functionName: 'decimals'
            })
            return {
              address: SUPPORTED_TOKENS.USDC,
              symbol: 'USDC',
              balance: balance.toString(),
              formattedBalance: `${formatUnits(balance, decimals)} USDC`,
            }
          }),

          // DAI Balance
          publicClient.readContract({
            address: SUPPORTED_TOKENS.DAI,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [state.accountAddress as `0x${string}`]
          }).then(async (balance: bigint) => {
            const decimals = await publicClient.readContract({
              address: SUPPORTED_TOKENS.DAI,
              abi: ERC20_ABI,
              functionName: 'decimals'
            })
            return {
              address: SUPPORTED_TOKENS.DAI,
              symbol: 'DAI',
              balance: balance.toString(),
              formattedBalance: `${formatUnits(balance, decimals)} DAI`,
            }
          })
        ])

        return balances
      } catch (_error) {
        return []
      }
    },
    enabled: isConnected && !!state.accountAddress,
    refetchInterval: 30000,
    retry: 1,
    retryDelay: 5000,
  })

  const initializeRhinestoneAccount = useCallback(async () => {
    // Check Privy connection
    if (!ready || !isConnected || !address || !walletClient) {
      console.log("❌ Rhinestone initialization skipped - Privy not connected or no wallet client");
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

      const viemAccount = walletClientToAccount(walletClient);
      const customAccount = createCustomAccount(viemAccount, walletClient);

      const sdk = new RhinestoneSDK({
        apiKey,
      });

      // Use the custom account for Rhinestone SDK
      const rhinestoneAccount = await sdk.createAccount({
        owners: {
          type: "ecdsa" as const,
          accounts: [customAccount],
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
  }, [ready, isConnected, address, walletClient, connectedWallet]);

  const sendTransaction = useCallback(
    async (calls: any[]): Promise<any> => {

      try {
        const txConfig = {
          chain: customSepolia,
          calls: calls
        };

        const transaction = await state.rhinestoneAccount?.sendTransaction(
          txConfig
        );

        if (!transaction) {
          throw new Error("Transaction failed");
        }

        const transactionResult = await state.rhinestoneAccount?.waitForExecution(transaction);

        if (!transactionResult) {
          throw new Error("Transaction result failed");
        }

        const txHash = getTxHashResult(transactionResult);

        return {
          transaction,
          result: transactionResult,
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
    address,
    isConnected,
    sendTransaction,
    stablecoinBalances,
    isLoadingBalances,
  };
}
