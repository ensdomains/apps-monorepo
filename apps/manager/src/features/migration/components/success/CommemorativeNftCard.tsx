import {
  type IconType,
  SiDiscord,
  SiOpensea,
  SiTelegram,
  SiX,
} from '@icons-pack/react-simple-icons'
import { Trans } from '@lingui/react/macro'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import { MSymbol } from '@/components/ui/material-symbol'
import arrowRightUrl from './assets/arrow-right.svg'
import ensMarkUrl from './assets/ens-mark.svg'
import type {
  MigrationSuccessDialogState,
  MigrationSuccessShareUrls,
} from './MigrationSuccessDialog.types'

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const formatMigrationDate = (date: Date) =>
  dateFormatter.format(date).replaceAll('/', '.')

type SocialControlProps = {
  readonly href?: string
  readonly icon: IconType
  readonly children: ReactNode
}

const SocialControl = ({ href, icon: Icon, children }: SocialControlProps) => {
  const className =
    'flex size-9 items-center justify-center rounded-full bg-white/[0.88] transition-opacity'

  if (href) {
    return (
      <a
        className={`${className} hover:opacity-75`}
        href={href}
        rel="noreferrer"
        target="_blank"
      >
        <Icon aria-hidden className="size-5 text-ens-garnet-500" />
        <span className="sr-only">{children}</span>
      </a>
    )
  }

  return (
    <button
      className={`${className} cursor-not-allowed`}
      disabled
      type="button"
    >
      <Icon aria-hidden className="size-5 text-ens-garnet-500" />
      <span className="sr-only">{children}</span>
    </button>
  )
}

const SharingRail = ({
  marketplaceUrl,
  shareUrls,
}: {
  readonly marketplaceUrl?: string
  readonly shareUrls?: MigrationSuccessShareUrls
}) => (
  <div className="absolute top-[8.25px] left-[256px] z-10 flex flex-col gap-1">
    <SocialControl href={shareUrls?.x} icon={SiX}>
      <Trans>Share on X</Trans>
    </SocialControl>
    <SocialControl href={shareUrls?.telegram} icon={SiTelegram}>
      <Trans>Share on Telegram</Trans>
    </SocialControl>
    <SocialControl href={shareUrls?.discord} icon={SiDiscord}>
      <Trans>Share on Discord</Trans>
    </SocialControl>
    <SocialControl href={marketplaceUrl} icon={SiOpensea}>
      <Trans>View on OpenSea</Trans>
    </SocialControl>
    <button
      className="flex size-9 items-center justify-center rounded-full bg-white/[0.88] transition-opacity enabled:hover:opacity-75 disabled:cursor-not-allowed"
      disabled={!shareUrls?.copy}
      onClick={() => {
        if (shareUrls?.copy) {
          void navigator.clipboard.writeText(shareUrls.copy)
        }
      }}
      type="button"
    >
      <MSymbol
        className="ms-wght-500 text-[20px] text-ens-garnet-500"
        symbol="content_copy"
      />
      <span className="sr-only">
        <Trans>Copy link</Trans>
      </span>
    </button>
  </div>
)

const RenderingCard = () => {
  const shouldReduceMotion = useReducedMotion()

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="absolute top-0 left-0 z-10 flex h-[295.348px] w-[228.737px] items-center justify-center"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      key="rendering"
    >
      <div className="relative h-[270.472px] w-[191.626px] rotate-[-8.32deg] overflow-hidden rounded-[16.967px] bg-[#f53293] shadow-[0_4px_19.4px_white]">
        <motion.div
          animate={
            shouldReduceMotion
              ? undefined
              : {
                  rotate: [-3.696, 5.592, 5.592],
                  x: [17.641, 22.742, 22.742],
                  y: [-1.139, -439.79, -439.79],
                  filter: [
                    'blur(55px)',
                    'blur(25px)',
                    'blur(25px)',
                    'blur(25px)',
                  ],
                }
          }
          className="absolute top-[286.11px] left-[-88.23px] flex h-[171.99px] w-[301.827px] items-center justify-center"
          initial={{
            rotate: -3.696,
            x: 17.641,
            y: -1.139,
            filter: 'blur(55px)',
          }}
          transition={
            shouldReduceMotion
              ? undefined
              : {
                  rotate: {
                    duration: 2,
                    times: [0, 0.8926, 1],
                    ease: [[0.5, 0, 0.5, 1], 'linear'],
                    repeat: Number.POSITIVE_INFINITY,
                  },
                  x: {
                    duration: 2,
                    times: [0, 0.8926, 1],
                    ease: 'linear',
                    repeat: Number.POSITIVE_INFINITY,
                  },
                  y: {
                    duration: 2,
                    times: [0, 0.8926, 1],
                    ease: 'linear',
                    repeat: Number.POSITIVE_INFINITY,
                  },
                  filter: {
                    duration: 2,
                    times: [0, 0.8925, 0.9999, 1],
                    ease: [[0.5, 0, 0.5, 1], 'linear', 'linear'],
                    repeat: Number.POSITIVE_INFINITY,
                  },
                }
          }
        >
          <div className="h-[306.677px] w-[52.651px] rotate-[66.19deg] bg-white blur-[50px]" />
        </motion.div>
        <span className="absolute inset-0 flex items-center justify-center text-[#f53293] text-[14px] leading-[1.2] tracking-[0.14px]">
          <Trans>Rendering</Trans>
        </span>
      </div>
    </motion.div>
  )
}

const ReadyCard = ({
  state,
}: {
  readonly state: Extract<MigrationSuccessDialogState, { status: 'ready' }>
}) => (
  <motion.div
    animate={{ opacity: 1 }}
    aria-label="Commemorative ENS NFT preview"
    className="absolute top-0 left-0 z-10 flex h-[295.348px] w-[228.737px] items-center justify-center"
    initial={{ opacity: 0 }}
    key="ready"
    role="img"
    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
  >
    <div className="relative h-[270.472px] w-[191.626px] rotate-[-5.12deg] overflow-hidden rounded-[16.967px] bg-[#006ee6] drop-shadow-[0_5.678px_4.117px_rgba(90,0,36,0.3)]">
      <img
        alt=""
        className="pointer-events-none absolute top-0 left-[-7.03%] h-full w-[141.41%] max-w-none select-none"
        draggable={false}
        src={state.artworkUrl}
      />
      <span className="absolute top-[5.49px] left-[3.49px] font-medium font-mono text-[#e1e1e0] text-[5.988px] leading-[1.05] tracking-[0.1198px]">
        {formatMigrationDate(state.migratedAt)}
      </span>
      <span className="absolute top-[73.86px] left-[26.45px] font-medium font-mono text-[#11ff5d] text-[5.988px] leading-[1.05] tracking-[0.1198px]">
        ENS v2
      </span>
      <span className="absolute top-[97.31px] left-[26.45px] font-medium font-mono text-[#11ff5d] text-[5.988px] leading-[1.05] tracking-[0.1198px]">
        NFT
      </span>
      <span className="absolute top-[199.11px] left-[115.77px] whitespace-nowrap font-mono text-[5.988px] text-white leading-[1.05] tracking-[0.1198px]">
        <Trans>YOU have migrated</Trans>
      </span>
      <span className="absolute top-[216.08px] left-[103.3px] whitespace-nowrap font-semi-mono text-[5.988px] text-white leading-[1.05] tracking-[0.1198px]">
        <span className="font-medium text-[#11ff5d]">
          {state.migratedNameCount}
        </span>{' '}
        {state.migratedNameCount === 1 ? (
          <Trans>name</Trans>
        ) : (
          <Trans>names</Trans>
        )}
      </span>
      <span className="absolute top-[249.51px] left-[65.87px] whitespace-nowrap font-semi-mono text-[5.988px] text-white leading-[1.05] tracking-[0.1198px]">
        <Trans>welcome to a new era of</Trans>{' '}
        <span className="text-[#11ff5d]">ENS</span>
      </span>
      <img
        alt=""
        className="absolute top-[246.52px] left-[164.18px] w-[9.981px]"
        src={ensMarkUrl}
      />
    </div>
  </motion.div>
)

export const CommemorativeNftCard = ({
  state,
}: {
  readonly state: MigrationSuccessDialogState
}) => (
  <div className="relative h-[295.348px] w-[300px] shrink-0">
    <SharingRail
      marketplaceUrl={
        state.status === 'ready' ? state.marketplaceUrl : undefined
      }
      shareUrls={state.status === 'ready' ? state.shareUrls : undefined}
    />
    <AnimatePresence initial={false} mode="wait">
      {state.status === 'rendering' ? (
        <RenderingCard key="rendering" />
      ) : (
        <ReadyCard key="ready" state={state} />
      )}
    </AnimatePresence>
  </div>
)

export { arrowRightUrl }
