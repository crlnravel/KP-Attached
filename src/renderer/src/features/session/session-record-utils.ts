import type { DashboardSnapshot, SessionRecord } from '@/lib/local-api'

export type ExistingPatientOption = {
  key: string
  name: string
  participantId: string
  age: string
  notes: string
  lastUpdated: string
  assessmentCount: number
}

export type PatientRow = {
  key: string
  name: string
  participantId: string
  age: string
  notes: string
  lastUpdated: string
  sortTime: number
  assessmentCount: number
  sessions: SessionRecord[]
}

const activeSessionStates = new Set<SessionRecord['state']>([
  'draft',
  'ready_for_inference',
  'running_inference'
])

const sortSessionsByUpdatedAt = (first: SessionRecord, second: SessionRecord): number => {
  return new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime()
}

const getPatientKey = (session: SessionRecord): string => {
  return (
    session.draft.participantId.trim().toLowerCase() ||
    session.draft.participantName.trim().toLowerCase() ||
    session.id
  )
}

const groupSessionsByPatient = (sessions: SessionRecord[]): Map<string, SessionRecord[]> => {
  const patientGroups = new Map<string, SessionRecord[]>()

  for (const session of sessions) {
    const patientKey = getPatientKey(session)
    const existingSessions = patientGroups.get(patientKey)

    if (existingSessions) {
      existingSessions.push(session)
      continue
    }

    patientGroups.set(patientKey, [session])
  }

  return patientGroups
}

export const isActiveSessionState = (state: SessionRecord['state']): boolean => {
  return activeSessionStates.has(state)
}

export const isActiveSession = (session: SessionRecord): boolean => {
  return isActiveSessionState(session.state)
}

export const buildDashboardSummary = (sessions: SessionRecord[]): DashboardSnapshot['summary'] => {
  return {
    totalSessions: sessions.length,
    completedSessions: sessions.filter((session) => session.state === 'completed').length,
    lowConfidenceSessions: sessions.filter((session) => session.state === 'low_confidence').length,
    failedSessions: sessions.filter((session) => session.state === 'failed').length,
    pendingSessions: sessions.filter((session) => isActiveSessionState(session.state)).length
  }
}

export const mergeSessionIntoDashboard = (
  snapshot: DashboardSnapshot,
  session: SessionRecord
): DashboardSnapshot => {
  const existingIndex = snapshot.sessions.findIndex((current) => current.id === session.id)
  const nextSessions =
    existingIndex === -1
      ? [session, ...snapshot.sessions]
      : snapshot.sessions.map((current) => (current.id === session.id ? session : current))

  nextSessions.sort(sortSessionsByUpdatedAt)

  return {
    ...snapshot,
    sessions: nextSessions,
    summary: buildDashboardSummary(nextSessions)
  }
}

export const buildExistingPatientOptions = (sessions: SessionRecord[]): ExistingPatientOption[] => {
  const patientGroups = groupSessionsByPatient(
    sessions.filter(
      (session) =>
        session.draft.participantId.trim().length > 0 ||
        session.draft.participantName.trim().length > 0
    )
  )

  return Array.from(patientGroups.entries())
    .map(([key, groupedSessions]) => {
      const sortedSessions = groupedSessions.toSorted(sortSessionsByUpdatedAt)
      const latestSession = sortedSessions[0]

      return {
        key,
        name: latestSession.draft.participantName || 'Peserta belum diisi',
        participantId: latestSession.draft.participantId || latestSession.id,
        age: latestSession.draft.age,
        notes: latestSession.draft.notes,
        lastUpdated: latestSession.updatedAt,
        assessmentCount: sortedSessions.length
      }
    })
    .toSorted(
      (first, second) =>
        new Date(second.lastUpdated).getTime() - new Date(first.lastUpdated).getTime()
    )
}

export const buildPatientRows = (sessions: SessionRecord[]): PatientRow[] => {
  const patientGroups = groupSessionsByPatient(sessions)

  return Array.from(patientGroups.entries()).map(([key, groupedSessions]) => {
    const sortedSessions = groupedSessions.toSorted(sortSessionsByUpdatedAt)
    const latestSession = sortedSessions[0]

    return {
      key,
      name: latestSession.draft.participantName || 'Peserta belum diisi',
      participantId: latestSession.draft.participantId || latestSession.id,
      age: latestSession.draft.age,
      notes: latestSession.draft.notes,
      lastUpdated: latestSession.updatedAt,
      sortTime: new Date(latestSession.updatedAt).getTime(),
      assessmentCount: sortedSessions.length,
      sessions: sortedSessions
    }
  })
}
