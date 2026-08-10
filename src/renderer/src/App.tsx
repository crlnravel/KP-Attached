import { Code2Icon } from 'lucide-react'

import { AppShell } from '@/components/app-shell'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { AssessmentView } from '@/features/assessment/assessment-view'
import { AdminView } from '@/features/admin/admin-view'
import { defaultRemoteAuth, useAppController } from '@/features/app/use-app-controller'
import { StartAssessmentDialog } from '@/features/app/start-assessment-dialog'
import { LoginView } from '@/features/auth/login-view'
import { ContactDeveloperView } from '@/features/contact/contact-developer-view'
import { DashboardView } from '@/features/dashboard/dashboard-view'
import { ProfileView } from '@/features/profile/profile-view'

const coverImageUrl = new URL('../../../resources/cover-image-login.avif', import.meta.url).href

function App(): React.JSX.Element {
  const {
    view,
    authSnapshot,
    dashboardSnapshot,
    adminSnapshot,
    dashboardError,
    adminError,
    authError,
    loading,
    authPending,
    dashboardPending,
    adminPending,
    email,
    password,
    registration,
    authMode,
    authNotice,
    assessmentPatientMode,
    startAssessmentDialogOpen,
    startAssessmentPending,
    startAssessmentError,
    patientChoices,
    startAssessmentDisabled,
    assessment,
    setEmail,
    setPassword,
    setRegistration,
    setStartAssessmentDialogOpen,
    handleNavigate,
    handleAuthModeChange,
    handleRegistrationDocumentChange,
    handleSignIn,
    handleSubmitAccessRequest,
    handleUpdateProfile,
    handleUpdateEmail,
    handleChangePassword,
    handleSignOut,
    handleResetLocalData,
    handleStartAssessment,
    handleCreateNewAssessment,
    handleCreateExistingPatientAssessment,
    handleOpenSession,
    handleAbortSession,
    handleDeleteSessionRecordings,
    handleSavePostAssessmentNote,
    handleReviewAccessRequest,
    handleAssessmentExit,
    isDevelopmentModeEnabled
  } = useAppController()

  if (loading) {
    return <main className="min-h-screen bg-background" />
  }

  if (!authSnapshot?.user) {
    return (
      <>
        <LoginView
          email={email}
          password={password}
          registration={registration}
          authMode={authMode}
          knownUser={authSnapshot?.knownUser ?? null}
          remoteAuth={authSnapshot?.remoteAuth ?? defaultRemoteAuth}
          onAuthModeChange={handleAuthModeChange}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onRegistrationChange={(field, value) =>
            setRegistration((current) => ({ ...current, [field]: value }))
          }
          onRegistrationDocumentChange={handleRegistrationDocumentChange}
          onSignIn={() => void handleSignIn()}
          onSubmitAccessRequest={() => void handleSubmitAccessRequest()}
          coverImageUrl={coverImageUrl}
          notice={authNotice}
          error={authError}
          isSubmitting={authPending}
        />
        {isDevelopmentModeEnabled ? <DevModeMarker /> : null}
      </>
    )
  }

  if (view === 'assessment' && authSnapshot.user.role === 'psychologist') {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <AssessmentView
          controller={assessment}
          modelRuntimeReady={dashboardSnapshot?.modelRuntimeReady}
          patientMode={assessmentPatientMode}
          existingPatientOptions={patientChoices}
          onExitAssessment={handleAssessmentExit}
        />
        {isDevelopmentModeEnabled ? <DevModeMarker /> : null}
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <AppShell
        currentView={view}
        onNavigate={handleNavigate}
        onStartAssessment={handleStartAssessment}
        startAssessmentDisabled={startAssessmentDisabled}
        onSignOut={() => void handleSignOut()}
        userRole={authSnapshot.user.role}
        showUser={false}
        userName={authSnapshot.user.fullName}
      >
        {view === 'dashboard' && (
          <DashboardView
            snapshot={dashboardSnapshot}
            isLoading={dashboardPending}
            error={dashboardError}
            onOpenSession={handleOpenSession}
            onAbortSession={handleAbortSession}
            onDeleteSessionRecordings={handleDeleteSessionRecordings}
            onSavePostAssessmentNote={handleSavePostAssessmentNote}
          />
        )}
        {view === 'admin' && (
          <AdminView
            snapshot={adminSnapshot}
            isLoading={adminPending}
            error={adminError}
            onReviewAccessRequest={(userId, decision) =>
              void handleReviewAccessRequest({ userId, decision })
            }
          />
        )}
        {view === 'profile' && (
          <ProfileView
            key={authSnapshot.user.id}
            user={authSnapshot.user}
            onUpdateProfile={handleUpdateProfile}
            onUpdateEmail={handleUpdateEmail}
            onChangePassword={handleChangePassword}
            onResetLocalData={handleResetLocalData}
          />
        )}
        {view === 'contact' && <ContactDeveloperView />}
      </AppShell>
      <StartAssessmentDialog
        open={startAssessmentDialogOpen}
        hasExistingPatients={patientChoices.length > 0}
        isSubmitting={startAssessmentPending}
        error={startAssessmentError}
        onOpenChange={setStartAssessmentDialogOpen}
        onCreateNew={() => void handleCreateNewAssessment()}
        onSelectExisting={() => void handleCreateExistingPatientAssessment()}
      />
      {isDevelopmentModeEnabled ? <DevModeMarker /> : null}
    </main>
  )
}

function DevModeMarker(): React.JSX.Element {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="fixed right-5 bottom-4 z-50 flex size-11 cursor-help items-center justify-center rounded-full border border-warning/30 bg-background/88 text-warning-container-foreground shadow-[0_12px_30px_rgb(17_24_39_/_0.08)] backdrop-blur-md"
            aria-label="Mode pengembangan aktif"
          >
            <Code2Icon className="size-4.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" sideOffset={10}>
          Versi ini berjalan dalam mode pengembangan.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export default App
