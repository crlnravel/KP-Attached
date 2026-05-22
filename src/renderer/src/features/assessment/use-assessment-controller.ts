import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type {
  CaptureKind,
  InferenceResult,
  InferenceStatus,
  ResultFeedback,
  SessionRecord,
  SessionStep,
  StimulusCaptureStatus
} from '../../../../shared/contracts'
import { QUESTION_COUNT, QUESTION_SCALE_VALUES, STIMULUS_COUNT } from '../../../../shared/contracts'
import { attachedApi } from '@/lib/local-api'

type RecordingMode = 'exposure' | 'response' | null

type AssessmentControllerArgs = {
  sessionId: string | null
  isActive: boolean
  onSessionChanged: () => void
  onSessionAborted: (sessionId: string) => void
}

export type AssessmentController = {
  state: {
    loading: boolean
    saving: boolean
    session: SessionRecord | null
    step: SessionStep
    error: string | null
    participantId: string
    participantName: string
    age: string
    notes: string
    answers: Array<number | null>
    captures: StimulusCaptureStatus[]
    currentSlotIndex: number
    previewError: string | null
    videoReady: boolean
    microphoneReady: boolean
    microphoneLevel: number
    recordingMode: RecordingMode
    inferenceStatus: InferenceStatus | null
    result: InferenceResult | null
    selectedVideoMimeType: string | null
    selectedAudioMimeType: string | null
    identityReady: boolean
    answeredCount: number
    captureCompletionCount: number
    reviewReady: boolean
  }
  previewVideoRef: React.RefObject<HTMLVideoElement | null>
  actions: {
    reload: () => Promise<void>
    updateParticipantField: (
      field: 'participantId' | 'participantName' | 'age' | 'notes',
      value: string
    ) => void
    saveIdentity: () => Promise<void>
    submitConsent: () => Promise<void>
    revokeConsent: () => Promise<void>
    goToIdentity: () => Promise<void>
    continueToRecording: () => Promise<void>
    continueToQuestionnaire: () => Promise<void>
    saveQuestionnaire: () => Promise<void>
    fillDebugSession: () => Promise<void>
    selectSlot: (slotIndex: number) => void
    startExposureRecording: () => Promise<void>
    stopExposureRecording: () => void
    startResponseRecording: () => Promise<void>
    stopResponseRecording: () => void
    setAnswer: (index: number, value: number) => void
    startInference: () => Promise<void>
    returnToReview: () => Promise<void>
    submitResultFeedback: (
      verdict: ResultFeedback['verdict'],
      correctedLabel?: 'secure' | 'insecure' | null
    ) => Promise<void>
    abortSession: () => Promise<void>
  }
}

type RecorderHandle = {
  recorder: MediaRecorder
  chunks: Blob[]
  tracks: MediaStreamTrack[]
}

type WavRecorderHandle = {
  audioContext: AudioContext
  source: MediaStreamAudioSourceNode
  processor: ScriptProcessorNode
  sink: GainNode
  chunks: Float32Array[]
  tracks: MediaStreamTrack[]
}

type PendingResponseArtifacts = {
  slot: number
  responseBlob: Blob | null
  audioBlob: Blob | null
}

function pickSupportedMimeType(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate
    }
  }
  return null
}

function cloneTrackStream(stream: MediaStream, kind: 'video' | 'audio'): MediaStreamTrack[] {
  return (kind === 'video' ? stream.getVideoTracks() : stream.getAudioTracks()).map((track) =>
    track.clone()
  )
}

function cloneCaptureStream(stream: MediaStream): {
  mediaStream: MediaStream
  tracks: MediaStreamTrack[]
} {
  const tracks = stream.getTracks().map((track) => track.clone())
  return {
    mediaStream: new MediaStream(tracks),
    tracks
  }
}

function stopTracks(tracks: MediaStreamTrack[]): void {
  tracks.forEach((track) => track.stop())
}

function stopRecorder(handle: RecorderHandle | null): void {
  if (!handle || handle.recorder.state === 'inactive') {
    return
  }

  try {
    handle.recorder.requestData()
  } catch {
    // Ignore requestData failures and still stop the recorder.
  }

  handle.recorder.stop()
}

function mergeFloat32Chunks(chunks: Float32Array[]): Float32Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const merged = new Float32Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }
  return merged
}

function encodeWav(chunks: Float32Array[], sampleRate: number): Blob {
  const samples = mergeFloat32Chunks(chunks)
  const bytesPerSample = 2
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample)
  const view = new DataView(buffer)

  const writeString = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index))
    }
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * bytesPerSample, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * bytesPerSample, true)
  view.setUint16(32, bytesPerSample, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, samples.length * bytesPerSample, true)

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]))
    view.setInt16(44 + index * bytesPerSample, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

function finalizeWavRecorder(handle: WavRecorderHandle): Blob {
  handle.processor.onaudioprocess = null
  handle.source.disconnect()
  handle.processor.disconnect()
  handle.sink.disconnect()
  stopTracks(handle.tracks)
  void handle.audioContext.close()
  return encodeWav(handle.chunks, handle.audioContext.sampleRate)
}

function firstIncompleteSlot(captures: StimulusCaptureStatus[]): number {
  const found = captures.findIndex(
    (capture) => !(capture.exposure && capture.response && capture.audio)
  )
  return found === -1 ? captures.length - 1 : found
}

function normalizeStep(session: SessionRecord): SessionStep {
  if (session.draft.step === 'review') {
    return 'review'
  }
  if (session.state === 'running_inference') {
    return 'running'
  }
  if (
    session.result ||
    session.state === 'completed' ||
    session.state === 'low_confidence' ||
    session.state === 'failed'
  ) {
    return 'result'
  }
  return session.draft.step
}

function buildDefaultParticipantId(sessionId: string): string {
  const matched = sessionId.match(/^SES-(\d{4}-\d{2}-\d{2})-([A-Za-z0-9]+)/)
  if (matched) {
    return `PTC-${matched[1]}-${matched[2].slice(0, 8).toUpperCase()}`
  }

  const now = new Date()
  const dateSegment = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('-')
  const suffix =
    sessionId
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(-8)
      .toUpperCase() || '00000001'
  return `PTC-${dateSegment}-${suffix}`
}

function normalizeParticipantId(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
}

export function useAssessmentController({
  sessionId,
  isActive,
  onSessionChanged,
  onSessionAborted
}: AssessmentControllerArgs): AssessmentController {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [session, setSession] = useState<SessionRecord | null>(null)
  const [step, setStep] = useState<SessionStep>('identity')
  const [error, setError] = useState<string | null>(null)
  const [participantId, setParticipantId] = useState('')
  const [participantName, setParticipantName] = useState('')
  const [age, setAge] = useState('')
  const [notes, setNotes] = useState('')
  const [answers, setAnswers] = useState<Array<number | null>>(() =>
    Array.from({ length: QUESTION_COUNT }, () => null)
  )
  const [captures, setCaptures] = useState<StimulusCaptureStatus[]>(() =>
    Array.from({ length: STIMULUS_COUNT }, (_, index) => ({
      slot: index + 1,
      exposure: null,
      response: null,
      audio: null
    }))
  )
  const [currentSlotIndex, setCurrentSlotIndex] = useState(0)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [videoReady, setVideoReady] = useState(false)
  const [microphoneReady, setMicrophoneReady] = useState(false)
  const [microphoneLevel, setMicrophoneLevel] = useState(0)
  const [recordingMode, setRecordingMode] = useState<RecordingMode>(null)
  const [inferenceStatus, setInferenceStatus] = useState<InferenceStatus | null>(null)
  const [result, setResult] = useState<InferenceResult | null>(null)

  const previewVideoRef = useRef<HTMLVideoElement | null>(null)
  const previewStreamRef = useRef<MediaStream | null>(null)
  const previewAudioContextRef = useRef<AudioContext | null>(null)
  const previewAnimationRef = useRef<number | null>(null)
  const exposureRecorderRef = useRef<RecorderHandle | null>(null)
  const responseVideoRecorderRef = useRef<RecorderHandle | null>(null)
  const responseAudioRecorderRef = useRef<WavRecorderHandle | null>(null)
  const pendingResponseArtifactsRef = useRef<PendingResponseArtifacts | null>(null)
  const initializedSlotSessionIdRef = useRef<string | null>(null)
  const generatedParticipantIdRef = useRef<Map<string, string>>(new Map())

  const selectedVideoMimeType = useMemo(
    () =>
      pickSupportedMimeType([
        'video/mp4',
        'video/mp4;codecs=avc1,mp4a.40.2',
        'video/mp4;codecs=h264,aac',
        'video/mp4;codecs=avc1',
        'video/mp4;codecs=h264',
        'video/mp4;codecs=avc1,opus'
      ]),
    []
  )

  const selectedAudioMimeType = 'audio/wav'

  const applySession = useCallback((nextSession: SessionRecord): void => {
    const generatedParticipantId =
      generatedParticipantIdRef.current.get(nextSession.id) ??
      buildDefaultParticipantId(nextSession.id)
    generatedParticipantIdRef.current.set(nextSession.id, generatedParticipantId)

    setSession(nextSession)
    setStep(normalizeStep(nextSession))
    setParticipantId(nextSession.draft.participantId || generatedParticipantId)
    setParticipantName(nextSession.draft.participantName)
    setAge(nextSession.draft.age)
    setNotes(nextSession.draft.notes)
    setAnswers(nextSession.draft.questionnaireAnswers)
    setCaptures(nextSession.draft.captures)
    setCurrentSlotIndex((current) => {
      const fallbackIndex = firstIncompleteSlot(nextSession.draft.captures)
      if (initializedSlotSessionIdRef.current !== nextSession.id) {
        initializedSlotSessionIdRef.current = nextSession.id
        return fallbackIndex
      }

      if (current >= 0 && current < nextSession.draft.captures.length) {
        return current
      }

      return fallbackIndex
    })
    setResult(nextSession.result)
    if (nextSession.state === 'failed') {
      setError(nextSession.failureMessage ?? 'Pemrosesan asesmen gagal.')
    } else {
      setError(null)
    }
  }, [])

  const reload = useCallback(async (): Promise<void> => {
    if (!sessionId) {
      setSession(null)
      return
    }

    setLoading(true)
    try {
      const nextSession = await attachedApi.sessions.get(sessionId)
      applySession(nextSession)
    } catch (reloadError) {
      setError(reloadError instanceof Error ? reloadError.message : 'Sesi gagal dimuat.')
    } finally {
      setLoading(false)
    }
  }, [applySession, sessionId])

  const stopPreview = useCallback((): void => {
    if (previewAnimationRef.current !== null) {
      window.cancelAnimationFrame(previewAnimationRef.current)
      previewAnimationRef.current = null
    }

    if (previewAudioContextRef.current) {
      void previewAudioContextRef.current.close()
      previewAudioContextRef.current = null
    }

    if (previewStreamRef.current) {
      previewStreamRef.current.getTracks().forEach((track) => track.stop())
      previewStreamRef.current = null
    }

    if (previewVideoRef.current) {
      previewVideoRef.current.srcObject = null
    }

    setVideoReady(false)
    setMicrophoneReady(false)
    setMicrophoneLevel(0)
  }, [])

  const discardActiveRecordings = useCallback((): void => {
    const exposureHandle = exposureRecorderRef.current
    if (exposureHandle) {
      exposureHandle.recorder.ondataavailable = null
      exposureHandle.recorder.onstop = null
      if (exposureHandle.recorder.state !== 'inactive') {
        try {
          exposureHandle.recorder.stop()
        } catch {
          // Best-effort cleanup only.
        }
      }
      stopTracks(exposureHandle.tracks)
      exposureRecorderRef.current = null
    }

    const responseVideoHandle = responseVideoRecorderRef.current
    if (responseVideoHandle) {
      responseVideoHandle.recorder.ondataavailable = null
      responseVideoHandle.recorder.onstop = null
      if (responseVideoHandle.recorder.state !== 'inactive') {
        try {
          responseVideoHandle.recorder.stop()
        } catch {
          // Best-effort cleanup only.
        }
      }
      stopTracks(responseVideoHandle.tracks)
      responseVideoRecorderRef.current = null
    }

    const responseAudioHandle = responseAudioRecorderRef.current
    if (responseAudioHandle) {
      responseAudioHandle.processor.onaudioprocess = null
      responseAudioHandle.source.disconnect()
      responseAudioHandle.processor.disconnect()
      responseAudioHandle.sink.disconnect()
      stopTracks(responseAudioHandle.tracks)
      void responseAudioHandle.audioContext.close()
      responseAudioRecorderRef.current = null
    }

    pendingResponseArtifactsRef.current = null
    setRecordingMode(null)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    const shouldRunPreview = isActive && (step === 'preflight' || step === 'recording')

    if (!shouldRunPreview) {
      stopPreview()
      return
    }

    let cancelled = false

    const startPreview = async (): Promise<void> => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: true
        })

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        previewStreamRef.current = stream
        setPreviewError(null)
        setMicrophoneReady(stream.getAudioTracks().some((track) => track.readyState === 'live'))

        if (previewVideoRef.current) {
          previewVideoRef.current.srcObject = stream
          await previewVideoRef.current.play()
          setVideoReady(true)
        }

        const audioContext = new AudioContext()
        previewAudioContextRef.current = audioContext

        const source = audioContext.createMediaStreamSource(stream)
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 256
        source.connect(analyser)

        const buffer = new Uint8Array(analyser.frequencyBinCount)

        const tick = (): void => {
          analyser.getByteFrequencyData(buffer)
          const average = buffer.reduce((sum, value) => sum + value, 0) / buffer.length / 255
          setMicrophoneLevel((current) => current * 0.5 + average * 0.5)
          previewAnimationRef.current = window.requestAnimationFrame(tick)
        }

        previewAnimationRef.current = window.requestAnimationFrame(tick)
      } catch (previewFailure) {
        setPreviewError(
          previewFailure instanceof Error ? previewFailure.message : 'Pratinjau tidak tersedia.'
        )
      }
    }

    void startPreview()

    return () => {
      cancelled = true
      stopPreview()
    }
  }, [isActive, step, stopPreview])

  useEffect(() => {
    if (!sessionId || step !== 'running') {
      return
    }

    let cancelled = false
    const interval = window.setInterval(() => {
      void attachedApi.inference
        .getStatus(sessionId)
        .then((status) => {
          if (cancelled) {
            return
          }

          setInferenceStatus(status)
          if (
            status.status === 'completed' ||
            status.status === 'low_confidence' ||
            status.status === 'failed'
          ) {
            void reload()
            onSessionChanged()
          }
        })
        .catch((pollError) => {
          if (!cancelled) {
            setError(
              pollError instanceof Error ? pollError.message : 'Status inferensi gagal diperbarui.'
            )
          }
        })
    }, 1500)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [onSessionChanged, reload, sessionId, step])

  const updateParticipantField = useCallback(
    (field: 'participantId' | 'participantName' | 'age' | 'notes', value: string): void => {
      if (field === 'participantId') setParticipantId(normalizeParticipantId(value))
      if (field === 'participantName') setParticipantName(value)
      if (field === 'age') setAge(value.replace(/\D+/g, '').slice(0, 3))
      if (field === 'notes') setNotes(value)
    },
    []
  )

  const saveIdentity = useCallback(async (): Promise<void> => {
    if (!sessionId) {
      return
    }

    setSaving(true)
    setError(null)
    try {
      const nextSession = await attachedApi.sessions.updateIdentity(sessionId, {
        participantId,
        participantName,
        age,
        notes
      })
      applySession(nextSession)
      onSessionChanged()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Identitas gagal disimpan.')
    } finally {
      setSaving(false)
    }
  }, [age, applySession, notes, onSessionChanged, participantId, participantName, sessionId])

  const submitConsent = useCallback(async (): Promise<void> => {
    if (!sessionId) {
      return
    }

    setSaving(true)
    setError(null)
    try {
      const nextSession = await attachedApi.sessions.submitConsent({
        sessionId,
        accepted: true
      })
      applySession(nextSession)
      onSessionChanged()
    } catch (consentError) {
      setError(consentError instanceof Error ? consentError.message : 'Persetujuan gagal disimpan.')
    } finally {
      setSaving(false)
    }
  }, [applySession, onSessionChanged, sessionId])

  const revokeConsent = useCallback(async (): Promise<void> => {
    if (!sessionId) {
      return
    }

    setSaving(true)
    setError(null)
    discardActiveRecordings()
    stopPreview()

    try {
      const nextSession = await attachedApi.sessions.revokeConsent(sessionId)
      setInferenceStatus(null)
      applySession(nextSession)
      onSessionChanged()
      onSessionAborted(sessionId)
    } catch (consentError) {
      setError(consentError instanceof Error ? consentError.message : 'Consent gagal dicabut.')
    } finally {
      setSaving(false)
    }
  }, [
    applySession,
    discardActiveRecordings,
    onSessionAborted,
    onSessionChanged,
    sessionId,
    stopPreview
  ])

  const continueToRecording = useCallback(async (): Promise<void> => {
    if (!sessionId) {
      return
    }
    setSaving(true)
    try {
      const nextSession = await attachedApi.sessions.updateStep(sessionId, 'recording')
      applySession(nextSession)
    } catch (stepError) {
      setError(stepError instanceof Error ? stepError.message : 'Gagal lanjut ke perekaman.')
    } finally {
      setSaving(false)
    }
  }, [applySession, sessionId])

  const goToIdentity = useCallback(async (): Promise<void> => {
    if (!sessionId) {
      return
    }

    setSaving(true)
    try {
      const nextSession = await attachedApi.sessions.updateStep(sessionId, 'identity')
      applySession(nextSession)
    } catch (stepError) {
      setError(stepError instanceof Error ? stepError.message : 'Gagal kembali ke identitas.')
    } finally {
      setSaving(false)
    }
  }, [applySession, sessionId])

  const continueToQuestionnaire = useCallback(async (): Promise<void> => {
    if (!sessionId) {
      return
    }
    setSaving(true)
    try {
      const nextSession = await attachedApi.sessions.updateStep(sessionId, 'questionnaire')
      applySession(nextSession)
    } catch (stepError) {
      setError(stepError instanceof Error ? stepError.message : 'Gagal lanjut ke kuesioner.')
    } finally {
      setSaving(false)
    }
  }, [applySession, sessionId])

  const persistArtifact = useCallback(
    async (slot: number, kind: CaptureKind, blob: Blob): Promise<void> => {
      if (!sessionId) {
        return
      }
      if (blob.size === 0) {
        throw new Error(`Rekaman ${kind} kosong. Rekam stimulus itu lagi.`)
      }

      const nextSession = await attachedApi.sessions.saveArtifact({
        sessionId,
        slot,
        kind,
        mimeType: blob.type,
        data: await blob.arrayBuffer()
      })
      applySession(nextSession)
      onSessionChanged()
    },
    [applySession, onSessionChanged, sessionId]
  )

  const persistResponseArtifactsIfReady = useCallback(
    (slot: number): void => {
      const pendingArtifacts = pendingResponseArtifactsRef.current
      if (
        !pendingArtifacts ||
        pendingArtifacts.slot !== slot ||
        !pendingArtifacts.responseBlob ||
        !pendingArtifacts.audioBlob
      ) {
        return
      }

      pendingResponseArtifactsRef.current = null
      setSaving(true)
      void persistArtifact(slot, 'response', pendingArtifacts.responseBlob)
        .then(() => persistArtifact(slot, 'audio', pendingArtifacts.audioBlob as Blob))
        .catch((recordingError) => {
          setError(
            recordingError instanceof Error
              ? recordingError.message
              : 'Rekaman respons gagal disimpan.'
          )
        })
        .finally(() => {
          setSaving(false)
          setRecordingMode(null)
          responseVideoRecorderRef.current = null
          responseAudioRecorderRef.current = null
        })
    },
    [persistArtifact]
  )

  const startExposureRecording = useCallback(async (): Promise<void> => {
    const stream = previewStreamRef.current
    if (!stream) {
      throw new Error('Kamera belum siap untuk rekaman paparan.')
    }
    if (!selectedVideoMimeType) {
      throw new Error('Perangkat ini tidak mendukung rekaman video MP4 yang dibutuhkan pipeline.')
    }

    setError(null)
    setSaving(false)

    const capture = cloneCaptureStream(stream)
    if (capture.tracks.every((track) => track.kind !== 'video')) {
      stopTracks(capture.tracks)
      throw new Error('Track video kamera tidak tersedia untuk rekaman paparan.')
    }

    const slot = currentSlotIndex + 1
    const recorder = new MediaRecorder(capture.mediaStream, {
      mimeType: selectedVideoMimeType
    })

    const handle: RecorderHandle = { recorder, chunks: [], tracks: capture.tracks }
    exposureRecorderRef.current = handle
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        handle.chunks.push(event.data)
      }
    }
    recorder.onstop = () => {
      const blob = new Blob(handle.chunks, {
        type: recorder.mimeType || selectedVideoMimeType
      })
      setSaving(true)
      void persistArtifact(slot, 'exposure', blob)
        .catch((recordingError) => {
          setError(
            recordingError instanceof Error
              ? recordingError.message
              : 'Rekaman paparan gagal disimpan.'
          )
        })
        .finally(() => {
          stopTracks(handle.tracks)
          setSaving(false)
          setRecordingMode(null)
          exposureRecorderRef.current = null
        })
    }

    try {
      recorder.start()
      setRecordingMode('exposure')
    } catch (recordingError) {
      stopTracks(handle.tracks)
      exposureRecorderRef.current = null
      throw recordingError instanceof Error
        ? recordingError
        : new Error('Rekaman paparan gagal dimulai.')
    }
  }, [currentSlotIndex, persistArtifact, selectedVideoMimeType])

  const stopExposureRecording = useCallback((): void => {
    stopRecorder(exposureRecorderRef.current)
  }, [])

  const startResponseRecording = useCallback(async (): Promise<void> => {
    const stream = previewStreamRef.current
    if (!stream) {
      throw new Error('Kamera belum siap untuk rekaman respons.')
    }
    if (!selectedVideoMimeType) {
      throw new Error('Perangkat ini tidak mendukung rekaman video MP4 yang dibutuhkan pipeline.')
    }

    const videoCapture = cloneCaptureStream(stream)
    if (videoCapture.tracks.every((track) => track.kind !== 'video')) {
      stopTracks(videoCapture.tracks)
      throw new Error('Track video kamera tidak tersedia untuk rekaman respons.')
    }

    const audioTracks = cloneTrackStream(stream, 'audio')
    if (audioTracks.length === 0) {
      stopTracks(videoCapture.tracks)
      throw new Error('Track mikrofon tidak tersedia untuk rekaman audio respons.')
    }

    const slot = currentSlotIndex + 1
    const videoRecorder = new MediaRecorder(videoCapture.mediaStream, {
      mimeType: selectedVideoMimeType
    })
    const audioStream = new MediaStream(audioTracks)
    const audioContext = new AudioContext()
    const source = audioContext.createMediaStreamSource(audioStream)
    const processor = audioContext.createScriptProcessor(4096, 1, 1)
    const sink = audioContext.createGain()
    sink.gain.value = 0

    source.connect(processor)
    processor.connect(sink)
    sink.connect(audioContext.destination)

    const videoHandle: RecorderHandle = {
      recorder: videoRecorder,
      chunks: [],
      tracks: videoCapture.tracks
    }
    const audioHandle: WavRecorderHandle = {
      audioContext,
      source,
      processor,
      sink,
      chunks: [],
      tracks: audioTracks
    }

    processor.onaudioprocess = (event) => {
      const channel = event.inputBuffer.getChannelData(0)
      audioHandle.chunks.push(new Float32Array(channel))
    }

    responseVideoRecorderRef.current = videoHandle
    responseAudioRecorderRef.current = audioHandle
    pendingResponseArtifactsRef.current = {
      slot,
      responseBlob: null,
      audioBlob: null
    }

    videoRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        videoHandle.chunks.push(event.data)
      }
    }

    videoRecorder.onstop = () => {
      const pendingArtifacts = pendingResponseArtifactsRef.current
      if (!pendingArtifacts || pendingArtifacts.slot !== slot) {
        stopTracks(videoHandle.tracks)
        responseVideoRecorderRef.current = null
        return
      }

      pendingArtifacts.responseBlob = new Blob(videoHandle.chunks, {
        type: videoRecorder.mimeType || selectedVideoMimeType
      })
      stopTracks(videoHandle.tracks)
      persistResponseArtifactsIfReady(slot)
    }

    try {
      await audioContext.resume()
      videoRecorder.start()
      setRecordingMode('response')
    } catch (recordingError) {
      pendingResponseArtifactsRef.current = null
      stopTracks(videoHandle.tracks)
      stopTracks(audioHandle.tracks)
      processor.disconnect()
      source.disconnect()
      sink.disconnect()
      void audioContext.close()
      responseVideoRecorderRef.current = null
      responseAudioRecorderRef.current = null
      throw recordingError instanceof Error
        ? recordingError
        : new Error('Rekaman respons gagal dimulai.')
    }
  }, [currentSlotIndex, persistResponseArtifactsIfReady, selectedVideoMimeType])

  const stopResponseRecording = useCallback((): void => {
    const audioHandle = responseAudioRecorderRef.current
    const pendingArtifacts = pendingResponseArtifactsRef.current

    if (audioHandle && pendingArtifacts) {
      pendingArtifacts.audioBlob = finalizeWavRecorder(audioHandle)
    }

    stopRecorder(responseVideoRecorderRef.current)
  }, [])

  const setAnswer = useCallback((index: number, value: number): void => {
    setAnswers((current) => {
      const next = [...current]
      next[index] = value
      return next
    })
  }, [])

  const saveQuestionnaire = useCallback(async (): Promise<void> => {
    if (!sessionId) {
      return
    }

    const completeAnswers = answers.every((value): value is number =>
      QUESTION_SCALE_VALUES.includes(value as (typeof QUESTION_SCALE_VALUES)[number])
    )
    if (!completeAnswers) {
      setError('Lengkapi seluruh 36 item ECR-RS dengan skala 1-6.')
      return
    }

    setSaving(true)
    try {
      const nextSession = await attachedApi.sessions.saveQuestionnaire({
        sessionId,
        answers: answers as number[]
      })
      applySession(nextSession)
      onSessionChanged()
    } catch (questionnaireError) {
      setError(
        questionnaireError instanceof Error
          ? questionnaireError.message
          : 'Kuesioner gagal disimpan.'
      )
    } finally {
      setSaving(false)
    }
  }, [answers, applySession, onSessionChanged, sessionId])

  const fillDebugSession = useCallback(async (): Promise<void> => {
    if (!sessionId) {
      return
    }

    setSaving(true)
    setError(null)
    try {
      const nextSession = await attachedApi.sessions.seedDebug(sessionId)
      setInferenceStatus(null)
      applySession(nextSession)
      onSessionChanged()
    } catch (debugError) {
      setError(debugError instanceof Error ? debugError.message : 'Sesi uji gagal diisi.')
    } finally {
      setSaving(false)
    }
  }, [applySession, onSessionChanged, sessionId])

  const startInference = useCallback(async (): Promise<void> => {
    if (!sessionId) {
      return
    }

    setSaving(true)
    setError(null)
    try {
      const status = await attachedApi.inference.start(sessionId)
      setInferenceStatus(status)
      setStep('running')
      onSessionChanged()
    } catch (inferenceError) {
      setError(
        inferenceError instanceof Error
          ? inferenceError.message
          : 'Pemrosesan asesmen gagal dimulai.'
      )
    } finally {
      setSaving(false)
    }
  }, [onSessionChanged, sessionId])

  const returnToReview = useCallback(async (): Promise<void> => {
    if (!sessionId) {
      return
    }

    setSaving(true)
    try {
      const nextSession = await attachedApi.sessions.updateStep(sessionId, 'review')
      applySession(nextSession)
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'Tinjauan gagal dibuka.')
    } finally {
      setSaving(false)
    }
  }, [applySession, sessionId])

  const submitResultFeedback = useCallback(
    async (
      verdict: ResultFeedback['verdict'],
      correctedLabel?: 'secure' | 'insecure' | null
    ): Promise<void> => {
      if (!sessionId) {
        return
      }

      setSaving(true)
      setError(null)
      try {
        const nextSession = await attachedApi.inference.submitFeedback({
          sessionId,
          verdict,
          correctedLabel
        })
        applySession(nextSession)
        onSessionChanged()
      } catch (feedbackError) {
        setError(
          feedbackError instanceof Error ? feedbackError.message : 'Feedback hasil gagal disimpan.'
        )
      } finally {
        setSaving(false)
      }
    },
    [applySession, onSessionChanged, sessionId]
  )

  const abortSession = useCallback(async (): Promise<void> => {
    if (!sessionId) {
      return
    }

    setSaving(true)
    setError(null)
    discardActiveRecordings()
    stopPreview()

    try {
      const nextSession = await attachedApi.sessions.abort(sessionId)
      setInferenceStatus(null)
      applySession(nextSession)
      onSessionChanged()
      onSessionAborted(sessionId)
    } catch (abortError) {
      setError(abortError instanceof Error ? abortError.message : 'Sesi gagal dibatalkan.')
    } finally {
      setSaving(false)
    }
  }, [
    applySession,
    discardActiveRecordings,
    onSessionAborted,
    onSessionChanged,
    sessionId,
    stopPreview
  ])

  const identityReady = participantId.trim().length > 0 && participantName.trim().length > 0
  const answeredCount = answers.filter((value) => typeof value === 'number').length
  const captureCompletionCount = captures.filter(
    (capture) => capture.exposure && capture.response && capture.audio
  ).length
  const reviewReady =
    identityReady && answeredCount === QUESTION_COUNT && captureCompletionCount === STIMULUS_COUNT

  return {
    state: {
      loading,
      saving,
      session,
      step,
      error,
      participantId,
      participantName,
      age,
      notes,
      answers,
      captures,
      currentSlotIndex,
      previewError,
      videoReady,
      microphoneReady,
      microphoneLevel,
      recordingMode,
      inferenceStatus,
      result,
      selectedVideoMimeType,
      selectedAudioMimeType,
      identityReady,
      answeredCount,
      captureCompletionCount,
      reviewReady
    },
    previewVideoRef,
    actions: {
      reload,
      updateParticipantField,
      saveIdentity,
      submitConsent,
      revokeConsent,
      goToIdentity,
      continueToRecording,
      continueToQuestionnaire,
      saveQuestionnaire,
      fillDebugSession,
      selectSlot: setCurrentSlotIndex,
      startExposureRecording,
      stopExposureRecording,
      startResponseRecording,
      stopResponseRecording,
      setAnswer,
      startInference,
      returnToReview,
      submitResultFeedback,
      abortSession
    }
  }
}
