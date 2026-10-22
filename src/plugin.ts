import type { Config, Field, Plugin } from 'payload'

import type { ScanValidationOptions } from './scanner/types.js'

/** Component export resolved by Payload's import map. */
export const BARCODE_SCANNER_COMPONENT_PATH =
  '@lipecode/barcode-scanner-payloadcms/client#BarcodeScannerField'

export interface BarcodeScannerFieldOptions {
  /** Collection slug that owns the barcode field. */
  collection: string
  /** Name of an existing `text` field. Its value is preserved and reused. */
  field: string
  /** Text shown on the scan button. Default: "Escanear código de barras". */
  buttonLabel?: string
  /**
   * When false, the target text field is marked read-only in the Admin UI.
   * A USB keyboard-wedge reader can still submit through the scanner panel.
   * Default: true.
   */
  allowManualEntry?: boolean
  /** Starts the camera when the scan button is pressed. Default: true. */
  autoStartCamera?: boolean
  /** Preferred camera when the scan panel opens. Default: "environment". */
  facingMode?: 'environment' | 'user'
  /** Mirror the camera preview horizontally. Default: true. */
  mirrorPreview?: boolean
  /** Validation applied by the camera/USB reader before writing the field. */
  validation?: ScanValidationOptions
  /** Delimiter sent by a USB keyboard-wedge reader. Default: "Enter". */
  usbTerminator?: 'Enter' | 'Tab' | 'Timeout'
  /**
   * Behaviour after a successful read. The field is always written first.
   * A `payload:barcode-scan` CustomEvent is always dispatched on `window`.
   */
  afterScan?: {
    /** Focus an input by its `name` attribute after writing the value. */
    focusField?: string
    /** Submit the enclosing form after writing the value. Default: false. */
    submit?: boolean
  }
  /** Name of the CustomEvent dispatched after a scan. Default: "payload:barcode-scan". */
  eventName?: string
}

export interface BarcodeScannerPluginOptions {
  /**
   * Disable the plugin without removing it from the config.
   * @default true
   */
  enabled?: boolean
  /** Fields to enable. Multiple fields and collections are supported. */
  fields: BarcodeScannerFieldOptions[]
}

// Payload's Field union has many shapes (named, unnamed tabs, collapsible
// blocks). The traversal below only touches common structural keys, so a
// deliberately loose internal shape keeps this plugin compatible across them.
type AnyField = Record<string, any>

function findField(fields: AnyField[], name: string): AnyField | undefined {
  for (const field of fields) {
    if (field.name === name) return field

    if (Array.isArray(field.fields)) {
      const nested = findField(field.fields, name)
      if (nested) return nested
    }

    if (Array.isArray(field.tabs)) {
      for (const tab of field.tabs) {
        const nested = Array.isArray(tab.fields) ? findField(tab.fields, name) : undefined
        if (nested) return nested
      }
    }

    if (Array.isArray(field.blocks)) {
      for (const block of field.blocks) {
        const nested = Array.isArray(block.fields) ? findField(block.fields, name) : undefined
        if (nested) return nested
      }
    }
  }
  return undefined
}

function isAlreadyInjected(field: AnyField): boolean {
  const afterInput = field.admin?.components?.afterInput
  if (!Array.isArray(afterInput)) return false
  return afterInput.some((component: unknown) => {
    if (typeof component === 'string') return component.includes('BarcodeScannerField')
    if (component && typeof component === 'object' && 'path' in component) {
      return String((component as { path?: unknown }).path).includes('BarcodeScannerField')
    }
    return false
  })
}

function decorateField(field: AnyField, options: BarcodeScannerFieldOptions): AnyField {
  if (field.type === 'text' && field.name === options.field) {
    if (isAlreadyInjected(field)) return field

    const components = field.admin?.components ?? {}
    return {
      ...field,
      admin: {
        ...field.admin,
        components: {
          ...components,
          afterInput: [
            ...(components.afterInput ?? []),
            {
              path: BARCODE_SCANNER_COMPONENT_PATH,
              clientProps: {
                collection: options.collection,
                field: options.field,
                buttonLabel: options.buttonLabel,
                allowManualEntry: options.allowManualEntry,
                autoStartCamera: options.autoStartCamera,
                facingMode: options.facingMode,
                mirrorPreview: options.mirrorPreview,
                validation: options.validation,
                usbTerminator: options.usbTerminator,
                afterScan: options.afterScan,
                eventName: options.eventName,
              },
            },
          ],
        },
        readOnly: options.allowManualEntry === false ? true : field.admin?.readOnly,
      },
    }
  }

  if (Array.isArray(field.fields)) {
    return {
      ...field,
      fields: field.fields.map((child: AnyField) => decorateField(child, options)),
    }
  }

  if (Array.isArray(field.tabs)) {
    return {
      ...field,
      tabs: field.tabs.map((tab: AnyField) => ({
        ...tab,
        ...(Array.isArray(tab.fields)
          ? { fields: tab.fields.map((child: AnyField) => decorateField(child, options)) }
          : {}),
      })),
    }
  }

  if (Array.isArray(field.blocks)) {
    return {
      ...field,
      blocks: field.blocks.map((block: AnyField) => ({
        ...block,
        ...(Array.isArray(block.fields)
          ? { fields: block.fields.map((child: AnyField) => decorateField(child, options)) }
          : {}),
      })),
    }
  }

  return field
}

function assertOptions(options: BarcodeScannerPluginOptions): void {
  if (!Array.isArray(options.fields) || options.fields.length === 0) {
    throw new Error(
      '[barcode-scanner] Configure at least one field, for example: barcodeScannerPlugin({ fields: [{ collection: "products", field: "codeBar" }] })',
    )
  }
  const seen = new Set<string>()
  for (const entry of options.fields) {
    if (!entry.collection || !entry.field) {
      throw new Error('[barcode-scanner] Every entry requires "collection" and "field".')
    }
    const key = `${entry.collection}.${entry.field}`
    if (seen.has(key)) {
      throw new Error(`[barcode-scanner] Duplicate configuration for ${key}.`)
    }
    seen.add(key)
  }
}

/**
 * Adds barcode scanning controls to existing text fields in Payload collections.
 *
 * The plugin only appends an `afterInput` component and, optionally, marks the
 * target field read-only. Existing fields, hooks, access rules and components
 * are preserved.
 */
export function barcodeScannerPlugin(options: BarcodeScannerPluginOptions): Plugin {
  const plugin = ((incomingConfig: Config): Config => {
    if (options.enabled === false) return incomingConfig

    assertOptions(options)

    const knownCollections = new Set(
      (incomingConfig.collections ?? []).map((collection) => collection.slug),
    )
    for (const entry of options.fields) {
      if (!knownCollections.has(entry.collection)) {
        throw new Error(`[barcode-scanner] Collection "${entry.collection}" was not found.`)
      }
    }

    const collections = (incomingConfig.collections ?? []).map((collection) => {
      const entries = options.fields.filter((entry) => entry.collection === collection.slug)
      if (entries.length === 0) return collection

      let fields = collection.fields as unknown as AnyField[]
      for (const entry of entries) {
        const target = findField(fields, entry.field)
        if (!target) {
          throw new Error(
            `[barcode-scanner] Field "${entry.field}" was not found in collection "${collection.slug}".`,
          )
        }
        if (target.type !== 'text') {
          throw new Error(
            `[barcode-scanner] Field "${entry.field}" in "${collection.slug}" must be a text field; received "${target.type}".`,
          )
        }
        fields = fields.map((field) => decorateField(field, entry))
      }

      return { ...collection, fields: fields as unknown as Field[] }
    })

    return { ...incomingConfig, collections }
  }) as Plugin

  plugin.slug = 'barcode-scanner'
  plugin.options = options as unknown as Record<string, unknown>

  return plugin
}

export type { ScanValidationOptions }
