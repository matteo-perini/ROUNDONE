# LionFit R22B.6E.7.5 — Extreme Performance Audit SAFE

Base: R22B.6E.7.4. Patch frontend incrementale e conclusione della fase di sviluppo programmata, non certificazione di prestazioni su dispositivo. Gli otto hash del manifest E.7.4 corrispondono alla baseline di lavoro. Nessuna modifica a Rules, Firebase, backend, configurazioni o dipendenze. Non include una nuova espansione a tutte le pagine durante il trascinamento.

## Audit e correzioni

- `nativePageTrack.ts`: l'animazione interna E.7.2 attendeva solo gli eventi finish/cancel. Un browser/WebView che sospende la timeline può lasciare il rail marcato come moving e bloccare nuovi swipe. Aggiunto watchdog durata + 120 ms, con controllo d'identità dell'animazione e cancellazione del timer su stop, cambio pagina e dispose. Le superfici tornano allo stato normale anche senza callback. La preparazione ora usa due query e una lettura di clientWidth (prima sette query e due letture nel percorso di nuova coppia); durante il gesto sulla stessa coppia non ci sono nuove query o letture di layout. Il reset pulisce esclusivamente i riferimenti alle superfici effettivamente mostrate, inclusi elementi rimossi. Se una superficie non esiste più, si esce in sicurezza.
- `App.vue`: il ritorno elastico esterno può anch'esso restare in stato transitorio se manca l'evento o WAAPI fallisce. Cleanup centralizzato con timeout, rimozione degli handler prima della cancellazione, rimozione dell'anteprima e marker. Non modifica soglie, direzioni, ordine della navbar, durata normale di 340 ms, permessi o flussi Chat.
- `universalMotion.ts`: ritorno dell'anteprima con gestione dell'eccezione WAAPI e rimozione degli handler al dispose, evitando di lasciare una cue sullo schermo.
- `motionAudit.ts` + `frameCadence.ts`: audit DEV su finestra limitata di 550 ms (max 120 campioni), cancellata al cambio rotta o teardown; p50/p95/max degli intervalli tra callback requestAnimationFrame e conteggi di intervalli >25 e >50 ms. Registra pattern di route invece di path concreti con identificativi. Zero nuovi loop di misura in produzione e nessuna telemetria. Non misura frame effettivamente presentati, latenza touch hardware, CPU/GPU, memoria o Firebase.

## Analisi ciclo di vita e limite architetturale

- Home/Piano/Archivio: un solo `useAthleteLive` e un rail di tre componenti visivi. Non è aggiunta una seconda istanza del workspace. L'Archivio ha letture attivate al primo ingresso, che possono restare fino all'uscita dal workspace; Home rimane montata e può conservare i suoi listener. I listener della sessione e le lease E.3 sono separati per identità/palestra/ruolo e progetto Firebase; nessuna modifica in E.7.5. La durata e il volume di letture reali devono essere osservati sul dispositivo e tramite strumenti Firebase, non sono deducibili dai test di navigazione.
- Altre sezioni: coordinatore E.7.4 di due radici reali dopo la conferma router. Durante il dito a contatto usano ancora la cue. Non sono due pagine integrali in ogni swipe; non si è introdotto KeepAlive generalizzato, cloning del DOM o letture anticipate di Chat. Resta un possibile lavoro architetturale futuro, da decidere dopo il video.
- Chat: nessuna modifica al componente, alla gestione tastiera o ai permessi. Il cambiamento di cleanup nella shell è comune: test R22 passati, ma apertura/chiusura, tastiera e invio reali sono da collaudare. Non si presume che la correzione precedente valga per ogni browser.

## Risultati effettivi

- Baseline E.7.4: `node --experimental-strip-types --test tests/*.mjs` 765/780.
- E.7.5: medesimo comando 770/785; stessi 15 fallimenti per nome, 5 nuovi test tutti passati. Nessuna modifica ai test precedenti. R22: 185/185. TypeScript (`node node_modules/vue-tsc/bin/vue-tsc.js --noEmit`): exit 0.
- Chromium headless, modulo Page Track effettivo transpiled in DOM isolato, tre larghezze 320/390/430: 27/27 verifiche. In ciascuna larghezza: trascinamento, distanza tra le due pagine, normale conclusione, recupero con WAAPI realmente messo in pausa, annullamento, 200 transizioni dirette a durata zero senza residui, dispose e assenza di errori JS. Queste 600 transizioni aggregate sono un test di stress del cleanup, non un benchmark di swipe o FPS. Test non eseguito sull'app intera con backend LIVE e non comprende tastiera hardware/IME.
- Build Vite tentata: fallita prima della compilazione per @rollup/rollup-linux-x64-gnu assente negli ZIP Windows. Ripetere sul PC; non modificare lockfile per questo limite dell'ambiente di verifica.

## 15 test già falliti nella baseline (non risolti, da triagiare prima della vendita)
- Contratti UI e backend: duplicazione scelta da Coach, data lunedì, ogni programma con ID
- existing single-document security paths, server reads, bounded concurrency and guard for writes
- real confirmation and server readback, no simulated payments, no new access controls
- tests/patch21-auth-emulator.mjs
- single responsive inbox placement matches shell breakpoints and stable account key
- coach primary snapshot loads before deferred program fanout and obsolete tasks cannot publish
- static UI: both select views share component, assignment search cannot silently switch athlete, day checks snapshots
- static auth: existing verified rules retained, email retry refreshes token, no automatic email send
- live actions remain wired, collaborator gated, demo non transmitting
- Mobile new home can scroll, old V3 screen lock does not apply
- default LionFit branding assets exist for gyms without personalization
- tests/progress07.static.unit.mjs
- Coach senza Registro carichi; Check Zone nominata ovunque
- Foto compressa prima di ogni invio, nessun originale nello Storage
- Formati HEIC e comuni + errore se dispositivo non decodifica

Non si assume che tutti siano falsi positivi: i contratti di sicurezza, pagamenti, branding, gestione foto e Auth Emulator devono essere esaminati individualmente prima della commercializzazione.

## Installazione e controllo finale
1. Conservare il commit E.7.4 e backup dei quattro file replace. Estrarre nella root e scegliere Sostituisci tutti i file.
2. `npm.cmd run typecheck`; `npm.cmd run build`; `node --experimental-strip-types --test tests/r22*.test.mjs` (185/185 nella baseline ricostruita).
3. Prima della pubblicazione provare almeno Home/Piano/Archivio, Chat via icona e swipe, tastiera/invio su account test, Coach, scroll e bozze. Rigenerare WebDocs e pubblicare solo dopo controlli OK. Nessun deploy Firebase.
4. Video finale con indicatore touch: primo giro navbar, poi swipe lento/rapido/annullato e consecutivo, sopra card/programma, confini con Agenda/Allenamenti/Profilo, Chat aperta/chiusa/riaperta. Ripetere Coach e Atleta; evitare dati personali.
5. Per misurazioni locali opzionali, `npm.cmd run dev -- --host 0.0.0.0`, aprire indirizzo con `?lfPerf=1`, acquisire in console Motion Audit, Swipe Audit e Frame Cadence. Disattivare rimuovendo la chiave sessionStorage `lionfit-motion-audit` e il parametro URL, ricaricare. Non abilitato in produzione. Per FPS effettivi, CPU/GPU e heap usare profiling del browser/WebView su dispositivo.
6. Rollback: ripristinare i quattro replace, rimuovere i due add e la documentazione, rigenerare WebDocs o ripristinare il commit E.7.4. Non toccare Firebase.
