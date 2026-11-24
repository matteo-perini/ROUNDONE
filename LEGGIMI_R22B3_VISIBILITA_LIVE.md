# LionFit PATCH R22B.3 — Chat visibile nella build LIVE pilota

## Perché serve
Nel codice R22A il flag `CHAT_PREVIEW_ENABLED` è abilitato solo nelle anteprime DEV/STAGING. R22B.2 ha introdotto `VITE_LIONFIT_CHAT_BETA=LIVE_PILOT_REVIEWED`, ma **non aveva aggiornato questo flag**. Quindi la build LIVE poteva terminare correttamente senza mostrare la chat nemmeno agli account pilota.

Questa correzione **non amplia i permessi**: la presenza del flag autorizza solo il caricamento della schermata/rotta; in `App.vue` rimane indispensabile una risposta positiva del callable `lfChatPilotStatus`, e tutte le altre callable continuano a controllare UID, ruolo, palestra e coppia autorizzata.

## Installazione incrementale
Richiede R22A, R22B, R22B.1 e R22B.2 **già installate**.

1. Fare backup, fuori dal repository, del file esistente `src/features/chat/chatPreview.ts`.
2. Estrarre il contenuto dello ZIP nella cartella principale `LionFit-Modern-Git` senza appiattire le sottocartelle.
3. Sostituire **solo** `src/features/chat/chatPreview.ts`; aggiungere `tests/r22b3-live-chat-visibility.test.mjs`.
4. NON modificare `chat-backend/functions/.env`, le Firestore Rules, le Storage Rules o il backend; non serve nessun deploy Cloud Functions aggiuntivo.

## Controlli su Windows (PowerShell nella radice progetto)

```powershell
node --test tests/r22b3-live-chat-visibility.test.mjs
node --test tests/r22b2-live-pilot-visibility.test.mjs
npm.cmd run typecheck
npm.cmd run build
```

Conservare nella root `.env.production.local` la variabile locale **già configurata**:

```dotenv
VITE_LIONFIT_CHAT_BETA=LIVE_PILOT_REVIEWED
```

Non committare alcun `.env`. Verifica Git: `git check-ignore .env.production.local`.

## Prima della pubblicazione
Eseguire `npm.cmd run dev` (usa Firebase LIVE): controllare con l'account Coach e Atleta di test che l'icona compaia, che messaggi e storico funzionino; verificare con un utente fuori pilota che l'icona non compaia. Non usare account di clienti reali per i test. Il sito pubblico rimane invariato fino al Push GitHub.

**Solo dopo esito positivo**, chiudere il server (`Ctrl+C`), fare doppio clic su `LIONFIT_PREPARA_WEB_E_DOCS.cmd`, attendere la conferma di preparazione `docs/`, quindi usare GitHub Desktop su `main` per rivedere i file modificati, Commit e Push. Attendere la pubblicazione GitHub Pages e verificare dal sito usando sessioni separate.

Se ci sono messaggi di rifiuto/errore, verificare che le otto Functions siano presenti, che `LF_CHAT_ENABLED=true` sia stato caricato nel deploy della codebase, e che palestra/UID e assegnazione siano coerenti. Non allargare il pilota per aggirare un problema.

## Rollback
Prima opzione: disattivare `LF_CHAT_ENABLED=false` in `chat-backend/functions/.env` e ridistribuire soltanto `functions:lionfit-chat` per bloccare subito i messaggi, senza rimuovere dati. Per rimuovere l'interfaccia, togliere il flag `VITE_LIONFIT_CHAT_BETA` da `.env.production.local` e ripubblicare WebDocs; oppure ripristinare dal backup `chatPreview.ts` e ripubblicare. Non cancellare dati o Functions manualmente.

## Test effettivamente eseguiti nel pacchetto
5 test dedicati R22B.3 e 4 test statici R22B.2 (eseguibili con Node); non sono un collaudo LIVE o una build completa. TypeScript/Vite finali e flussi reali si verificano sul PC Windows dell'utente.
