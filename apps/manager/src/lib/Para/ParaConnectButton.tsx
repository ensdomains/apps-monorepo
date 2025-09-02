import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  getUserInfo,
  initializePara,
  isLoggedIn,
  logout,
  signUpOrLogIn,
  verifyNewAccount,
  waitForLogin,
} from './paraService'

export function ParaConnectButton() {
  const [isConnecting, setIsConnecting] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [address, setAddress] = useState<string | undefined>(undefined)
  const [authStage, setAuthStage] = useState<'idle' | 'verify' | 'login'>(
    'idle',
  )
  const [email, setEmail] = useState<string>('')

  const handleConnect = async () => {
    setIsConnecting(true)
    try {
      await initializePara()

      const loggedIn = await isLoggedIn()
      if (loggedIn) {
        const userInfo = await getUserInfo()
        if (userInfo?.wallets && userInfo.wallets.length > 0) {
          setAddress(userInfo.wallets[0].address)
          setIsConnected(true)
        }
      } else {
        const userEmail = prompt('Enter your email address:')
        if (!userEmail) return

        setEmail(userEmail)
        const result = await signUpOrLogIn(userEmail)
        console.log('Login result:', result)

        if (result.stage === 'verify') {
          setAuthStage('verify')
        } else if (result.stage === 'login') {
          setAuthStage('login')

          if (result.passkeyUrl) {
            window.open(result.passkeyUrl, '_blank', 'width=500,height=600')
          }

          try {
            await waitForLogin()
            const loggedIn = await isLoggedIn()
            if (loggedIn) {
              const userInfo = await getUserInfo()
              if (userInfo?.wallets && userInfo.wallets.length > 0) {
                setAddress(userInfo.wallets[0].address)
                setIsConnected(true)
                setAuthStage('idle')
              }
            }
          } catch (error) {
            console.error('Login completion failed:', error)
            setAuthStage('idle')
          }
        }
      }
    } catch (error) {
      console.error('Failed to connect:', error)
    } finally {
      setIsConnecting(false)
    }
  }

  const handleVerification = async (verificationCode: string) => {
    try {
      const result = await verifyNewAccount(verificationCode)
      console.log('Verification result:', result)

      if (result.stage === 'login') {
        setAuthStage('login')

        if (result.passkeyUrl) {
          window.open(result.passkeyUrl, '_blank', 'width=500,height=600')
        }

        try {
          await waitForLogin()
          const loggedIn = await isLoggedIn()
          if (loggedIn) {
            const userInfo = await getUserInfo()
            if (userInfo?.wallets && userInfo.wallets.length > 0) {
              setAddress(userInfo.wallets[0].address)
              setIsConnected(true)
              setAuthStage('idle')
            }
          }
        } catch (error) {
          console.error('Login completion failed:', error)
          setAuthStage('idle')
        }
      }
    } catch (error) {
      console.error('Verification failed:', error)
    }
  }

  const handleDisconnect = () => {
    logout()
    setIsConnected(false)
    setAddress(undefined)
    setAuthStage('idle')
    setEmail('')
  }

  const getDisplayName = () => {
    if (address) {
      return `${address.slice(0, 6)}...${address.slice(-4)}`
    }
    return 'Connected'
  }

  if (isConnected) {
    return (
      <Button variant="outline" onClick={handleDisconnect}>
        Disconnect {getDisplayName()}
      </Button>
    )
  }

  if (authStage === 'verify') {
    return (
      <div className="flex flex-col gap-2">
        <div className="text-muted-foreground text-sm">
          Enter the verification code sent to {email}
        </div>
        <Button
          onClick={() => {
            const code = prompt('Enter verification code:')
            if (code) {
              handleVerification(code)
            }
          }}
        >
          Enter Verification Code
        </Button>
      </div>
    )
  }

  if (authStage === 'login') {
    return (
      <div className="flex flex-col gap-2">
        <div className="text-muted-foreground text-sm">
          Complete authentication in the browser window...
        </div>
        <Button disabled>Authenticating...</Button>
      </div>
    )
  }

  return (
    <Button onClick={handleConnect} disabled={isConnecting}>
      {isConnecting ? 'Connecting...' : 'Connect with Para'}
    </Button>
  )
}
