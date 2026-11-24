# LionFit R22B.6D — Premium Motion Final Polish

Patch incrementale cumulativa **da R22B.6C.1 oppure da R22B.6C.2**. Comprende C2 e la nuova D. Non installare su versioni precedenti a C1. Non sostituisce l'intero progetto. Nessuna modifica a backend, Rules, permessi Chat, configurazioni Firebase o .env. Nessun deploy Firebase necessario.

## Modifiche D
- Il gesto conserva l'ultima posizione effettivamente disegnata (requestAnimationFrame) fino al cambio route.
- Le transizioni di uscita e ingresso ereditano lo spostamento e la durata residua, anche per il workspace condiviso Home/Piano/Archivio. I clic normali mantengono i 340 ms.
- La durata di completamento diminuisce progressivamente con l'avanzamento; gli swipe piccoli, invertiti o non validi non usano il trasferimento.
- In caso di navigazione annullata/rifiutata si ripristina la posizione. L'animazione di ritorno precedente viene cancellata al nuovo gesto. La scelta asse orizzontale/verticale e la protezione clic della C1 sono conservate.
- Nessuna schermata adiacente viene montata durante il trascinamento: la vera navigazione resta Vue Router. Non si tratta di un pager nativo a due pagine contemporaneamente interattive.
- Include Smart Route Preloading, Rome Day Clock e ottimizzazione delle proiezioni della C2.

## Installazione Windows
1. Chiudere il server dev. Copiare fuori dal progetto tutti i file esistenti elencati nel manifest; i file nuovi vanno rimossi in caso di rollback.
2. Estrarre nella radice LionFit-Modern-Git, mantenendo le sottocartelle.
3. Dalla radice PowerShell: `npm.cmd run typecheck`, `npm.cmd run build`.
4. Test mirati: `node --experimental-strip-types --test tests/r22b6d-motion-continuity.test.mjs tests/r22b6c2-performance.test.mjs` (Node 22 compatibile con type stripping).
5. Per prova mobile: `npm.cmd run dev -- --host 0.0.0.0`; usare indirizzo Network mostrato da Vite sulla stessa rete Wi-Fi. Usare solo account test. Non esporre la porta su Internet.
6. Verificare swipe lento, veloce, annullato, inverso; Home/Piano/Archivio, Chat/Home, altri tab; tap e scroll verticale su card, tabelle, campi e grafici; profili Coach/Atleta. Se si osservano regressioni non pubblicare. Se tutto OK, usare LIONFIT_PREPARA_WEB_E_DOCS.cmd e GitHub Desktop (escludere file .env).

## Controlli effettuati
- vue-tsc --noEmit: OK.
- Suite locale tests/r22a*.mjs + tests/r22b*.mjs: 62/62 passati, inclusi 4 nuovi test D.
- Chromium headless, fixture Vue con le regole CSS estratte: 6/6 passaggi (next/prev esterno, chat open/close, next/prev workspace). Per esempio a 390px e offset -120px, uscente parte da -120px ed entrante da +270px; al termine resta una sola schermata a 0px. Non equivale a prova dell'intera app, gesture fisiche o benchmark FPS.
- Build Vite in ambiente Linux: non completata per dipendenza Rollup nativa Windows presente negli archivi. Da eseguire su PC Windows.
- Nessuna prova su telefono reale né misurazioni del guadagno di velocità complessivo. Nessun deploy.

## Diagnostica / rollback
Audit locale già presente: in dev aprire la URL di LionFit con `?lfPerf=1` e leggere la console `[LionFit Motion Audit]`. Per confronto, provare stessi tab e dispositivo, senza dati privati nel video. Ripristinare file dal backup, rimuovere nuovi file, ricompilare e se già pubblicato rigenerare WebDocs. Nessuna modifica a Firebase da annullare.
