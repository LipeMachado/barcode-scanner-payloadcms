'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'

import {
  validateBarcode,
  type ScanError,
  type ScanResult,
  type ScanValidationOptions,
  type ScannerStatus,
} from './types.js'

export interface UsbScannerInputProps {
  /** Called when a complete code is read. */
  onScan: (result: ScanResult) => void
  /** Called for rejected input. */
  onError?: (error: ScanError) => void
  /** Called whenever the reader state changes. */
  onStatusChange?: (status: ScannerStatus, error?: ScanError) => void
  /** Character used by the device to finish a read. Defaults to Enter. */
  terminator?: 'Enter' | 'Tab' | 'Timeout'
  /** Idle delay used only by the `Timeout` terminator. Default 120 ms. */
  idleTimeoutMs?: number
  /** A duplicate code is ignored during this interval. Default 1500 ms. */
  duplicateWindowMs?: number
  /** Validation applied to the input. */
  validation?: ScanValidationOptions
  /** Focus the field when it mounts. Default true. */
  autoFocus?: boolean
  /** Disable input without unmounting it. */
  disabled?: boolean
  /** Accessible label. */
  label?: string
  placeholder?: string
  className?: string
  /** `usb` for a hardware reader, `manual` for typed input. Default `usb`. */
  source?: 'manual' | 'usb'
}

/**
 * Input for USB barcode readers that emulate a keyboard ("keyboard wedge").
 *
 * The reader must be focused for keystrokes to arrive. The device may finish a
 * read with Enter, Tab or no delimiter at all; all three behaviours are
 * supported. The component never listens globally, so it cannot steal input
 * from other form fields.
 */
export function UsbScannerInput({
  onScan,
  onError,
  onStatusChange,
  terminator = 'Enter',
  idleTimeoutMs = 120,
  duplicateWindowMs = 1500,
  validation,
  autoFocus = true,
  disabled = false,
  label = 'Código de barras',
  placeholder = 'Aponte o leitor e dispare',
  className,
  source = 'usb',
}: UsbScannerInputProps) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastScanRef = useRef<{ at: number; code: string } | null>(null)
  const [value, setValue] = useState('')
  const [status, setStatus] = useState<ScannerStatus>('idle')
  const [message, setMessage] = useState('')

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const setReaderStatus = useCallback(
    (next: ScannerStatus, error?: ScanError) => {
      setStatus(next)
      onStatusChange?.(next, error)
    },
    [onStatusChange],
  )

  const submit = useCallback(
    (raw: string) => {
      clearTimer()
      const parsed = validateBarcode(raw, validation)
      if (parsed.error) {
        setMessage(parsed.error.message)
        setReaderStatus('error', parsed.error)
        onError?.(parsed.error)
        return
      }

      if (!parsed.code) return

      const now = Date.now()
      const last = lastScanRef.current
      if (last && last.code === parsed.code && now - last.at < duplicateWindowMs) {
        setMessage('Leitura repetida ignorada.')
        return
      }

      lastScanRef.current = { at: now, code: parsed.code }
      setMessage('')
      setValue('')
      setReaderStatus('success')
      onScan({ code: parsed.code, source, timestamp: now })
    },
    [clearTimer, duplicateWindowMs, onError, onScan, setReaderStatus, source, validation],
  )

  useEffect(() => {
    if (autoFocus && !disabled) {
      const raf = requestAnimationFrame(() => inputRef.current?.focus())
      return () => cancelAnimationFrame(raf)
    }
    return undefined
  }, [autoFocus, disabled])

  useEffect(() => clearTimer, [clearTimer])

  const scheduleTimeoutFlush = useCallback(() => {
    if (terminator !== 'Timeout') return
    clearTimer()
    timerRef.current = setTimeout(() => {
      const current = inputRef.current?.value ?? ''
      if (current.trim()) submit(current)
    }, idleTimeoutMs)
  }, [clearTimer, idleTimeoutMs, submit, terminator])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (disabled) return

      if (
        (terminator === 'Enter' && event.key === 'Enter') ||
        (terminator === 'Tab' && event.key === 'Tab')
      ) {
        event.preventDefault()
        submit(event.currentTarget.value)
        return
      }

      if (event.key.length === 1) {
        setReaderStatus('scanning')
        setMessage('')
        scheduleTimeoutFlush()
      }
    },
    [disabled, scheduleTimeoutFlush, setReaderStatus, submit, terminator],
  )

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setValue(event.target.value)
      if (event.target.value) setReaderStatus('scanning')
      scheduleTimeoutFlush()
    },
    [scheduleTimeoutFlush, setReaderStatus],
  )

  return (
    <div className={`bcsp-usb ${className ?? ''}`.trim()} data-state={status}>
      <label className="bcsp-usb__label" htmlFor={id}>
        {label}
      </label>
      <input
        aria-describedby={`${id}-hint`}
        autoComplete="off"
        autoFocus={autoFocus}
        className="bcsp-usb__input"
        disabled={disabled}
        id={id}
        inputMode="text"
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        ref={inputRef}
        spellCheck={false}
        type="text"
        value={value}
      />
      <p className="bcsp-hint" id={`${id}-hint`}>
        {message ||
          (terminator === 'Timeout'
            ? 'Leitor USB sem delimitador: o código é confirmado após uma breve pausa.'
            : `Leitor USB: o código é confirmado com ${
                terminator === 'Enter' ? 'Enter' : 'Tab'
              } ou pelo botão ao lado.`)}
      </p>
      <button
        className="bcsp-button bcsp-button--small"
        disabled={disabled || !value.trim()}
        onClick={() => submit(value)}
        type="button"
      >
        Usar código
      </button>
    </div>
  )
}
