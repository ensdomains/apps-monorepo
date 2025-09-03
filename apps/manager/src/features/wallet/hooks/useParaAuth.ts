import type { AuthState } from '@getpara/web-sdk'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { para } from '@/lib/wagmi'

interface SignUpOrLoginParams {
  email?: string
  phoneNumber?: string
  countryCode?: string
}

export const useParaAuth = () => {
  const queryClient = useQueryClient()

  const signUpOrLoginMutation = useMutation({
    mutationFn: async ({
      email,
      phoneNumber,
      countryCode,
    }: SignUpOrLoginParams) => {
      if (email) {
        return await para.signUpOrLogIn({ auth: { email } })
      } else if (phoneNumber && countryCode) {
        const phone = `+${countryCode}${phoneNumber}` as `+${number}`
        return await para.signUpOrLogIn({ auth: { phone } })
      }
      throw new Error('Either email or phone number is required')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paraAccount'] })
    },
  })

  const verifyAccountMutation = useMutation({
    mutationFn: async ({ verificationCode }: { verificationCode: string }) => {
      return await para.verifyNewAccount({ verificationCode })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paraAccount'] })
    },
  })

  const waitForLoginMutation = useMutation({
    mutationFn: async (params?: { isCanceled?: () => boolean }) => {
      return await para.waitForLogin(params)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paraAccount'] })
    },
  })

  const logoutMutation = useMutation({
    mutationFn: async (params?: { clearPregenWallets?: boolean }) => {
      return await para.logout(params)
    },
    onSuccess: () => {
      queryClient.invalidateQueries()
    },
  })

  return {
    signUpOrLogin: signUpOrLoginMutation.mutate,
    signUpOrLoginAsync: signUpOrLoginMutation.mutateAsync,
    isSigningUpOrLoggingIn: signUpOrLoginMutation.isPending,
    signUpOrLoginError: signUpOrLoginMutation.error,

    verifyAccount: verifyAccountMutation.mutate,
    verifyAccountAsync: verifyAccountMutation.mutateAsync,
    isVerifyingAccount: verifyAccountMutation.isPending,
    verifyAccountError: verifyAccountMutation.error,

    waitForLogin: waitForLoginMutation.mutate,
    waitForLoginAsync: waitForLoginMutation.mutateAsync,
    isWaitingForLogin: waitForLoginMutation.isPending,
    waitForLoginError: waitForLoginMutation.error,

    logout: logoutMutation.mutate,
    logoutAsync: logoutMutation.mutateAsync,
    isLoggingOut: logoutMutation.isPending,
    logoutError: logoutMutation.error,
  }
}
