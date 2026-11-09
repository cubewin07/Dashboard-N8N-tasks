import { forwardRef, type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type DivProps = HTMLAttributes<HTMLDivElement>

export const Card = forwardRef<HTMLDivElement, DivProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('rounded-[var(--radius-card)] border border-border bg-surface text-foreground shadow-[var(--shadow-soft)]', className)} {...props} />
))
Card.displayName = 'Card'

export const CardHeader = forwardRef<HTMLDivElement, DivProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex flex-col gap-1 p-4 sm:p-5', className)} {...props} />
))
CardHeader.displayName = 'CardHeader'

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(({ className, ...props }, ref) => (
  <h3 ref={ref} className={cn('text-base font-semibold leading-tight', className)} {...props} />
))
CardTitle.displayName = 'CardTitle'

export const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
))
CardDescription.displayName = 'CardDescription'

export const CardContent = forwardRef<HTMLDivElement, DivProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('px-4 pb-4 sm:px-5 sm:pb-5', className)} {...props} />
))
CardContent.displayName = 'CardContent'

export const CardFooter = forwardRef<HTMLDivElement, DivProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex items-center gap-2 border-t border-border px-4 py-3 sm:px-5', className)} {...props} />
))
CardFooter.displayName = 'CardFooter'
