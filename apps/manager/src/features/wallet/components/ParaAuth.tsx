/** biome-ignore-all lint/correctness/useUniqueElementIds: <explanation> */

import { useSelector } from '@xstate/react'
import { Mail, Phone } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { paraMachine } from '../machines/para'

export const ParaAuth = () => {
  const snapshot = useSelector(paraMachine, (snapshot) => snapshot)

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="mb-2 font-bold text-2xl">Sign in with Para</h2>
        <p className="text-gray-600">
          Create an account or sign in to get started
        </p>
      </div>
      {snapshot.matches('input') && <InputStep />}
      {snapshot.matches('email') && <EmailStep />}
      {snapshot.matches({ verifyOtp: 'input' }) && <VerifyInputStep />}
      {snapshot.matches({ verifyOtp: 'verify' }) && <VerifyStep />}
      {snapshot.matches('login') && <LoginStep />}
      {snapshot.matches('signup') && <SignupStep />}
      {snapshot.matches('needsWallet') && <NeedsWalletStep />}
      {snapshot.matches('success') && <SuccessStep />}
    </div>
  )
}

const InputStep = () => {
  const [authMethod, setAuthMethod] = useState<'email' | 'phone'>('email')
  const [email, setEmail] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [countryCode, setCountryCode] = useState('+1')

  return (
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
            />
            <Input
              id="phone"
              type="tel"
              placeholder="Enter your phone number"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="flex-1"
            />
          </div>
        </div>
      )}

      <Button
        onClick={() => {
          if (authMethod === 'email') {
            paraMachine.send({ type: 'LOGIN_EMAIL', email })
          } else {
            paraMachine.send({
              type: 'LOGIN_PHONE',
              phoneNumber: `+${countryCode}${phoneNumber}` as `+${number}`,
            })
          }
        }}
        disabled={
          authMethod === 'email' ? !email : !phoneNumber || !countryCode
        }
        className="w-full"
      >
        {/* {isSigningUpOrLoggingIn ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending code...
              </>
            ) : (
              'Continue'
            )} */}
        Continue
      </Button>
    </div>
  )
}

const EmailStep = () => {
  return <div>Signing in...</div>
}

const VerifyInputStep = () => {
  const [verificationCode, setVerificationCode] = useState('')

  return (
    <div className="space-y-4">
      <div className="mb-4 text-center">
        <h3 className="mb-2 font-semibold text-lg">Enter verification code</h3>
        <p className="text-gray-600">We've sent a verification code to you</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="verificationCode">Verification code</Label>
        <Input
          id="verificationCode"
          type="text"
          placeholder="Enter 6-digit code"
          value={verificationCode}
          onChange={(e) => setVerificationCode(e.target.value)}
          maxLength={6}
        />
      </div>

      <Button
        onClick={() => {
          paraMachine.send({ type: 'VERIFY_OTP', verificationCode })
        }}
        disabled={!verificationCode}
        className="w-full"
      >
        Verify Code
      </Button>
    </div>
  )
}

const VerifyStep = () => {
  return <div>Verifying...</div>
}

const LoginStep = () => {
  return <div>Logging in...</div>
}

const SignupStep = () => {
  return <div>Signing up...</div>
}

const NeedsWalletStep = () => {
  return (
    <div>
      <h1>Needs wallet</h1>
      <Button onClick={() => paraMachine.send({ type: 'CLOSE' })}>Close</Button>
    </div>
  )
}

const SuccessStep = () => {
  return (
    <div>
      <h1>Success</h1>
      <Button onClick={() => paraMachine.send({ type: 'CLOSE' })}>Close</Button>
    </div>
  )
}
