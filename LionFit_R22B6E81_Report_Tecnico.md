# LionFit R22B.6E.8.1 — Premium Page Motion

Base: E.7.5 Extreme Performance Audit SAFE. I sei file del manifest E.7.5 sono stati verificati tramite SHA-256 prima di intervenire. Patch esclusivamente frontend; non modifica route, policy touch, contenuti, listeners, Chat, Firebase Rules, funzioni, .env o dipendenze.

## Scelte e architettura

- Separatore grafico da 14 px, centrato sul confine delle due superfici, con gradiente e ombra interna leggera compatibili con tema chiaro/scuro. Si vede durante lo swipe; opacity progressiva all'inizio e alla fine, rimozione a riposo. Non è un nuovo margine di layout: la banda decorativa copre il confine senza cambiare larghezza, distanza di viaggio o coordinate del touch.
- Il Page Track reale (Home/Piano/Archivio) crea un solo elemento decorativo per coppia trascinata, trasportato dalla stessa rail. Nessun nuovo calcolo del layout durante i frame. La rail non viene scalata.
- Il percorso esterno con anteprima usa la stessa decorazione, posizionata sulla superficie visibile. Dopo il rilascio e l'autorizzazione del router, il coordinatore esterno crea la decorazione delle pagine reali prima di eliminare l'anteprima. L'animazione decorativa condivide curva/durata e, ove disponibile, startTime con le pagine. Non modifica il percorso di autorizzazione. I passaggi esterni mantengono le anteprime durante il drag, come E.7.5.
- La banda è aria-hidden, inert e pointer-events:none; non contiene dati. Rimozione al completamento, annullamento, inversione, dispose o watchdog esistenti. Preferenza reduced-motion rispettata. Fallback senza WAAPI: decorazione rimossa/nascosta, movimento preesistente preservato.
- Non ho applicato la scala reale 98–100% inizialmente ipotizzata: l'effetto profondità usa l'ombra. Ridimensionare la pagina radice può alterare geometria, fixed/sticky, viewport Chat e bordi; la scelta evita ulteriori rischi prima del collaudo reale. La banda non costituisce uno spazio fisico aggiunto.
- Navbar: invariata a 340 ms. Soglie swipe e durata adattiva invariate. Le animazioni di ingresso contenuti da 550 ms, spostamento 28 px, stagger 55 ms sono riservate alla E.8.2; non ancora introdotte.

## Verifiche eseguite

- TypeScript: `node node_modules/vue-tsc/bin/vue-tsc.js --noEmit` exit 0.
- R22: `node --experimental-strip-types --test tests/r22*.test.mjs` 190/190 (5 nuovi). Nessun test esistente modificato.
- Suite estesa: `node --experimental-strip-types --test tests/*.mjs` 775/790, 15 fallimenti. Confronto per nome con log E.7.5 (770/785): stessi 15 fallimenti; nessun nuovo fallimento. Uno richiede Firebase Emulator. Non risolti in questa patch.
- 65 verifiche Chromium isolate: larghezze 320, 390, 430, 850 px, temi chiaro/scuro; geometria della banda, nessun tocco intercettato, riutilizzo del nodo su 100 frame, inversione, annullamento, navbar senza decorazione, pulizia, passaggio cue/coordinatore esterno, reduced motion. Moduli TS effettivi transpiled, stili effettivi, DOM dimostrativo; non intera app LIVE né misure di FPS/GPU.
- Build Vite tentata: bloccata da `@rollup/rollup-linux-x64-gnu` mancante (dipendenze Windows dei sorgenti). Eseguire sul PC Windows. Non modificare package-lock o node_modules per questa patch.

## Installazione e rollback

Backup dei file replace del manifest, copia dei file nella radice del progetto E.7.5 con Sostituisci tutti. Verificare `npm.cmd run typecheck`, `npm.cmd run build`, `node --experimental-strip-types --test tests/r22*.test.mjs` (attesi 190). Smoke test telefono: passaggi Home/Piano/Archivio in entrambe le direzioni, esterni e Chat, swipe annullato, navbar, temi. Se OK, WebDocs e commit/push. Nessun deploy Firebase. Ripristinare i replace dal backup e rimuovere gli add del manifest per rollback; rigenerare WebDocs. Non dichiarare collaudo smartphone o fluidità definitiva prima della prova reale.
