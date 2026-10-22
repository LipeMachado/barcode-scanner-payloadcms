# Basic host example

This folder shows the smallest config change needed to use the plugin:

1. Add an existing `text` field to the collection (`codeBar`).
2. Add `barcodeScannerPlugin({ fields: [{ collection: 'products', field: 'codeBar' }] })`
   to `plugins`.
3. Run `pnpm payload generate:importmap`.
4. Build and open the product form. The scan button appears below the field.

The example assumes the host installs `@payloadcms/db-postgres` and `payload`.
Copy it into a real Payload app created with `create-payload-app`, or use the
plugin's repository instructions. See the root README of this package for the
complete options and states.
