# LionFit — R22B.6E.2 Continuous Motion Engine

Base richiesta: R22B.6E.1 installata. Patch incrementale frontend: nessuna modifica al backend, Rules, configurazioni `.env` o autorizzazioni Chat.

## Modifiche
- Durante il trascinamento una sola anteprima grafica neutra della sezione autorizzata di destinazione segue il dito insieme alla schermata uscente. Contiene il nome della sezione e sagome statiche, non dati fittizi o privati. Non monta componenti, non apre listener e non fa richieste di rete. Inversione, annullamento, navigazione fallita e smontaggio eliminano l'anteprima. Il contenuto reale subentra quando Vue Router completa il cambio pagina.
- Le due schermate reali condividono una distanza in pixel, la stessa curva e durata; la pagina uscente conserva larghezza e coordinate di layout ed è inerte durante l'uscita. Non si azzera il movimento già dipinto. Rimosso il fade delle transizioni orizzontali, rimangono 340 ms per il tap e durata adattiva per lo swipe.
- Sulle sezioni principali mobile viene evitata la sovrapposizione con l'animazione d'ingresso delle card; le altre pagine e la prima apertura conservano il comportamento precedente. La Home uscente non deve più governare il layout della pagina entrante con il selettore :has.
- Conservate protezioni gesture E.1, navbar, preferenza di movimento ridotto e componente condiviso Home/Piano/Archivio. Nessuna cache di messaggi o dati: quella è prevista nella E.3, con verifica di isolamento e invalidazione. Non si tratta ancora di due pagine dati montate simultaneamente durante il trascinamento.

## Backup e installazione
Prima di estrarre, copiare fuori dal repository tutti questi file:
- `src/App.vue`
- `src/views/AthleteLiveWorkspace.vue`
- `src/features/motion/roundOneMotion.ts`
- `src/styles-r14-athlete-home.css`
- `src/main.ts`
- `tests/r22b5-athlete-shared-screen-motion.test.mjs`
- `tests/r22b6d-motion-continuity.test.mjs`
- `tests/patch27-r2-motion.unit.mjs`

Estrarre lo ZIP nella cartella principale LionFit-Modern-Git, mantenendo le sottocartelle. In PowerShell:

```powershell
node --experimental-strip-types --test tests/r22b6e2-continuous-motion.test.mjs
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev -- --host 0.0.0.0
```

Prova su smartphone (stessa rete, URL Network indicato da Vite). Dev normale usa Firebase LIVE; usare account di test. Verificare swipe lento e veloce, annullamento e inversione, scroll verticale, swipe partendo da una card, sequenze rapide di tap/swipe, passaggi Home/Piano/Archivio/Allenamenti/Agenda/Profilo e Home/Chat in entrambi i sensi. Controllare anche Coach, tema chiaro/scuro, rotazione e accessibilità. Se l'anteprima rimane dopo la navigazione o si nota regressione, non pubblicare. Solo dopo il collaudo usare WebDocs e GitHub Desktop. Non serve deploy.

## Verifiche eseguite
- TypeScript exit 0.
- 83/83 test mirati: serie `r22*.test.mjs` + `patch27-r2-motion.unit.mjs` (inclusi 5 nuovi test E.2 e il controllo delle animazioni secondarie). Due test contrattuali aggiornati per le nuove proprietà di geometria; nessun test rimosso.
- Suite estesa con `patch27-performance.unit.mjs`: 91/94, tre fallimenti riprodotti identici sulla baseline E.1 (mock sessione Check Zone e vecchio markup Archivio). Nessun nuovo fallimento nella suite eseguita.
- 8 prove in Chromium headless a 390px su fixture isolate con Vue e CSS effettivi: 6 transizioni nelle due direzioni con larghezze diverse e posizione assoluta misurata, inversione/annullamento dell'anteprima e creazione dopo spostamento del root. Non è un collaudo dell'app completa o di Firebase.
- Build Vite tentata, bloccata dal modulo opzionale `@rollup/rollup-linux-x64-gnu` assente nelle dipendenze Windows. Da verificare sul PC. Nessuna misura FPS reale o latenza backend.

## Rollback
Ripristinare i file del backup; eliminare i nuovi file:
- `src/features/navigation/continuousMotion.ts`
- `src/styles-continuous-motion.css`
- `tests/r22b6e2-continuous-motion.test.mjs`

Ripetere build e, se già pubblicato, WebDocs/Push del frontend ripristinato. Non è richiesto rollback Firebase.
