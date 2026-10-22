/**
 * Shared types for the barcode scanner primitives.
 *
 * These types do not depend on Payload or on the Admin UI, so they can be
 * reused by any React application (for example, a PWA).
 */

export type ScanSource = 'camera' | 'usb' | 'manual'

export type ScannerStatus =
  | 'idle'
  | 'starting'
  | 'scanning'
  | 'success'
  | 'error'
  | 'cancelled'
  | 'permission-denied'
  | 'unavailable'

export type ScanErrorCode =
  | 'camera-in-use'
  | 'camera-unavailable'
  | 'invalid-code'
  | 'insecure-context'
  | 'not-supported'
  | 'permission-denied'
  | 'unknown'

export interface ScanResult {
  /** The decoded text exactly as returned by the reader. */
  code: string
  /** Camera, USB keyboard-wedge or manual entry. */
  source: ScanSource
  /** Epoch milliseconds when the scan was accepted. */
  timestamp: number
}

export interface ScanError {
  code: ScanErrorCode
  message: string
  cause?: unknown
}

export interface ScanValidationOptions {
  /** Maximum accepted length after trimming. Defaults to 256. */
  maxLength?: number
  /** Minimum accepted length after trimming. Defaults to 1. */
  minLength?: number
  /**
   * A JavaScript regular expression source used to validate the code.
   * Defaults to printable ASCII (`^[\x20-\x7E]+$`).
   */
  pattern?: string
}

export interface CameraScannerOptions {
  /** How long a duplicate result is ignored after a successful scan. Default 1500 ms. */
  duplicateWindowMs?: number
  /** Preferred camera. Defaults to the rear camera (`environment`). */
  facingMode?: 'environment' | 'user'
  /** Delay between decode attempts. Default 150 ms. */
  scanDelayMs?: number
  /** Delay between successful results. Default 750 ms. */
  scanSuccessDelayMs?: number
  validation?: ScanValidationOptions
}

export const DEFAULT_VALIDATION: Required<Pick<ScanValidationOptions, 'maxLength' | 'minLength'>> &
  ScanValidationOptions = {
  maxLength: 256,
  minLength: 1,
  pattern: '^[\\x20-\\x7E]+$',
}

/**
 * Validates the decoded text. Barcode formats and lengths vary, so the default
 * only enforces a useful upper bound and printable characters.
 */
export function validateBarcode(
  rawCode: string,
  options: ScanValidationOptions = {},
): { code: string; error?: ScanError } {
  const settings = { ...DEFAULT_VALIDATION, ...options }
  const code = rawCode.trim()

  if (code.length < (settings.minLength ?? 1)) {
    return {
      code,
      error: {
        code: 'invalid-code',
        message: `O código é curto demais (mínimo de ${settings.minLength ?? 1} caracteres).`,
      },
    }
  }

  if (code.length > (settings.maxLength ?? 256)) {
    return {
      code,
      error: {
        code: 'invalid-code',
        message: `O código é longo demais (máximo de ${settings.maxLength ?? 256} caracteres).`,
      },
    }
  }

  if (settings.pattern) {
    try {
      if (!new RegExp(settings.pattern).test(code)) {
        return {
          code,
          error: { code: 'invalid-code', message: 'O código contém caracteres inválidos.' },
        }
      }
    } catch (cause) {
      return {
        code,
        error: {
          code: 'invalid-code',
          message: 'A configuração de validação do código é inválida.',
          cause,
        },
      }
    }
  }

  return { code }
}
