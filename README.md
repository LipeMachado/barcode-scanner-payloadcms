# @lipecode/barcode-scanner-payload

Barcode scanning for **Payload CMS 3** admin fields. Adds a scan button to an
existing `text` field and fills it with a value read by camera, USB
keyboard-wedge reader or manual entry.

## Status

Pre-release (`0.1.0`). The npm package name was checked and is available; the
package has not been published because publication requires the owner's explicit
approval and access to the `@lipecode` npm scope.

<!-- Maintainers: keep release notes and usage examples here. -->

- Payload CMS: `3.91.x` (peer `^3.91.0`)
- React: 19+
- Next.js: the versions officially supported by Payload 3.91
- Browser support for the camera path: secure context (HTTPS or localhost) and
  `navigator.mediaDevices.getUserMedia`; Chromium/Android and Safari/iOS/iPadOS.
  USB readers work wherever keyboard input works.

## Install

```bash
pnpm add @lipecode/barcode-scanner-payload
```

For local development beside this repository:

```bash
pnpm add file:../barcode-scanner-payload
```

## Configure

```ts
// payload.config.ts
import { buildConfig } from 'payload'
import { barcodeScannerPlugin } from '@lipecode/barcode-scanner-payload'

export default buildConfig({
  collections: [
    {
      slug: 'products',
      fields: [
        { name: 'codeBar', type: 'text', required: true, unique: true },
      ],
    },
  ],
  plugins: [
    barcodeScannerPlugin({
      fields: [
        {
          collection: 'products',
          field: 'codeBar',
          allowManualEntry: true,
          usbTerminator: 'Enter',
          afterScan: { focusField: 'name' },
        },
      ],
    }),
  ],
})
```

The target field must already exist and must be a `text` field. The plugin
preserves its validation, hooks, access control and other admin components. It
only appends an `afterInput` component and, when `allowManualEntry` is `false`,
sets `admin.readOnly` on that field.

After changing the config, run:

```bash
pnpm payload generate:importmap
```

### Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | Disable without removing the plugin. |
| `fields` | `FieldOptions[]` | required | Fields to enhance. Multiple collections/fields are supported. |
| `fields[].collection` | `string` | required | Collection slug. |
| `fields[].field` | `string` | required | Existing `text` field name. |
| `fields[].buttonLabel` | `string` | `Escanear código de barras` | Button label. |
| `fields[].allowManualEntry` | `boolean` | `true` | When `false`, marks the field read-only in the Admin UI. |
| `fields[].autoStartCamera` | `boolean` | `true` | Camera starts when the user opens the scanner. |
| `fields[].facingMode` | `'environment' \| 'user'` | `'environment'` | Preferred camera. |
| `fields[].validation` | `{ minLength?, maxLength?, pattern? }` | printable ASCII, 1–256 chars | Client-side guard. Server validation is still required. |
| `fields[].usbTerminator` | `'Enter' \| 'Tab' \| 'Timeout'` | `'Enter'` | Delimiter sent by the reader. |
| `fields[].afterScan.focusField` | `string` | – | Focus an input by `name` after the read. |
| `fields[].afterScan.submit` | `boolean` | `false` | Submit the containing form after the read. |
| `fields[].eventName` | `string` | `payload:barcode-scan` | Custom event dispatched after a successful read. |

### Custom post-scan behaviour

Every successful scan writes the field first, then dispatches a browser event:

```ts
window.addEventListener('payload:barcode-scan', (event) => {
  const { code, source, collection, field, path } = (event as CustomEvent).detail
  console.log({ code, source, collection, field, path })
})
```

For custom screens, import the underlying primitives:

```tsx
'use client'
import {
  ScannerDialog,
  UsbScannerInput,
  useCameraScanner,
} from '@lipecode/barcode-scanner-payload/client'

<ScannerDialog
  open={open}
  onClose={() => setOpen(false)}
  onScan={(result) => console.log(result.code)}
  onStatusChange={(status, error) => console.log(status, error?.code)}
/>
```

The app in this repository uses `useCameraScanner` for its PWA, showing that the
scanner primitives are not tied to Payload Admin.

## Scanner states

All primitives expose the same status union:

`idle`, `starting`, `scanning`, `success`, `error`, `cancelled`,
`permission-denied`, `unavailable`.

Errors carry a code: `permission-denied`, `camera-unavailable`,
`camera-in-use`, `insecure-context`, `not-supported`, `invalid-code`,
`unknown`. The camera is stopped when the dialog closes, when a read succeeds,
when the caller stops it, and on unmount. Duplicate camera results are ignored
for 1.5 seconds by default. USB duplicates are ignored for the same window.

## Known limitations

- A USB keyboard-wedge reader is indistinguishable from a person typing. When
  manual typing must be prevented in the main form, set
  `allowManualEntry: false`; the scanner dialog still needs a keyboard input to
  receive USB scans.
- Camera access requires a secure context. On iOS, camera access also requires a
  modern iOS/Safari or a browser using the same WebKit APIs. The OS may suspend
  the camera when the tab is backgrounded.
- `allowManualEntry: false` sets `admin.readOnly` on the target field. It is a UI
  restriction, not a security boundary; validate barcodes on the server.
- The plugin uses `useFieldPath` from `@payloadcms/ui`, which Payload marks as
  experimental. It is used to support nested fields without hard-coding a path.
- The camera reader uses `@zxing/browser`; decoding is performed in JavaScript.
  Very small, curved or damaged barcodes may need better lighting or a USB
  reader.
- The plugin does not add server-side uniqueness validation. A barcode field
  that must be unique needs `unique: true` in the collection or a custom
  validation hook.
- A Payload custom component cannot receive arbitrary client-side callback
  functions through config. Custom post-scan code runs through the exported
  primitives (`onScan`) or the browser event.

## Development and tests

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm pack:check
```

`pnpm pack:check` creates a tarball and verifies the published file list. The
host app (`facilities-stock`) additionally tests the plugin inside a real Payload
collection with Playwright, including a real ZXing decode from a fake camera
video, USB keyboard input, permission denial and cancellation.

The package is ESM-only, matching Payload 3.

## Publishing

```bash
npm view @lipecode/barcode-scanner-payload version   # should 404 until published
pnpm test
pnpm build
pnpm pack
npm publish --access public
```

Do not publish without the package owner's explicit approval. After publishing,
add the `payload-plugin` topic to the repository.

## License

MIT
