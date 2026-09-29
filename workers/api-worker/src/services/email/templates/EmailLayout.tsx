/** @jsxImportSource react */
import {
  Body,
  Container,
  Head,
  Html,
  Preview,
  Section,
} from '@react-email/components'
import type { ReactNode } from 'react'

// Deliberately plain: final designs are applied to the templates separately.
const bodyStyle = {
  fontFamily: 'Arial, sans-serif',
  color: '#202124',
  margin: 0,
}
const containerStyle = { maxWidth: '600px', margin: '0 auto', padding: '24px' }

interface EmailLayoutProps {
  readonly preview: string
  readonly children: ReactNode
}

export const EmailLayout = ({ preview, children }: EmailLayoutProps) => (
  <Html lang="en">
    <Head />
    <Preview>{preview}</Preview>
    <Body style={bodyStyle}>
      <Container style={containerStyle}>
        <Section>{children}</Section>
      </Container>
    </Body>
  </Html>
)
