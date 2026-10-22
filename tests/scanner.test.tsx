import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { UsbScannerInput } from '../src/scanner/UsbScannerInput.js'
import { validateBarcode } from '../src/scanner/types.js'

describe('UsbScannerInput', () => {
  it('accepts a keyboard-wedge read terminated by Enter', () => {
    const onScan = vi.fn()
    render(<UsbScannerInput autoFocus={false} onScan={onScan} />)
    const input = screen.getByLabelText('Código de barras')

    fireEvent.change(input, { target: { value: '7891000000015' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onScan).toHaveBeenCalledTimes(1)
    expect(onScan.mock.calls[0]?.[0]).toMatchObject({
      code: '7891000000015',
      source: 'usb',
    })
  })

  it('supports Tab as a configurable delimiter', () => {
    const onScan = vi.fn()
    render(<UsbScannerInput autoFocus={false} onScan={onScan} terminator="Tab" />)
    const input = screen.getByLabelText('Código de barras')

    fireEvent.change(input, { target: { value: 'ABC-123' } })
    fireEvent.keyDown(input, { key: 'Tab' })

    expect(onScan).toHaveBeenCalledWith(expect.objectContaining({ code: 'ABC-123' }))
  })

  it('ignores duplicate reads within the debounce window', () => {
    const onScan = vi.fn()
    render(<UsbScannerInput autoFocus={false} onScan={onScan} />)
    const input = screen.getByLabelText('Código de barras')

    fireEvent.change(input, { target: { value: 'DUP-1' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.change(input, { target: { value: 'DUP-1' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onScan).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Leitura repetida ignorada.')).toBeTruthy()
  })

  it('reports invalid short codes and does not scan them', () => {
    const onScan = vi.fn()
    const onError = vi.fn()
    render(
      <UsbScannerInput
        autoFocus={false}
        onError={onError}
        onScan={onScan}
        validation={{ minLength: 5 }}
      />,
    )
    const input = screen.getByLabelText('Código de barras')

    fireEvent.change(input, { target: { value: 'ab' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onScan).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'invalid-code' }),
    )
  })

  it('supports a reader with no delimiter using the timeout terminator', () => {
    vi.useFakeTimers()
    const onScan = vi.fn()
    render(
      <UsbScannerInput
        autoFocus={false}
        onScan={onScan}
        terminator="Timeout"
        idleTimeoutMs={100}
      />,
    )
    const input = screen.getByLabelText('Código de barras')

    fireEvent.change(input, { target: { value: 'NO-DELIM' } })
    vi.advanceTimersByTime(120)

    expect(onScan).toHaveBeenCalledWith(expect.objectContaining({ code: 'NO-DELIM' }))
    vi.useRealTimers()
  })

  it('can submit through the explicit button (manual entry)', () => {
    const onScan = vi.fn()
    render(<UsbScannerInput autoFocus={false} onScan={onScan} source="manual" />)
    const input = screen.getByLabelText('Código de barras')

    fireEvent.change(input, { target: { value: 'MANUAL-9' } })
    fireEvent.click(screen.getByRole('button', { name: 'Usar código' }))

    expect(onScan).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'MANUAL-9', source: 'manual' }),
    )
  })
})

describe('validateBarcode', () => {
  it('trims and accepts mixed barcode formats', () => {
    expect(validateBarcode('  7891000000015  ').code).toBe('7891000000015')
    expect(validateBarcode('CODE-128/abc').error).toBeUndefined()
  })

  it('rejects empty, long and non-printable values', () => {
    expect(validateBarcode('').error?.code).toBe('invalid-code')
    expect(validateBarcode('x'.repeat(300)).error?.code).toBe('invalid-code')
    expect(validateBarcode('abc\u0000def').error?.code).toBe('invalid-code')
  })

  it('applies configured lengths and patterns', () => {
    expect(validateBarcode('123', { minLength: 4 }).error?.code).toBe('invalid-code')
    expect(validateBarcode('123', { maxLength: 2 }).error?.code).toBe('invalid-code')
    expect(validateBarcode('ABC', { pattern: '^[0-9]+$' }).error?.code).toBe('invalid-code')
    expect(validateBarcode('123', { pattern: '^[0-9]+$' }).error).toBeUndefined()
  })
})
