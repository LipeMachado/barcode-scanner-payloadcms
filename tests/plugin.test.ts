import { describe, expect, it } from 'vitest'
import type { Config } from 'payload'

import { barcodeScannerPlugin, BARCODE_SCANNER_COMPONENT_PATH } from '../src/index.js'

function configWith(fields: unknown[]): Config {
  return {
    collections: [{ slug: 'products', fields }],
  } as unknown as Config
}

function apply(
  plugin: ReturnType<typeof barcodeScannerPlugin>,
  config: Config,
): Config {
  return plugin(config) as Config
}

describe('barcodeScannerPlugin', () => {
  it('injects an afterInput component into an existing text field', () => {
    const incoming = configWith([
      { name: 'name', type: 'text' },
      {
        name: 'codeBar',
        type: 'text',
        admin: { components: { afterInput: [{ path: '/custom#Existing' }] } },
      },
    ])

    const config = apply(
      barcodeScannerPlugin({
        fields: [{ collection: 'products', field: 'codeBar', afterScan: { focusField: 'name' } }],
      }),
      incoming,
    )

    const field = config.collections?.[0]?.fields?.[1] as {
      admin?: { components?: { afterInput?: unknown[] } }
    }
    expect(field.admin?.components?.afterInput).toHaveLength(2)
    expect(JSON.stringify(field.admin?.components?.afterInput)).toContain(
      BARCODE_SCANNER_COMPONENT_PATH,
    )
    expect(JSON.stringify(field.admin?.components?.afterInput)).toContain('/custom#Existing')
  })

  it('preserves hooks and does not mutate the incoming config', () => {
    const hook = () => undefined
    const incoming = configWith([
      { name: 'codeBar', type: 'text', hooks: { beforeValidate: [hook] } },
    ])

    const config = apply(
      barcodeScannerPlugin({ fields: [{ collection: 'products', field: 'codeBar' }] }),
      incoming,
    )

    const originalField = incoming.collections?.[0]?.fields?.[0] as {
      admin?: { components?: { afterInput?: unknown[] } }
    }
    const changedField = config.collections?.[0]?.fields?.[0] as {
      hooks?: { beforeValidate?: unknown[] }
    }
    expect(originalField.admin?.components?.afterInput).toBeUndefined()
    expect(changedField.hooks?.beforeValidate).toHaveLength(1)
  })

  it('works in nested groups and marks the field read-only when manual entry is disabled', () => {
    const incoming = configWith([
      {
        type: 'group',
        name: 'identificacao',
        fields: [{ name: 'codeBar', type: 'text' }],
      },
    ])

    const config = apply(
      barcodeScannerPlugin({
        fields: [{ collection: 'products', field: 'codeBar', allowManualEntry: false }],
      }),
      incoming,
    )

    const group = config.collections?.[0]?.fields?.[0] as {
      fields: Array<{ admin?: { readOnly?: boolean; components?: { afterInput?: unknown[] } } }>
    }
    expect(group.fields[0]?.admin?.readOnly).toBe(true)
    expect(group.fields[0]?.admin?.components?.afterInput).toHaveLength(1)
  })

  it('returns the config unchanged when disabled', () => {
    const incoming = configWith([{ name: 'codeBar', type: 'text' }])
    const config = apply(
      barcodeScannerPlugin({
        enabled: false,
        fields: [{ collection: 'missing', field: 'nope' }],
      }),
      incoming,
    )
    expect(config).toBe(incoming)
  })

  it('throws on missing collection, missing field and non-text fields', () => {
    expect(() =>
      barcodeScannerPlugin({ fields: [{ collection: 'missing', field: 'codeBar' }] })(
        configWith([{ name: 'codeBar', type: 'text' }]),
      ),
    ).toThrow(/Collection "missing" was not found/)

    expect(() =>
      barcodeScannerPlugin({ fields: [{ collection: 'products', field: 'missing' }] })(
        configWith([{ name: 'codeBar', type: 'text' }]),
      ),
    ).toThrow(/was not found in collection/)

    expect(() =>
      barcodeScannerPlugin({ fields: [{ collection: 'products', field: 'codeBar' }] })(
        configWith([{ name: 'codeBar', type: 'number' }]),
      ),
    ).toThrow(/must be a text field/)
  })

  it('validates empty and duplicate options', () => {
    expect(() => barcodeScannerPlugin({ fields: [] })(configWith([]))).toThrow(
      /Configure at least one field/,
    )

    expect(() =>
      barcodeScannerPlugin({
        fields: [
          { collection: 'products', field: 'codeBar' },
          { collection: 'products', field: 'codeBar' },
        ],
      })(configWith([{ name: 'codeBar', type: 'text' }])),
    ).toThrow(/Duplicate configuration/)
  })

  it('is idempotent when applied twice', () => {
    const options = {
      fields: [{ collection: 'products', field: 'codeBar' as const }],
    }
    const once = apply(
      barcodeScannerPlugin(options),
      configWith([{ name: 'codeBar', type: 'text' }]),
    )
    const twice = apply(barcodeScannerPlugin(options), once)
    const field = twice.collections?.[0]?.fields?.[0] as {
      admin?: { components?: { afterInput?: unknown[] } }
    }
    expect(field.admin?.components?.afterInput).toHaveLength(1)
  })
})
