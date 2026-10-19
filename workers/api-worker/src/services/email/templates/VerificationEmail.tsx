/** @jsxImportSource react */
import { Text } from '@react-email/components'
import type { CSSProperties } from 'react'
import type { EmailContext } from '../context.js'
import { type RenderedEmail, renderEmail } from '../render.js'
import { EmailLayout, EmailParagraph } from './EmailLayout.js'

export interface VerificationEmailProps {
  readonly otp: string
  readonly accountAddress: string
  readonly expiresInMinutes: number
}

const otpStyle: CSSProperties = {
  margin: '4px 0 26px',
  color: '#02293b',
  fontFamily: "Menlo, Consolas, 'Courier New', monospace",
  fontSize: '36px',
  letterSpacing: '0.28em',
  lineHeight: '44px',
  textAlign: 'center',
}

// Intentionally has no directions section: the code is typed into
// Notification Settings by the signed-in wallet, so there is nothing here to
// phish and nothing else to do.
const VerificationEmail = ({
  context,
  otp,
  accountAddress,
  expiresInMinutes,
}: VerificationEmailProps & { readonly context: EmailContext }) => (
  <EmailLayout
    context={context}
    preview={`Your ENS email verification code is ${otp}`}
    heading="Verify your email"
    reason="this address was entered in ENS notification settings. If that wasn’t you, you can ignore this email"
  >
    <EmailParagraph centered>
      {`Enter this code in Notification Settings in the ENS app. It expires in ${expiresInMinutes} minutes.`}
    </EmailParagraph>
    <Text style={otpStyle}>{otp}</Text>
    <EmailParagraph
      centered
    >{`Requested for wallet ${accountAddress}`}</EmailParagraph>
  </EmailLayout>
)

export const renderVerificationEmail = (
  context: EmailContext,
  props: VerificationEmailProps,
): Promise<RenderedEmail> =>
  renderEmail(
    context,
    'Your ENS email verification code',
    <VerificationEmail context={context} {...props} />,
  )
