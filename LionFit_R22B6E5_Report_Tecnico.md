# LionFit R22B.6E.5 — Native Swipe Engine

## 1. Base e perimetro
Patch incrementale per R22B.6E.4, ricostruita dai sorgenti e dalle patch precedenti. Obiettivo: ridurre l'attrito del touch e rimuovere le anteprime artificiali osservate nel video. Non sono stati modificati Firebase, Rules, Cloud Functions, configurazioni .env, dipendenze, permessi, cache E.3, navbar o interfaccia Chat E.4. La tastiera Chat resta oggetto della E.6.

## 2. Architettura
- Pointer Events in capture dove supportati, percorso Touch Events alternativo (non simultaneo). Si accettano input touch, non mouse/penna; il secondo dito annulla un gesto ancora non confermato. Sono preservati scroll verticale, rail orizzontali, pinch-zoom, campi, selezione, modali e bordi di sistema (20 px).
- Lock orizzontale da 7 CSS px, rapporto 1,18; riconoscimento verticale con rapporto 1,10. Velocità recente su massimo 12 campioni e finestra 120 ms. Reiezione dei gesti che ritornano verso l'origine o hanno direzione finale contraria.
- Prima del commit: feedback via requestAnimationFrame, trasformazione 92% dello spostamento entro limite 28 px (14 px al bordo). Si evita il montaggio preventivo di viste, copie DOM, snapshot di contenuti privati e listener aggiuntivi. Nessuna anteprima generica. Non si tratta di un pager a due viste reali sempre montate che seguono integralmente il dito: il contenuto di destinazione arriva solo dopo il router.
- Commit al rilascio: distanza adattiva max(48,min(82,width*0,14)) oppure almeno 26 px e velocità recente >=0,48 px/ms. Commit anticipato: gesto sufficientemente orizzontale e almeno 64 px con velocità >=0,9 px/ms oppure distanza max(88,min(124,width*0,26)); su 390 px circa 101 px. Prima del commit si può annullare, dopo il commit la navigazione è definitiva per quel contatto. Un contatto non può avviare due rotte.
- Transizione reale: offset effettivamente scritto, durata 190–285 ms per swipe; navbar 340 ms. Geometria/variabili fissate per elemento, rilascio al termine; contenuto uscente inert. Workspace Atleta condiviso conservato. Il router continua a valutare le guardie esistenti; in caso di rifiuto, ritorno alla pagina iniziale.
- Durante transizione in corso, una destinazione successiva può essere accodata, con attesa massima 380 ms. Il click esplicito esterno può annullare l'intento ancora non emesso. Un tocco esterno senza click non cancella lo swipe già accettato: in una prova estrema Chromium non ha generato il click di compatibilità dopo uno swipe immediatamente precedente; il nuovo gesto accettato non viene perso. Non equivale a garantire che ogni tocco ultra-ravvicinato venga riconosciuto su ogni browser.
- Reset per cambio sessione, larghezza, visibilità e autorizzazione Chat. Reduced motion conserva navigazione senza feedback di trascinamento.
- Audit DEV locale: ?lfPerf=1 sulla URL di sviluppo, console [LionFit Swipe Audit], lock/paint/route/cancel/ignored e percentili. paint è scrittura del transform, non presentazione fisica del frame; route misura risoluzione/trasferimento, non caricamento dati. Nessuna coordinata/identificativo/contenuto personale inviato o conservato dalla diagnostica.

## 3. Verifica
- TypeScript: `node node_modules/vue-tsc/bin/vue-tsc.js --noEmit`, exit 0 sul codice finale.
- Serie R22: 126/126, inclusi 16 nuovi test E.5. Sette test storici aggiornati nei contratti sorgente per i nuovi adattatori e per la rimozione delle anteprime; non sono tutti test end-to-end.
- Suite estesa `node --experimental-strip-types --test tests/*.mjs`: E.4 655/685; E.5 671/701. I 30 fallimenti sono gli stessi per nome e ordine; nessun nuovo fallimento, ma suite non interamente verde.
- Chromium headless: 39 verifiche riuscite con Vue, Vue Router, CSS e gestori reali estratti dall'app in una fixture isolata con schermate/servizi simulati e input touch CDP; non è un test dell'intera app né di Firebase LIVE. Campione: 8 px di spostamento -> 7,36 px di transform; 12 -> 11,04. Non è una misura della latenza hardware, FPS o frame visibile sul telefono.
- Build Vite tentata: bloccata dal modulo nativo `@rollup/rollup-linux-x64-gnu` mancante nelle dipendenze Windows fornite. Verificare build su Windows; non è dichiarata riuscita. Nessun collaudo su Safari/iOS, Android WebView reale o telefono fisico.

### Casi Chromium verificati
- ordinary tap
- diagonal card right to Chat
- swipe inside Chat vertical scrollport
- nested stopPropagation capture
- horizontal rail remains native
- vertical scrolling remains native
- short drag restores, no ghost click
- small feedback before commit
- reverse to origin cancels
- decisive swipe commits before release
- one route per contact
- delayed guard no fabricated preview
- authorized delayed route resolves
- denied guard returns original page
- visible modal blocks background swipe
- no wrap past profile
- Chat disabled not navigable
- first rapid route
- rapid next swipe queued once
- scope switch cancels drag
- no browser errors
- reduced motion skips feedback
- reduced motion still navigates
- Coach dashboard to Chat
- Coach Chat to dashboard
- Coach next navbar route
- legacy touch selected exclusively
- legacy tap
- legacy swipe
- legacy Chat swipe
- legacy rail preserved
- legacy cancellation and click guard
- 8px does not navigate or click
- 12px cancelled and no route
- editing input protected
- multitouch cancels uncommitted gesture
- long hold after early commit never clicks destination
- explicit navbar click wins over queued swipe
- immediate touch does not lose accepted navigation

### Fallimenti già presenti nella baseline E.4 (nomi dei test)
- static compat check rejects removed gym scope in every one of five screens/models
- Contratti UI e backend: duplicazione scelta da Coach, data lunedì, ogni programma con ID
- existing single-document security paths, server reads, bounded concurrency and guard for writes
- real confirmation and server readback, no simulated payments, no new access controls
- tests/patch21-auth-emulator.mjs
- single responsive inbox placement matches shell breakpoints and stable account key
- candidate extends only existing rules; exact copy for dedicated emulator
- rules preserve originals and enforce author, append-only correction audit, deletion receipt and tenant protection
- tests/patch26-work-gps.unit.mjs
- coach primary snapshot loads before deferred program fanout and obsolete tasks cannot publish
- Vue compilation and unchanged server rules fixture
- static UI: both select views share component, assignment search cannot silently switch athlete, day checks snapshots
- static auth: existing verified rules retained, email retry refreshes token, no automatic email send
- live actions remain wired, collaborator gated, demo non transmitting
- Mobile new home can scroll, old V3 screen lock does not apply
- tests/patch30-r17b-multisport.unit.mjs
- payload matches exact SHA256 manifest
- server denies missing pilot and other gyms
- only explicit invite sends targeted notification
- web and native controls gated to pilot gym
- spontaneous requests stay in existing component
- tests/patch30-r18d-competition-inbox.unit.mjs
- payload SHA: competitions-backend/functions/index.mjs
- payload SHA: competitions-backend/functions/inviteModel.mjs
- payload SHA: src/integrations/firebase/competitionInvites.ts
- default LionFit branding assets exist for gyms without personalization
- tests/progress07.static.unit.mjs
- Coach senza Registro carichi; Check Zone nominata ovunque
- Foto compressa prima di ogni invio, nessun originale nello Storage
- Formati HEIC e comuni + errore se dispositivo non decodifica

## 4. Installazione e rollback
Leggere LEGGIMI_R22B6E5.txt. Applicare esclusivamente sopra E.4. Manifest con hash pre/post, senza segreti. Backup o commit locale prima dell'estrazione. Ripristinare i file sostituiti dal backup e rimuovere i tre file nuovi se si vuole tornare alla E.4; non ripristinare il database.

## 5. Collaudo reale consigliato
- Atleta e Coach: tutti i passaggi navbar, swipe in entrambe le direzioni, Chat sinistra, ritorno Home.
- Tocco semplice su card e pulsanti, diagonali, swipe corto annullato, inverso prima della soglia, due swipe ravvicinati, swipe e tap navbar, scroll verticale e rail orizzontali, tastiera/campi, multitouch.
- Rete lenta, ritorno da background, cambio account/palestra, Chat disabilitata; nessuna schermata non autorizzata.
- Ripetere il video E.4 con medesima sequenza; se disponibile attivare mostra tocchi Android e audit DEV. Misurare prima di dichiarare 60 FPS o parità con la navbar.

## 6. File
- `src/App.vue` — modificato
- `src/features/navigation/continuousMotion.ts` — modificato
- `src/features/navigation/nativeSwipe.ts` — nuovo
- `src/features/navigation/swipeIntent.ts` — modificato
- `src/features/performance/swipeAudit.ts` — nuovo
- `src/styles-continuous-motion.css` — modificato
- `src/views/AthleteLiveWorkspace.vue` — modificato
- `tests/r22b4-section-swipe.test.mjs` — modificato
- `tests/r22b5-athlete-shared-screen-motion.test.mjs` — modificato
- `tests/r22b6b-ultra-swipe.test.mjs` — modificato
- `tests/r22b6c-swipe-intent.test.mjs` — modificato
- `tests/r22b6d-motion-continuity.test.mjs` — modificato
- `tests/r22b6e1-responsive-gesture.test.mjs` — modificato
- `tests/r22b6e2-continuous-motion.test.mjs` — modificato
- `tests/r22b6e5-native-swipe.test.mjs` — nuovo
