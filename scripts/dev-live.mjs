/** LIONFIT LOCAL PROD DEV — NO DEPLOY, NO SECRET IN SOURCE.
 * npm run dev => Vite HMR, MODE=production, NODE_ENV=development.
 * Firebase LIVE is enabled by an explicit local-only flag recognized by stagingConfig.
 * Firestore Rules are always enforced by Firebase, NOT by this script.
 */
import { readFileSync, existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const envFile = resolve(projectRoot, '.env.production.local')
function fatal(reason) { console.error(`\n[LIONFIT] ERRORE: ${reason}\n`); process.exit(1) }
if (!existsSync(envFile)) fatal('Manca .env.production.local: recupera la configurazione LIVE nella cartella privata originale. Non inserirla nella patch o su GitHub.')

// Solo preflight sui campi pubblici: non mostrare mai valori delle credenziali.
const contents = readFileSync(envFile, 'utf8')
const vars = Object.fromEntries(contents.split(/\r?\n/).flatMap(line => {
  const entry = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
  if (!entry || line.trimStart().startsWith('#')) return []
  return [[entry[1], entry[2].trim().replace(/^(['"])(.*)\1$/, '$2')]]
}))
const expectedProject = 'app-palestra-b0b9d'
if (vars.VITE_LIONFIT_MODE !== 'live' || vars.VITE_LIONFIT_LIVE_ACK !== 'LIVE_FIREBASE_RULES_CONFIRMED') fatal('La configurazione non è quella LIVE verificata.')
if (vars.VITE_FIREBASE_PROJECT_ID !== expectedProject || vars.VITE_LIONFIT_PRODUCTION_PROJECT_ID !== expectedProject) fatal('Il projectId Firebase non corrisponde alla produzione prevista.')
for (const key of ['VITE_FIREBASE_API_KEY','VITE_FIREBASE_AUTH_DOMAIN','VITE_FIREBASE_APP_ID']) if (!vars[key]) fatal(`Campo mancante: ${key}`)

const writes = (process.env.VITE_LIONFIT_LIVE_WRITES ?? vars.VITE_LIONFIT_LIVE_WRITES) === 'ENABLED_AFTER_RULES_REVIEW'
console.log('\n=======================================================')
console.log(' LION FIT · SVILUPPO LOCALE CON FIREBASE PRODUZIONE')
console.log('=======================================================')
console.log(' Autenticazione: account REALI; dati: PRODUZIONE.')
console.log(writes ? ' ATTENZIONE: SCRITTURE LIVE ABILITATE NELLA CONFIG.' : ' Scritture applicative disabilitate dalla configurazione. Non equivale a un blocco di sicurezza lato server.')
console.log(' I profili di test NON isolano automaticamente gli altri dati della palestra.')
console.log(' URL: http://localhost:5173/   Ctrl+C: stop')
console.log(' Non esegue build, pubblicazione, deploy o sync Android.\n')

if (process.argv.includes('--check')) { console.log('[LIONFIT] Configurazione PROD locale: preflight PASS. Nessuna connessione o scrittura eseguita.'); process.exit(0) }

const viteEntrypoint = resolve(projectRoot, 'node_modules/vite/bin/vite.js')
if (!existsSync(viteEntrypoint)) fatal('Dipendenze Vite mancanti: esegui npm install dalla cartella del progetto.')
const child = spawn(process.execPath, [viteEntrypoint, '--host', '127.0.0.1', '--mode', 'production', '--port', '5173', '--strictPort'], {
 cwd: projectRoot,
 env: {
  ...process.env,
  NODE_ENV: 'development',
  VITE_LIONFIT_LOCAL_PROD_DEV: 'LOCAL_PROD_PREVIEW_CONFIRMED',
  VITE_LIONFIT_UPDATE_CHECK: 'DISABLED_IN_LOCAL_PREVIEW'
 },
 stdio: 'inherit'
})
child.on('error', err => fatal(`Vite non avviato: ${err.message}`))
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0) })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { if (child.exitCode===null && !child.killed) child.kill(signal) })
