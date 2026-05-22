import { cn } from '@/lib/utils'
import { NavUser } from '@/components/nav-user'

export function AppHeader({
  actions,
  showUser = true,
  userName = 'Pengguna Attached'
}: {
  actions?: React.ReactNode
  showUser?: boolean
  userName?: string
}): React.JSX.Element {
  if (!actions && !showUser) {
    return <></>
  }

  return (
    <header className={cn('mb-8 flex items-center justify-end gap-6')}>
      {actions}
      {showUser ? <NavUser name={userName} /> : null}
    </header>
  )
}
