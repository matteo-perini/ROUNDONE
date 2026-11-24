# LIONFIT — PATCH INCREMENTALE R22B.6B
## Apertura Chat tutte le palestre (sorvegliata) + Ultra Fluid Swipe

**Base richiesta: R22B.5.** Questo ZIP **include le modifiche della R22B.6A**, quindi può essere installato direttamente dopo la R22B.5 senza applicare separatamente la 6A. Se hai già la 6A, installa sopra quella.

**Stato attuale:** preparato e testato offline. Non ho accesso al tuo progetto Firebase e NON ho effettuato deploy, WebDocs o Push. La Chat rimane nel precedente pilota finché non modifichi manualmente il file `.env` e distribuisci il backend. I test di interazione reale, cross-palestra e performance mobile restano da verificare sul campo.

### Che cosa cambia

1. **Chat general release**: `rolloutPolicy.mjs` supporta `LF_CHAT_ROLLOUT_MODE=all` con conferme esplicite; il backend mantiene i controlli server per UID, ruolo, palestra, stato account e associazione Coach–Atleta. Non richiede nuove Firestore Rules per il testo (le regole effettivamente LIVE vanno comunque ricontrollate). `lfChatPilotStatus` abilita la UI per account attivi autorizzati nella modalità `all`, mentre ogni API continua a controllare i permessi.
2. **Rollback semplice**: si torna al solo pilota con `LF_CHAT_ROLLOUT_MODE=pilot`, oppure si disattiva tutto con `LF_CHAT_ENABLED=false`, seguito da deploy **solo** della codebase `lionfit-chat`. Nessun dato viene cancellato.
3. **Motion Audit** (dalla 6A): misura locale facoltativa in dev con `?lfPerf=1`. Nessuna telemetria inviata online.
4. **Chat meno costosa** (dalla 6A): polling della conversazione 10 secondi solo con chat attiva, badge unread 30 secondi solo dopo autorizzazione e quando la finestra è visibile.
5. **Swipe che segue il dito**: anteprima GPU via `transform`, con resistenza ai bordi, piccole gesture annullabili, soglia distanza/velocità e ritorno elastico. La transizione Vue originale rimane responsabile del cambio pagina: senza root accessibile o con movimento ridotto il comportamento torna alla navigazione esistente. Non modifica la navbar.

### A. INSTALLAZIONE

1. Crea un backup **fuori da `LionFit-Modern-Git`** dei file che sovrascrivi:

```text
src/App.vue
src/views/AthleteChatPreview.vue
chat-backend/functions/index.mjs
chat-backend/functions/tests/hardening.test.mjs
chat-backend/functions/tests/rolloutPolicy.test.mjs (se presente)
tests/r22b-chat-contract.test.mjs
tests/r22b2-live-pilot-visibility.test.mjs
tests/r22b3-live-chat-visibility.test.mjs
```

2. Estrai questo ZIP nella root di `LionFit-Modern-Git` mantenendo le sottocartelle. Non sovrascrivere `.env` (non è incluso).
3. In PowerShell, dalla root:

```powershell
npm.cmd run typecheck
npm.cmd run build
node --experimental-strip-types --test tests/r22b6b-ultra-swipe.test.mjs
```

4. Testa gli swipe con `npm.cmd run dev` su telefono, usando gli account di test. Verifica Home ↔ Piano ↔ Archivio e le altre sezioni, Chat ↔ Home, gesto verticale, caroselli, grafici, tastiera e ritorno da swipe annullato. Non confondere i test logici con la fluidità realmente misurata sul dispositivo.

### B. APERTURA CHAT A TUTTE LE PALESTRE SU FIREBASE REALE

**Hai scelto consapevolmente un rilascio sul campo.** Sono comunque dati privati: il fatto che un messaggio non appaia nell'altra palestra non prova l'assenza di accessi indebiti. Il backend resta *fail closed* e la modalità `all` richiede conferme esplicite. Prima di utilizzare contenuti privati dei clienti, assicurati che l'informativa/condizioni coprano la messaggistica.

1. Controlla che il file locale `chat-backend/functions/.env` sia escluso da Git:

```powershell
git check-ignore chat-backend/functions/.env
```

2. Dalla root apri `notepad .\chat-backend\functions\.env` e **mantieni tutti gli ID del pilota esistenti**. Verifica queste righe (non duplicarle):

```dotenv
LF_CHAT_ENABLED=true
LF_CHAT_ROLLOUT_MODE=all
LF_CHAT_GENERAL_RELEASE_ACK=REVIEWED_PRIVATE_CHAT_GENERAL_ROLLOUT
LF_CHAT_ALL_GYMS_ACK=ENABLE_LIVE_FIELD_ROLLOUT_WITH_ROLLBACK
```

Il valore `ENABLE_LIVE_FIELD_ROLLOUT_WITH_ROLLBACK` significa solo che l'apertura sul campo è deliberata: **non attesta test di sicurezza o di carico superati**. Non inserire UID, email, token o `.env` in Git.

3. Esegui il test della politica di rollout senza toccare Firebase:

```powershell
cd chat-backend\functions
node --test tests/rolloutPolicy.test.mjs tests/model.test.mjs tests/hardening.test.mjs
```

4. Assicurati che il progetto indicato sia `app-palestra-b0b9d`, e solo allora distribuisci il backend Chat:

```powershell
cd ..
firebase.cmd deploy --only functions:lionfit-chat --project app-palestra-b0b9d
```

Se Firebase chiede di **eliminare** funzioni o modificare risorse inattese, interrompi. Non eseguire deploy di Rules/Storage né di altre codebase. Controlla che tutte le otto `lfChat*` siano ancora in `europe-west1`.

5. La build LIVE continua a richiedere la precedente riga `VITE_LIONFIT_CHAT_BETA=LIVE_PILOT_REVIEWED` in `.env.production.local`; questo **non limita** i nuovi account al pilota: è soltanto un interruttore frontend, l'autorizzazione è sul server. Esegui il consueto `LIONFIT_PREPARA_WEB_E_DOCS.cmd` e controlla l'elenco delle modifiche in GitHub Desktop prima di Commit e Push. Non includere `.env`.

6. Sul campo prova almeno: Coach/Atleta reali stessa palestra → invio e ricezione; palestra TEST → nessuna conversazione della palestra reale, e viceversa; account sospeso o senza associazione → no chat autorizzata. Se una verifica fallisce, effettua subito il rollback.

**Non inviare immediatamente dati sensibili** durante il primo collaudo e non dedurre la sicurezza da un solo messaggio.

### C. ROLLBACK IMMEDIATO DELLA CHAT

Per tornare al SOLO PILOTA (le conversazioni già create rimangono conservate):

```dotenv
LF_CHAT_ENABLED=true
LF_CHAT_ROLLOUT_MODE=pilot
```

Le due variabili `LF_CHAT_GENERAL_RELEASE_ACK` / `LF_CHAT_ALL_GYMS_ACK` possono rimanere nel file senza effetto in modalità `pilot`, ma è preferibile rimuoverle. Poi da `chat-backend`:

```powershell
firebase.cmd deploy --only functions:lionfit-chat --project app-palestra-b0b9d
```

Per fermare **tutta** la messaggistica imposta `LF_CHAT_ENABLED=false` e ridistribuisci la stessa codebase. Questo non elimina i messaggi salvati: si limita a negare le API. In caso di bug nello swipe ripristina i file frontend precedenti e rifai WebDocs/Push; non è necessario toccare Firebase.

### D. TEST E LIMITI

- Controllo TypeScript `vue-tsc --noEmit`: **OK** in ambiente di analisi.
- Test Node focalizzati frontend/backend: **44/44 superati** su progetto parziale ricostruito (37 di chat + nuove gesture, più altri).
- `vite build` qui **non eseguibile**: manca il binario `@rollup/rollup-linux-x64-gnu` nelle dipendenze Windows esportate. Eseguire build su Windows prima della pubblicazione.
- Nessun test Firebase Emulator LIVE effettuato per questa release; nessuna misura FPS reale, nessuna verifica effettiva delle Rules attive, nessun deploy.
- Lo swipe con anteprima segue il dito, ma la transizione conclusiva resta gestita dal router. Non promette 60/120 FPS su tutti i dispositivi; interrompere il rilascio se interagisce male con gesture native o controlli UI.
- Per performance dev: `npm.cmd run dev` e apri `/home?lfPerf=1`, F12 → Console per `[LionFit Motion Audit]` (non invia dati su rete).
- Il sistema chat rimane **testuale** (niente allegati né push Chat; quelli sono separati R22C). Il backend usa polling, con costi Firebase da osservare.
