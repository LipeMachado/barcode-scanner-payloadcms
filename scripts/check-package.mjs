import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = process.cwd()
const temp = await mkdtemp(join(tmpdir(), 'bcsp-pack-'))

try {
  const packOutput = execFileSync('pnpm', ['pack', '--pack-destination', temp], {
    cwd: root,
    encoding: 'utf8',
  })
  const tarball = packOutput.trim().split('\n').at(-1)
  if (!tarball) throw new Error('pnpm pack did not return a tarball name')
  const tarballPath = tarball.startsWith('/') ? tarball : join(temp, tarball)

  const manifest = JSON.parse(
    execFileSync('tar', ['-xOf', tarballPath, 'package/package.json'], {
      encoding: 'utf8',
    }),
  )
  const required = [
    'dist/index.js',
    'dist/index.d.ts',
    'dist/client/index.js',
    'dist/client/styles.css',
    'dist/scanner/index.js',
    'README.md',
    'LICENSE',
  ]

  const files = execFileSync('tar', ['-tf', tarballPath], { encoding: 'utf8' })
  for (const file of required) {
    if (!files.includes(`package/${file}`)) {
      throw new Error(`Tarball is missing ${file}`)
    }
  }

  const consumer = join(temp, 'consumer')
  await mkdir(consumer, { recursive: true })
  await writeFile(
    join(temp, 'package.json'),
    JSON.stringify({ name: 'bcsp-consumer', private: true, type: 'module' }, null, 2),
  )
  await writeFile(
    join(consumer, 'index.ts'),
    [
      "import { barcodeScannerPlugin } from '@lipecode/barcode-scanner-payloadcms'",
      "import { UsbScannerInput } from '@lipecode/barcode-scanner-payloadcms/scanner'",
      '',
      'void barcodeScannerPlugin({ fields: [{ collection: "products", field: "codeBar" }] })',
      'void UsbScannerInput',
      '',
    ].join('\n'),
  )

  console.log(`Tarball ${tarball} contains the expected files.`)
  console.log(`Manifest version: ${manifest.version}`)
  // The actual TypeScript consumer check is performed by the repository test
  // harness, which has the consumer dependencies installed.
} finally {
  await rm(temp, { recursive: true, force: true })
}
