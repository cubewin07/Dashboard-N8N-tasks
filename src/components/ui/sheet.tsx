import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type HTMLAttributes } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/i18n'

export const Sheet = DialogPrimitive.Root
export const SheetTrigger = DialogPrimitive.Trigger
export const SheetClose = DialogPrimitive.Close

/** Right-side panel. Full-screen under 640px; `sm:max-w-xl` by default (pass className to widen). Body scrolls internally. */
export const SheetContent = forwardRef<ElementRef<typeof DialogPrimitive.Content>, ComponentPropsWithoutRef<typeof DialogPrimitive.Content>>(
  ({ className, children, ...props }, ref) => {
    const { t } = useI18n()
    return (
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/40 data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          ref={ref}
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex h-dvh w-full flex-col overflow-y-auto bg-surface text-foreground shadow-[var(--shadow-soft)] sm:max-w-xl sm:border-l sm:border-border',
            'data-[state=open]:animate-slide-in-right',
            className,
          )}
          {...props}
        >
          {children}
          <DialogPrimitive.Close
            aria-label={t.common.actions.close}
            className="absolute right-3 top-3 inline-flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <X className="size-5" aria-hidden />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    )
  },
)
SheetContent.displayName = 'SheetContent'

export function SheetHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('sticky top-0 z-10 flex flex-col gap-1.5 border-b border-border bg-surface px-4 py-4 pr-14 sm:px-6', className)} {...props} />
}

export function SheetFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('sticky bottom-0 z-10 mt-auto flex flex-col-reverse gap-2 border-t border-border bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-6', className)}
      {...props}
    />
  )
}

export const SheetTitle = forwardRef<ElementRef<typeof DialogPrimitive.Title>, ComponentPropsWithoutRef<typeof DialogPrimitive.Title>>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('text-lg font-semibold leading-tight', className)} {...props} />
))
SheetTitle.displayName = 'SheetTitle'

export const SheetDescription = forwardRef<ElementRef<typeof DialogPrimitive.Description>, ComponentPropsWithoutRef<typeof DialogPrimitive.Description>>(
  ({ className, ...props }, ref) => <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />,
)
SheetDescription.displayName = 'SheetDescription'
