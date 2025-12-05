import type { ComponentProps, ReactNode } from 'react'
import { useId } from 'react'
import { cn } from '@/lib/utils'
import { tw } from '@/utils/tailwind'

/**
 * A repeating weave pattern SVG background.
 */
export const BgPattern = (props: React.SVGProps<SVGSVGElement>) => {
  const id = useId()
  return (
    <svg
      viewBox="0 0 200 200"
      width="100%"
      height="100%"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid slice"
      role="presentation"
      {...props}
    >
      <defs>
        <pattern
          id={`bg-weave-pattern-${id}`}
          width="200"
          height="200"
          patternUnits="userSpaceOnUse"
          patternContentUnits="userSpaceOnUse"
          patternTransform="scale(0.0156)"
        >
          <rect x="160" width="40" height="40" fill="currentColor" />
          <rect x="80" y="40" width="40" height="40" fill="currentColor" />
          <rect y="80" width="40" height="40" fill="currentColor" />
          <rect x="120" y="120" width="40" height="40" fill="currentColor" />
          <rect x="40" y="160" width="40" height="40" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#bg-weave-pattern-${id})`} />
    </svg>
  )
}

/**
 * A scalable chat bubble with a smooth curved tail at the bottom-left.
 * Based on the ENS design language.
 */
export const ChatBubble = ({
  children,
  className,
  kind = 'message',
  ...props
}: {
  children: ReactNode
  className?: string
  kind?: 'message' | 'reply'
} & Omit<ComponentProps<'div'>, 'children'>) => {
  // Tail dimensions (from the original SVG design)
  const tailWidth = 21
  const tailHeight = 14

  return (
    <div
      className={cn('relative inline-block', className)}
      style={{ marginBottom: tailHeight }}
      {...props}
    >
      {/* Main bubble */}
      <div
        className={tw`rounded-sm px-4 py-3 font-medium text-lg leading-ens-tight shadow-sm ${kind === 'message' ? 'bg-ens-white text-ens-gray' : 'bg-ens-lapis-core text-ens-white'}`}
      >
        {children}
      </div>

      {/* Tail SVG - positioned at the bottom */}
      <svg
        width={tailWidth}
        height={tailHeight}
        viewBox="0 0 21 14"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn(
          'absolute top-full',
          kind === 'message' ? 'left-3' : '-scale-x-100 right-3',
        )}
        style={{ marginTop: -0.5 }} // Slight overlap to prevent gap
        aria-hidden="true"
      >
        {/* 
          Path extracted from original design's tail portion.
          Starts at top-left, curves down into stem, curves at tip,
          then diagonals back up to top-right edge.
        */}
        <path
          d="M0 0C1.4386 0 2.6048 1.1662 2.6048 2.6048V9.9616C2.6048 12.2534 5.3511 13.4281 7.0085 11.8453L18.6574 0.721C19.142 0.2582 19.7863 0 20.4563 0Z"
          className={
            kind === 'message' ? 'fill-ens-white' : 'fill-ens-lapis-core'
          }
        />
      </svg>
    </div>
  )
}
