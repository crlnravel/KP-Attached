import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '@/components/ui/sidebar'
import { NavGroup } from '@/components/nav-group'
import { AttachedWordmark } from '@/components/attached-wordmark'
import { navGroups, type AuthenticatedView, type SidebarNavGroup } from '@/components/app-shared'
import { LogOutIcon, PlusIcon } from 'lucide-react'

type AppSidebarProps = {
  currentView: AuthenticatedView
  onNavigate: (view: AuthenticatedView) => void
  onStartAssessment: () => void
  startAssessmentDisabled?: boolean
  onSignOut: () => void
  userRole?: 'admin' | 'psychologist'
}

export function AppSidebar({
  currentView,
  onNavigate,
  onStartAssessment,
  startAssessmentDisabled = false,
  onSignOut,
  userRole = 'psychologist'
}: AppSidebarProps): React.JSX.Element {
  const visibleNavGroups: SidebarNavGroup[] = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        item.view === 'admin'
          ? userRole === 'admin'
          : userRole !== 'admin' || item.view !== 'dashboard'
      )
    }))
    .filter((group) => group.items.length > 0)

  return (
    <Sidebar
      collapsible="none"
      className="sticky top-0 h-svh shrink-0 border-r border-sidebar-border bg-sidebar"
    >
      <SidebarHeader className="justify-center gap-0 px-4 pt-5 pb-3">
        <SidebarMenuButton
          asChild
          className="h-auto justify-start rounded-[14px] bg-transparent px-3.5 py-3 font-headline text-3xl font-semibold tracking-[-0.055em] hover:bg-transparent active:bg-transparent"
        >
          <button
            type="button"
            onClick={() => onNavigate(userRole === 'admin' ? 'admin' : 'dashboard')}
          >
            <AttachedWordmark className="text-3xl" />
          </button>
        </SidebarMenuButton>
      </SidebarHeader>
      <SidebarContent className="flex flex-1 flex-col gap-4 px-4 pb-5">
        {userRole === 'psychologist' ? (
          <SidebarMenu className="gap-2">
            <SidebarMenuItem>
              <SidebarMenuButton
                className="bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
                size="lg"
                asChild
                tooltip="Buka asesmen"
              >
                <button
                  type="button"
                  onClick={onStartAssessment}
                  disabled={startAssessmentDisabled}
                  aria-disabled={startAssessmentDisabled}
                >
                  <PlusIcon />
                  <span>Asesmen baru</span>
                </button>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        ) : null}
        {visibleNavGroups.map((group) => (
          <NavGroup
            key={group.label}
            group={group}
            currentView={currentView}
            onNavigate={onNavigate}
          />
        ))}
      </SidebarContent>
      <SidebarFooter className="mt-auto gap-0 px-4 pt-0 pb-5">
        <SidebarMenu className="gap-2">
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="text-muted-foreground hover:text-foreground active:text-foreground"
              size="lg"
            >
              <button type="button" onClick={onSignOut}>
                <LogOutIcon />
                <span>Keluar</span>
              </button>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
