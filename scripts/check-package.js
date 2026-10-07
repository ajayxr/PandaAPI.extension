import assert from 'node:assert/strict'
import { readFile, access } from 'node:fs/promises'

const packageJson = JSON.parse(await readFile('package.json', 'utf8'))
const lockfile = JSON.parse(await readFile('package-lock.json', 'utf8'))
const manifest = JSON.parse(await readFile('public/manifest.json', 'utf8'))
const builtManifest = JSON.parse(await readFile('dist/manifest.json', 'utf8'))

assert.equal(
  manifest.version,
  packageJson.version,
  'A versão do package.json deve corresponder à versão do manifesto.',
)
assert.equal(
  lockfile.version,
  packageJson.version,
  'A versão do package-lock.json deve corresponder à versão do package.json.',
)
assert.deepEqual(
  builtManifest,
  manifest,
  'O manifesto compilado precisa estar atualizado; execute npm run build.',
)

const referencedFiles = [
  manifest.background.service_worker,
  manifest.action.default_popup,
  ...Object.values(manifest.icons),
  ...Object.values(manifest.action.default_icon),
]

for (const file of referencedFiles) {
  await access(`dist/${file}`)
}

await access('PRIVACY.md')
await access('STORE_LISTING.md')

console.log(`Pacote ${manifest.name} v${manifest.version}: manifesto e arquivos conferidos.`)
