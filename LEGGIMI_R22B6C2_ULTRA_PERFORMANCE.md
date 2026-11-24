# LionFit R22B.6C.2 — Ultra Performance Engine
Base: progetto unificato 1.zip + 2.zip, patch R22A–R22B.6C.1 in sequenza.
Patch incrementale frontend. Richiede R22B.6C.1; NON la sostituisce. Nessun deploy Firebase, nessuna modifica a Rules, backend, .env, package.json o dati.

## Modifiche
- Clock calendario Roma: mantiene il valore reattivo nello stesso giorno, verifica ogni 30 s soltanto quando la pagina e visibile; aggiornamento al focus/ripresa e smontaggio pulito. Non modifica i timer di recupero, notifiche o orari di prenotazione. Il cambio di giorno in primo piano può richiedere fino a 30 s come prima.
- Piano atleta: proiezione Vue computed dei collegamenti esatti scheda/giorno; riuso durante render e modali, invalidazione quando cambiano settimana o gruppi. Non deduplica documenti né altera ID.
- Riutilizzo del formatter della data di Roma.
- Router: caricamento anticipato opzionale del solo codice di una sezione adiacente non ancora caricata, dopo 1,5 s da navigazione operativa riuscita; requestIdleCallback se disponibile, fallback ritardato su altri browser. Una importazione anticipata in corso al massimo; controllo sessione, ruolo, palestra, percorso, visibilità, connessione e risparmio dati. Nessun montaggio preventivo delle viste, nessun nuovo listener Firestore. Non precarica chat o Control Center. Importazioni già iniziate non sono annullabili; la navigazione normale resta invariata. Il warmup può consumare una piccola quantità aggiuntiva di traffico JS.

## Backup e installazione
1. Ferma npm run dev. Copia fuori dal progetto questi quattro file: src/views/AthleteLiveWorkspace.vue, src/components/AthletePlanContent.vue, src/features/sheets/assignmentPolicy.ts, src/router/index.ts.
2. Estrai lo ZIP nella radice LionFit-Modern-Git, conservando i percorsi. Non copiare .env, non cambiare Firebase.
3. In PowerShell, radice progetto:
```
node --experimental-strip-types --test tests/r22b6c2-performance.test.mjs
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev -- --host 0.0.0.0
```
4. Test con account di prova: Home/Piano/Archivio, schede esatte dei giorni (slot 1 e 2), schede libere, passaggio tra settimane, aggiornamento al ritorno in app, swipe/click, cambio account, Coach e Atleta. Verificare modifica scheda lato Coach e aggiornamento lato Atleta; provare senza rete con cautela senza scritture. La dev LIVE usa dati reali.
5. Per misurare: aprire /home?lfPerf=1 o /coach?lfPerf=1 in dev e leggere Console [LionFit Motion Audit]. Confrontare stesso dispositivo/rete/percorso, navigazione a freddo e a caldo, almeno 10 ripetizioni per percorso. Il dato misura navigazione e primo frame, non il contenuto Firebase pronto. Non promette FPS o percentuali di accelerazione.
6. Dopo verifica, LIONFIT_PREPARA_WEB_E_DOCS.cmd, Commit e Push manuali. Nessun nuovo deploy backend.

## Test effettuati nella copia ricostruita
- vue-tsc --noEmit: OK.
- Nuovi test: 7/7. Test sintetico: 120 campioni a 30 s nello stesso giorno non invalidano il computed calendario; cambio giorno lo invalida. Non è una misura FPS reale.
- Suite mirata R22, piano/home/archivio, assegnazioni e programmi: 106/107. Un fallimento storico patch11-programs.unit.mjs (contratto UI cerca "SELEZIONA PROGRAMMA"), riprodotto con file C1 originali. Nessuna nuova failure in questa suite.
- Vite build tentata ma bloccata dal modulo @rollup/rollup-linux-x64-gnu assente nelle dipendenze Windows degli ZIP. Verifica Windows necessaria. Non sono stati eseguiti nuovi test Firebase LIVE o browser mobile.

## Rollback
Ripristina i quattro file dal backup, rimuovi i quattro file nuovi sopra elencati nel manifest, ripeti typecheck/build e, se già pubblicato, WebDocs/Commit/Push. Il rollback non modifica dati o stato commerciale.
