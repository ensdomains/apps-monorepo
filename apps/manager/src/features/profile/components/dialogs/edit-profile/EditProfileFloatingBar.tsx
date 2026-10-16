import { useLingui } from '@lingui/react/macro'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { match } from 'ts-pattern'
import {
  editBottomBarContentClassName,
  profileBarActionsClassName,
} from '@/features/profile/components/view/ProfileAction.styles'
import { useIntercomClearance } from '@/hooks/useIntercomClearance'

const OPEN_HEIGHT_RATIO = 0.7

const getOpenHeight = () =>
  typeof window === 'undefined'
    ? 0
    : Math.round(window.innerHeight * OPEN_HEIGHT_RATIO)

const useOpenHeight = () => {
  const [openHeight, setOpenHeight] = useState(getOpenHeight)

  useEffect(() => {
    const handleResize = () => setOpenHeight(getOpenHeight())

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return openHeight
}

// Sequenced swap so content never travels across the screen: the old content
// fades out, the container resizes, then the new content fades in.
const FADE_OUT_DURATION = 0.12
const RESIZE_DURATION = 0.28
const FADE_IN_DELAY = FADE_OUT_DURATION + RESIZE_DURATION
const FADE_IN_DURATION = 0.15

const getHeightTransition = (isReducedMotion: boolean) =>
  isReducedMotion
    ? { duration: 0 }
    : {
        delay: FADE_OUT_DURATION,
        duration: RESIZE_DURATION,
        ease: [0.4, 0, 0.2, 1] as const,
      }

const getBarTransition = (isOpen: boolean, isReducedMotion: boolean) =>
  match({ isOpen, isReducedMotion })
    .with({ isReducedMotion: true }, () => ({ duration: 0 }))
    .with({ isOpen: true }, () => ({ duration: FADE_OUT_DURATION }))
    .otherwise(() => ({ delay: FADE_IN_DELAY, duration: FADE_IN_DURATION }))

const getFadeMotion = (isReducedMotion: boolean) => ({
  animate: {
    opacity: 1,
    transition: {
      delay: isReducedMotion ? 0 : FADE_IN_DELAY,
      duration: isReducedMotion ? 0 : FADE_IN_DURATION,
    },
  },
  exit: {
    opacity: 0,
    transition: { duration: isReducedMotion ? 0 : FADE_OUT_DURATION },
  },
  initial: { opacity: 0 },
})

const useMeasuredHeight = (ref: RefObject<HTMLElement | null>) => {
  const [height, setHeight] = useState<number>()

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    // Ignore the empty frame while swapped content is unmounted
    const updateHeight = () => {
      if (element.offsetHeight > 0) setHeight(element.offsetHeight)
    }
    const observer = new ResizeObserver(updateHeight)
    observer.observe(element)
    updateHeight()

    return () => observer.disconnect()
  }, [ref])

  return height
}

// Figma-spec card: the 12px radius, 0.25px border and layered shadows have no
// matching tokens. The open shadow is the elevated state while the editor is up.
const containerClassName =
  'pointer-events-auto relative mx-auto w-full max-w-97.5 overflow-hidden border-ens-quartz-200 border-t bg-white shadow-[0_-3px_2px_rgba(220,220,220,0.25)] transition-shadow duration-300 xs:rounded-xl xs:border-[0.25px] xs:border-ens-quartz-300 xs:border-solid xs:shadow-[0_2px_12px_rgba(0,0,0,0.06)] xs:data-[open=true]:shadow-[0_24px_64px_rgba(7,28,47,0.16)] xl:max-w-226.25'

// Figma-spec offset: the bar floats 30px above the bottom (plus the device
// safe area), which has no matching spacing token.
const sectionClassName =
  'pointer-events-none fixed inset-x-0 bottom-0 z-40 xs:bottom-[calc(30px+env(safe-area-inset-bottom,0px))] xs:px-4'

interface EditProfileFloatingBarProps {
  readonly children: ReactNode
  readonly isOpen: boolean
  readonly leftActions?: ReactNode
  readonly onEscape: () => void
  readonly rightActions: ReactNode
}

export const EditProfileFloatingBar = ({
  children,
  isOpen,
  leftActions,
  onEscape,
  rightActions,
}: EditProfileFloatingBarProps) => {
  const { t } = useLingui()
  const shouldReduceMotion = useReducedMotion()
  const openHeight = useOpenHeight()
  const barRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const barHeight = useMeasuredHeight(barRef)
  const [section, setSection] = useState<HTMLElement | null>(null)
  useIntercomClearance(section)

  useEffect(() => {
    if (isOpen) editorRef.current?.focus({ preventScroll: true })
  }, [isOpen])

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || event.defaultPrevented || !isOpen) return

    onEscape()
  }

  const isReducedMotion = !!shouldReduceMotion
  const heightTransition = getHeightTransition(isReducedMotion)
  const barTransition = getBarTransition(isOpen, isReducedMotion)
  const fadeMotion = getFadeMotion(isReducedMotion)

  return (
    <section
      aria-label={t`Profile actions`}
      className={sectionClassName}
      onKeyDown={handleKeyDown}
      ref={setSection}
    >
      <motion.div
        animate={{
          height: isOpen ? openHeight : (barHeight ?? 'auto'),
        }}
        className={containerClassName}
        data-open={isOpen}
        initial={false}
        transition={heightTransition}
      >
        <motion.div
          animate={{ opacity: isOpen ? 0 : 1 }}
          inert={isOpen}
          ref={barRef}
          transition={barTransition}
        >
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              animate={fadeMotion.animate}
              className={editBottomBarContentClassName}
              exit={fadeMotion.exit}
              initial={fadeMotion.initial}
              key={leftActions ? 'bar' : 'preview'}
            >
              {leftActions ? (
                <div className={profileBarActionsClassName}>{leftActions}</div>
              ) : null}
              <div className="flex min-w-0 flex-1 items-center justify-end gap-3 xl:ml-auto xl:flex-none">
                {rightActions}
              </div>
            </motion.div>
          </AnimatePresence>
        </motion.div>

        <AnimatePresence>
          {isOpen ? (
            <motion.div
              animate={fadeMotion.animate}
              className="absolute inset-x-0 bottom-0 flex flex-col outline-none focus-visible:ring-2 focus-visible:ring-ens-lapis-500 focus-visible:ring-inset"
              exit={fadeMotion.exit}
              initial={fadeMotion.initial}
              ref={editorRef}
              style={{ height: openHeight }}
              tabIndex={-1}
            >
              {children}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </section>
  )
}
