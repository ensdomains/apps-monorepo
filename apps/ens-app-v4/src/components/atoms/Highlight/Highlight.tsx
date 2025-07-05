import { cn } from '@/lib/utils'

export const Highlight = ({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) => {
  return (
    <span
      className={cn(
        'bg-gray-800 text-white p-1.5 leading-ens-none rounded-md font-mono text-sm w-fit max-w-3/4 wrap-anywhere',
        className,
      )}
    >
      {children}
    </span>
  )
}
