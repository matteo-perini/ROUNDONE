# LIONFIT — PATCH INCREMENTALE R22B · CHAT COACH–ATLETA (PILOTA)
23 novembre 2026 · baseline: gli ZIP 1.zip + 2.zip ricomposti, più PATCH R22A.

IMPORTANTE: questo ZIP aggiunge codice per una Chat REALE, ma **NON la attiva** in produzione.
NON distribuire il backend LIVE o abilitare la chat agli utenti prima del collaudo dedicato.
NON contiene segreti o configurazioni Firebase reali. Nessun deploy è stato eseguito.

## COSA FA
- Mantiene la Chat a SINISTRA della Dashboard Atleta e la transizione di R22A.
- Su mobile: elenco conversazioni a tutta larghezza, poi conversazione a tutta larghezza.
- Su desktop: elenco affiancato ai messaggi.
- Ricerca nominativi, apertura conversazione, lettura cronologia, paginazione dei messaggi precedenti.
- Invio messaggi di testo max 1200 caratteri, stato invio, gestione errori rete.
- Sincronizzazione automatica dei messaggi visibili ~6,5 secondi (POLLING, non listener realtime istantaneo).
- Badge dei non letti nella shell quando la versione pilota è abilitata.
- Segna come letti SOLO messaggi già ricevuti a schermo; evita false conferme.
- Identificativo di richiesta riusabile dopo problemi di rete per ridurre duplicati.
- Non aggiunge un settimo tasto alla barra inferiore. Mantiene swipe e R22A.

## BACKEND PROPOSTO
Nuova codebase indipendente `chat-backend` (Node 22, Cloud Functions 2a gen.):
  lfChatContacts  lfChatOpen  lfChatList  lfChatUnread
  lfChatHistory   lfChatSend  lfChatMarkRead

- Nessuna lettura o scrittura diretta ai documenti chat dal browser.
- Le Cloud Functions verificano Auth, profilo /users, gymId, gyms/{gymId}.ownerUid,
  ruolo, stato attivo e assegnazione primaryCoachUid/coachUids.
- Le conversazioni sono consentite SOLO tra Coach attivo e Atleta attivo
  della stessa palestra e in relazione assegnata. Per profili legacy senza
  assegnazione, è consentito solo il titolare verificato.
- ID thread deterministico SHA-256 del trio palestra/coach/atleta.
- I contenuti risiedono nei percorsi PRIVATI:
    lf_private_chat_threads/{threadId}/messages/{requestId}
    lf_private_chat_inbox/{uid}/threads/{threadId}
  L'Admin SDK delle Functions è l'unico gateway previsto.
- Nessuna modifica alle Firestore Rules esistenti in questa patch:
  prima del rilascio verificare che le Rules EFFETTIVAMENTE pubblicate
  NON concedano lettura/scrittura client a questi nuovi percorsi.
- Controlli anti-spam: almeno 800 ms fra invii, max 20 al minuto per mittente.
- Invio atomico di messaggio, inbox mittente, inbox destinatario.
- Doppio invio con lo stesso requestId e testo restituisce 'duplicate' senza riscrivere.
- Nessuna notifica push ancora: verrà aggiunta solo nella R22C.
- Non è previsto eliminare messaggi/archivi; definire retention/privacy prima del lancio.

## SICUREZZA / ATTIVAZIONE (DEFAULT: DISABILITATA)
La Chat rimane VISUALMENTE in anteprima, NON ATTIVA, finché non è autorizzato il pilot.

1. Per i CLIENTI non servono nuove Rules client per leggere i messaggi: tutto passa
   dai callable. Non distribuire Rules nuove senza verifica delle Rules LIVE.
2. `chat-backend` non accetta richieste se LF_CHAT_ENABLED != true.
3. È obbligatorio impostare LF_CHAT_PILOT_GYM_ID a una palestra verificata.
4. In produzione sono obbligatori anche:
   LF_CHAT_PRODUCTION_ACK=REVIEWED_PRIVATE_CHAT_PILOT
   LF_CHAT_PILOT_COACH_UID=<UID coach esplicitamente scelto>
   LF_CHAT_PILOT_ATHLETE_UID=<UID atleta esplicitamente scelto>
   Solo la coppia di test è autorizzata. Non abilitare tutte le palestre.
5. Lato frontend la funzione appare solo con il flag esplicito:
   - per progetto STAGING: VITE_LIONFIT_CHAT_BETA=STAGING_REVIEWED
   - per progetto LIVE: VITE_LIONFIT_CHAT_BETA=LIVE_PILOT_REVIEWED
   Per sicurezza NON inserire il flag LIVE in .env.production o nelle build pubbliche
   fino a conclusione del collaudo. Questi flag NON sostituiscono gli ACL del server.
6. NON mettere identificativi privati o configurazioni dei pilot nel repository pubblico.
7. Un deploy di queste Cloud Functions richiede piano Firebase e permessi idonei;
   controllare anche billing, invoker e quota del progetto.

## FILE INCREMENTALI
FILE GIA' ESISTENTI IN R22A, DA SOSTITUIRE:
  src/App.vue
  src/features/chat/chatPreview.ts
  src/views/AthleteChatPreview.vue

NUOVI:
  src/features/chat/chatClient.ts
  chat-backend/firebase.json
  chat-backend/functions/package.json
  chat-backend/functions/index.mjs
  chat-backend/functions/model.mjs
  chat-backend/functions/tests/model.test.mjs
  tests/r22b-chat-contract.test.mjs

N.B. NON include src/router/index.ts o altri file R22A perché non cambiano.

## INSTALLAZIONE WINDOWS (INIZIALMENTE SOLO FRONTEND DISABILITATO)
1. Verifica di avere GIÀ APPLICATO la PATCH R22A. Se non presente, installala prima.
2. Backup dei TRE file esistenti indicati sopra, in una cartella ESTERNA al repo.
3. Estrai lo ZIP nella radice `LionFit-Modern-Git`, con struttura cartelle intatta.
4. Controlli nella radice (PowerShell che blocca npm.ps1 -> usare npm.cmd):
     npm.cmd run typecheck
     npm.cmd run build
5. Avvio locale che usavi abitualmente:
     npm.cmd run dev
   ATTENZIONE: il tuo `npm run dev` usa il progetto Firebase LIVE.
   NON aggiungere il flag VITE_LIONFIT_CHAT_BETA a `.env.production.local`.
   In assenza di flag il pulsante mostra soltanto una schermata non operativa.
6. Verifica che la Dashboard, la navigazione e la chat di Assistenza continuino
   a funzionare e che le sei voci della navbar non cambino.
7. NON avviare WebDocs per mostrare la chat ai clienti: senza backend testato
   la versione LIVE conserva intenzionalmente la chat disabilitata.

## COME COLLAUDARE CON MESSAGGI VERI (SOLO DOPO VERIFICA PILOTA)
La verifica richiede un progetto STAGING Firebase e due account test sicuri.
Il backend non è stato distribuito da questa patch; queste sono istruzioni
per un futuro collaudo controllato, NON un comando da lanciare ciecamente.

A. Verifica prima il progetto target, i due profili, gyms.ownerUid, ruolo,
   membershipStatus e primaryCoachUid/coachUids. Confronta le Rules REALMENTE pubblicate.
B. Sul computer autorizzato configura le variabili backend (non committare .env*):
     LF_CHAT_ENABLED=true
     LF_CHAT_PILOT_GYM_ID=<gym ID test>
   Per produzione servono i TRE flag extra indicati nella sezione Sicurezza.
C. Dentro `chat-backend/functions` esegui `npm.cmd install` per installare
   firebase-admin e firebase-functions dopo una verifica del lockfile/policy.
   La patch NON include node_modules, né credenziali.
D. Dopo revisione, il deploy selettivo di *sole* Functions chat può usare:
     firebase deploy --config chat-backend/firebase.json --only functions:lionfit-chat --project lionfit-staging-test
   **NON eseguire un deploy LIVE senza backup, approvazione e piano di rollback.**
E. Solo dopo collaudo server, nel frontend STAGING abilita:
     VITE_LIONFIT_CHAT_BETA=STAGING_REVIEWED
   Avvia la build/preview STAGING con la configurazione già autorizzata del progetto.
F. Verifica con due account reali di test: invio, risposta, scroll, conteggio
   non letti, refresh, rete assente, logout, membership revocata, coach diverso,
   palestra differente, idempotenza e limitazione rate.

## TEST ESEGUITI NELLA PREPARAZIONE DELLA PATCH
- `node node_modules/vue-tsc/bin/vue-tsc.js --noEmit`: SUPERATO.
- `node --experimental-strip-types --test tests/r22a-chat-navigation.test.mjs tests/r22b-chat-contract.test.mjs chat-backend/functions/tests/model.test.mjs`: 16/16.
- Suite frontend estesa: 599 test, 581 passati, 18 falliti, includendo un
  file `patch21-auth-emulator.mjs` che FALLISCE senza emulatore Auth acceso.
  Gli altri 17 fallimenti sono gli stessi presenti nella baseline R22A.
- Build Vite in questo ambiente Linux NON eseguibile (modulo nativo Rollup
  Linux assente nelle dipendenze Windows presenti negli ZIP). L'utente ha
  confermato build e typecheck OK su Windows per R22A, NON per R22B.
- Non sono stati eseguiti test end-to-end reali delle Cloud Functions, né
  Firestore Emulator end-to-end per questa nuova codebase: OBBLIGATORI prima
  del rilascio commerciale.
- Nessun deploy, nessuna Rule modificata, nessuna scrittura sui dati reali.

## PUBBLICAZIONE E ROLLBACK
- WebDocs (`LIONFIT_PREPARA_WEB_E_DOCS.cmd`) rimane invariato; GitHub Desktop
  commit/push rimane manuale. Pubblicare solo dopo esito build WINDOWS e
  decisione consapevole sull'abilitazione della Chat.
- ROLLBACK FRONTEND: ripristina i tre file salvati nel backup ed elimina
  `src/features/chat/chatClient.ts` se vuoi annullare R22B. Conserva R22A.
- ROLLBACK BACKEND (solo se successivamente distribuito): DISATTIVA
  LF_CHAT_ENABLED e verifica la propagazione, poi valuta la rimozione delle
  sole Functions chat; non eliminare dati senza piano di retention e consenso.

## PASSO SUCCESSIVO: R22C
- Notifiche push genuine a Coach e Atleta, evitando doppio invio.
- Test pilota su iPhone PWA/Android; comportamento offline e recovery.
- Eventuale listener Firestore realtime solo dopo Rules sicure validate con Emulator.
- Controllo di privacy/retention e attivazione progressiva.
