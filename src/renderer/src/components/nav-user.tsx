import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

type NavUserProps = {
  name: string
  avatarUrl?: string
}

export function NavUser({ name, avatarUrl }: NavUserProps): React.JSX.Element {
  const fallback = name
    .trim()
    .split(/\s+/)
    .map((segment) => segment[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <Avatar className="size-11 ring-1 ring-border/50">
      <AvatarImage src={avatarUrl} />
      <AvatarFallback>{fallback}</AvatarFallback>
    </Avatar>
  )
}
