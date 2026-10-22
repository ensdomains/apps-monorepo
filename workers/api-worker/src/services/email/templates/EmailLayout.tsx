/** @jsxImportSource react */
import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components'
import type { CSSProperties, ReactNode } from 'react'
import { type EmailContext, isTestnet, networkLabel } from '../context.js'

// Values from the manager app's theme (quartz greys, signal danger). Only what
// every mail client renders is relied on: table layout, background colours,
// borders and two font weights. Rounded corners and the shadow are extras that
// Outlook and Gmail drop, so the border is what separates the card.
const COLOR = {
  ink: '#191919',
  body: '#515151',
  muted: '#7d7d7d',
  rule: '#ebeae8',
  canvas: '#faf9f7',
  cardBorder: '#e3e2df',
  danger: '#c82e1f',
  testnetText: '#674d49',
  testnetBackground: '#f8f6d6',
} as const
// Mail clients do not load ENS's own fonts reliably, so the layout is designed
// for the web-safe faces it falls back to. Bold is 700: a 500 weight renders
// as regular in Arial.
const SANS = 'Helvetica, Arial, sans-serif'
const MONO = "Menlo, Consolas, 'Courier New', monospace"
const CARD_WIDTH = 552
const GUTTER = '32px'

const bodyStyle: CSSProperties = {
  margin: 0,
  backgroundColor: COLOR.canvas,
  fontFamily: SANS,
  color: COLOR.ink,
}
const containerStyle: CSSProperties = {
  maxWidth: `${CARD_WIDTH}px`,
  margin: '0 auto',
  padding: '28px 12px 32px',
}
const cardStyle: CSSProperties = {
  backgroundColor: '#ffffff',
  border: `1px solid ${COLOR.cardBorder}`,
  borderRadius: '12px',
  borderCollapse: 'separate',
  boxShadow: '0 4px 24px rgba(7, 28, 47, 0.07)',
}
// The app's testnet notice colours, which read on every theme's header.
// Outlook drops the rounding and padding and shows a highlighted label instead.
const testnetPillStyle: CSSProperties = {
  display: 'inline-block',
  padding: '3px 10px',
  borderRadius: '999px',
  backgroundColor: COLOR.testnetBackground,
  color: COLOR.testnetText,
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.06em',
  lineHeight: '16px',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
}
const logoStyle: CSSProperties = { display: 'block', border: 0 }
// Fluid so the header scales down on phones; the width attribute keeps
// Outlook, which ignores max-width, at the card's width.
const patternStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  maxWidth: '550px',
  height: 'auto',
  border: 0,
}
const nameStyle: CSSProperties = {
  margin: 0,
  padding: `0 ${GUTTER} 24px`,
  color: '#ffffff',
  fontFamily: MONO,
  fontSize: '26px',
  lineHeight: '32px',
  wordBreak: 'break-all',
}
const contentStyle: CSSProperties = { padding: `28px ${GUTTER} 30px` }
const headingStyle: CSSProperties = {
  margin: '0 0 12px',
  color: COLOR.ink,
  fontFamily: SANS,
  fontSize: '26px',
  fontWeight: 400,
  lineHeight: '32px',
}
const subheadingStyle: CSSProperties = {
  margin: '0 0 8px',
  color: COLOR.ink,
  fontSize: '16px',
  fontWeight: 700,
  lineHeight: '24px',
}
// Long ENS names repeat inside sentences; break them only where they would
// overflow, so ordinary words still wrap whole.
const wrapLongWords: CSSProperties = {
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
}
const paragraphStyle: CSSProperties = {
  ...wrapLongWords,
  margin: '0 0 14px',
  color: COLOR.body,
  fontSize: '16px',
  lineHeight: '24px',
}
const factsStyle: CSSProperties = {
  margin: '22px 0 26px',
  borderBottom: `1px solid ${COLOR.rule}`,
}
const factCellStyle: CSSProperties = {
  padding: '11px 0',
  borderTop: `1px solid ${COLOR.rule}`,
  fontSize: '15px',
  lineHeight: '22px',
  verticalAlign: 'top',
}
const factLabelStyle: CSSProperties = { ...factCellStyle, color: COLOR.muted }
const monoValueStyle: CSSProperties = {
  fontFamily: MONO,
  fontSize: '14px',
  wordBreak: 'break-all',
}
const stepNumberStyle: CSSProperties = {
  width: '22px',
  padding: '0 0 8px',
  color: COLOR.muted,
  fontSize: '16px',
  lineHeight: '24px',
  verticalAlign: 'top',
}
const stepTextStyle: CSSProperties = {
  ...wrapLongWords,
  padding: '0 0 8px',
  color: COLOR.body,
  fontSize: '16px',
  lineHeight: '24px',
}
const appHostStyle: CSSProperties = {
  color: COLOR.ink,
  fontFamily: MONO,
  fontSize: '15px',
}
const codeStyle: CSSProperties = {
  margin: '4px 0 16px',
  color: COLOR.ink,
  fontFamily: MONO,
  fontSize: '44px',
  letterSpacing: '6px',
  lineHeight: '52px',
}
const footerStyle: CSSProperties = { padding: '20px 4px 0' }
const footerTextStyle: CSSProperties = {
  ...wrapLongWords,
  margin: '0 0 8px',
  color: COLOR.muted,
  fontSize: '13px',
  lineHeight: '20px',
}
const trustStyle: CSSProperties = { ...footerTextStyle, color: COLOR.ink }

/**
 * Marks a row whose cells read side by side, so the plain-text part keeps a
 * gap between them instead of running "Expires" into its date.
 */
export const TEXT_COLUMNS_CLASS = 'text-columns'

// Mail clients turn anything shaped like a domain into a link. An invisible
// non-joiner after each dot defeats that, so the host stays something to
// type. (A zero-width space would become a visible space in the text part.)
export const ZERO_WIDTH_NON_JOINER = '‌'
const unlinkable = (value: string): string =>
  value.replaceAll('.', `.${ZERO_WIDTH_NON_JOINER}`)

/** The manager app's host, rendered so mail clients cannot link it. */
export const AppHost = ({
  context,
  quiet = false,
}: {
  readonly context: EmailContext
  /** In running small print, without the monospaced emphasis. */
  readonly quiet?: boolean
}) => (
  <span style={quiet ? undefined : appHostStyle}>
    {unlinkable(context.appHost)}
  </span>
)

export const EmailParagraph = ({
  children,
}: {
  readonly children: ReactNode
}) => <Text style={paragraphStyle}>{children}</Text>

export const EmailSubheading = ({
  children,
  color = COLOR.ink,
}: {
  readonly children: ReactNode
  readonly color?: string
}) => <Text style={{ ...subheadingStyle, color }}>{children}</Text>

/** A labelled fact such as "Expires: 22 Oct 2026, 18:00 UTC". */
export interface EmailFact {
  readonly label: string
  readonly value: string
  /** Bold, for the date the reader has to act by. */
  readonly emphasis?: boolean
  /** Monospaced, for addresses and hashes. */
  readonly mono?: boolean
}

const factValueStyle = (fact: EmailFact): CSSProperties => ({
  color: COLOR.ink,
  fontWeight: fact.emphasis ? 700 : 400,
  ...(fact.mono ? monoValueStyle : {}),
})

/**
 * Facts as ruled rows. Short values sit beside their label; long ones (`stacked`)
 * go underneath so addresses get the full width.
 */
export const EmailFacts = ({
  facts,
  stacked = false,
}: {
  readonly facts: readonly EmailFact[]
  readonly stacked?: boolean
}) => (
  <Section style={factsStyle}>
    {facts.map((fact) =>
      stacked ? (
        <Row key={fact.label}>
          <Column style={factLabelStyle}>
            {fact.label}
            <br />
            <span style={factValueStyle(fact)}>{fact.value}</span>
          </Column>
        </Row>
      ) : (
        <Row key={fact.label} className={TEXT_COLUMNS_CLASS}>
          <Column style={factLabelStyle}>{fact.label}</Column>
          <Column
            align="right"
            style={{ ...factCellStyle, ...factValueStyle(fact) }}
          >
            {fact.value}
          </Column>
        </Row>
      ),
    )}
  </Section>
)

/**
 * Directions to the app, written to be typed rather than clicked: the first
 * step is always the address, the last is what to do once there.
 */
export const EmailAppSteps = ({
  context,
  title,
  lastStep,
}: {
  readonly context: EmailContext
  readonly title: string
  readonly lastStep: ReactNode
}) => {
  const steps = [
    <>
      Type <AppHost context={context} /> into your browser’s address bar. Don’t
      search for it, as search ads can impersonate ENS.
    </>,
    lastStep,
  ]
  return (
    <>
      <EmailSubheading>{title}</EmailSubheading>
      <Section>
        {steps.map((step, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the steps are a fixed, ordered list
          <Row key={index} className={TEXT_COLUMNS_CLASS}>
            <Column style={stepNumberStyle}>{index + 1}.</Column>
            <Column style={stepTextStyle}>{step}</Column>
          </Row>
        ))}
      </Section>
    </>
  )
}

export const EmailWarning = ({
  title,
  children,
}: {
  readonly title: string
  readonly children: ReactNode
}) => (
  <>
    <EmailSubheading color={COLOR.danger}>{title}</EmailSubheading>
    <Text style={{ ...paragraphStyle, margin: 0 }}>{children}</Text>
  </>
)

export const EmailCode = ({ code }: { readonly code: string }) => (
  <Text style={codeStyle}>{code}</Text>
)

export const emphasis = (value: string): ReactNode => (
  <b style={{ color: COLOR.ink }}>{value}</b>
)

interface EmailLayoutProps {
  readonly context: EmailContext
  readonly preview: string
  readonly heading: string
  /** Header colour: the name's profile theme, or grace. */
  readonly themeColor: string
  /** The ENS name the email is about, set in the header. */
  readonly name?: string
  /** Completes "You got this because …". */
  readonly reason: string
  /** False for one-off emails, which have no setting to turn off. */
  readonly canOptOut?: boolean
  readonly children: ReactNode
}

export const EmailLayout = ({
  context,
  preview,
  heading,
  themeColor,
  name,
  reason,
  canOptOut = true,
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
          <Section style={cardStyle}>
            <Row>
              {/* The colour is a cell background, not part of an image, so the
                  header keeps its theme when images are blocked. */}
              <Column
                style={{
                  backgroundColor: themeColor,
                  borderRadius: '11px 11px 0 0',
                }}
              >
                <Section>
                  <Row className={TEXT_COLUMNS_CLASS}>
                    <Column style={{ padding: `22px 0 0 ${GUTTER}` }}>
                      <Img
                        src={context.logoUrl}
                        alt="ENS"
                        // Stops React hoisting a <link rel="preload" href>
                        // into <head>, which would put a URL in the HTML
                        // besides the image itself.
                        fetchPriority="low"
                        width="72"
                        height="22"
                        style={logoStyle}
                      />
                    </Column>
                    {testnet && (
                      <Column
                        align="right"
                        style={{ padding: `22px ${GUTTER} 0 0` }}
                      >
                        <span style={testnetPillStyle}>
                          {networkLabel(context)} testnet
                        </span>
                      </Column>
                    )}
                  </Row>
                  <Row>
                    <Column style={{ padding: '6px 0 0' }}>
                      <Img
                        src={context.patternUrl}
                        alt=""
                        fetchPriority="low"
                        width="550"
                        height="66"
                        style={patternStyle}
                      />
                    </Column>
                  </Row>
                  <Row>
                    {name ? (
                      <Column style={nameStyle}>{name}</Column>
                    ) : (
                      <Column style={{ height: '20px' }} />
                    )}
                  </Row>
                </Section>
              </Column>
            </Row>
            <Row>
              <Column style={contentStyle}>
                <Heading as="h1" style={headingStyle}>
                  {heading}
                </Heading>
                {children}
              </Column>
            </Row>
          </Section>
          <Section style={footerStyle}>
            <Text style={trustStyle}>
              ENS emails never contain links or buttons. If an email that looks
              like ours asks you to click something, it’s a scam.
            </Text>
            {testnet && (
              <Text style={footerTextStyle}>
                Sent from the {networkLabel(context)} testnet. Names there have
                no real value, and testnet data can be reset at any time.
              </Text>
            )}
            <Text style={footerTextStyle}>
              You got this because {reason}.
              {canOptOut && (
                <>
                  {' '}
                  To stop these emails, go to{' '}
                  <AppHost context={context} quiet /> and open Notification
                  Settings.
                </>
              )}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
