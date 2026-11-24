# LionFit R22B.6E.4 — Professional UI Final Polish

Base obbligatoria: R22B.6E.3. Patch incrementale frontend. Nessun deploy, nessuna modifica a Firebase Rules, backend, .env, router, swipe, session cache, listener o dipendenze.

## Interventi
- Chat: stessa cornice di lavoro per caricamento e contenuti, placeholder statici senza messaggi simulati, stato di errore distinto, ricerca specifica per ruolo (già introdotta in E.3), campi e testo più leggibili, simbolo di invio dedicato, pulsanti con area di tocco più ampia, cronologia scorrevole e composer in fondo. Layout a una colonna fino a 799 px, due colonne desktop. Colori basati sulle variabili del tema. Il codice di autorizzazione, invio, polling e gestione dati rimane identico a E.3; il composer non è abilitato prima di verifica server. Non sono stati aggiunti indicatori di consegna o lettura non supportati dal backend.
- Dashboard: card prossima lezione/evento con corpo riservato, placeholder statici accessibili, link Agenda ancorato al fondo, testo più leggibile. Altezza minima 166 px mobile e 150 px desktop; contenuti lunghi possono espandersi naturalmente. Stati disattivato, vuoto ed errore preservati. Non si nascondono errori o veri ritardi del server.
- Branding: durante il primo caricamento LIVE, se il nome o il logo non sono ancora disponibili, mostra un segnaposto neutro anziché un nome/logo generico temporaneo; copertina di default quando la lettura è risolta o in errore, non durante la fase di attesa senza cover. I dati validi disponibili continuano a essere mostrati; editor e demo conservano i comportamenti originali. Non aggiunge cache.
- Accessibilità: testo dei messaggi 14px, campi chat 16px, pulsante invio 46px, focus da tastiera, stato leggibile per screen reader, assenza di shimmer continuo. Nessuna modifica alla durata delle transizioni E.2 o sensibilità E.1.

## Test realmente eseguiti
- TypeScript (`node node_modules/vue-tsc/bin/vue-tsc.js --noEmit`): OK.
- Suite R22 (`node --experimental-strip-types --test tests/r22*.mjs`): 110/110, inclusi 9 nuovi test E.4; prima della patch 101/101. Comprende test E.3 con servizi simulati. I nuovi test verificano compilazione SFC, contratti del template, CSS e conservazione delle protezioni UI. Non è una suite end-to-end LIVE.
- Chromium: 8 scenari chat, con template effettivo, CSS globali importati e stati simulati, 320x640, 390x844, 768x900 e 1280x800 in tema chiaro/scuro. Altezza/larghezza invariata da caricamento a lista, invio visibile, area di tocco >=44px, input 16px, nessun overflow orizzontale nella cronologia del test. 3 scenari card: 320 e 390 px, altezza 166 px sia in attesa sia con dati di prova; 1280 px, 150 → 150,48 px. Il test non misura l'intera shell, la tastiera virtuale, i tempi di rete, gli FPS o la latenza Firebase.
- Script di Chat e AthleteHomeHighlights confrontati con E.3: invariati. Nessuna nuova dipendenza.
- Build Vite tentata, bloccata da @rollup/rollup-linux-x64-gnu non presente nelle dipendenze Windows degli ZIP. Build da eseguire sul PC Windows. Non è stato eseguito un collaudo Firebase LIVE né la suite storica integrale in questa patch.

## Installazione
1. Ferma il dev server. Verifica che E.3 sia installata. Fai il backup dei 5 file da sostituire elencati sotto, conservando la struttura delle cartelle fuori dal repo. Se hai apportato modifiche manuali, confrontale prima.
2. Estrai lo ZIP nella root LionFit-Modern-Git, mantenendo i percorsi. Non sovrascrivere l'intero progetto.
3. PowerShell:

```powershell
npm.cmd run typecheck
node --experimental-strip-types --test tests/r22b6e4-ui-polish.test.mjs
npm.cmd run build
npm.cmd run dev -- --host 0.0.0.0
```

4. Prova da smartphone con account test, Home, Agenda, Chat, primo accesso, rientro rapido, rete lenta, errore e cambio account. Controlla il tema chiaro/scuro, messaggi lunghi, tastiera aperta/chiusa, invio e ritorno alle conversazioni. Prova swipe sopra card, scroll verticale e navbar. Dev usa Firebase LIVE: non esporre la porta su Internet. Verifica E.3 con ?lfPerf=1 in dev, confronto con stesso dispositivo, account e rete. Non scambiare dati sensibili nel test.
5. Solo dopo typecheck/build e prova reale, usa LIONFIT_PREPARA_WEB_E_DOCS.cmd, controlla GitHub Desktop (nessun .env nel commit), Commit e Push. Nessun firebase deploy richiesto.

## Rollback
Ripristina i cinque file sostituiti dal backup, elimina solo il nuovo test e i documenti E.4, ripeti build. Se pubblicata, riprepara WebDocs e ripubblica. Non modificare i dati o la configurazione della Chat.

## File da sostituire
- `src/components/AthleteHomeHighlights.vue`
- `src/components/GymIdentity.vue`
- `src/components/LionIcon.vue`
- `src/styles-r14c-dashboard-rebuild.css`
- `src/views/AthleteChatPreview.vue`

## File nuovo
- `tests/r22b6e4-ui-polish.test.mjs`
