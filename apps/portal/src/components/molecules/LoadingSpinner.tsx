import { Spinner } from '@/components/ui/spinner'

export interface LoadingSpinnerProps {
  title?: string
}

export const LoadingSpinner = ({ title }: LoadingSpinnerProps) => {
  return (
    <div className="p-8 gap-4 flex flex-row items-center justify-start">
      <Spinner />
      {title && <p className="text-base font-medium text-gray-500">{title}</p>}
    </div>
  )
}
