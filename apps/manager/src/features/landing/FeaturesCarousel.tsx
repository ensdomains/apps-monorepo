import clsx from 'clsx'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { motion, useMotionValue, useTransform } from 'motion/react'
import type { ComponentProps, ReactNode } from 'react'
import { useRef, useState } from 'react'
import card_1_1 from '@/assets/pages/landing/card-1-1.webp'
import card_1_2 from '@/assets/pages/landing/card-1-2.webp'
import card_1_3 from '@/assets/pages/landing/card-1-3.webp'
import { cn } from '@/lib/utils'
import { tw } from '@/utils/tailwind'
import { BgPattern, ChatBubble } from './components/primitives'

type FeatureCard = {
  title: ReactNode
  description: ReactNode
  className?: string
  indicatorClass: string
  children: ReactNode
}

const FEATURE_CARDS: FeatureCard[] = [
  {
    className: tw`bg-ens-peridot-dust text-ens-peridot-core`,
    indicatorClass: tw`border-ens-peridot-core data-active:bg-ens-peridot-core`,
    title: (
      <>
        One username <br />
        <span className="font-normal font-serif italic">everywhere</span>
      </>
    ),
    description: (
      <>
        Your name lives onchain — you own it, not a platform. Sign in to web3
        apps with your <span className="font-medium font-sans">.eth name</span>{' '}
        and your ENS profile will load automatically.
      </>
    ),
    children: (
      <>
        <div className="-z-10 absolute inset-0 overflow-hidden rounded-sm">
          <BgPattern className="opacity-90" />
          <div className="absolute inset-0 bg-linear-130 from-25% from-[#e4e5e4cc] to-110% to-[#92ad9acc]"></div>
        </div>

        <img
          src={card_1_2}
          alt="card-1-2"
          className="pointer-events-none absolute bottom-3 left-[27.5%] w-64"
        />
        <img
          src={card_1_1}
          alt="card-1-1"
          className="pointer-events-none absolute top-[22px] left-[22px] w-64"
        />
        <img
          src={card_1_3}
          alt="card-1-3"
          className="pointer-events-none absolute right-4 bottom-12 w-64"
        />
      </>
    ),
  },
  {
    className: tw`bg-ens-garnet-dust text-ens-garnet-core`,
    indicatorClass: tw`border-ens-garnet-core data-active:bg-ens-garnet-core`,
    title: <>Verify authenticity and stay safe.</>,
    description: (
      <>
        Companies and projects use ENS because it's secured with ethereum, so
        you can be sure it's the real deal. Avoid impersonation scams and stay
        safe out there &lt;3.
      </>
    ),
    children: (
      <>
        <div className="-z-10 absolute inset-0 overflow-hidden rounded-sm">
          <BgPattern className="opacity-90" />
          <div className="absolute inset-0 bg-linear-290 from-55% from-[#FFEFF6CC] to-130% to-[#F886B64D] opacity-90" />
        </div>

        <div className="absolute top-8 left-8 space-y-4">
          <div className="flex items-center gap-2">
            <div className="size-11 rounded-full bg-ens-garnet-surface"></div>
            <div className="rounded-md bg-ens-garnet-dense p-2 font-medium text-base text-white leading-ens-tight">
              support.company.eth
            </div>
          </div>

          <ChatBubble>Can you share your order number?</ChatBubble>
        </div>

        <div className="absolute right-8 bottom-8 space-y-4">
          <div className="flex items-center justify-end gap-2">
            <div className="size-11 rounded-full bg-ens-garnet-surface"></div>
            <div className="rounded-md bg-ens-garnet-dense p-2 font-medium text-base text-white leading-ens-tight">
              you.eth
            </div>
          </div>

          <ChatBubble kind="reply">
            No problem. I just checked your
            <br />
            ENS profile, you're legit! It's HGJLY ☺️
          </ChatBubble>
        </div>
      </>
    ),
  },
  {
    className: tw`bg-ens-lapis-dust text-ens-lapis-core`,
    indicatorClass: tw`border-ens-lapis-core data-active:bg-ens-lapis-core`,
    title: (
      <>
        A simpler way to
        <br />
        <span className="font-normal font-serif italic">get paid.</span>
      </>
    ),
    description: (
      <>
        Your ENS name replaces your wallet addresses so friends and clients can
        send money to <span className="font-medium font-sans">friend.eth</span>{' '}
        instead of a scary jumble of letters and numbers.
      </>
    ),
    children: (
      <>
        <div className="-z-10 absolute inset-0 overflow-hidden rounded-sm">
          <BgPattern className="opacity-30" />
          <div className="absolute inset-0 bg-linear-125 from-22% from-[#FEFEFE00] to-63% to-[#EDF1F2] opacity-80" />
        </div>

        <div className="absolute top-10 left-10 w-1/3 max-w-3xs">
          <div className="relative rounded-[6px] bg-ens-blue-midnight/50 p-4">
            <span className="block w-full bg-linear-90 from-white to-transparent bg-clip-text font-medium font-semi-mono text-sm text-transparent">
              0x0b08dA7068b73A579Bd5E8a8290f
            </span>
            <span className="-translate-1/2 absolute top-0 left-0 text-[32px] leading-none">
              🫣
            </span>
            <span className="-translate-y-1/2 absolute top-1/2 right-0 translate-x-[115%] text-[42px] leading-none">
              🫷
            </span>
          </div>
        </div>

        <div className="-translate-1/2 absolute top-[55%] left-1/2">
          <div className="relative rounded-[6px] bg-linear-90 from-ens-blue to-[#21B8FF] p-5">
            <span className="block w-full font-medium font-semi-mono text-[28px] text-white">
              friend.eth
            </span>
            <span className="-translate-1/2 absolute top-0 left-0 text-[44px] leading-none">
              😌
            </span>
            <span className="-translate-y-1/2 absolute top-1/2 right-0 translate-x-[115%] text-[44px] leading-none">
              🫶
            </span>
          </div>
        </div>
      </>
    ),
  },
]

const CarouselCard = ({
  data: { title, description },
  children,
  className,
  style,
  ...props
}: {
  data: {
    title: ReactNode
    description: ReactNode
  }
  children: ReactNode
} & ComponentProps<typeof motion.div>) => {
  const x = useMotionValue(0)
  const scale = useTransform(x, [-300, 0, 300], [0.9, 1, 0.9])
  const rotate = useTransform(x, [-300, 0, 300], [-12, 0, 12])

  return (
    <motion.div
      className={cn(
        'flex flex-none flex-col gap-4 overflow-hidden rounded-[8px] p-[22px]',
        className,
      )}
      style={{
        x,
        scale,
        rotate,
        ...style,
      }}
      {...props}
    >
      <h2 className="font-bold text-temp-32px leading-ens-none">{title}</h2>
      <p className="max-w-[350px] font-normal font-serif text-base leading-none">
        {description}
      </p>

      <div className="relative isolate mt-auto h-[320px]">{children}</div>
    </motion.div>
  )
}

export const FeaturesCarousel = () => {
  const [offset, setOffset] = useState(0)
  const constraintRef = useRef<HTMLDivElement>(null)

  function incrementOffset() {
    setOffset((offset + 1) % FEATURE_CARDS.length)
  }
  function decrementOffset() {
    setOffset((offset - 1 + FEATURE_CARDS.length) % FEATURE_CARDS.length)
  }

  return (
    <div className="relative mt-28">
      <div className="relative mx-auto w-full-[2rem] max-w-6xl">
        <div
          className="relative flex w-full [--s2-basis:90%] xl:[--s2-basis:70%]"
          ref={constraintRef}
        >
          {FEATURE_CARDS.map(({ children, className, ...data }, index) => {
            const cardIndex =
              (index - offset + FEATURE_CARDS.length) % FEATURE_CARDS.length
            return (
              <CarouselCard
                // biome-ignore lint/suspicious/noArrayIndexKey: Hardcoded list
                key={index}
                className={clsx(className, 'basis-(--s2-basis)')}
                data={data}
                style={{
                  zIndex: FEATURE_CARDS.length - cardIndex,
                  order: cardIndex,
                  position: 'relative',
                  right:
                    cardIndex === 0
                      ? undefined
                      : `calc((var(--s2-basis) - (100% - var(--s2-basis)) / ${FEATURE_CARDS.length - 1}) * ${cardIndex})`,
                }}
                layout="position"
                drag={cardIndex === 0 ? 'x' : false}
                dragConstraints={{
                  left: 0,
                  right: 0,
                }}
                onDragEnd={(_, info) => {
                  const constraintWidth =
                    constraintRef.current?.getBoundingClientRect().width ?? 0
                  const threshold = 0.125 * constraintWidth

                  if (
                    Math.abs(info.velocity.x) >= 50 ||
                    Math.abs(info.offset.x) > threshold
                  ) {
                    incrementOffset()
                  }
                }}
                onClick={() => setOffset(index)}
              >
                {children}
              </CarouselCard>
            )
          })}
        </div>
        {/* Prev button, dots for each slide, next button */}
        <div className="my-9 flex items-center justify-center gap-4 pb-4">
          <button type="button" onClick={decrementOffset}>
            <ChevronLeftIcon className="size-6" />
          </button>
          <div className="flex items-center justify-center gap-2">
            {FEATURE_CARDS.map(({ indicatorClass }, index) => {
              return (
                <button
                  type="button"
                  // biome-ignore lint/suspicious/noArrayIndexKey: Hardcoded list
                  key={index}
                  className={clsx(
                    'size-4 rounded-xs border-2 bg-transparent transition-colors',
                    indicatorClass,
                  )}
                  onClick={() => setOffset(index)}
                  data-active={index === offset ? true : undefined}
                ></button>
              )
            })}
          </div>
          <button type="button" onClick={incrementOffset}>
            <ChevronRightIcon className="size-6" />
          </button>
        </div>
      </div>
      <div className="-z-10 absolute inset-x-0 top-1/2 bottom-0 bg-white"></div>
    </div>
  )
}
