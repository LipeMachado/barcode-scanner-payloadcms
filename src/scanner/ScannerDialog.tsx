'use client'

import { useEffect, useRef } from 'react'

import { UsbScannerInput } from './UsbScannerInput.js'
import { useCameraScanner } from './useCameraScanner.js'
import type {
  ScanError,
  ScanResult,
  ScanValidationOptions,
  ScannerStatus,
} from './types.js'

export interface ScannerDialogProps {
  /** Controls visibility. The camera only runs while this is true. */
  open: boolean
  onClose: (reason: 'cancelled' | 'completed') => void
  onScan: (result: ScanResult) => void
  onStatusChange?: (status: ScannerStatus, error?: ScanError) => void
  title?: string
  /**
   * Kept for API compatibility with the admin integration. A USB keyboard
   * wedge is indistinguishable from a person typing, so USB input is always
   * available. Use `field.readOnly` to prevent typing into the main field.
   */
  allowManualEntry?: boolean
  autoStartCamera?: boolean
  validation?: ScanValidationOptions
  className?: string
  usbTerminator?: 'Enter' | 'Tab' | 'Timeout'
}

/**
 * Full-screen scanner dialog with camera, USB keyboard-wedge and manual input.
 *
 * The dialog is rendered with the native `<dialog>` element, which provides
 * focus management and Escape handling without extra dependencies. The camera
 * is started only after the dialog is opened by an explicit user action.
 */
export function ScannerDialog({
  open,
  onClose,
  onScan,
  onStatusChange,
  title = 'Escanear código de barras',
  autoStartCamera = true,
  validation,
  className,
  usbTerminator = 'Enter',
}: ScannerDialogProps) {
  if (!open) return null

  return (
    <ScannerDialogContent
      autoStartCamera={autoStartCamera}
      className={className}
      onClose={onClose}
      onScan={onScan}
      onStatusChange={onStatusChange}
      title={title}
      usbTerminator={usbTerminator}
      validation={validation}
    />
  )
}

function ScannerDialogContent({
  onClose,
  onScan,
  onStatusChange,
  title,
  autoStartCamera,
  validation,
  className,
  usbTerminator,
}: Omit<ScannerDialogProps, 'open' | 'allowManualEntry'>) {
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const closedRef = useRef(false)

  const finish = (reason: 'cancelled' | 'completed') => {
    if (closedRef.current) return
    closedRef.current = true
    onClose(reason)
  }

  const camera = useCameraScanner({
    active: autoStartCamera !== false,
    onScan: (result) => {
      onScan(result)
      finish('completed')
    },
    onStatusChange,
    validation,
  })

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const handleCancel = (event: Event) => {
      event.preventDefault()
      finish('cancelled')
    }
    dialog.addEventListener('cancel', handleCancel)
    return () => dialog.removeEventListener('cancel', handleCancel)
    // finish is stable for the lifetime of this mounted dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <dialog
      aria-label={title}
      className={`bcsp-dialog ${className ?? ''}`.trim()}
      ref={dialogRef}
    >
      <div className="bcsp-dialog__header">
        <h2 className="bcsp-dialog__title">{title}</h2>
        <button
          aria-label="Cancelar leitura"
          className="bcsp-icon-button"
          onClick={() => finish('cancelled')}
          type="button"
        >
          <svg aria-hidden="true" height="18" viewBox="0 0 18 18" width="18">
            <path d="M3 3l12 12M15 3L3 15" fill="none" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        </button>
      </div>

      <div className="bcsp-camera" data-status={camera.status}>
        <video
          aria-label="Prévia da câmera"
          autoPlay
          className="bcsp-camera__video bcsp-camera__video--mirrored"
          muted
          playsInline
          ref={camera.videoRef}
        />
        <div aria-hidden="true" className="bcsp-camera__frame" />
        <div className="bcsp-camera__status" role="status">
          {camera.status === 'starting' && 'Abrindo câmera…'}
          {camera.status === 'scanning' && 'Aponte a câmera para o código de barras.'}
          {camera.status === 'permission-denied' && 'Permissão de câmera negada.'}
          {camera.status === 'error' && (camera.error?.message ?? 'Câmera indisponível.')}
          {camera.status === 'unavailable' && (camera.error?.message ?? 'Câmera indisponível.')}
          {camera.status === 'idle' && 'Câmera parada.'}
        </div>
        <div className="bcsp-camera__actions">
          <button
            className="bcsp-button bcsp-button--ghost"
            onClick={() => void camera.start()}
            type="button"
          >
            {camera.status === 'scanning' ? 'Reiniciar câmera' : 'Abrir câmera'}
          </button>
          {(camera.status === 'scanning' || camera.status === 'starting') && (
            <button
              aria-label="Virar câmera"
              className="bcsp-button bcsp-button--ghost bcsp-button--icon"
              onClick={camera.flipCamera}
              title="Virar câmera"
              type="button"
            >
              <svg aria-hidden="true" height="18" viewBox="0 0 20 20" width="18">
                <path
                  d="M4 7h3l1.2-2h3.6L13 7h3v8H4V7zm6 6.2A3.2 3.2 0 1 0 10 6.8a3.2 3.2 0 0 0 0 6.4z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                />
              </svg>
              Virar
            </button>
          )}
        </div>
      </div>

      <div className="bcsp-dialog__manual">
        <UsbScannerInput
          autoFocus
          label="Ou use um leitor USB / digite o código"
          onError={(error) => onStatusChange?.('error', error)}
          onScan={(result) => {
            onScan(result)
            finish('completed')
          }}
          onStatusChange={onStatusChange}
          placeholder="Código de barras"
          terminator={usbTerminator}
          validation={validation}
        />
      </div>
    </dialog>
  )
}
