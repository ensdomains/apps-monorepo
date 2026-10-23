/** @jsxImportSource react */
import type { EmailContext } from '../context.js'
import { type RenderedEmail, renderEmail } from '../render.js'
import { DEFAULT_THEME_COLOR } from '../theme.js'
import {
  EmailCode,
  EmailFacts,
  EmailLayout,
  EmailParagraph,
} from './EmailLayout.js'

export interface VerificationEmailProps {
  readonly otp: string
  readonly accountAddress: string
  readonly expiresInMinutes: number
}

// Intentionally has no directions: the code is typed into Notification
// Settings by the signed-in wallet, so there is nothing here to phish and
// nothing else to do.
const VerificationEmail = ({
  context,
  otp,
  accountAddress,
  expiresInMinutes,
}: VerificationEmailProps & { readonly context: EmailContext }) => (
  <EmailLayout
    context={context}
    preview={`Your ENS email verification code is ${otp}`}
    heading="Your verification code"
    themeColor={DEFAULT_THEME_COLOR}
    reason="this address was entered in ENS notification settings. If that wasn’t you, you can ignore this email"
    canOptOut={false}
  >
    <EmailCode code={otp} />
    <EmailParagraph>
      {`Enter this code in Notification Settings in the ENS app. It expires in ${expiresInMinutes} minutes. Don’t share it with anyone. ENS will never ask you for it.`}
    </EmailParagraph>
    <EmailFacts
      isStacked
      facts={[
        { label: 'Requested for wallet', value: accountAddress, isMono: true },
      ]}
    />
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
