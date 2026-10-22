'use client'

import { useCallback, useMemo, useState } from 'react'
import { toast, useField, useFieldPath } from '@payloadcms/ui'

import './styles.css'
import { ScannerDialog } from '../scanner/ScannerDialog.js'
import type {
  ScanError,
  ScanResult,
  ScanValidationOptions,
  ScannerStatus,
} from '../scanner/types.js'

export interface BarcodeScannerFieldClientProps {
  collection?: string
  field?: string
  buttonLabel?: string
  allowManualEntry?: boolean
  autoStartCamera?: boolean
  facingMode?: 'environment' | 'user'
  mirrorPreview?: boolean
  validation?: ScanValidationOptions
  usbTerminator?: 'Enter' | 'Tab' | 'Timeout'
  afterScan?: {
    focusField?: string
    submit?: boolean
  }
  eventName?: string
}

const FALLBACK_EVENT = 'payload:barcode-scan'

function escapeSelector(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value)
  return value.replace(/["\\]/g, '\\$&')
}

/**
 * Admin field extension injected by `barcodeScannerPlugin`.
 *
 * It writes to the field whose `FieldPathContext` wraps this component, so it
 * works in nested groups, tabs and arrays without hard-coding a path.
 */
export function BarcodeScannerField({
  collection,
  field,
  buttonLabel,
  allowManualEntry = true,
  autoStartCamera = true,
  facingMode = 'environment',
  mirrorPreview = true,
  validation,
  usbTerminator = 'Enter',
  afterScan,
  eventName = FALLBACK_EVENT,
}: BarcodeScannerFieldClientProps) {
  const path = useFieldPath()
  const { setValue, value } = useField<string>({ path })
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<ScannerStatus>('idle')
  const [lastError, setLastError] = useState<ScanError | null>(null)

  const dialogValidation = useMemo(() => validation, [validation])

  const focusNext = useCallback(() => {
    if (!afterScan?.focusField) return
    const element = document.querySelector<HTMLElement>(
      `[name="${escapeSelector(afterScan.focusField)}"]`,
    )
    element?.focus()
  }, [afterScan?.focusField])

  const handleScan = useCallback(
    (result: ScanResult) => {
      setValue(result.code)
      setStatus('success')
      setLastError(null)
      setOpen(false)

      toast.success(`Código lido: ${result.code}`, { duration: 2500 })

      window.dispatchEvent(
        new CustomEvent(eventName, {
          detail: {
            ...result,
            collection,
            field,
            path,
          },
        }),
      )

      window.setTimeout(() => {
        focusNext()
        if (afterScan?.submit) {
          const form = document.querySelector<HTMLFormElement>('form')
          form?.requestSubmit()
        }
      }, 80)
    },
    [afterScan?.submit, collection, eventName, field, focusNext, path, setValue],
  )

  const handleStatus = useCallback((next: ScannerStatus, error?: ScanError) => {
    setStatus(next)
    if (error) setLastError(error)
  }, [])

  return (
    <div className="bcsp-field">
      <div className="bcsp-field__row">
        <button
          className="bcsp-button bcsp-button--scan"
          onClick={() => {
            setLastError(null)
            setOpen(true)
          }}
          type="button"
        >
          <svg aria-hidden="true" height="18" viewBox="0 0 20 20" width="18">
            <path
              d="M2.5 6V3.5H5M15 3.5h2.5V6M17.5 14v2.5H15M5 16.5H2.5V14M5 7v6M7.5 6.5v7M10 7v6M12.5 6.5v7M15 7v6"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.4"
            />
          </svg>
          {buttonLabel ?? 'Escanear código de barras'}
        </button>
        <span aria-live="polite" className="bcsp-field__status">
          {status === 'starting' && 'Abrindo câmera…'}
          {status === 'scanning' && 'Procurando código…'}
          {status === 'success' && 'Código preenchido.'}
          {status === 'error' && (lastError?.message ?? 'Não foi possível ler o código.')}
          {status === 'permission-denied' && 'Permissão de câmera negada.'}
          {status === 'unavailable' && (lastError?.message ?? 'Câmera indisponível.')}
          {value && status === 'idle' ? 'Código preenchido. Use o campo acima para editar.' : null}
        </span>
      </div>

      {open ? (
        <ScannerDialog
          autoStartCamera={autoStartCamera}
          mirrorPreview={mirrorPreview}
          onClose={() => setOpen(false)}
          open={open}
          onScan={handleScan}
          onStatusChange={handleStatus}
          usbTerminator={usbTerminator}
          validation={dialogValidation}
        />
      ) : null}

      {!allowManualEntry ? (
        <p className="bcsp-hint">
          A digitação direta está desabilitada. Use a câmera, um leitor USB ou o campo de leitura.
        </p>
      ) : null}
    </div>
  )
}
