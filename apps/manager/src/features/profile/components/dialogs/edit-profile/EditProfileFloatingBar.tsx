import { useLingui } from '@lingui/react/macro'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  type KeyboardEvent,
  type ReactNode,
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
  const [barHeight, setBarHeight] = useState<number>()

  useLayoutEffect(() => {
    const bar = barRef.current
    if (!bar) return

    const observer = new ResizeObserver(() => setBarHeight(bar.offsetHeight))
    observer.observe(bar)
    setBarHeight(bar.offsetHeight)

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (isOpen) editorRef.current?.focus({ preventScroll: true })
  }, [isOpen])

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || event.defaultPrevented || !isOpen) return

    onEscape()
  }

  const duration = shouldReduceMotion ? 0 : 0.35

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
        className="pointer-events-auto relative mx-auto w-full max-w-226.25 overflow-hidden border-ens-quartz-200 border-t bg-white shadow-[0_-3px_2px_rgba(220,220,220,0.25)] lg:landscape:rounded-xl lg:landscape:border-[0.25px] lg:landscape:border-ens-quartz-300 lg:landscape:shadow-[0_2px_6px_rgba(0,0,0,0.06)]"
        initial={false}
        transition={{ duration, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.div
          animate={{ opacity: isOpen ? 0 : 1 }}
          className={editBottomBarContentClassName}
          inert={isOpen}
          ref={barRef}
          transition={{
            delay: isOpen || shouldReduceMotion ? 0 : 0.2,
            duration: shouldReduceMotion ? 0 : 0.15,
          }}
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
              animate={{
                opacity: 1,
                transition: {
                  delay: shouldReduceMotion ? 0 : 0.2,
                  duration: shouldReduceMotion ? 0 : 0.2,
                },
              }}
              className="absolute inset-0 flex flex-col outline-none"
              exit={{
                opacity: 0,
                transition: { duration: shouldReduceMotion ? 0 : 0.15 },
              }}
              initial={{ opacity: 0 }}
              ref={editorRef}
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
