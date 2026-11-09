import { forwardRef, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { fieldClasses } from './input'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, rows = 3, ...props }, ref) => (
  <textarea ref={ref} rows={rows} className={cn(fieldClasses, 'min-h-20 py-2 leading-relaxed', className)} {...props} />
))
Textarea.displayName = 'Textarea'
