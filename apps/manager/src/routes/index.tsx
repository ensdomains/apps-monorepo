import { createFileRoute, useNavigate } from '@tanstack/react-router'
import clsx from 'clsx'
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  GithubIcon,
  GlobeIcon,
  MailIcon,
  PlaneIcon,
  TwitterIcon,
} from 'lucide-react'
import { motion } from 'motion/react'
import {
  type ComponentProps,
  type ReactNode,
  useId,
  useRef,
  useState,
} from 'react'
import card_1_1 from '@/assets/pages/landing/card-1-1.webp'
import card_1_2 from '@/assets/pages/landing/card-1-2.webp'
import card_1_3 from '@/assets/pages/landing/card-1-3.webp'
import { formatDashboardDate } from '@/features/dashboard/utils'
import { CheckAvailability } from '@/features/register/components/CheckAvailability/CheckAvailability'
import { cn } from '@/lib/utils'
import { tw, twm } from '@/utils/tailwind'

const BgPattern = (props: React.SVGProps<SVGSVGElement>) => {
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
const ChatBubble = ({
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

const CARDS: {
  title: ReactNode
  description: ReactNode
  className?: string
  indicatorClass: string
  children: ReactNode
}[] = [
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

const Section2Card = ({
  data: { title, description },
  children,
  className,
  ...props
}: {
  data: {
    title: ReactNode
    description: ReactNode
  }
  children: ReactNode
} & ComponentProps<typeof motion.div>) => {
  return (
    <motion.div
      className={cn(
        'flex flex-none flex-col gap-4 overflow-hidden rounded-[8px] p-[22px]',
        className,
      )}
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

const Section2 = () => {
  const [offset, setOffset] = useState(0)
  const constraintRef = useRef<HTMLDivElement>(null)

  function incrementOffset() {
    setOffset((offset + 1) % CARDS.length)
  }
  function decrementOffset() {
    setOffset((offset - 1 + CARDS.length) % CARDS.length)
  }
  return (
    <div className="relative mt-28 overflow-x-hidden">
      <div className="relative mx-auto w-full-[2rem] max-w-6xl">
        <div
          className="relative flex w-full [--s2-basis:80%] xl:[--s2-basis:70%]"
          ref={constraintRef}
        >
          {CARDS.map(({ children, className, ...data }, index) => {
            const cardIndex = (index - offset + CARDS.length) % CARDS.length
            return (
              <Section2Card
                // biome-ignore lint/suspicious/noArrayIndexKey: Hardcoded list
                key={index}
                className={clsx(className, 'basis-(--s2-basis)')}
                data={data}
                style={{
                  zIndex: CARDS.length - cardIndex,
                  order: cardIndex,
                  position: 'relative',
                  right:
                    cardIndex === 0
                      ? undefined
                      : `calc((var(--s2-basis) - (100% - var(--s2-basis)) / ${CARDS.length - 1}) * ${cardIndex})`,
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
              </Section2Card>
            )
          })}
        </div>
        {/* Prev button, dots for each slide, next button */}
        <div className="my-9 flex items-center justify-center gap-4">
          <button type="button" onClick={decrementOffset}>
            <ChevronLeftIcon className="size-6" />
          </button>
          <div className="flex items-center justify-center gap-2">
            {CARDS.map(({ indicatorClass }, index) => {
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

const COLOR_VARIANTS = {
  garnet: {
    bg: 'bg-[#FFEDF5]',
    border: 'border-[#FFEDF5]',
    bg2: 'bg-[#FBD5E7]',
    surface: {
      bg: 'bg-ens-garnet-surface',
      text: 'text-ens-garnet-surface',
    },
    core: {
      bg: 'bg-ens-garnet-core',
      text: 'text-ens-garnet-core',
    },
    dust: {
      bg: 'bg-ens-garnet-dust',
      text: 'text-ens-garnet-dust',
      border: 'border-ens-garnet-dust',
    },
  },
  lapis: {
    bg: 'bg-[#E3F1F5]',
    border: 'border-[#E3F1F5]',
    bg2: 'bg-sky-200',
    surface: {
      bg: 'bg-ens-lapis-surface',
      text: 'text-ens-lapis-surface',
    },
    core: {
      bg: 'bg-ens-lapis-core',
      text: 'text-ens-lapis-core',
    },
    dust: {
      bg: 'bg-ens-lapis-dust',
      text: 'text-ens-lapis-dust',
      border: 'border-ens-lapis-dust',
    },
  },
  peridot: {
    bg: 'bg-[#DEF3E4]',
    border: 'border-[#DEF3E4]',
    bg2: 'bg-[#CAE6D3]',
    surface: {
      bg: 'bg-ens-peridot-surface',
      text: 'text-ens-peridot-surface',
    },
    core: {
      bg: 'bg-ens-peridot-core',
      text: 'text-ens-peridot-core',
    },
    dust: {
      bg: 'bg-ens-peridot-dust',
      text: 'text-ens-peridot-dust',
      border: 'border-ens-peridot-dust',
    },
  },
}

const LandingProfileCard = ({
  name,
  avatarUrl,
  headerUrl,
  registeredDate,
  description,
  links,
  variant,
  className,
}: {
  name: string
  avatarUrl: string
  headerUrl: string
  registeredDate: Date
  description: string
  links: { icon: ReactNode; href: string; title: string }[]
  variant: 'garnet' | 'lapis' | 'peridot'
  className?: string
}) => {
  return (
    <div
      className={twm(
        'w-full overflow-hidden rounded-xl',
        COLOR_VARIANTS[variant].bg,
        className,
      )}
    >
      <div
        className={tw`relative mb-18 h-32 w-full ${COLOR_VARIANTS[variant].surface.bg}`}
      >
        <img
          src={avatarUrl}
          alt={name}
          className={tw`-bottom-1/2 absolute left-5 size-32 rounded-full border-4 ${COLOR_VARIANTS[variant].border}`}
        />
      </div>

      <div className="px-4 pb-4">
        <p
          className={tw`w-fit rounded-sm p-2.5 font-medium text-ens-white text-lg leading-ens-none ${COLOR_VARIANTS[variant].core.bg}`}
        >
          {name}
        </p>
        <p
          className={tw`mt-3 flex items-center gap-1.5 font-normal font-sans text-sm ${COLOR_VARIANTS[variant].surface.text}`}
        >
          <span>
            <CalendarIcon className="inline-block size-4" /> Registered{' '}
          </span>
          <span
            className={tw`font-medium ${COLOR_VARIANTS[variant].core.text}`}
          >
            {formatDashboardDate(registeredDate)}
          </span>
        </p>

        <p
          className={tw`mt-4 font-serif text-base leading-ens-none ${COLOR_VARIANTS[variant].core.text}`}
        >
          {description}
        </p>

        <div className={tw`my-4 h-px w-full ${COLOR_VARIANTS[variant].bg2}`} />
        <p
          className={tw`mb-3 font-medium text-lg ${COLOR_VARIANTS[variant].core.text}`}
        >
          links
        </p>
        <div className="flex flex-wrap gap-2">
          {links.map(({ icon, href, title }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={tw`flex items-center gap-1 rounded-sm p-2 ${COLOR_VARIANTS[variant].bg2}`}
            >
              <span
                className={tw`size-4 ${COLOR_VARIANTS[variant].surface.text}`}
              >
                {icon}
              </span>
              <span
                className={tw`font-normal ${COLOR_VARIANTS[variant].core.text}`}
              >
                {title}
              </span>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}

const Section3 = () => {
  return (
    <div className="mx-auto mt-20 mb-28 w-full-[4rem] max-w-6xl">
      <div className="space-y-6">
        <h2 className="font-medium text-ens-lapis-core text-temp-32px leading-ens-none">
          Look at these profiles
        </h2>
        <p className="max-w-md font-serif text-lg leading-ens-normal">
          Lorem ipsum, dolor sit amet consectetur adipisicing elit.
          Exercitationem, accusantium tenetur quasi aspernatur quos vero nostrum
          veritatis. Nemo nesciunt debitis ducimus nihil exercitationem, vero et
          earum maxime officiis quod sit.
        </p>
      </div>

      <div className="mt-20 flex gap-11 max-md:flex-col">
        <LandingProfileCard
          name="vitalik.eth"
          avatarUrl="https://enstate.rs/i/vitalik.eth"
          headerUrl="https://enstate.rs/h/vitalik.eth"
          registeredDate={new Date('2020-02-04')}
          description="mi pinxe lo crino tcati"
          links={[
            {
              icon: <TwitterIcon className="size-full" />,
              href: 'https://x.com/vitalikbuterin',
              title: '@VitalikButerin',
            },
            {
              icon: <GithubIcon className="size-full" />,
              href: 'https://github.com/vbuterin',
              title: 'vButerin',
            },
            {
              icon: <GlobeIcon className="size-full" />,
              href: 'https://vitalik.eth.limo',
              title: 'vitalik.eth.limo',
            },
          ]}
          variant="peridot"
        />
        <LandingProfileCard
          name="nick.eth"
          avatarUrl="https://enstate.rs/i/nick.eth"
          headerUrl="https://enstate.rs/h/nick.eth"
          registeredDate={new Date('2020-02-04')}
          description="Lead developer of ENS & Ethereum Foundation alum. Certified rat tickler. he/him."
          links={[
            {
              icon: <TwitterIcon className="size-full" />,
              href: 'https://x.com/nicksdjohnson',
              title: '@nicksdjohnson',
            },
            {
              icon: <GithubIcon className="size-full" />,
              href: 'https://github.com/arachnid',
              title: 'arachnid',
            },
            {
              icon: <MailIcon className="size-full" />,
              href: 'mailto:arachnied@notdot',
              title: 'arachnied@notdot',
            },
          ]}
          variant="lapis"
        />
        <LandingProfileCard
          name="erni.eth"
          avatarUrl="https://enstate.rs/i/erni.eth"
          headerUrl="https://enstate.rs/h/erni.eth"
          registeredDate={new Date('2020-02-04')}
          description="This is placeholder. Maybe I could make my profile really educational and it would make sense. Put Paris Hilton on here instead fr. "
          links={[
            {
              icon: <TwitterIcon className="size-full" />,
              href: 'https://x.com/erni_eth',
              title: '@erni_eth',
            },
            {
              icon: <MailIcon className="size-full" />,
              href: 'mailto:myemail.me.com',
              title: 'myemail.me.com',
            },
          ]}
          variant="garnet"
        />
      </div>
    </div>
  )
}

const Section4 = () => {
  return (
    <div className="mt-20 bg-white">
      <div className="mx-auto w-full-[4rem] max-w-6xl py-20">
        <div className="space-y-6">
          <h2 className="font-medium text-ens-lapis-core text-temp-32px leading-ens-none">
            These are all the places you can you your ENS name.
          </h2>
          <p className="max-w-md font-serif text-lg leading-ens-normal">
            Lorem ipsum dolor sit amet consectetur, adipisicing elit. Iste quia
            ad corrupti quasi, libero commodi, adipisci a voluptas fuga
            exercitationem quis ipsum sapiente quos repellendus modi, sunt ullam
            eligendi architecto?
          </p>
        </div>
      </div>
    </div>
  )
}

function IndexPage() {
  const navigate = useNavigate()

  return (
    <div>
      {/* First Section */}
      <div className="mx-auto mt-11 flex flex-col items-center">
        <h1 className="text-center text-temp-64px">
          <span className="font-normal text-ens-lapis-core">Claim your</span>
          <br />
          <span className="font-serif text-ens-lapis-dense italic">
            web3 username
          </span>
        </h1>
        <p className="mt-6 text-center font-normal text-ens-lapis-core text-temp-32px">
          A simple, portable identity that you control
        </p>
        <div className="mt-11 w-full max-w-3xl">
          <CheckAvailability
            onRegistrationComplete={(name) => {
              navigate({ to: '/register', search: { name } })
            }}
          />
        </div>
      </div>

      <Section2 />

      <Section3 />

      <Section4 />
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: IndexPage,
})
