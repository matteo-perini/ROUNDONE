# LionFit R22B.6E.3 — Smart Session & Data Engine

**Base:** R22B.6E.2 (progetto ricostruito dagli ZIP originali e dalle patch precedenti).  
**Data:** 24 novembre 2026.  
**Tipo:** patch incrementale frontend + test. Nessuna migrazione, nessun deploy, nessuna modifica alle Rules, alle Functions, alle variabili di ambiente o alle dipendenze.

## 1. Audit e modifiche

- GymIdentity: prima, la visualizzazione riapriva le sottoscrizioni del branding al rimontaggio. Ora il percorso di sola lettura condivide una sorgente temporanea per sessione e palestra; l'editor conserva il percorso precedente. Replay a un rientro dopo lo smontaggio soltanto per snapshot confermati dal server, non in caso di offline. Il logo e l'aspetto devono essere pronti prima del replay.
- AthleteHomeHighlights: sottoscrizioni per prenotazioni, configurazione gare e gare riutilizzabili. Gestione degli errori esplicita, callback obsolete ignorate, eliminazione delle aperture duplicate quando la configurazione non cambia, orologio periodico sospeso con pagina nascosta. Gli altri consumatori di watchCompetitionEvents conservano il comportamento precedente.
- useAthleteLive: condivisione delle schede personali e delle settimane dopo le verifiche server già presenti; nessuna eliminazione delle verifiche del profilo e della palestra. Riutilizzo delle proiezioni quando i documenti non cambiano; l'archivio e le esclusioni conservano il percorso originale.
- Chat: ogni ingresso richiede al backend contatti e conversazioni. Hint RAM di massimo 8 secondi dall'ultima conferma utile (massimo 100 contatti e 100 conversazioni), senza testo dei messaggi, cronologia o bozze; non interattivo prima della riconferma e non riproposto offline. Nessun localStorage/IndexedDB aggiunto. Le richieste obsolete vengono scartate per sessione, generazione e azione. Aggiornamenti della lista e della cronologia ogni 10 s con chat visibile, contatti circa ogni 30 s; aggiornamento non blocca la scelta della conversazione. La paginazione mantiene i messaggi precedenti e la posizione di scroll. Durante una normale uscita la schermata resta stabile fino allo smontaggio; in caso di cambio sessione o permessi rilevati, il contenuto viene rimosso subito.
- App.vue: controlli su chiave completa della sessione verificata, non solo UID; riduzione dei refresh inutili del contatore. I dati di sessione non vengono condivisi fra palestre/ruoli/account. Le modifiche allo swipe E.1/E.2 sono preservate.
- Performance Audit: in sviluppo, usando ?lfPerf=1, console [LionFit Data Audit] con area generica, fase warm-hint/ready/error e tempo in ms. Non registra UID, palestra, messaggi o payload, non invia telemetria. Misura la disponibilità del contenuto, non FPS o prestazioni assolute.

## 2. Architettura, sicurezza e limiti

La lease della sottoscrizione è limitata a una sola chiave per sorgente e a 15 secondi dall'ultimo distacco. A scadenza, cambio account/palestra/ruolo, logout o errore durante la fase inattiva si chiude la sorgente; le callback obsolete non possono ripopolare la cache. L'eventuale replay al rientro richiede dati precedentemente confermati dal server e una sessione ancora valida. Una sottoscrizione attiva può condividere lo stato corrente con altri consumatori dello stesso scope. Non viene aggiunta persistenza dei dati.

L'autorizzazione della chat continua ad essere verificata dal backend, che non è modificato. L'hint dell'elenco non equivale a una conferma attuale dei permessi: una revoca remota non ancora rilevata può lasciare visibili brevemente metadati già ricevuti (massimo 8 secondi), senza testo dei messaggi o possibilità di interagire prima della riconferma. All'errore di autorizzazione e al cambio scope rilevato, invalidazione immediata. La breve permanenza dei listener può ridurre le riaperture ma non implica un risparmio garantito di letture o costi Firestore. Il riuso non è garantito in caso di primo accesso, offline, timeout o perdita di autorizzazione.

## 3. Verifiche effettuate

- TypeScript: `vue-tsc --noEmit` superato.
- Nuova suite `r22b6e3-session-data.test.mjs`: **27/27**. Include lease condivisa, rientri, expiry, offline, cambio palestra a UID invariato, revoca/errore, risposta tardiva, aggiornamenti concorrenti, hint senza testo, paginazione e uscita. Include prove con Vue reale (compilazione dei componenti e renderer di test con servizi simulati), non collaudo del sito completo o di Firebase LIVE.
- Suite unitaria e regressioni selezionate: E.2 **616/647**, E.3 **645/674**. 29 fallimenti residui già presenti per nome nella baseline; nessun nuovo fallimento. Due fallimenti storici risolti aggiornando fixture/mock del test, non rappresentano nuove funzionalità applicative. I fallimenti residui comprendono contratti statici di patch storiche, fixture mancanti e verifiche che richiedono ulteriori indagini. Non si dichiara la suite completa verde.
- Build Vite tentata: bloccata dalla dipendenza nativa `@rollup/rollup-linux-x64-gnu` assente nel pacchetto node_modules proveniente da Windows. Build da ripetere sul PC Windows prima della pubblicazione.
- Nessun test Firebase LIVE, nessun deploy, nessuna misurazione su smartphone effettuati per questa patch.

## 4. Installazione e collaudo

1. Ferma il dev server. Verifica di avere installato E.2. Fai un backup dei file contrassegnati replace nel manifest, mantenendo la struttura delle cartelle; conserva il backup fuori dal progetto. Se un file è stato modificato manualmente dopo E.2, confrontalo prima di sovrascriverlo.
2. Estrai lo ZIP nella cartella principale di LionFit-Modern-Git, sovrascrivendo i file indicati. Non sostituire l'intero progetto. Non modificare .env, backend, Firebase Rules o configurazione LIVE.
3. PowerShell nella root del progetto:

```powershell
npm.cmd run typecheck
node --experimental-strip-types --test tests/r22b6e3-session-data.test.mjs
npm.cmd run build
npm.cmd run dev -- --host 0.0.0.0
```

4. Prova Home → Piano → Archivio → Allenamenti → Home (ripetendo entro 15 secondi), poi rientro dopo più di 15 secondi. Controlla branding, prossima lezione/evento, aggiornamento dati, assenza di caricamenti fittizi e correttezza del contenuto.
5. Chat: apri, torna alla Home, riapri; scegli rapidamente conversazioni e invia un messaggio di prova mentre avviene un refresh; verifica storico, non letti, errori, uscita e rientro. Usa account di test. Un rientro rapido può mostrare soltanto l'hint dell'elenco finché il server non conferma; la cronologia viene sempre caricata dal backend.
6. Logout e login con un altro account, eventualmente stessa palestra/ruolo diverso e palestra diversa. Nessun contenuto precedente deve apparire. Prova rete lenta/interrotta e ritorno alla connessione. Verifica anche Coach e Atleta, desktop e mobile, e le gesture E.2. Non usare dati sensibili reali nelle registrazioni.
7. Per misurare, da dev apri `http://127.0.0.1:5173/home?lfPerf=1`, poi F12 → Console (livello Verbose per console.debug). Cerca `[LionFit Data Audit]` e `[LionFit Motion Audit]`. Sul telefono usa l'IP del PC nella stessa rete. Il server dev può essere collegato a Firebase LIVE: usare esclusivamente account di prova e non esporre la porta a Internet. Confronta lo stesso dispositivo, rete, account e percorso, primo ingresso e ritorno ravvicinato. Non confondere warm-hint con ready. Nessun invio di telemetria aggiunto.
8. Solo dopo i controlli, esegui LIONFIT_PREPARA_WEB_E_DOCS.cmd, controlla le modifiche e l'esclusione dei file .env, quindi Commit e Push origin tramite GitHub Desktop. Non serve firebase deploy.

## 5. Rollback

In caso di regressione, ripristina dal backup tutti i file replace indicati sotto. Rimuovi soltanto i nuovi file add di questa patch e i due documenti di accompagnamento (se estratti). Ripeti typecheck e build. Se E.3 è già online, riprepara WebDocs e pubblica la versione ripristinata. Non modificare i dati Firebase, la configurazione della Chat o le Rules.

### File modificati (backup richiesto)
- `src/App.vue`
- `src/components/AthleteHomeHighlights.vue`
- `src/components/GymIdentity.vue`
- `src/features/athletes/useAthleteLive.ts`
- `src/features/chat/chatClient.ts`
- `src/integrations/firestore/competitions.ts`
- `src/views/AthleteChatPreview.vue`
- `tests/patch27-performance.unit.mjs`
- `tests/r22b6a-perf-security.test.mjs`

### File nuovi

- `src/features/athletes/athleteSheetStream.ts`
- `src/features/branding/liveIdentityStream.ts`
- `src/features/chat/chatSessionSnapshot.ts`
- `src/features/performance/sessionDataAudit.ts`
- `src/features/performance/verifiedSessionStreams.ts`
- `src/features/performance/warmSessionStream.ts`
- `tests/r22b6e3-session-data.test.mjs`

## 6. Prossima fase

E.4 Professional UI Final Polish, soltanto dopo il collaudo E.3. Valutare grafica, spaziature, scheletri iniziali, accessibilità e comportamento reale delle transizioni. Non modificare nuovamente gesture o backend senza una criticità concreta.
