import { forwardRef, type SelectHTMLAttributes } from 'react'
import { fieldClasses } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * A native <select> with the field look. Used for the admin filters and forms: it is labelled by
 * the surrounding <label>, works with the keyboard and screen readers, and needs no popper on phones.
 */
export const NativeSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select ref={ref} className={cn(fieldClasses, 'h-10', className)} {...props} />
  ),
)
NativeSelect.displayName = 'NativeSelect'
