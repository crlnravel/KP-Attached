import type { ElementType } from 'react'

import { cn } from '@/lib/utils'

type AttachedWordmarkProps = {
  as?: ElementType
  className?: string
}

export function AttachedWordmark({
  as: Component = 'span',
  className
}: AttachedWordmarkProps): React.JSX.Element {
  return (
    <Component
      className={cn('font-headline font-semibold tracking-[-0.055em] text-foreground', className)}
    >
      Attached
    </Component>
  )
}
