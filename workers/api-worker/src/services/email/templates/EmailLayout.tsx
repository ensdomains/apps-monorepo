/** @jsxImportSource react */
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { CSSProperties, ReactNode } from 'react'
import { type EmailContext, isTestnet, networkLabel } from '../context.js'

// Interim house style, pending the design team's pass. Brand values come from
// the manager theme; fonts fall back to web-safe faces because mail clients
// do not load ENS's own.
const COLOR = {
  ink: '#02293b',
  body: '#5a6670',
  muted: '#7a858c',
  rule: '#e6eaec',
  lapis: '#0080bc',
  testnetName: '#674d49',
  testnetBanner: '#f8f6d6',
} as const
const SANS = 'Helvetica, Arial, sans-serif'
const SERIF = "Georgia, 'Times New Roman', serif"
const MONO = "Menlo, Consolas, 'Courier New', monospace"
const GUTTER = '48px'

const bodyStyle: CSSProperties = {
  backgroundColor: '#ffffff',
  color: COLOR.ink,
  fontFamily: SANS,
  margin: 0,
}
const containerStyle: CSSProperties = {
  maxWidth: '600px',
  margin: '0 auto',
  padding: '44px 0 36px',
}
const columnStyle: CSSProperties = { padding: `0 ${GUTTER}` }
// Spacing lives on block elements: Gmail and Outlook drop negative margins
// and vertical margins on inline ones.
const logoStyle: CSSProperties = { margin: '0 auto 34px' }
const testnetLogoStyle: CSSProperties = { margin: '0 auto 20px' }
const bannerRowStyle: CSSProperties = {
  margin: '0 0 22px',
  textAlign: 'center',
}
const bannerStyle: CSSProperties = {
  display: 'inline-block',
  padding: '4px 12px',
  borderRadius: '999px',
  backgroundColor: COLOR.testnetBanner,
  color: COLOR.testnetName,
  fontSize: '13px',
  lineHeight: '20px',
}
const headingStyle: CSSProperties = {
  margin: '0 0 20px',
  color: COLOR.ink,
  fontFamily: SERIF,
  fontSize: '34px',
  fontWeight: 400,
  lineHeight: '38px',
  textAlign: 'center',
}
const nameStyle: CSSProperties = {
  display: 'inline-block',
  padding: '9px 16px',
  borderRadius: '6px',
  color: '#ffffff',
  fontFamily: MONO,
  fontSize: '21px',
  fontWeight: 700,
  lineHeight: '26px',
  wordBreak: 'break-all',
}
const paragraphStyle: CSSProperties = {
  margin: '0 0 20px',
  color: COLOR.body,
  fontSize: '16px',
  lineHeight: '24px',
}
const detailStyle: CSSProperties = { ...paragraphStyle, margin: '0 0 6px' }
const detailValueStyle: CSSProperties = {
  color: COLOR.ink,
  wordBreak: 'break-all',
}
const actionStyle: CSSProperties = {
  ...columnStyle,
  marginTop: '30px',
  paddingTop: '26px',
  paddingBottom: '26px',
  borderTop: `1px solid ${COLOR.rule}`,
  borderBottom: `1px solid ${COLOR.rule}`,
  textAlign: 'center',
}
const actionTitleStyle: CSSProperties = {
  margin: '0 0 6px',
  color: COLOR.ink,
  fontSize: '16px',
  lineHeight: '24px',
}
const actionBodyStyle: CSSProperties = {
  margin: 0,
  color: COLOR.body,
  fontSize: '15px',
  lineHeight: '22px',
}
const appHostStyle: CSSProperties = {
  color: COLOR.ink,
  fontFamily: MONO,
  fontSize: '14px',
}
const footerStyle: CSSProperties = {
  ...columnStyle,
  paddingTop: '26px',
  textAlign: 'center',
}
const footerTextStyle: CSSProperties = {
  margin: '0 0 10px',
  color: COLOR.muted,
  fontSize: '13px',
  lineHeight: '20px',
}
const noLinksStyle: CSSProperties = { ...footerTextStyle, color: COLOR.ink }

// Mail clients turn anything shaped like a domain into a link. An invisible
// non-joiner after each dot defeats that, so the host stays something to
// type. (A zero-width space would become a visible space in the text part.)
export const ZERO_WIDTH_NON_JOINER = '\u200C'
const unlinkable = (value: string): string =>
  value.replaceAll('.', `.${ZERO_WIDTH_NON_JOINER}`)

export const EmailParagraph = ({
  children,
  centered = false,
}: {
  readonly children: ReactNode
  readonly centered?: boolean
}) => (
  <Text
    style={
      centered ? { ...paragraphStyle, textAlign: 'center' } : paragraphStyle
    }
  >
    {children}
  </Text>
)

/** A labelled fact such as "Expiry date: 22 Oct 2026". */
export const EmailDetail = ({
  label,
  value,
}: {
  readonly label: string
  readonly value: string
}) => (
  <Text style={detailStyle}>
    {label}: <span style={detailValueStyle}>{value}</span>
  </Text>
)

/** The manager app's host, rendered so mail clients cannot link it. */
export const AppHost = ({ context }: { readonly context: EmailContext }) => (
  <span style={appHostStyle}>{unlinkable(context.appHost)}</span>
)

export interface EmailAction {
  readonly title: string
  readonly body: ReactNode
}

interface EmailLayoutProps {
  readonly context: EmailContext
  readonly preview: string
  readonly heading: string
  /** The ENS name the email is about, shown as a chip under the heading. */
  readonly name?: string
  /** What to do next, written as directions rather than a link. */
  readonly action?: EmailAction
  /** Completes "You received this because …". */
  readonly reason: string
  readonly children: ReactNode
}

export const EmailLayout = ({
  context,
  preview,
  heading,
  name,
  action,
  reason,
  children,
}: EmailLayoutProps) => {
  const testnet = isTestnet(context)
  return (
    <Html lang="en">
      <Head>
        <meta
          name="format-detection"
          content="telephone=no, date=no, address=no, email=no, url=no"
        />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={columnStyle}>
            <Img
              src={context.logoUrl}
              alt="ENS"
              // Stops React hoisting a <link rel="preload" href> into <head>,
              // which would put a URL in the HTML besides the image itself.
              fetchPriority="low"
              width="96"
              height="30"
              style={testnet ? testnetLogoStyle : logoStyle}
            />
            {testnet && (
              <Text style={bannerRowStyle}>
                <span style={bannerStyle}>
                  {networkLabel(context)} testnet. These names have no real
                  value.
                </span>
              </Text>
            )}
            <Heading as="h1" style={headingStyle}>
              {heading}
            </Heading>
            {name && (
              <Text style={{ margin: '0 0 26px', textAlign: 'center' }}>
                <span
                  style={{
                    ...nameStyle,
                    backgroundColor: testnet ? COLOR.testnetName : COLOR.lapis,
                  }}
                >
                  {name}
                </span>
              </Text>
            )}
            {children}
          </Section>
          {action ? (
            <Section style={actionStyle}>
              <Text style={actionTitleStyle}>{action.title}</Text>
              <Text style={actionBodyStyle}>{action.body}</Text>
            </Section>
          ) : (
            <Section
              style={{
                marginTop: '30px',
                borderTop: `1px solid ${COLOR.rule}`,
              }}
            />
          )}
          <Section style={footerStyle}>
            <Text style={footerTextStyle}>
              You received this because {reason}. Manage notifications in the
              ENS app.
            </Text>
            <Text style={noLinksStyle}>
              ENS emails never contain links. If one does, it isn’t from us.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
