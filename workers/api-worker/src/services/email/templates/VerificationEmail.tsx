/** @jsxImportSource react */
import { Heading, Text } from '@react-email/components'
import { type RenderedEmail, renderEmail } from '../render.js'
import { EmailLayout } from './EmailLayout.js'

export type VerificationEmailProps = {
  otp: string
  accountAddress: string
  expiresInMinutes: number
}

const otpStyle = {
  fontSize: '32px',
  fontWeight: 'bold',
  letterSpacing: '0.2em',
}

// Intentionally has no link or button: the code is typed into Notification
// Settings by the signed-in wallet, so there is nothing here to phish.
const VerificationEmail = ({
  otp,
  accountAddress,
  expiresInMinutes,
}: VerificationEmailProps) => (
  <EmailLayout preview={`Your ENS email verification code is ${otp}`}>
    <Heading as="h1">Verify your email for ENS notifications</Heading>
    <Text>Enter this code in Notification Settings:</Text>
    <Text style={otpStyle}>{otp}</Text>
    <Text>
      Requested for wallet <strong>{accountAddress}</strong>.
    </Text>
    <Text>
      {`This code expires in ${expiresInMinutes} minutes. If you did not request it, you can safely ignore this email.`}
    </Text>
  </EmailLayout>
)

export const renderVerificationEmail = (
  props: VerificationEmailProps,
): Promise<RenderedEmail> =>
  renderEmail(
    'Your ENS email verification code',
    <VerificationEmail {...props} />,
  )
