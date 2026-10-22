import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

await mkdir(resolve(root, 'dist/client'), { recursive: true })
await cp(resolve(root, 'src/client/styles.css'), resolve(root, 'dist/client/styles.css'))

const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
const required = [
  'dist/index.js',
  'dist/index.d.ts',
  'dist/client/index.js',
  'dist/client/BarcodeScannerField.js',
  'dist/client/styles.css',
  'dist/scanner/index.js',
  'README.md',
  'LICENSE',
]

const missing = []
for (const file of required) {
  try {
    await readFile(resolve(root, file))
  } catch {
    missing.push(file)
  }
}

if (missing.length > 0) {
  console.error(`Package is incomplete (${packageJson.name}): missing ${missing.join(', ')}`)
  process.exit(1)
}

console.log(`Package assets ready for ${packageJson.name}@${packageJson.version}`)
