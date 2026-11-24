# LionFit — R22B.2 · Pilota controllato sul Firebase LIVE (senza staging)

Questa patch è **incrementale**, da applicare **dopo R22A, R22B e R22B.1**. Non pubblica nulla, non crea account né modifica dati esistenti.

## Scopo
- Autorizzare il **solo** test Coach–Atleta in una palestra di prova già presente nel progetto Firebase reale `app-palestra-b0b9d`.
- Nascondere icona Messaggi e gesture a tutti gli altri account nella build web LIVE, usando `lfChatPilotStatus` (verifica lato Cloud Function); i callable dei messaggi continuano a fare autonomamente la verifica dei permessi.
- Nessuna modifica a Firestore Rules, Storage Rules, navbar o sistema di distribuzione WebDocs.
- **Notifiche push assenti**; saranno R22C.

## File da sostituire (fare backup fuori dal repository)
- `chat-backend/functions/index.mjs`
- `src/features/chat/chatClient.ts`
- `src/App.vue`
- `src/views/AthleteChatPreview.vue`

## File nuovo
- `tests/r22b2-live-pilot-visibility.test.mjs`

## Prima del rilascio
1. Assicurarsi che R22B.1 sia stata installata. Confermare `npm.cmd run typecheck` e `npm.cmd run build` **sul tuo PC**.
2. Eseguire il test di base `cd chat-backend\functions`, `npm.cmd install`, `npm.cmd test`. Tornare alla radice.
3. Eseguire `node --test tests/r22b2-live-pilot-visibility.test.mjs` dalla radice.
4. **Eseguire il collaudo Emulator** della R22B.1, anche se il pilota finale userà Firebase LIVE: `RUN_R22B1_EMULATOR.cmd`. Se fallisce, NON procedere alla produzione.
5. In Firebase Console confrontare le **Rules realmente pubblicate** con quelle fornite nella chat. Verificare che i percorsi `lf_private_chat_threads` e `lf_private_chat_inbox` siano negati ai client. Non pubblicare la fixture dell'Emulator.
6. Nella console verificare tre valori (non condividerli in chat né nel repository): `gymId` palestra prova; UID Firebase del Coach; UID Firebase dell'Atleta. Entrambi devono appartenere alla palestra e avere il corretto ruolo/stato; il Coach deve essere assegnato all'Atleta (`primaryCoachUid` oppure `coachUids`), o essere il titolare in assenza di associazioni legacy.
7. Prima di distribuire salvare una copia della configurazione Functions e predisporre rollback. Evitare test su conversazioni o dati di clienti reali.

## Attivazione in produzione: due fasi, sempre manuali
La codebase `chat-backend/firebase.json` contiene **solo** la codebase `lionfit-chat` e non deve sostituire il `firebase.json` generale del progetto.

### A. Deploy disabilitato (non consente messaggi)
Preparare **sul proprio PC** (mai in ZIP/Git) `chat-backend/functions/.env` con valori privati e `LF_CHAT_ENABLED=false`:

```dotenv
LF_CHAT_ENABLED=false
LF_CHAT_PILOT_GYM_ID=<gymId_della_palestra_test>
LF_CHAT_PRODUCTION_ACK=REVIEWED_PRIVATE_CHAT_PILOT
LF_CHAT_PILOT_COACH_UID=<UID_COACH_TEST>
LF_CHAT_PILOT_ATHLETE_UID=<UID_ATLETA_TEST>
```

Da PowerShell, nella cartella `chat-backend`, dopo aver verificato con `firebase projects:list` l'ID di progetto atteso:

```powershell
firebase deploy --only functions:lionfit-chat --project app-palestra-b0b9d
```

È un deploy **in produzione**: NON eseguirlo se test e backup non sono pronti. Controllare che siano state distribuite **otto** Functions (sette R22B più `lfChatPilotStatus`), tutte in `europe-west1`. Se il comando mostra risorse da eliminare o un progetto diverso, interrompere.

### B. Attivazione soltanto della coppia test
Solo dopo verifiche e autorizzazione, cambiare `LF_CHAT_ENABLED=true` nel file `.env` locale e **ridistribuire solo `functions:lionfit-chat`**. La sicurezza del pilota è lato server: gli altri account non devono poter utilizzare le Functions.

Per pubblicare la UI nel frontend LIVE, nella **configurazione locale di build** già in uso (non in Git) aggiungere:

```dotenv
VITE_LIONFIT_CHAT_BETA=LIVE_PILOT_REVIEWED
```

**ATTENZIONE**: il flag di frontend non protegge i dati: serve soltanto per caricare la nuova UI; il backend decide chi è autorizzato. La nuova `lfChatPilotStatus` nasconde pulsanti e gesture agli utenti non inclusi nel pilota. La prima volta può esserci un istante di ritardo nel mostrare l'icona, mentre il server verifica i permessi.

Eseguire di nuovo `npm.cmd run typecheck` e `npm.cmd run build`, quindi WebDocs/GitHub Desktop **solo dopo** aver verificato su PC i risultati e approvato il test pilota. L'app `npm run dev` non è un ambiente di staging: può usare Firebase LIVE.

## Collaudo su coppia di prova
- Login Coach → Chat → contatto Atleta e invio messaggio breve.
- Login Atleta su secondo dispositivo/browser → ricezione entro pochi secondi, risposta, non letti, swipe verso destra dalla Dashboard e ritorno verso sinistra.
- Account di altra palestra → icona non visibile e callable rifiutati.
- Account della stessa palestra non incluso nel pilota → icona non visibile e callable rifiutati.
- Coach non assegnato, revoca account e logout → invio/lettura rifiutati.
- Nessun allegato e nessuna notifica push in questa versione; l'aggiornamento usa polling ~6,5 secondi.

## Arresto / rollback
1. Rimettere `LF_CHAT_ENABLED=false` nelle variabili di ambiente lato Functions e ridistribuire la codebase selettivamente.
2. Rimuovere `VITE_LIONFIT_CHAT_BETA` dalla configurazione web locale e ripubblicare tramite WebDocs se occorre nascondere l'interfaccia.
3. Non eliminare a mano collezioni della chat né le Functions esistenti senza una procedura approvata. La disattivazione non elimina automaticamente i messaggi del pilota.

## Limiti dei controlli svolti qui
- Verifiche statiche e sintassi backend: eseguite.
- Test Firebase Emulator end-to-end: **non eseguiti qui**.
- TypeScript/Vite su Windows: **da verificare sul tuo PC dopo aver applicato R22B.2**.
- Configurazione di account, UID, permessi Cloud e Rules LIVE: **non verificabili da questi ZIP**.
- Nessun deploy o accesso a Firebase LIVE è stato effettuato.
