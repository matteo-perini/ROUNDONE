# LIONFIT — PATCH INCREMENTALE R22B.6A
## Preparazione apertura Chat e Performance Audit / Motion Foundation

**Base:** R22B.5 installata. **Non installare su versioni precedenti senza prima applicare le patch precedenti.**

**Stato:** codice verificato localmente, **nessuna pubblicazione Firebase/GitHub**, general release **NON attivata**. La modalità predefinita resta il pilota Coach–Atleta già configurato. Le modifiche non richiedono di toccare Firestore Rules o Storage Rules.

### 1. Perché non attivare subito a tutti

Nel backend R22B.5 `LF_CHAT_PILOT_GYM_ID` e i due UID sono controlli **server-side**. Prima di estendere le conversazioni private dobbiamo provare le autorizzazioni, la gestione dei costi e la capacità di recupero su più palestre. Il passaggio diretto da un pilota a tutti gli account non è sicuro soltanto perché un test manuale funziona.

### 2. Modifiche di questa patch

- Nuovo file `chat-backend/functions/rolloutPolicy.mjs`: politica esplicita `pilot` (default), `allowlist` (fino a 20 palestre espressamente selezionate), `all` (solo a seguito di doppia conferma). Qualunque combinazione incompleta o inattesa viene rifiutata (fail closed).
- `chat-backend/functions/index.mjs`: usa la politica centrale, mantiene controlli su ruolo/stato account, palestra e associazione Coach–Atleta per ogni callable; per la modalità estesa il controllo visibilità risponde anche agli altri account attivi e autorizzati. **Nessun client accede direttamente ai messaggi Firestore.**
- `src/App.vue`: l'aggiornamento del contatore non letti non invia chiamate per account non autorizzati; smette di ripetere la richiesta ad ogni cambio di sezione. Aggiunge strumentazione facoltativa di performance in modalità DEV.
- `src/views/AthleteChatPreview.vue`: aggiornamento attivo ogni ~10 s (invece che ~6,5 s) e refresh al ritorno in primo piano, evitando richieste di lettura mentre la scheda del browser è nascosta.
- `src/features/performance/motionAudit.ts`: misure locali del tempo di navigazione fino al frame successivo, p50/p95 e segnalazione delle Long Animation Frames se supportate. Nessun invio online, nessun dato atleta, attivo **solo su `npm run dev` e soltanto su richiesta**.
- Test aggiunti/aggiornati per la politica di rollout e i contratti dei percorsi esistenti.

### 3. Installazione incrementale

1. **Backup fuori dal repository** dei file che saranno sostituiti:

```text
src/App.vue
src/views/AthleteChatPreview.vue
chat-backend/functions/index.mjs
chat-backend/functions/tests/hardening.test.mjs
tests/r22b-chat-contract.test.mjs
tests/r22b2-live-pilot-visibility.test.mjs
tests/r22b3-live-chat-visibility.test.mjs
```

2. Estrarre lo ZIP **nella cartella principale `LionFit-Modern-Git`**, conservando i percorsi e sovrascrivendo solo i file interessati.
3. **Non modificare** `chat-backend/functions/.env`: mantenere la configurazione pilota attiva e **non aggiungere** `LF_CHAT_ROLLOUT_MODE=all`.
4. Dal PowerShell nella cartella principale:

```powershell
npm.cmd run typecheck
npm.cmd run build
node --experimental-strip-types --test tests/r22a-chat-navigation.test.mjs tests/r22b-chat-contract.test.mjs tests/r22b2-live-pilot-visibility.test.mjs tests/r22b3-live-chat-visibility.test.mjs tests/r22b4-section-swipe.test.mjs tests/r22b5-athlete-shared-screen-motion.test.mjs tests/r22b6a-perf-security.test.mjs
cd chat-backend\functions
npm.cmd test
cd ..\..
```

5. Verificare il normale pilota Coach–Atleta con LION FIT TEST, la visibilità a un account fuori dal pilota e tutte le transizioni mobile. **Non eseguire deploy né WebDocs fino al completamento dei test e alla revisione delle Rules pubblicate.**

### 4. Performance Audit locale

- Avviare `npm.cmd run dev` su Windows.
- Aprire nel browser PC **una sola volta** la Dashboard con `?lfPerf=1` aggiunto al percorso (es.: `http://127.0.0.1:5173/home?lfPerf=1`).
- Aprire gli strumenti sviluppatore (`F12`) → scheda **Console**.
- Eseguire 15–25 passaggi Home ↔ Piano ↔ Archivio ↔ Allenamenti ↔ Agenda, sia toccando le voci sia con lo swipe da mobile o in emulazione.
- La console mostrerà `[LionFit Motion Audit]` con durata navigazione, tempo fino ai frame successivi e p50/p95 della **sessione corrente**. Le misure non sono automaticamente salvate e non vanno interpretate come tempi di caricamento effettivo dei dati Firebase.
- Per disattivare: in Console `sessionStorage.removeItem('lionfit-motion-audit')` e ricaricare.

**Obiettivo successivo R22B.6B:** usare questi dati per implementare lo swipe che segue il dito, con soglie dinamiche, annullamento elastico e rispetto delle gesture native. Non affermare che la fluidità sia aumentata finché non è verificato su dispositivi reali.

### 5. Modalità di rollout backend (NON attivarle ora)

| Modalità | Stato | Condizione |
|---|---|---|
| `pilot` (predefinita) | Conservata | Configurazione esistente `LF_CHAT_ENABLED=true` più ID palestra + coppia + `LF_CHAT_PRODUCTION_ACK` |
| `allowlist` | Predisposta | `LF_CHAT_ROLLOUT_MODE=allowlist`, lista esplicita `LF_CHAT_ALLOWED_GYM_IDS` e `LF_CHAT_GENERAL_RELEASE_ACK=REVIEWED_PRIVATE_CHAT_GENERAL_ROLLOUT` |
| `all` | **Predisposta ma NON approvata per produzione** | Serve anche `LF_CHAT_ALL_GYMS_ACK=ENABLE_AFTER_SECURITY_AND_LOAD_TESTS`; da non inserire prima di un vero collaudo multi-palestra |

Gli ID degli account e le configurazioni `.env` non vanno inseriti nei commit o negli ZIP. Quando approveremo il rilascio, il backend richiederà un nuovo deploy selettivo `functions:lionfit-chat` e successivamente il frontend WebDocs già in uso.

### 6. Blocchi prima dell'apertura generale

- Verifica delle Firestore Rules **LIVE** per le collezioni private e prova di accessi diretti negati ai client.
- Test con almeno due palestre differenti, due Coach e due Atleti; revoche, account non assegnati e messaggi incrociati devono essere rifiutati.
- Test end-to-end delle Cloud Functions su Emulator, inclusi thread esistenti, messaggi duplicati, paginazione, recupero dopo errore e invii contemporanei.
- Dimensionamento `allContacts` (oggi massimo 350 profili per palestra e 200 contatti) e carico dei polling prima di aprire a una palestra di grandi dimensioni.
- Definire conservazione ed eventuale cancellazione dei messaggi, informativa privacy e gestione degli abusi prima della vendita al pubblico.
- Monitorare i costi e gli errori Firebase nella prima settimana di rollout; predisporre ripristino rapido della modalità `pilot`.

### 7. Collaudo effettuato nella preparazione

- `vue-tsc --noEmit`: OK.
- 39/39 test frontend mirati: OK.
- 17/17 test backend locali: OK.
- Sintassi backend: OK.
- `vite build` Linux: **non completata** a causa del modulo nativo Rollup Linux mancante nelle dipendenze del progetto esportate da Windows. **Verificare con `npm.cmd run build` sul PC.**
- Test Firebase Emulator cross-tenant e test visivo mobile: **NON eseguiti in questa sessione**.
- Nessun deploy Firebase, nessun WebDocs, nessun Push GitHub.

### 8. Rollback

Ripristina i backup della sezione 3, elimina i nuovi `rolloutPolicy.mjs`, `motionAudit.ts` e i nuovi test, verifica TypeScript e build. Se in futuro avessi distribuito questa versione in modalità pilota, fai il rollback anche del backend con la copia precedente, senza cambiare le Rules. Non disattivare il progetto Firebase o eliminare collezioni messaggi.
