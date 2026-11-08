/**
 * LionFit Modern: prepara la cartella docs/ per GitHub Pages da una build
 * LIVE gia' verificata da `npm run release:build`.
 *
 * Non fa network, Git commit/push, deploy, e non cambia le Pages Settings.
 * Mantiene la cartella precedente in caso di errore durante il cambio.
 */
import {
  existsSync, lstatSync, readdirSync, readFileSync,
  cpSync, rmSync, renameSync, writeFileSync
} from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const dest = join(root, 'docs')
const next = join(root, 'docs.__lionfit_preparing')
const prev = join(root, 'docs.__lionfit_previous')
const required = [
  'index.html', 'CNAME', '404.html', 'manifest.webmanifest',
  'www/index.html', 'www/admin.html', 'www/athlete.html',
  'www/prenotazioni.html', 'www/ios.html',
  'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'icons/icon-maskable-512.png', 'www/icons/apple-touch-icon.png',
  'www/icons/icon-192.png', 'www/icons/icon-512.png',
  'www/icons/icon-maskable-512.png', 'assets'
]
function fail(message) { throw new Error(message) }
function resolveSafe(rootDir, relativePath) {
  const full = resolve(rootDir, relativePath)
  if (full !== rootDir && !full.startsWith(rootDir + sep)) fail('Percorso non valido: ' + relativePath)
  return full
}
function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}
function checkRepository() {
  let branch, top
  try {
    branch = git(['branch', '--show-current'])
    top = git(['rev-parse', '--show-toplevel'])
  } catch {
    fail('Git non disponibile o cartella non collegata a un repository.')
  }
  if (branch !== 'main') fail(`Ramo attivo: ${branch || '(non identificato)'}. Richiesto: main.`)
  const same = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase()
  if (!same(top, root)) fail('Lo script deve essere nella radice del repository (cartella con .git).')
  const tracked = git(['ls-files', '--', '.env.production.local', '.env.staging.local', '.env'])
  if (tracked) fail('File .env locali tracciati da Git: ' + tracked.split('\n').join(', '))
}
function validateBuild() {
  if (!existsSync(dist) || !lstatSync(dist).isDirectory() || lstatSync(dist).isSymbolicLink()) fail('Manca dist/: prima esegui release:build.')
  for (const p of required) {
    const full = resolveSafe(dist, p)
    if (!existsSync(full)) fail('File obbligatorio assente dalla build: ' + p)
  }
  if (readFileSync(join(dist, 'CNAME'), 'utf8').trim() !== 'www.lionfit.it')
    fail('Dominio inatteso in dist/CNAME. Atteso: www.lionfit.it')
  const index = readFileSync(join(dist, 'index.html'), 'utf8')
  if (!/\/assets\/[^"']+\.js/.test(index)) fail('index.html non contiene il bundle Vite compilato.')
  if (/\/src\/(?:main\.ts|features\/integrative\/nativeBackEntry\.ts)/.test(index))
    fail('index.html contiene ancora riferimenti ai sorgenti, non e\' compilato.')
  const assetFiles = readdirSync(join(dist, 'assets')).filter(x => x.endsWith('.js'))
  if (!assetFiles.length) fail('Mancano i file JavaScript compilati in dist/assets.')
  // Verifica PWA iPhone e Android: installazione Home, non offline.
  let manifest
  try { manifest = JSON.parse(readFileSync(join(dist, 'manifest.webmanifest'), 'utf8')) }
  catch { fail('PWA: manifest.webmanifest non e JSON valido.') }
  if (manifest.display !== 'standalone' || manifest.start_url !== '/' || manifest.scope !== '/')
    fail('PWA: display, start_url o scope errati.')
  const icons = ['/icons/icon-192.png','/icons/icon-512.png','/icons/icon-maskable-512.png']
  if (!Array.isArray(manifest.icons) || !icons.every(src => manifest.icons.some(i => i.src === src)))
    fail('PWA: riferimenti alle icone mancanti nel manifest.')
  if (!index.includes('rel="manifest"') || !index.includes('apple-touch-icon'))
    fail('PWA: collegamenti manifest / apple-touch-icon mancanti in index.html.')
  const pngSizes = {
    'icons/apple-touch-icon.png':180, 'icons/icon-192.png':192,
    'icons/icon-512.png':512, 'icons/icon-maskable-512.png':512,
    'www/icons/apple-touch-icon.png':180, 'www/icons/icon-192.png':192,
    'www/icons/icon-512.png':512, 'www/icons/icon-maskable-512.png':512
  }
  for (const [name,size] of Object.entries(pngSizes)) {
    const png = readFileSync(join(dist,name))
    if (png.length < 24 || png.subarray(0,8).toString('hex') !== '89504e470d0a1a0a' ||
        png.readUInt32BE(16) !== size || png.readUInt32BE(20) !== size)
      fail('PWA: icona PNG mancante/non valida: ' + name)
  }
  if (!readFileSync(join(dist,'404.html'),'utf8').includes('__lfRoute') || !index.includes('__lfRoute'))
    fail('Routing SPA: fallback 404 non valido.')
  const forbiddenSegments = new Set(['.git', 'node_modules', 'security', 'src', 'android'])
  const forbiddenFiles = /^\.env(?:\..*)?$|\.(?:keystore|jks|p12|pfx|pem|key|map)$/i
  let count = 0
  function inspect(dir) {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, item.name)
      const rel = relative(dist, path).replaceAll('\\', '/')
      if (item.isSymbolicLink()) fail('Link simbolico non consentito nel sito: ' + rel)
      if (forbiddenSegments.has(item.name) || forbiddenFiles.test(item.name))
        fail('Contenuto privato/non previsto nella build: ' + rel)
      if (item.isDirectory()) inspect(path)
      else if (item.isFile()) count++
      else fail('Tipo di file inatteso nella build: ' + rel)
    }
  }
  inspect(dist)
  if (count < 8) fail('Build sospettosamente incompleta.')
  if (existsSync(dest)) {
    if (!lstatSync(dest).isDirectory() || lstatSync(dest).isSymbolicLink())
      fail('docs esiste ma non e\' una normale cartella.')
    const oldCname = join(dest, 'CNAME')
    if (!existsSync(oldCname) || readFileSync(oldCname, 'utf8').trim() !== 'www.lionfit.it')
      fail('docs esistente non identificata come sito LionFit: non la sostituisco.')
  }
  return count
}
function main() {
  checkRepository()
  const count = validateBuild()
  // Non cancellare mai una preparazione precedente lasciata a meta'.
  if (existsSync(next) || existsSync(prev))
    fail('Cartella temporanea preesistente. Verifica docs.__lionfit_preparing / docs.__lionfit_previous prima di riprovare.')
  let hadDocs = false
  let movedNewDocs = false
  try {
    cpSync(dist, next, { recursive: true, errorOnExist: true, force: false })
    writeFileSync(join(next, '.nojekyll'), '')
    if (existsSync(dest)) { renameSync(dest, prev); hadDocs = true }
    renameSync(next, dest)
    movedNewDocs = true
    if (hadDocs) rmSync(prev, { recursive: true, force: false })
  } catch (error) {
    if (!movedNewDocs) {
      // Ripristino dei contenuti pubblicati in precedenza.
      if (hadDocs && existsSync(prev) && !existsSync(dest)) {
        try { renameSync(prev, dest) } catch { /* conservato prev per recupero manuale */ }
      }
      if (existsSync(next)) {
        try { rmSync(next, { recursive: true, force: true }) } catch { /* lascia temporaneo per diagnosi */ }
      }
    }
    fail('Preparazione interrotta: ' + error.message)
  }
  console.log(`PASS: ${count} file della build LIVE preparati in docs/.`)
  console.log('NESSUN commit, push o deploy automatico. Controlla GitHub Desktop prima di pubblicare.')
}
try { main() } catch (error) { console.error('STOP: ' + error.message); process.exitCode = 1 }
