'use client'

import { useEffect, useState } from 'react'
import { useConnect } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  getParaInstance,
  getUserInfo,
  initializePara,
  isLoggedIn,
  signUpOrLogIn,
  verifyNewAccount,
  waitForLogin,
} from '../../Para/paraService'
import { paraConnector } from '../connectors'

interface ParaAuthComponentProps {
  onSuccess: () => void
}

export function ParaAuthComponent({ onSuccess }: ParaAuthComponentProps) {
  const [email, setEmail] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [authStage, setAuthStage] = useState<'idle' | 'verify' | 'login'>(
    'idle',
  )
  const [isLoading, setIsLoading] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadingMessage, setLoadingMessage] = useState<string>('')
  const { connect } = useConnect()

  // Check if user is already authenticated with Para
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        await initializePara()
        const loggedIn = await isLoggedIn()
        if (loggedIn) {
          setAuthStage('login')
        }
      } catch (error) {
        console.error('Failed to check Para auth status:', error)
      } finally {
        setIsCheckingAuth(false)
      }
    }

    checkAuthStatus()
  }, [])

  const handleEmailSubmit = async () => {
    if (!email) return

    setIsLoading(true)
    try {
      await initializePara()
      const result = await signUpOrLogIn(email)

      if (result.stage === 'verify') {
        setAuthStage('verify')
      } else if (result.stage === 'login') {
        setAuthStage('login')
        if (result.passkeyUrl) {
          window.open(result.passkeyUrl, '_blank', 'width=500,height=600')
        }
        await waitForLogin()
        // Check if authentication was successful
        const loggedIn = await isLoggedIn()
        if (loggedIn) {
          const userInfo = await getUserInfo()
          if (userInfo?.wallets && userInfo.wallets.length > 0) {
            // Authentication successful, show connect button
            setAuthStage('login')
          }
        }
      }
    } catch (error) {
      console.error('Email authentication failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerification = async () => {
    if (!verificationCode) return

    setIsLoading(true)
    try {
      const result = await verifyNewAccount(verificationCode)

      if (result.stage === 'login') {
        setAuthStage('login')
        if (result.passkeyUrl) {
          window.open(result.passkeyUrl, '_blank', 'width=500,height=600')
        }
        await waitForLogin()
        // Check if authentication was successful
        const loggedIn = await isLoggedIn()
        if (loggedIn) {
          const userInfo = await getUserInfo()
          if (userInfo?.wallets && userInfo.wallets.length > 0) {
            // Authentication successful, show connect button
            setAuthStage('login')
          }
        }
      }
    } catch (error) {
      console.error('Verification failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleOAuthLogin = async (provider: string) => {
    setIsLoading(true)
    setError(null)
    setLoadingMessage('Initializing...')

    // Add overall timeout for the entire OAuth process
    const oauthTimeout = setTimeout(
      () => {
        setIsLoading(false)
        setError(`${provider} login timed out. Please try again.`)
      },
      10 * 60 * 1000,
    ) // 10 minutes timeout

    try {
      setLoadingMessage('Initializing Para SDK...')
      await initializePara()

      const _para = getParaInstance()
      console.log('Para instance:', _para)
      console.log('Provider:', provider)

      setLoadingMessage('Getting OAuth URL...')
      const oauthUrl = await _para.getOAuthUrl({ method: provider } as any)

      console.log('OAuth URL:', oauthUrl)
      setLoadingMessage('Opening OAuth popup...')
      const popup = window.open(
        oauthUrl,
        `${provider}-oauth`,
        'width=500,height=600,scrollbars=yes,resizable=yes,top=100,left=100',
      )

      if (!popup) {
        throw new Error(
          'Failed to open OAuth popup. Please allow popups for this site.',
        )
      }

      // Focus the popup
      popup.focus()
      setLoadingMessage('Waiting for OAuth completion...')

      // Wait for popup to close (user completes OAuth)
      await new Promise<void>((resolve, reject) => {
        const checkClosed = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkClosed)
            resolve()
          }
        }, 1000)

        // Timeout after 5 minutes
        setTimeout(
          () => {
            clearInterval(checkClosed)
            if (!popup.closed) {
              popup.close()
            }
            reject(new Error('OAuth popup timeout'))
          },
          5 * 60 * 1000,
        )
      })

      // Close the popup if it's still open
      if (!popup.closed) {
        popup.close()
      }

      // OAuth authentication is complete when popup closes
      // Give Para SDK a moment to establish the session
      setLoadingMessage('Verifying OAuth authentication...')

      // Use verifyOAuth to complete the OAuth authentication process
      try {
        const oauthResponse = await _para.verifyOAuth({
          method: provider,
        } as any)
        console.log('OAuth verification successful:', oauthResponse)

        // Check if authentication was successful
        const loggedIn = await isLoggedIn()
        console.log('OAuth authentication result:', loggedIn)

        if (loggedIn) {
          setLoadingMessage('Getting user information...')
          const userInfo = await getUserInfo()
          console.log('OAuth user info:', userInfo)

          if (userInfo?.wallets && userInfo.wallets.length > 0) {
            console.log('OAuth authentication successful with wallets')
            setAuthStage('login')
          } else {
            // User is logged in but no wallets - they might need to create one
            console.log('OAuth user authenticated but no wallets found')
            setAuthStage('login')
          }
        } else {
          console.log('OAuth authentication failed after verification')
          throw new Error('OAuth authentication failed - please try again')
        }
      } catch (verifyError) {
        console.error('OAuth verification failed:', verifyError)
        throw new Error('OAuth verification failed - please try again')
      }
    } catch (error) {
      console.error(`${provider} login failed:`, error)
      const errorMessage =
        error instanceof Error
          ? error.message
          : `${provider} login failed. Please try again.`
      setError(errorMessage)
    } finally {
      clearTimeout(oauthTimeout)
      setIsLoading(false)
      setLoadingMessage('')
    }
  }

  const handleGoogleLogin = () => handleOAuthLogin('GOOGLE')

  // Show loading while checking authentication status
  if (isCheckingAuth) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-slate-500 text-sm dark:text-slate-400">
          Checking authentication status...
        </p>
        <Button disabled className="w-full bg-slate-200 dark:bg-slate-700">
          Loading...
        </Button>
      </div>
    )
  }

  if (authStage === 'verify') {
    return (
      <div className="space-y-4">
        <div className="text-center">
          <p className="text-slate-500 text-sm dark:text-slate-400">
            Enter the verification code sent to {email}
          </p>
        </div>
        <Input
          type="text"
          placeholder="Verification code"
          value={verificationCode}
          onChange={(e) => setVerificationCode(e.target.value)}
          className="border-slate-200 bg-white text-slate-900 placeholder-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400"
        />
        <Button
          onClick={handleVerification}
          disabled={isLoading || !verificationCode}
          className="w-full bg-blue-600 hover:bg-blue-700"
        >
          {isLoading ? 'Verifying...' : 'Verify'}
        </Button>
      </div>
    )
  }

  if (authStage === 'login') {
    return (
      <div className="space-y-4 text-center">
        <p className="text-slate-500 text-sm dark:text-slate-400">
          Authentication completed! Click below to connect your wallet.
        </p>
        <Button
          onClick={async () => {
            try {
              // Re-initialize Para to ensure state is fresh
              await initializePara()

              // Use the same approach as ParaConnectButton
              const loggedIn = await isLoggedIn()
              if (loggedIn) {
                const userInfo = await getUserInfo()
                if (userInfo?.wallets && userInfo.wallets.length > 0) {
                  // Add a small delay to ensure Para SDK is fully ready
                  await new Promise((resolve) => setTimeout(resolve, 500))

                  // Now try to connect with wagmi
                  await connect({ connector: paraConnector })
                  onSuccess() // Close the modal after successful connection
                }
              }
            } catch (error) {
              console.error('Failed to connect Para wallet:', error)
            }
          }}
          className="w-full bg-slate-600 text-white hover:bg-slate-700"
        >
          Connect Para Wallet
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Error Display */}
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-red-700 text-sm dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Email Input */}
      <div className="relative">
        <Input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border-slate-200 bg-white text-slate-900 placeholder-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400"
        />
      </div>

      {/* Login Button */}
      <Button
        onClick={handleEmailSubmit}
        disabled={isLoading || !email}
        className="w-full bg-slate-600 text-white hover:bg-slate-700"
      >
        {isLoading ? 'Logging in...' : 'Login'}
      </Button>

      {/* Google Login Button */}
      <div className="space-y-3">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-slate-200 border-t dark:border-slate-700" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-2 text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              Or continue with
            </span>
          </div>
        </div>

        <Button
          onClick={handleGoogleLogin}
          disabled={isLoading}
          className="flex w-full items-center gap-2 border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-label="Google logo">
            <title>Google</title>
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          {isLoading
            ? loadingMessage || 'Connecting...'
            : 'Continue with Google'}
        </Button>
      </div>
    </div>
  )
}
