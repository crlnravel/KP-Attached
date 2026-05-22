import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppHeader } from '@/components/app-header'
import { AppSidebar } from '@/components/app-sidebar'
import type { AuthenticatedView } from '@/components/app-shared'
import { cn } from '@/lib/utils'

export function AppShell({
  children,
  currentView,
  onNavigate,
  onStartAssessment,
  startAssessmentDisabled = false,
  onSignOut,
  userRole = 'psychologist',
  hideSidebar = false,
  headerActions,
  showUser = true,
  userName = 'Pengguna Attached'
}: {
  children: React.ReactNode
  currentView: AuthenticatedView
  onNavigate: (view: AuthenticatedView) => void
  onStartAssessment: () => void
  startAssessmentDisabled?: boolean
  onSignOut: () => void
  userRole?: 'admin' | 'psychologist'
  hideSidebar?: boolean
  headerActions?: React.ReactNode
  showUser?: boolean
  userName?: string
}): React.JSX.Element {
  return (
    <SidebarProvider>
      {!hideSidebar && (
        <AppSidebar
          currentView={currentView}
          onNavigate={onNavigate}
          onStartAssessment={onStartAssessment}
          startAssessmentDisabled={startAssessmentDisabled}
          onSignOut={onSignOut}
          userRole={userRole}
        />
      )}
      <SidebarInset className="h-svh min-h-0 p-4 md:p-6">
        <AppHeader actions={headerActions} showUser={showUser} userName={userName} />
        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col gap-4',
            currentView === 'dashboard' ? 'overflow-hidden' : 'overflow-y-auto'
          )}
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
