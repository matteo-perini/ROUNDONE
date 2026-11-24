# LionFit R22B.6C.1 — Smart Swipe Zones

Base richiesta: R22B.6B già installata. Patch esclusivamente frontend: nessuna variazione a Rules, backend, Chat, .env o configurazioni Firebase. Nessuna modifica alla navbar o alla durata delle transizioni.

## Modifiche
- Le tabelle non orizzontalmente scorrevoli, le card, i link, i pulsanti ordinari, le immagini e le icone non sono più esclusi a priori dallo swipe.
- La direzione iniziale viene bloccata dopo 10 px di movimento sufficiente. Un gesto verticale o diagonale ambiguo resta affidato allo scroll nativo. Il movimento orizzontale riconosciuto utilizza la preview già esistente, annulla l'azione nativa del tocco e protegge dai click sintetici sulla superficie trascinata; anche uno swipe annullato non deve attivare il pulsante. La normale pressione e l'accesso da tastiera non devono cambiare.
- Mantiene i campi di input, le label dei campi, i dialoghi, i grafici interattivi, i cursori, i trascinamenti esercizi, media, caroselli, aree con overflow orizzontale reale e i marcatori di esclusione espliciti. Fascia di rispetto dei gesti di sistema: 20 px anziché 32 px.
- Annulla il gesto in caso di multitouch, selezione del testo o gesto già preso in carico dal browser. Non introduce CSS touch-action globale che possa bloccare lo scorrimento orizzontale nativo dei controlli.

## Installazione
1. Arrestare il dev server (Ctrl+C). Salvare una copia di `src/App.vue`, `tests/r22b4-section-swipe.test.mjs` e `tests/r22b6b-ultra-swipe.test.mjs` fuori dal repository. Verificare che la R22B.6B sia già installata.
2. Estrarre lo ZIP nella cartella principale LionFit-Modern-Git, mantenendo i percorsi. Nuovi file: `src/features/navigation/swipeIntent.ts`, `tests/r22b6c-swipe-intent.test.mjs`. Sostituzioni: i tre file di cui sopra. Le due suite precedenti vengono adeguate solo ai controlli intenzionalmente cambiati.
3. `npm.cmd run typecheck` e `npm.cmd run build`.
4. `npm.cmd run dev -- --host 0.0.0.0` (rete Wi-Fi privata, PC e telefono sulla stessa rete). Aprire l'indirizzo Network riportato da Vite. Usa gli account di test: dev LIVE scrive sul database reale.
5. Provare da telefono, sia Coach sia Atleta: tap normale su card/link/pulsanti; swipe in entrambe le direzioni iniziando da contenuti cliccabili o celle; annullamento dello swipe senza attivare pulsanti; scroll verticale; scorrimento di una tabella più larga dello schermo; grafici, campi, riordino, gesture di sistema. Provare anche una gesture lenta, una rapida e due dita. Non pubblicare se un tap o un trascinamento causa azioni involontarie.
6. Se le verifiche passano, WebDocs e Commit/Push manuale come sempre. Non serve deploy Functions.

## Verifiche effettuate qui
- `vue-tsc --noEmit`: exit 0 sulla copia ricostruita fino alla R22B.6B con questa patch.
- `node --experimental-strip-types --test tests/r22*.test.mjs`: 51/51. Sono test unitari e contrattuali/statici, non prove touch in browser reale.
- Build Vite tentata, bloccata dalla mancanza del modulo nativo Linux `@rollup/rollup-linux-x64-gnu` nelle dipendenze Windows. Verificare su Windows. Nessun collaudo dispositivo né pubblicazione eseguiti qui.

## Rollback
Ripristinare i tre file salvati ed eliminare i due nuovi file. Ricompilare. Se già pubblicato, ripetere WebDocs e Commit/Push della versione ripristinata. Nessuna modifica server da annullare.

## Seguito
Questa patch risolve l'arbitraggio delle gesture; non misura né garantisce FPS o tempi di caricamento. L'ottimizzazione delle elaborazioni Vue, dei dati e della continuità del gesto al cambio route resta una fase successiva, da affrontare in base alle misurazioni.
