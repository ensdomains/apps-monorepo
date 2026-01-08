import type { HTMLAttributes, ReactNode } from 'react'
import { match, P } from 'ts-pattern'
import { cn } from '@/lib/utils'

type TextElement =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'p'
  | 'span'
  | 'div'
type TextVariant =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'body'
  | 'bodySmall'
  | 'caption'
  | 'overline'
type TextColor =
  | 'primary'
  | 'secondary'
  | 'accent'
  | 'error'
  | 'success'
  | 'warning'
type TextAlign = 'left' | 'center' | 'right'
type TextWeight = 'regular' | 'medium' | 'bold' | 'black'

export interface TextProps extends HTMLAttributes<HTMLElement> {
  as?: TextElement
  variant?: TextVariant
  color?: TextColor
  align?: TextAlign
  weight?: TextWeight
  children: ReactNode
}

const variantClasses = {
  h1: 'text-4xl font-bold tracking-tight',
  h2: 'text-3xl font-semibold tracking-tight',
  h3: 'text-2xl font-semibold tracking-tight',
  h4: 'text-xl font-semibold tracking-tight',
  h5: 'text-lg font-semibold tracking-tight',
  h6: 'text-base font-semibold tracking-tight',
  body: 'text-base',
  bodySmall: 'text-sm',
  caption: 'text-xs',
  overline: 'text-xs uppercase tracking-widest font-medium',
}

const colorClasses = {
  primary: 'text-foreground',
  secondary: 'text-muted-foreground',
  accent: 'text-primary',
  error: 'text-destructive',
  success: 'text-green-600',
  warning: 'text-yellow-600',
}

const alignClasses = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
}

const weightClasses = {
  regular: 'font-normal',
  medium: 'font-medium',
  bold: 'font-bold',
  black: 'font-black',
}

export const Text = ({
  as,
  variant = 'body',
  color = 'primary',
  align = 'left',
  weight,
  children,
  className,
  ...props
}: TextProps) => {
  const Element = as || getSemanticElement(variant)

  const classes = cn(
    variantClasses[variant],
    colorClasses[color],
    alignClasses[align],
    weight && weightClasses[weight],
    className,
  )

  return (
    <Element className={classes} {...props}>
      {children}
    </Element>
  )
}

function getSemanticElement(variant: TextVariant): TextElement {
  return match<TextVariant, TextElement>(variant)
    .with(P.union('h1', 'h2', 'h3', 'h4', 'h5', 'h6'), (heading) => heading)
    .with(P.union('body', 'bodySmall'), () => 'p')
    .with(P.union('caption', 'overline'), () => 'span')
    .otherwise(() => 'p')
}

Text.displayName = 'Text'
