import { createElement, type JSX } from 'hono/jsx'
import { Github, type IconNode, Link, Mail, MapPin, Twitter } from 'lucide'
import { AvatarSize, COLORS } from './constants'

interface LucideProps extends JSX.HTMLAttributes {
  size?: string | number
  absoluteStrokeWidth?: boolean
}

export const LucideIcon = ({
  color = 'currentColor',
  size = 24,
  strokeWidth = 2,
  absoluteStrokeWidth,
  children,
  iconNode,
  ...rest
}: LucideProps & { iconNode: IconNode }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      width={size}
      height={size}
      stroke={color}
      strokeWidth={
        absoluteStrokeWidth
          ? (Number(strokeWidth) * 24) / Number(size)
          : strokeWidth
      }
      {...rest}
      // biome-ignore lint/correctness/noChildrenProp: Passing children to SVG is required to render custom icon nodes from Lucide.
      children={iconNode.map(([tag, attrs]) => createElement(tag, attrs))}
    />
  )
}

export type SocialRecords = {
  twitter?: string
  github?: string
  website?: string
  location?: string
  email?: string
}

export const AvatarCard = ({ src }: { src?: string }) => {
  if (!src) {
    return null
  }

  return (
    <div
      style={{
        width: `${AvatarSize}px`,
        height: `${AvatarSize}px`,
        borderRadius: '32px',
        overflow: 'hidden',
        background: COLORS.gray1,
        border: `6px solid ${COLORS.lightBlue}`,
        flexShrink: 0,
        display: 'flex',
      }}
    >
      <img
        src={src}
        alt="avatar"
        width={AvatarSize}
        height={AvatarSize}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </div>
  )
}

export const NameHeadline = ({
  text,
  fontSizePx,
  maxWidthPx,
}: {
  text: string
  fontSizePx: number
  maxWidthPx: number
}) => (
  <div
    style={{
      fontSize: `${fontSizePx}px`,
      letterSpacing: '-0.01em',
      wordBreak: 'break-all',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      maxWidth: `${maxWidthPx}px`,
      display: 'flex',
    }}
  >
    <span
      style={{
        fontWeight: 800,
        color: COLORS.blue,
        background: COLORS.lightBlue,
        padding: '8px 12px',
        borderRadius: '12px',
        lineHeight: 1.15,
      }}
    >
      {text}
    </span>
  </div>
)

export const DescriptionBlock = ({ text }: { text: string }) => (
  <div
    style={{
      fontSize: '28px',
      opacity: 0.95,
      maxWidth: '700px',
      lineClamp: 3,
      display: 'block',
    }}
  >
    {text}
  </div>
)

export const SocialPill = ({
  iconNode,
  text,
}: {
  iconNode: IconNode
  text: string
}) => (
  <div
    style={{
      fontSize: '24px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
    }}
  >
    <LucideIcon iconNode={iconNode} color={COLORS.gray1} />
    {text}
  </div>
)

export const SocialRow = ({ socials }: { socials: SocialRecords }) => (
  <div
    style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '4px' }}
  >
    {socials.twitter && (
      <SocialPill iconNode={Twitter} text={`twitter.com/${socials.twitter}`} />
    )}
    {socials.github && (
      <SocialPill iconNode={Github} text={`github.com/${socials.github}`} />
    )}
    {socials.website && <SocialPill iconNode={Link} text={socials.website} />}
    {socials.location && (
      <SocialPill iconNode={MapPin} text={socials.location} />
    )}
    {socials.email && <SocialPill iconNode={Mail} text={socials.email} />}
  </div>
)

export const HeaderBar = ({
  label,
  address,
}: {
  label: string
  address?: string
}) => (
  <div
    style={{
      width: '100%',
      height: '60px',
      background: COLORS.lightBlue,
      padding: '15px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}
  >
    <div
      style={{
        color: COLORS.gray1,
        fontSize: '20px',
        display: 'flex',
        maxWidth: '30%',
        flex: 0.5,
      }}
    >
      <span
        style={{
          padding: '4px 8px',
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          background: COLORS.blue,
          borderRadius: '6px',
        }}
      >
        {label}
      </span>
    </div>
    <div
      style={{
        color: COLORS.blue,
        flex: 1,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        textAlign: 'center',
        fontSize: '20px',
      }}
    >
      {address}
    </div>
    <div
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        flex: 0.5,
      }}
    >
      <svg
        width="27"
        height="30"
        viewBox="0 0 27 30"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="presentation"
      >
        <path
          d="M13.1462 0.278913L4.63718 13.9125C4.57045 14.0194 4.41541 14.0313 4.33263 13.9356C3.58353 13.0695 0.792738 9.38478 4.24606 6.02638C7.39723 2.96185 11.4109 0.776903 12.8985 0.021739C13.0672 -0.0639381 13.245 0.120657 13.1462 0.278913Z"
          fill={COLORS.blue}
        />
        <path
          d="M12.6757 29.9638C12.8455 30.0795 13.0547 29.8821 12.9409 29.7136C11.0403 26.8986 4.72241 17.5327 3.84967 16.1268C2.98885 14.74 1.29576 12.4354 1.15452 10.4636C1.14042 10.2668 0.860899 10.2268 0.790583 10.4119C0.677181 10.7105 0.556448 11.0668 0.443926 11.4738C-0.976575 16.6122 1.08643 22.0647 5.56683 25.1185L12.6757 29.9638V29.9638Z"
          fill={COLORS.blue}
        />
        <path
          d="M13.8445 29.7212L22.3536 16.0876C22.4203 15.9807 22.5753 15.9688 22.6581 16.0645C23.4072 16.9306 26.198 20.6153 22.7447 23.9737C19.5935 27.0382 15.5798 29.2232 14.0923 29.9783C13.9235 30.064 13.7457 29.8794 13.8445 29.7212Z"
          fill={COLORS.blue}
        />
        <path
          d="M14.3245 0.0346595C14.1547 -0.081084 13.9455 0.116303 14.0593 0.284867C15.9599 3.09978 22.2778 12.4657 23.1505 13.8716C24.0113 15.2584 25.7044 17.5631 25.8457 19.5348C25.8598 19.7316 26.1393 19.7716 26.2096 19.5865C26.323 19.288 26.4437 18.9316 26.5563 18.5246C27.9768 13.3862 25.9138 7.93375 21.4333 4.87996L14.3245 0.0346595Z"
          fill={COLORS.blue}
        />
      </svg>
    </div>
  </div>
)
