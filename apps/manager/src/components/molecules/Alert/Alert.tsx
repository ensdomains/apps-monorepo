import type { HTMLAttributes, ReactNode } from 'react'
import { match, P } from 'ts-pattern'
import {
  AlertDescription,
  AlertTitle,
  Alert as ShadcnAlert,
} from '@/components/ui/alert'
import { cn } from '@/lib/utils'

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'destructive' | 'success' | 'warning' | 'info'
  title?: string
  description?: ReactNode
  icon?: ReactNode
  children?: ReactNode
}

export const Alert = ({
  variant = 'default',
  title,
  description,
  icon,
  children,
  className,
  ...props
}: AlertProps) => {
  const getDefaultIcon = () => {
    return match(variant)
      .with('success', () => <CheckCircleIcon />)
      .with('destructive', () => <XCircleIcon />)
      .with('warning', () => <ExclamationIcon />)
      .with(P.union('info', 'default'), () => <InfoIcon />)
      .otherwise(() => null)
  }

  const displayIcon = icon || getDefaultIcon()

  const shadcnVariant =
    variant === 'success' || variant === 'warning' || variant === 'info'
      ? 'default'
      : variant

  return (
    <ShadcnAlert
      variant={shadcnVariant as 'default' | 'destructive'}
      className={cn(
        variant === 'success' && 'border-green-200 bg-green-50 text-green-800',
        variant === 'warning' &&
          'border-yellow-200 bg-yellow-50 text-yellow-800',
        variant === 'info' && 'border-blue-200 bg-blue-50 text-blue-800',
        className,
      )}
      {...props}
    >
      {displayIcon}

      <div>
        {title && <AlertTitle>{title}</AlertTitle>}

        {description && <AlertDescription>{description}</AlertDescription>}

        {children}
      </div>
    </ShadcnAlert>
  )
}

const CheckCircleIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="currentColor"
    className="h-4 w-4"
  >
    <title>Success</title>
    <path
      fillRule="evenodd"
      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
      clipRule="evenodd"
    />
  </svg>
)

const XCircleIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="currentColor"
    className="h-4 w-4"
  >
    <title>Error</title>
    <path
      fillRule="evenodd"
      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
      clipRule="evenodd"
    />
  </svg>
)

const ExclamationIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="currentColor"
    className="h-4 w-4"
  >
    <title>Warning</title>
    <path
      fillRule="evenodd"
      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
      clipRule="evenodd"
    />
  </svg>
)

const InfoIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="currentColor"
    className="h-4 w-4"
  >
    <title>Information</title>
    <path
      fillRule="evenodd"
      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
      clipRule="evenodd"
    />
  </svg>
)

Alert.displayName = 'Alert'
