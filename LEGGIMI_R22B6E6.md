# LionFit R22B.6E.6 — Native Chat Experience

Prerequisito: E.5.1 installata. Patch incrementale, solo frontend e test. Non installare sopra versioni anteriori saltando le patch intermedie.

## Prima di estrarre
1. Conservare una copia della cartella del progetto o un commit Git pulito della E.5.1. Non includere segreti o `.env` nel commit.
2. Copiare in una cartella di backup i file esistenti da sostituire:
   - `src/views/AthleteChatPreview.vue`
   - `tests/r22b6e3-session-data.test.mjs`
   - `tests/r22b6e4-ui-polish.test.mjs`
3. Estrarre lo ZIP nella root del progetto LionFit, consentendo la sovrascrittura dei tre file indicati. Gli altri due file di codice/test sono nuovi.

## Verifica su Windows
```powershell
npm.cmd run typecheck
npm.cmd run build
node --experimental-strip-types --test tests/r22b6e6-native-chat.test.mjs
```
Se tutto passa, procedere con `LIONFIT_PREPARA_WEB_E_DOCS.cmd`, commit e push GitHub Desktop, come da flusso abituale. Nessun deploy Firebase. Per prova LIVE utilizzare solo account e conversazioni di test; verificare che sia effettivamente servita la versione nuova.

## Collaudo telefono
- Aprire Chat e una conversazione, attivare/disattivare la tastiera; verificare che la barra di scrittura rimanga accessibile e il dock si ripristini.
- Inviare un messaggio di prova mentre si scrive; verificare che la tastiera rimanga aperta e che eventuale nuova bozza non venga cancellata.
- Scorrere verso messaggi vecchi, aprire/chiudere tastiera; controllare che non si venga riportati in fondo. Verificare il caricamento dei messaggi precedenti.
- Tornare alla Home con swipe o barra di navigazione (dopo chiusura tastiera); ripetere lato Coach e Atleta.
- Verificare tema chiaro/scuro, scroll verticale, tocco e ricerca; con tastiera mobile Enter crea una nuova riga, il pulsante invia; su desktop Enter invia e Shift+Enter va a capo.

## Rollback
Ripristinare i tre file dal backup E.5.1 e rimuovere esclusivamente i nuovi `src/features/chat/chatViewport.ts` e `tests/r22b6e6-native-chat.test.mjs`. Ricompilare e ripubblicare frontend, se necessario. Nessun rollback dati o backend. I documenti della patch non sono richiesti a runtime.
