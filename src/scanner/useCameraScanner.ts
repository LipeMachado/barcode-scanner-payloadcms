'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { IScannerControls } from '@zxing/browser'

import {
  validateBarcode,
  type CameraScannerOptions,
  type ScanError,
  type ScanResult,
  type ScannerStatus,
} from './types.js'

interface CameraReader {
  decodeFromConstraints: (
    constraints: MediaStreamConstraints,
    preview: HTMLVideoElement,
    callback: (
      result: { getText: () => string } | undefined,
      error: unknown,
      controls: IScannerControls,
    ) => void,
  ) => Promise<IScannerControls>
}

interface UseCameraScannerOptions extends CameraScannerOptions {
  /** Starts the camera when true. */
  active: boolean
  /** Called once for each accepted barcode. */
  onScan: (result: ScanResult) => void
  /** Called whenever the state changes. */
  onStatusChange?: (status: ScannerStatus, error?: ScanError) => void
}

interface UseCameraScannerResult {
  videoRef: React.RefObject<HTMLVideoElement | null>
  status: ScannerStatus
  error: ScanError | null
  facingMode: 'environment' | 'user'
  /** True when the active camera is front-facing and the preview should be mirrored. */
  previewMirrored: boolean
  start: () => Promise<void>
  stop: () => void
  flipCamera: () => void
}

const DEFAULT_CAMERA_OPTIONS: Required<
  Pick<CameraScannerOptions, 'duplicateWindowMs' | 'scanDelayMs' | 'scanSuccessDelayMs'>
> = {
  duplicateWindowMs: 1500,
  scanDelayMs: 150,
  scanSuccessDelayMs: 750,
}

function resolvePreviewMirrored(
  stream: MediaStream | null | undefined,
  requested: 'environment' | 'user',
): boolean {
  const actual = stream?.getVideoTracks()[0]?.getSettings().facingMode
  if (actual === 'user') return true
  if (actual === 'environment') return false
  return requested === 'user'
}

function mapCameraError(error: unknown): ScanError {
  const name = error instanceof Error ? error.name : ''

  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return {
      code: 'permission-denied',
      message: 'Permissão de câmera negada. Autorize o acesso ou use o código digitado.',
      cause: error,
    }
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return {
      code: 'camera-unavailable',
      message: 'Nenhuma câmera compatível foi encontrada neste dispositivo.',
      cause: error,
    }
  }

  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return {
      code: 'camera-in-use',
      message: 'A câmera está sendo usada por outro aplicativo. Feche-o e tente novamente.',
      cause: error,
    }
  }

  return {
    code: 'unknown',
    message: 'Não foi possível iniciar a câmera. Use o leitor USB ou digite o código.',
    cause: error,
  }
}

/**
 * Continuous camera barcode scanning with explicit lifecycle management.
 *
 * The camera only starts when `active` is true (or `start()` is called).
 * Every track is released on stop and on unmount.
 */
export function useCameraScanner({
  active,
  onScan,
  onStatusChange,
  duplicateWindowMs = DEFAULT_CAMERA_OPTIONS.duplicateWindowMs,
  facingMode: initialFacingMode = 'environment',
  scanDelayMs = DEFAULT_CAMERA_OPTIONS.scanDelayMs,
  scanSuccessDelayMs = DEFAULT_CAMERA_OPTIONS.scanSuccessDelayMs,
  validation,
}: UseCameraScannerOptions): UseCameraScannerResult {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const sessionRef = useRef(0)
  const stopRequestedRef = useRef(false)
  const lastScanRef = useRef<{ at: number; code: string } | null>(null)
  const lastInvalidRef = useRef<string>('')
  const onScanRef = useRef(onScan)
  const onStatusChangeRef = useRef(onStatusChange)
  const validationRef = useRef(validation)
  const [status, setStatus] = useState<ScannerStatus>('idle')
  const [error, setError] = useState<ScanError | null>(null)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>(initialFacingMode)
  const [previewMirrored, setPreviewMirrored] = useState(initialFacingMode === 'user')
  const [restartToken, setRestartToken] = useState(0)

  onScanRef.current = onScan
  onStatusChangeRef.current = onStatusChange
  validationRef.current = validation

  const updateStatus = useCallback((next: ScannerStatus, nextError?: ScanError) => {
    setStatus(next)
    setError(nextError ?? null)
    onStatusChangeRef.current?.(next, nextError)
  }, [])

  const releaseTracks = useCallback(() => {
    const video = videoRef.current
    const stream = video?.srcObject
    if (stream instanceof MediaStream) {
      stream.getTracks().forEach((track) => track.stop())
    }
    if (video) {
      video.srcObject = null
    }
  }, [])

  const stop = useCallback(
    (nextStatus: ScannerStatus = 'idle') => {
      stopRequestedRef.current = true
      sessionRef.current += 1
      controlsRef.current?.stop()
      controlsRef.current = null
      releaseTracks()
      if (nextStatus !== 'success' && nextStatus !== 'permission-denied' && nextStatus !== 'error') {
        setStatus(nextStatus)
      }
    },
    [releaseTracks],
  )

  const start = useCallback(async () => {
    const video = videoRef.current
    if (!video) return

    const session = sessionRef.current + 1
    sessionRef.current = session
    stopRequestedRef.current = false

    if (typeof window !== 'undefined' && !window.isSecureContext) {
      const secureError: ScanError = {
        code: 'insecure-context',
        message: 'A câmera exige HTTPS (ou localhost). Use o leitor USB ou digite o código.',
      }
      updateStatus('unavailable', secureError)
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      const unsupportedError: ScanError = {
        code: 'not-supported',
        message: 'Este navegador não oferece acesso à câmera. Use o leitor USB ou digite o código.',
      }
      updateStatus('unavailable', unsupportedError)
      return
    }

    controlsRef.current?.stop()
    controlsRef.current = null
    setPreviewMirrored(facingMode === 'user')
    updateStatus('starting')

    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      const reader = new BrowserMultiFormatReader(undefined, {
        delayBetweenScanAttempts: scanDelayMs,
        delayBetweenScanSuccess: scanSuccessDelayMs,
      }) as unknown as CameraReader

      if (sessionRef.current !== session) return

      const controls = await reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: facingMode },
            height: { ideal: 720 },
            width: { ideal: 1280 },
          },
        },
        video,
        (result, _decodeError, currentControls) => {
          if (sessionRef.current !== session || stopRequestedRef.current) return
          if (!result) return

          const parsed = validateBarcode(result.getText(), validationRef.current)
          if (parsed.error) {
            if (lastInvalidRef.current !== result.getText()) {
              lastInvalidRef.current = result.getText()
              updateStatus('error', parsed.error)
            }
            return
          }

          const now = Date.now()
          const last = lastScanRef.current
          if (last && last.code === parsed.code && now - last.at < duplicateWindowMs) {
            return
          }

          lastScanRef.current = { at: now, code: parsed.code }
          currentControls.stop()
          controlsRef.current = null
          stopRequestedRef.current = true
          updateStatus('success')
          onScanRef.current({
            code: parsed.code,
            source: 'camera',
            timestamp: now,
          })
        },
      )

      if (sessionRef.current !== session) {
        controls.stop()
        releaseTracks()
        return
      }

      controlsRef.current = controls
      stopRequestedRef.current = false
      setPreviewMirrored(
        resolvePreviewMirrored(video.srcObject instanceof MediaStream ? video.srcObject : null, facingMode),
      )
      updateStatus('scanning')
    } catch (cause) {
      if (sessionRef.current !== session) return
      const cameraError = mapCameraError(cause)
      controlsRef.current?.stop()
      controlsRef.current = null
      releaseTracks()
      updateStatus(cameraError.code === 'permission-denied' ? 'permission-denied' : 'error', cameraError)
    }
  }, [
    duplicateWindowMs,
    facingMode,
    releaseTracks,
    scanDelayMs,
    scanSuccessDelayMs,
    updateStatus,
  ])

  useEffect(() => {
    if (!active) {
      stop('idle')
      return
    }

    void start()

    return () => {
      stop('idle')
    }
    // restartToken intentionally restarts the reader when the camera is flipped.
  }, [active, restartToken, start, stop])

  const flipCamera = useCallback(() => {
    setFacingMode((current) => (current === 'environment' ? 'user' : 'environment'))
    setRestartToken((token) => token + 1)
  }, [])

  useEffect(() => {
    return () => {
      sessionRef.current += 1
      controlsRef.current?.stop()
      controlsRef.current = null
      releaseTracks()
    }
  }, [releaseTracks])

  return { videoRef, status, error, facingMode, previewMirrored, start, stop, flipCamera }
}
