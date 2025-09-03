/** biome-ignore-all lint/correctness/useUniqueElementIds: <explanation> */
import { ArrowLeft, Loader2, Mail, Phone } from 'lucide-react'
import { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useParaAccount } from '../hooks/useParaAccount'
import { useParaAuth } from '../hooks/useParaAuth'

type AuthStep = 'input' | 'verification' | 'waiting'

export const ParaAuth = () => {
  const [step, setStep] = useState<AuthStep>('input')
  const [email, setEmail] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [countryCode, setCountryCode] = useState('+1')
  const [verificationCode, setVerificationCode] = useState('')
  const [authMethod, setAuthMethod] = useState<'email' | 'phone'>('email')

  const {
    signUpOrLogin,
    verifyAccount,
    waitForLogin,
    isSigningUpOrLoggingIn,
    isVerifyingAccount,
    isWaitingForLogin,
    signUpOrLoginError,
    verifyAccountError,
    waitForLoginError,
  } = useParaAuth()
  const { isConnected } = useParaAccount()

  const handleSignUpOrLogin = async () => {
    if (authMethod === 'email' && email) {
      await signUpOrLogin({ email })
      setStep('verification')
    } else if (authMethod === 'phone' && phoneNumber && countryCode) {
      await signUpOrLogin({ phoneNumber, countryCode })
      setStep('verification')
    }
  }

  const handleVerification = async () => {
    if (verificationCode) {
      await verifyAccount({ verificationCode })
      setStep('waiting')
    }
  }

  const handleWaitForLogin = async () => {
    await waitForLogin({})
  }

  const resetForm = () => {
    setStep('input')
    setEmail('')
    setPhoneNumber('')
    setVerificationCode('')
  }

  if (isConnected) {
    return (
      <div className="py-8 text-center">
        <div className="mb-2 text-2xl text-green-600">✓</div>
        <h3 className="mb-2 font-semibold text-lg">Successfully Connected!</h3>
        <p className="text-gray-600">Your Para wallet is now connected.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="mb-2 font-bold text-2xl">Sign in with Para</h2>
        <p className="text-gray-600">
          Create an account or sign in to get started
        </p>
      </div>

      {step === 'input' && (
        <div className="space-y-4">
          <div className="flex space-x-2">
            <Button
              variant={authMethod === 'email' ? 'default' : 'outline'}
              onClick={() => setAuthMethod('email')}
              className="flex-1"
            >
              <Mail className="mr-2 h-4 w-4" />
              Email
            </Button>
            <Button
              variant={authMethod === 'phone' ? 'default' : 'outline'}
              onClick={() => setAuthMethod('phone')}
              className="flex-1"
            >
              <Phone className="mr-2 h-4 w-4" />
              Phone
            </Button>
          </div>

          {authMethod === 'email' ? (
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSigningUpOrLoggingIn}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="phone">Phone number</Label>
              <div className="flex space-x-2">
                <Input
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="w-20"
                  disabled={isSigningUpOrLoggingIn}
                />
                <Input
                  id="phone"
                  type="tel"
                  placeholder="Enter your phone number"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  disabled={isSigningUpOrLoggingIn}
                  className="flex-1"
                />
              </div>
            </div>
          )}

          <Button
            onClick={handleSignUpOrLogin}
            disabled={
              isSigningUpOrLoggingIn ||
              (authMethod === 'email' ? !email : !phoneNumber || !countryCode)
            }
            className="w-full"
          >
            {isSigningUpOrLoggingIn ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending code...
              </>
            ) : (
              'Continue'
            )}
          </Button>

          {signUpOrLoginError && (
            <Alert className="border-red-200 bg-red-50">
              <AlertDescription className="text-red-800">
                {signUpOrLoginError.message}
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {step === 'verification' && (
        <div className="space-y-4">
          <Button variant="ghost" onClick={resetForm} className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>

          <div className="mb-4 text-center">
            <h3 className="mb-2 font-semibold text-lg">
              Enter verification code
            </h3>
            <p className="text-gray-600">
              We've sent a verification code to your{' '}
              {authMethod === 'email' ? 'email' : 'phone'}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="verificationCode">Verification code</Label>
            <Input
              id="verificationCode"
              type="text"
              placeholder="Enter 6-digit code"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              disabled={isVerifyingAccount}
              maxLength={6}
            />
          </div>

          <Button
            onClick={handleVerification}
            disabled={isVerifyingAccount || !verificationCode}
            className="w-full"
          >
            {isVerifyingAccount ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verifying...
              </>
            ) : (
              'Verify Code'
            )}
          </Button>

          {verifyAccountError && (
            <Alert className="border-red-200 bg-red-50">
              <AlertDescription className="text-red-800">
                {verifyAccountError.message}
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {step === 'waiting' && (
        <div className="space-y-4 text-center">
          <div className="mb-2 text-2xl text-blue-600">⏳</div>
          <h3 className="mb-2 font-semibold text-lg">Almost there!</h3>
          <p className="mb-4 text-gray-600">
            Please complete the verification in your Para app or email
          </p>

          <Button
            onClick={handleWaitForLogin}
            disabled={isWaitingForLogin}
            className="w-full"
          >
            {isWaitingForLogin ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Waiting for verification...
              </>
            ) : (
              'Check Status'
            )}
          </Button>

          {waitForLoginError && (
            <Alert className="border-red-200 bg-red-50">
              <AlertDescription className="text-red-800">
                {waitForLoginError.message}
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}
    </div>
  )
}
