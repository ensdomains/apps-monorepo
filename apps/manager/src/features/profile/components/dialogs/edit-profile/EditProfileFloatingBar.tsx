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
import {
  editBottomBarContentClassName,
  profileBarActionsClassName,
} from '@/features/profile/components/view/ProfileAction.styles'

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

const getHeightTransition = (isOpen: boolean, reduced: boolean) => {
  if (reduced) return { duration: 0 }

  return isOpen
    ? { type: 'spring' as const, stiffness: 300, damping: 30, mass: 0.8 }
    : { type: 'spring' as const, stiffness: 380, damping: 38, mass: 0.7 }
}

const getBarMotion = (isOpen: boolean, reduced: boolean) => ({
  animate: {
    filter: isOpen ? 'blur(6px)' : 'blur(0px)',
    opacity: isOpen ? 0 : 1,
    scale: isOpen ? 0.97 : 1,
  },
  transition: {
    delay: isOpen || reduced ? 0 : 0.1,
    duration: reduced ? 0 : isOpen ? 0.1 : 0.14,
    ease: 'easeOut' as const,
  },
})

const getEditorMotion = (reduced: boolean) => ({
  animate: {
    filter: 'blur(0px)',
    opacity: 1,
    y: 0,
    transition: {
      delay: reduced ? 0 : 0.07,
      duration: reduced ? 0 : 0.3,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  },
  exit: {
    filter: reduced ? 'blur(0px)' : 'blur(4px)',
    opacity: 0,
    y: reduced ? 0 : 16,
    transition: { duration: reduced ? 0 : 0.1 },
  },
  initial: {
    filter: reduced ? 'blur(0px)' : 'blur(8px)',
    opacity: 0,
    y: reduced ? 0 : 24,
  },
})

const useMeasuredHeight = (ref: RefObject<HTMLElement | null>) => {
  const [height, setHeight] = useState<number>()

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new ResizeObserver(() => setHeight(element.offsetHeight))
    observer.observe(element)
    setHeight(element.offsetHeight)

    return () => observer.disconnect()
  }, [ref])

  return height
}

// Figma-spec card: the 12px radius, 0.25px border and layered shadows have no
// matching tokens. The open shadow is the elevated state while the editor is up.
const containerClassName =
  'pointer-events-auto relative mx-auto w-full max-w-226.25 overflow-hidden border-ens-quartz-200 border-t bg-white shadow-[0_-3px_2px_rgba(220,220,220,0.25)] transition-shadow duration-300 lg:landscape:rounded-xl lg:landscape:border-[0.25px] lg:landscape:border-ens-quartz-300 lg:landscape:border-solid lg:landscape:shadow-[0_2px_12px_rgba(0,0,0,0.06)] lg:landscape:data-[open=true]:shadow-[0_24px_64px_rgba(7,28,47,0.16)]'

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

  useEffect(() => {
    if (isOpen) editorRef.current?.focus({ preventScroll: true })
  }, [isOpen])

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || event.defaultPrevented || !isOpen) return

    onEscape()
  }

  const reduced = !!shouldReduceMotion
  const heightTransition = getHeightTransition(isOpen, reduced)
  const barMotion = getBarMotion(isOpen, reduced)
  const editorMotion = getEditorMotion(reduced)

  return (
    <section
      aria-label={t`Profile actions`}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 lg:landscape:bottom-[calc(30px+env(safe-area-inset-bottom,0px))] lg:landscape:px-4"
      onKeyDown={handleKeyDown}
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
          animate={barMotion.animate}
          className={editBottomBarContentClassName}
          inert={isOpen}
          ref={barRef}
          style={{ transformOrigin: 'bottom center' }}
          transition={barMotion.transition}
        >
          {leftActions ? (
            <div className={profileBarActionsClassName}>{leftActions}</div>
          ) : null}
          <div className="flex min-w-0 flex-1 items-center justify-end gap-3 lg:landscape:ml-auto lg:landscape:flex-none">
            {rightActions}
          </div>
        </motion.div>

        <AnimatePresence>
          {isOpen ? (
            <motion.div
              animate={editorMotion.animate}
              className="absolute inset-x-0 bottom-0 flex flex-col outline-none focus-visible:ring-2 focus-visible:ring-ens-lapis-500 focus-visible:ring-inset"
              exit={editorMotion.exit}
              initial={editorMotion.initial}
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
