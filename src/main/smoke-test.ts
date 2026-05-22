import { app, type BrowserWindow } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const ACTIVE_SESSION_STATES = new Set(['draft', 'ready_for_inference', 'running_inference'])

type SmokeTestOptions = {
  mainWindow: BrowserWindow
  email: string
  password: string
  timeoutMs?: number
}

type SmokeTestResult = {
  ok: true
  firstSessionId: string
  reopenedSessionId: string
  reviewValidated: true
  modelRuntimeReady: boolean
  postResultSessionId: string | null
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function createRendererScript(email: string, password: string, timeoutMs: number): string {
  return `
    (async () => {
      const email = ${JSON.stringify(email)}
      const password = ${JSON.stringify(password)}
      const timeoutMs = ${JSON.stringify(timeoutMs)}
      const activeStates = new Set(${JSON.stringify([...ACTIVE_SESSION_STATES])})

      const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))
      const normalize = (value) => value.replace(/\\s+/g, ' ').trim()
      const isVisible = (element) => {
        if (!(element instanceof HTMLElement)) {
          return false
        }

        const rect = element.getBoundingClientRect()
        const style = window.getComputedStyle(element)
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== 'hidden' &&
          style.display !== 'none'
        )
      }

      const textOf = (element) => normalize(element.textContent ?? '')

      const log = (message) => {
        console.log('[smoke]', message)
      }

      const waitFor = async (predicate, description, maxWaitMs = timeoutMs) => {
        const startedAt = Date.now()
        while (Date.now() - startedAt <= maxWaitMs) {
          try {
            const result = await predicate()
            if (result) {
              return result
            }
          } catch {
            // Ignore transient lookup failures while the UI updates.
          }

          await sleep(120)
        }

        throw new Error('Timeout while waiting for ' + description)
      }

      const findButton = (label) => {
        return [...document.querySelectorAll('button')]
          .filter(isVisible)
          .find((button) => {
            const text = textOf(button)
            return text === label || text.includes(label)
          }) ?? null
      }

      const findInput = (placeholder) => {
        return [...document.querySelectorAll('input, textarea')]
          .find((input) => input.getAttribute('placeholder') === placeholder) ?? null
      }

      const clickElement = (element, description) => {
        if (!(element instanceof HTMLElement)) {
          throw new Error(description + ' was not found')
        }
        if (element instanceof HTMLButtonElement && element.disabled) {
          throw new Error(description + ' is disabled')
        }
        element.click()
      }

      const setInputValue = (element, value) => {
        if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLTextAreaElement)) {
          throw new Error('Input element was not found')
        }

        const prototype =
          element instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype
        const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value')
        descriptor?.set?.call(element, value)
        element.dispatchEvent(new Event('input', { bubbles: true }))
        element.dispatchEvent(new Event('change', { bubbles: true }))
      }

      const hasVisibleText = (text) => {
        return [...document.querySelectorAll('body *')].some((node) => {
          if (!isVisible(node)) {
            return false
          }
          return textOf(node).includes(text)
        })
      }

      const getSingleActiveSessionId = async () => {
        const sessions = await window.attached.sessions.list()
        const activeSessions = sessions.filter((session) => activeStates.has(session.state))
        if (activeSessions.length !== 1) {
          throw new Error(
            'Expected exactly one active session, found ' + activeSessions.length + '.'
          )
        }
        return activeSessions[0].id
      }

      const waitForLogin = async () => {
        await waitFor(() => window.attached, 'the preload API bridge')
        return waitFor(
          () => {
            const emailInput = findInput('nama@klinik.id')
            const passwordInput = findInput('Minimal 8 karakter')
            const signInButton = findButton('Masuk')
            return emailInput && passwordInput && signInButton ? true : false
          },
          'the sign-in form'
        )
      }

      const waitForDashboard = async () =>
        waitFor(() => (findButton('Asesmen baru') && hasVisibleText('Dasbor') ? true : false), 'the dashboard')

      const waitForAssessmentIdentity = async () =>
        waitFor(() => (hasVisibleText('Verifikasi data peserta.') ? true : false), 'the assessment identity step')

      const ensureSignedOut = async () => {
        const signOutButton = findButton('Keluar')
        if (!signOutButton) {
          return
        }

        log('Signing out persisted session before smoke login')
        clickElement(signOutButton, 'the sign-out button')
        await waitForLogin()
      }

      const switchToSignInIfNeeded = async () => {
        if (findInput('nama@klinik.id') && findInput('Minimal 8 karakter')) {
          return
        }

        const switchButton = findButton('Sudah punya akun?')
        if (!switchButton) {
          throw new Error('The login form is not in sign-in mode.')
        }

        clickElement(switchButton, 'the sign-in mode switch')
        await waitForLogin()
      }

      const abortDashboardActiveSessionIfPresent = async () => {
        const sessions = await window.attached.sessions.list()
        const activeSessions = sessions.filter((session) => activeStates.has(session.state))
        if (activeSessions.length === 0) {
          return
        }

        log('Aborting existing active session(s) before smoke login flow')
        await Promise.all(activeSessions.map((session) => window.attached.sessions.abort(session.id)))

        await waitFor(async () => {
          const sessions = await window.attached.sessions.list()
          return sessions.every((session) => !activeStates.has(session.state)) ? true : false
        }, 'existing active sessions to clear')

        await waitForDashboard()
      }

      const getVisibleButton = (label) => {
        return waitFor(() => findButton(label), 'button "' + label + '"')
      }
      const getEnabledButton = (label) => {
        return waitFor(() => {
          const button = findButton(label)
          return button && !button.disabled ? button : null
        }, 'enabled button "' + label + '"')
      }

      const hasAssessmentReview = () =>
        hasVisibleText('Data Selesai Didapatkan')

      log('Waiting for login screen')
      await ensureSignedOut()
      await switchToSignInIfNeeded()
      await waitForLogin()

      const emailInput = findInput('nama@klinik.id')
      const passwordInput = findInput('Minimal 8 karakter')
      const signInButton = findButton('Masuk')

      setInputValue(emailInput, email)
      setInputValue(passwordInput, password)
      clickElement(signInButton, 'the sign-in button')
      log('Submitted sign-in form')

      await waitForDashboard()
      log('Dashboard loaded')

      await abortDashboardActiveSessionIfPresent()

      const startAssessmentButton = await getEnabledButton('Asesmen baru')
      clickElement(startAssessmentButton, 'the start assessment button')
      log('Opened the assessment once')

      await waitForAssessmentIdentity()
      const firstSessionId = await getSingleActiveSessionId()
      log('First active session: ' + firstSessionId)

      window.location.hash = '#/dashboard'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
      await waitForDashboard()
      log('Returned to the dashboard with an active draft session')

      const reopenButton = await getEnabledButton('Asesmen baru')
      clickElement(reopenButton, 'the reopen assessment button')
      log('Triggered assessment reopen from the sidebar')

      await waitForAssessmentIdentity()
      const reopenedSessionId = await getSingleActiveSessionId()
      if (reopenedSessionId !== firstSessionId) {
        throw new Error(
          'Expected Asesmen baru to reopen ' +
            firstSessionId +
            ', but the app opened ' +
            reopenedSessionId +
            '.'
        )
      }

      const debugSeedButton = await getEnabledButton('Gunakan data uji')
      clickElement(debugSeedButton, 'the debug seed button')
      log('Filled the assessment with test captures and questionnaire answers')

      await waitFor(() => (hasAssessmentReview() ? true : false), 'the seeded review step')

      const dashboardSnapshot = await window.attached.dashboard.getSnapshot()
      const modelRuntimeReady = dashboardSnapshot.modelRuntimeReady
      const startInferenceButton = await getVisibleButton('Lanjut')
      if (startInferenceButton.disabled !== !modelRuntimeReady) {
        throw new Error(
          'Review continue button readiness did not match modelRuntimeReady=' + modelRuntimeReady + '.'
        )
      }

      if (!modelRuntimeReady && !hasVisibleText('Analisis lokal belum siap')) {
        throw new Error('Expected runtime warning when local model runtime is unavailable.')
      }

      let postResultSessionId = null

      if (modelRuntimeReady) {
        clickElement(startInferenceButton, 'the start inference button')
        log('Started local inference from the seeded review state')

        await waitFor(
          () => (hasVisibleText('Memproses asesmen') ? true : false),
          'the running inference screen'
        )

        await waitFor(
          async () => {
            const sessions = await window.attached.sessions.list()
            const latestSession = sessions.find((session) => session.id === reopenedSessionId)
            return latestSession && !activeStates.has(latestSession.state) ? true : false
          },
          'the seeded session to finish inference',
          Math.max(timeoutMs, 120000)
        )

        await waitFor(
          () => (hasVisibleText('Hasil asesmen') && findButton('Selesai') ? true : false),
          'the inference result screen',
          Math.max(timeoutMs, 120000)
        )

        const finishButton = await getEnabledButton('Selesai')
        clickElement(finishButton, 'the result finish button')
        log('Returned to the dashboard from the result screen')

        await waitForDashboard()

        await waitFor(
          async () => {
            const sessions = await window.attached.sessions.list()
            return sessions.every((session) => !activeStates.has(session.state)) ? true : false
          },
          'all active sessions to clear after completion'
        )

        const postResultStartButton = await getEnabledButton('Asesmen baru')
        clickElement(postResultStartButton, 'the post-result start assessment button')
        log('Started a new assessment after completing the prior session')

        await waitForAssessmentIdentity()
        postResultSessionId = await getSingleActiveSessionId()
        if (postResultSessionId === reopenedSessionId) {
          throw new Error(
            'Expected a new session after result exit, but the app reopened ' +
              reopenedSessionId +
              '.'
          )
        }

        await window.attached.sessions.abort(postResultSessionId)
        log('Cleaned up the post-result smoke-test session')
      } else {
        await window.attached.sessions.abort(reopenedSessionId)
        log('Cleaned up the seeded smoke-test session')
      }

      return {
        ok: true,
        firstSessionId,
        reopenedSessionId,
        reviewValidated: true,
        modelRuntimeReady,
        postResultSessionId
      }
    })()
  `
}

async function waitForRenderer(mainWindow: BrowserWindow): Promise<void> {
  if (!mainWindow.webContents.isLoadingMainFrame()) {
    return
  }

  await new Promise<void>((resolve) => {
    mainWindow.webContents.once('did-finish-load', () => resolve())
  })
}

async function captureFailureScreenshot(mainWindow: BrowserWindow): Promise<string | null> {
  try {
    const image = await mainWindow.webContents.capturePage()
    const filePath = join(app.getPath('temp'), `attached-smoke-failure-${Date.now()}.png`)
    await writeFile(filePath, image.toPNG())
    return filePath
  } catch {
    return null
  }
}

export async function runElectronSmokeTest({
  mainWindow,
  email,
  password,
  timeoutMs = 45_000
}: SmokeTestOptions): Promise<SmokeTestResult> {
  if (!email.trim() || !password.trim()) {
    throw new Error(
      'Smoke test requires ATTACHED_SMOKE_TEST_EMAIL and ATTACHED_SMOKE_TEST_PASSWORD.'
    )
  }

  console.log('[smoke] Smoke test starting')

  const forwardRendererLog = (
    details: Electron.Event<Electron.WebContentsConsoleMessageEventParams>
  ): void => {
    const { message, level, lineNumber, sourceId } = details
    if (!message.startsWith('[smoke]')) {
      return
    }

    const sourceSuffix = sourceId ? ` @ ${sourceId}:${lineNumber}` : ''
    console.log(`[renderer ${level}] ${message}${sourceSuffix}`)
  }

  mainWindow.webContents.on('console-message', forwardRendererLog)

  try {
    await waitForRenderer(mainWindow)
    await delay(500)

    const result = (await mainWindow.webContents.executeJavaScript(
      createRendererScript(email, password, timeoutMs),
      true
    )) as SmokeTestResult

    const runtimeMessage = result.modelRuntimeReady ? 'runtime ready' : 'runtime unavailable'
    const postResultMessage = result.postResultSessionId
      ? ` post-result session ${result.postResultSessionId} created successfully.`
      : ''
    console.log(
      `[smoke] Smoke test passed. Reopened session ${result.reopenedSessionId} from ${result.firstSessionId}; seeded review validated (${runtimeMessage}).${postResultMessage}`
    )
    return result
  } catch (error) {
    const screenshotPath = await captureFailureScreenshot(mainWindow)
    const errorMessage = error instanceof Error ? error.message : 'Unknown smoke test failure.'
    const screenshotMessage = screenshotPath ? ` Screenshot: ${screenshotPath}` : ''
    throw new Error(`${errorMessage}${screenshotMessage}`)
  } finally {
    mainWindow.webContents.off('console-message', forwardRendererLog)
  }
}
