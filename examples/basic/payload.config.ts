import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { barcodeScannerPlugin } from '@lipecode/barcode-scanner-payloadcms'

/**
 * Minimal host configuration used to show how the plugin is consumed.
 * This example is documentation; the package's test host is facilities-stock.
 */
export default buildConfig({
  admin: {
    user: 'users',
  },
  collections: [
    {
      slug: 'users',
      auth: true,
      fields: [{ name: 'name', type: 'text' }],
    },
    {
      slug: 'products',
      fields: [
        { name: 'name', type: 'text', required: true },
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
          afterScan: { focusField: 'name' },
        },
      ],
    }),
  ],
  secret: process.env.PAYLOAD_SECRET || 'example-only',
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URL || '' },
  }),
})
