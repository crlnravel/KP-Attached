import type { ReactNode } from 'react'
import { CircleHelpIcon, LayoutGridIcon, ShieldCheckIcon, UserCircle2Icon } from 'lucide-react'

export type AuthenticatedView = 'dashboard' | 'assessment' | 'profile' | 'contact' | 'admin'
export type AppView = 'login' | AuthenticatedView

export type SidebarNavItem = {
  title: string
  view?: AuthenticatedView
  icon?: ReactNode
  subItems?: SidebarNavItem[]
}

export type SidebarNavGroup = {
  label: string
  items: SidebarNavItem[]
}

export const navGroups: SidebarNavGroup[] = [
  {
    label: 'Ruang kerja',
    items: [
      {
        title: 'Dasbor',
        view: 'dashboard',
        icon: <LayoutGridIcon />
      },
      {
        title: 'Profil',
        view: 'profile',
        icon: <UserCircle2Icon />
      },
      {
        title: 'Admin',
        view: 'admin',
        icon: <ShieldCheckIcon />
      },
      {
        title: 'Hubungi pengembang',
        view: 'contact',
        icon: <CircleHelpIcon />
      }
    ]
  }
]

export const footerNavLinks: SidebarNavItem[] = []

export const navLinks: SidebarNavItem[] = [
  ...navGroups.flatMap((group) =>
    group.items.flatMap((item) => (item.subItems?.length ? [item, ...item.subItems] : [item]))
  ),
  ...footerNavLinks
]

export const viewHashes: Record<AuthenticatedView, string> = {
  dashboard: '#/dashboard',
  assessment: '#/assessment',
  profile: '#/profile',
  contact: '#/contact-developer',
  admin: '#/admin'
}

export function parseAuthenticatedView(hash: string): AuthenticatedView {
  const normalizedHash = hash || viewHashes.dashboard

  if (normalizedHash.startsWith(viewHashes.assessment)) {
    return 'assessment'
  }

  if (normalizedHash.startsWith(viewHashes.profile)) {
    return 'profile'
  }

  if (normalizedHash.startsWith(viewHashes.contact)) {
    return 'contact'
  }

  if (normalizedHash.startsWith(viewHashes.admin)) {
    return 'admin'
  }

  return 'dashboard'
}

export function navigateToView(view: AuthenticatedView): void {
  window.location.hash = viewHashes[view]
}
