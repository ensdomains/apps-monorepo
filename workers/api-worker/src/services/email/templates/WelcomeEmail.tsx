/** @jsxImportSource react */
import { Heading, Text } from '@react-email/components'
import { type RenderedEmail, renderEmail } from '../render.js'
import { EmailLayout } from './EmailLayout.js'

const WelcomeEmail = () => (
  <EmailLayout preview="Your email is verified for ENS notifications">
    <Heading as="h1">Welcome to ENS Notifications!</Heading>
    <Text>
      Your email has been successfully verified and you're all set to receive
      notifications about your ENS domains.
    </Text>
    <Text>You'll receive updates about:</Text>
    <ul>
      <li>Domain expiry reminders</li>
      <li>Domain transfers</li>
      <li>And other important events</li>
    </ul>
    <Text>
      You can manage which notifications you receive at any time in Notification
      Settings in the ENS Manager app.
    </Text>
  </EmailLayout>
)

export const renderWelcomeEmail = (): Promise<RenderedEmail> =>
  renderEmail('Welcome to ENS Notifications', <WelcomeEmail />)
