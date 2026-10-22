/** @jsxImportSource react */
import { V2_GRACE_PERIOD_DAYS } from '@ens-apps/utils/gracePeriod'
import type { EmailContext } from '../context.js'
import { type RenderedEmail, renderEmail } from '../render.js'
import { DEFAULT_THEME_COLOR } from '../theme.js'
import {
  EmailAppSteps,
  EmailLayout,
  EmailParagraph,
  EmailSubheading,
  emphasis,
} from './EmailLayout.js'

// The first email people read closely, so it teaches how to tell a real ENS
// email from a fake one; later emails only repeat the rule in the footer.
const WelcomeEmail = ({ context }: { readonly context: EmailContext }) => (
  <EmailLayout
    context={context}
    preview="Your email is verified for ENS notifications"
    heading="You’re all set"
    themeColor={DEFAULT_THEME_COLOR}
    reason="you verified this address in the ENS app"
  >
    <EmailParagraph>
      Your email is verified. We’ll let you know before your names expire and
      while they’re in their {V2_GRACE_PERIOD_DAYS}-day grace period.
    </EmailParagraph>
    <EmailSubheading>How to tell an email is from us</EmailSubheading>
    <EmailParagraph>
      Our emails never contain links or buttons. We’ll never ask you to sign
      anything, connect your wallet or share your recovery phrase from an email.
    </EmailParagraph>
    <EmailAppSteps
      context={context}
      title="To choose what you hear about"
      lastStep={<>Open {emphasis('Notification Settings')}.</>}
    />
  </EmailLayout>
)

export const renderWelcomeEmail = (
  context: EmailContext,
): Promise<RenderedEmail> =>
  renderEmail(
    context,
    'Welcome to ENS notifications',
    <WelcomeEmail context={context} />,
  )
