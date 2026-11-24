# LionFit — PATCH INCREMENTALE R22B.1 (Backend hardening + collaudo Emulator)

Data: 23/11/2026. Base: 1.zip + 2.zip unificati + patch R22A + R22B già applicate.

**Questa patch NON pubblica nulla e NON attiva la chat LIVE.**
È un'aggiunta di sicurezza e un collaudo locale della messaggistica, prima di ogni deploy.

## Perché serve
- `lfChatOpen` verifica di nuovo account, palestra, ruolo e relazione Coach–Atleta **dentro la transazione**, prima di creare la conversazione. Evita un'apertura in caso di revoca o cambio di assegnazione durante la richiesta.
- `lfChatMarkRead` ricontrolla l'autorizzazione durante l'aggiornamento e non azzera i non letti se il server ha registrato un messaggio successivo a quello visualizzato.
- `rollout()` ammette un progetto `demo-lionfit-chat` **SOLO con `FUNCTIONS_EMULATOR=true`**. La produzione continua a richiedere i flag e gli UID del pilota previsti dalla R22B.
- Test locale end-to-end per conversazioni, accessi vietati, duplicati, letture e revoca, senza account né dati reali.

## Cosa contiene lo ZIP
SOSTITUIRE (con backup):
- `chat-backend/functions/index.mjs`
- `chat-backend/functions/package.json`

AGGIUNGERE:
- `chat-backend/functions/tests/hardening.test.mjs`
- `chat-backend/functions/tests/emulator.e2e.mjs`
- `chat-backend/firebase.emulator.json`
- `chat-backend/emulator/firestore.rules` (COPIA SANITIZZATA delle Rules candidate incollate dall'utente, SOLO per emulator; identità del Super Admin sostituita)
- `RUN_R22B1_EMULATOR.cmd`
- questo LEGGIMI e manifesto

Non si sostituiscono le Firestore Rules e Storage Rules di produzione. Nessun file frontend cambia. Non cambiare `chat-backend/firebase.json` usato per un eventuale deploy futuro.

## Installazione
1. Effettua backup dei due file da sostituire **fuori** dalla cartella del repository.
2. Estrai lo ZIP nella radice di `LionFit-Modern-Git` mantenendo i percorsi delle cartelle.
3. Apri PowerShell nella radice e verifica il frontend, come fai abitualmente:
   ```powershell
   npm.cmd run typecheck
   npm.cmd run build
   ```
   Se R22B non è ancora stata verificata su Windows, questi controlli sono obbligatori prima di qualunque pubblicazione.
4. Installa le dipendenze del solo backend chat (prima installazione):
   ```powershell
   cd chat-backend\functions
   npm.cmd install
   npm.cmd test
   cd ..\..
   ```
   `npm install` potrà generare `package-lock.json`: controllare il diff ed evitare di includere dipendenze inaspettate. In produzione non caricare `node_modules`.
5. Avvia `RUN_R22B1_EMULATOR.cmd` con doppio clic **dalla radice del progetto**. Richiede Node.js 22, Firebase CLI e Java disponibili sul PC. Lo script avvia Auth/Firestore/Functions Emulator e verifica le operazioni automaticamente nel progetto `demo-lionfit-chat`.
6. Non pubblicare o attivare la chat se un test fallisce. Invia il log dell'errore per correggere in modo incrementale.

## Cosa verificano i test Emulator
- Creazione di due palestre e di utenti test **solo negli emulatori**.
- Ricerca del Coach assegnato e blocco Coach non assegnato.
- Blocco conversazioni e cronologia tra palestre diverse.
- Apertura conversazione, invio testuale e storico messaggi.
- Retry idempotente: stesso ID di messaggio non produce un doppio invio.
- Non letti e contrassegno di lettura.
- Letture e scritture dirette alle collezioni private via SDK client rifiutate dalle Rules della fixture.
- Account revocato: accesso e invio bloccati.

**NOTA IMPORTANTISSIMA:** la fixture `chat-backend/emulator/firestore.rules` è una copia SANITIZZATA delle Rules *candidate* che hai condiviso, NON una copia certificata delle Rules attualmente LIVE. I test locali non dimostrano che le Rules pubblicate coincidano: prima di un deploy occorre confrontarle dalla Firebase Console. Non caricare il file della fixture nella console Firebase.

## Sicurezza e deploy
- Non eseguire `firebase deploy` durante questa fase.
- `npm run dev` normale collega LionFit al progetto Firebase LIVE (se così è configurato nella tua installazione). **Non usarlo come test dei messaggi**: la chat rimane disattivata da default e potrebbe usare il progetto reale se forzata.
- Il collaudo sicuro è `RUN_R22B1_EMULATOR.cmd`, isolato dal progetto reale.
- Nessuna modifica alle regole LIVE, ai dati della palestra o a WebDocs.
- La R22B (anche con questa R22B.1) non invia notifiche push; rimangono previste nella R22C.
- Dopo i test Emulator: collaudo STAGING separato, con verifica che l'ID del progetto sia effettivamente disponibile e corretto. Il progetto `lionfit-staging-test` compare nel codice, **ma non è stato verificato che esista nel tuo account**.
- L'attivazione LIVE, anche per una sola coppia pilota, richiede una decisione distinta e controlli su privacy, retention e rollback.

## Verifiche eseguite durante la preparazione
- Sintassi JavaScript e JSON dei file nuovi: OK.
- Node test delle policy pure e del nuovo hardening: 12/12 superati.
- Firebase Emulator E2E: **NON eseguito qui**, Firebase CLI non disponibile in questo ambiente. Va eseguito su Windows.
- TypeScript/Build R22B.1: **NON rieseguiti qui**; nessun file frontend è stato modificato, ma verificarli su Windows, soprattutto se non ancora eseguiti per la R22B.

## Rollback
- Ripristinare `chat-backend/functions/index.mjs` e `package.json` dal backup precedente.
- Eliminare solo i nuovi file aggiunti dalla R22B.1, senza toccare gli altri file della R22B.
- Nessuna operazione lato Firebase necessaria perché questa patch non esegue deploy.
