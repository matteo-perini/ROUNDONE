# LionFit — R22B.6E.7 Final Performance Review

## 1. Base, obiettivo e confini
Base verificata: due ZIP originali più tutte le patch R22 fino alla E.6. Il contenuto dei file src/tests sovrascritti dalle patch coincide byte per byte con l'ultima versione attesa prima delle modifiche E.7. Sono stati ricostruiti anche i sorgenti backend, gli script, le regole e i file ausiliari disponibili nei due ZIP, escludendo segreti, configurazioni locali .env, build generate e dipendenze backend non necessarie alle prove. Nessuna connessione a Firebase LIVE, scrittura cloud o modifica alla configurazione di produzione.

Audit statico mirato al ciclo di navigazione, drag/anteprima, observer dei rail, transizioni, sessioni temporanee, workspace Atleta, branding, Agenda, Chat, diagnostica e precaricamento route. Non è una certificazione completa della sicurezza o una profilazione dell'intero codice in esecuzione su un telefono. La suite locale estesa è stata eseguita prima e dopo nello stesso ambiente ricostruito.

## 2. Correzioni implementate

- **Anteprima swipe** (`universalMotion.ts`): la proiezione è aggiornata solo quando cambia il titolo o l'oggetto riepilogo (stabile nel chiamante durante la stessa destinazione/gesture). Eliminata serializzazione JSON ad ogni frame e ripetuti reset del DOM quando l'anteprima non è visibile; evita anche scritture identiche di transform. Nessun cambiamento alle soglie, geometria E.5.1, reversibilità, curva o durata. Il riepilogo resta una proiezione leggera, non una seconda schermata Vue completa.
- **Rail orizzontali** (`swipeRails.ts`): il MutationObserver non programma nuove misurazioni per inserimenti/rimozioni riguardanti esclusivamente l'anteprima dello swipe, né per modifiche interne alla cue (anche Text nodes). Le mutazioni reali, ResizeObserver e resize finestra continuano a rivalutare le larghezze. Il selettore settimane mantiene la distinzione fra rail contenuto e overflow reale.
- **Sessioni e listener** (`warmSessionStream.ts`): un callback di reset può acquisire sincronicamente un'altra identità. Una richiesta precedente non può associarsi alla nuova entry; la validità viene ricontrollata prima dell'acquisizione e fra i subscriber. Versionamento della lease per evitare che un callback di scadenza obsoleto chiuda una lease successiva. Finestra 15 s, controlli Firebase e criteri replay invariati. Il test verifica un caso limite sintetico, non una perdita dati osservata in produzione.
- **Chat** (`AthleteChatPreview.vue`): ricerca normalizzata una volta per modifica e computed per l'elenco dei thread; indice Set dei peer per evitare scansione annidata contatti x thread. Filtri, ordinamento, limite 50 contatti e verifiche di accesso invariati.
- **Viewport Chat** (`chatViewport.ts`): baseline di altezza aggiornata in assenza di focus, evitando che una riduzione stabile dell'altezza a larghezza invariata (es. finestra ridimensionata) venga successivamente interpretata come tastiera al semplice focus. Riconoscimento tastiera, soglia, zoom e gestione dock E.6 invariati.
- **Diagnostica** (`motionAudit.ts`): campioni associati all'oggetto route, non a un unico pending globale; esclusione campioni obsoleti dopo navigazioni rapide e tab nascosto; cancellazione dei requestAnimationFrame ancora pendenti al teardown. Due rAF rappresentano un'opportunità di rendering, non misurano il paint GPU né la disponibilità completa dei dati. Diagnostica solo DEV, locale e facoltativa.

## 3. Esito del controllo architetturale

| Area | Esito e limiti |
|---|---|
| Gesture e transizioni | Conservati il motore Pointer Events/fallback, le soglie E.5.1, le protezioni dei controlli nativi e la durata navbar; corretto lavoro inutile nella cue. Il percorso reale può comunque attendere router, guardie e rendering. |
| Anteprime | Home/Piano/Archivio possono usare un riepilogo autorizzato del workspace; altre destinazioni possono mostrare una superficie neutra. Non sono due pagine reali interamente precaricate. |
| Workspace Atleta | Home/Piano/Archivio condividono il workspace. Le due sottoscrizioni archivio sono attivate al primo accesso necessario e mantenute finché il workspace resta montato; vengono chiuse all'uscita. Nessuna ulteriore sottoscrizione introdotta. |
| Branding e Agenda | Lease E.3 limitata a 15 s, scope verificato, nessuna persistenza aggiunta. L'editor mantiene il percorso originale. |
| Chat | Richieste autorizzate dal server; hint lista 8 s senza testo messaggi; poll visibile e guardie contro risposte obsolete. Nessuna cache cronologia aggiunta. Restano da verificare latenza server e tastiera effettiva. |
| Router | Warmup solo codice, una importazione alla volta, visibilità/connessione controllate. Non indeboliti i controlli di navigazione. |
| Memoria | Verificati teardown, rimozione cue, timer, observer e lease nei moduli toccati. Nessun heap snapshot dell'app completa: non dichiarare assenza globale di leak. |
| CSS/layout | Nessun nuovo stile o cambio grafico in E.7; precedenti prove touch e Chat rieseguite con codice aggiornato. |
| Backend e Rules | Invariati; nessun deploy. I test locali di contratto non sostituiscono emulator suite completa o audit live. |

## 4. Test effettivi

Comandi eseguiti con Node 22.16.0 nell'ambiente ricostruito:

- `node node_modules/vue-tsc/bin/vue-tsc.js --noEmit` — OK.
- `node --experimental-strip-types --test tests/*.unit.mjs tests/r22*.test.mjs` — E.6: 727/741, 14 fallimenti. E.7: 736/750, 14 fallimenti. Confronto dei nomi dei fallimenti: identici. Il conteggio differisce da report precedenti perché questa ricostruzione include più file ausiliari originali, rendendo eseguibili più test storici; confronto significativo solo entro la stessa baseline.
- `node --experimental-strip-types --test tests/r22*.test.mjs` — 154/154, inclusi i 9 nuovi test E.7.
- Nuovi test E.7: 6 prove comportamentali (reset rientrante, invalidazione durante callback, verifica post-reset, timer obsoleto, cue DOM, viewport) e 3 controlli di contratto statici (diagnostica, ricerca Chat, observer rail).
- Chromium headless: 13 asserzioni touch con gestori reali estratti da App.vue, router e dati simulati. Rail con settimana singola o overflow, drag continuo e annullabile, tocco normale, revoca scope, rifiuto router, input protetto. 35 asserzioni Chat con SFC Vue compilato e viewport/backend simulati: quattro configurazioni mobile e desktop, tastiera, invio, focus, bozza, scroll, revoca, teardown. Totale 48 asserzioni; non rappresentano 48 test end-to-end dell'app LIVE.
- Build Vite tentata: impossibile avviarla per modulo nativo `@rollup/rollup-linux-x64-gnu` mancante nei node_modules Windows forniti. Nessuna sostituzione package-lock o installazione di nuove dipendenze. Build obbligatoria sul PC Windows.
- Non eseguiti emulator test che richiedono servizi Firebase in esecuzione, APK/iOS reale, misurazioni FPS/hardware o suite di sicurezza LIVE.

### 14 fallimenti preesistenti da mantenere aperti

I nomi riportati sono quelli dei test, non diagnosi di difetti runtime confermati. Molti verificano contratti testuali storici; non sono stati riscritti per rendere verde la suite. Richiedono triage separato prima della commercializzazione, soprattutto i contratti commerciali, autorizzazioni e foto.

- Contratti UI e backend: duplicazione scelta da Coach, data lunedì, ogni programma con ID
- existing single-document security paths, server reads, bounded concurrency and guard for writes
- real confirmation and server readback, no simulated payments, no new access controls
- single responsive inbox placement matches shell breakpoints and stable account key
- coach primary snapshot loads before deferred program fanout and obsolete tasks cannot publish
- static UI: both select views share component, assignment search cannot silently switch athlete, day checks snapshots
- static auth: existing verified rules retained, email retry refreshes token, no automatic email send
- live actions remain wired, collaborator gated, demo non transmitting
- Mobile new home can scroll, old V3 screen lock does not apply
- default LionFit branding assets exist for gyms without personalization
- tests/progress07.static.unit.mjs
- Coach senza Registro carichi; Check Zone nominata ovunque
- Foto compressa prima di ogni invio, nessun originale nello Storage
- Formati HEIC e comuni + errore se dispositivo non decodifica

## 5. Installazione e rollback

1. Partire dalla E.6. Prima dell'estrazione copiare in una cartella di backup esterna al progetto i sei file src indicati nel manifest. Se si usa Git, annotare il commit E.6 e mantenere le proprie modifiche locali separate. La patch aggiunge un solo file di test.
2. Estrarre ZIP nella cartella radice, sovrascrivere esclusivamente i sei file src elencati. Non cancellare node_modules, package-lock o configurazioni locali.
3. Eseguire `npm.cmd run typecheck` e `npm.cmd run build` (PowerShell); facoltativo ripetere `node --experimental-strip-types --test tests/r22*.test.mjs`.
4. Solo a build riuscita, eseguire `LIONFIT_PREPARA_WEB_E_DOCS.cmd`, controllare le modifiche previste e pubblicare tramite GitHub Desktop. Nessun deploy Firebase. Verificare che il telefono carichi realmente gli asset della nuova build (PWA e cache browser possono mantenere la versione precedente).
5. Rollback: ripristinare i sei file dal backup E.6, eliminare solo `tests/r22b6e7-final-review.test.mjs` se aggiunto dalla patch, ricostruire WebDocs e ripubblicare. Non ripristinare o modificare database e configurazioni.

## 6. Collaudo reale finale — criteri di accettazione

- Video Atleta e Coach con indicatore tocchi/posizione puntatore, giro navbar e poi swipe; partire dalla pagina stabilizzata e poi effettuare sequenze rapide. Provare card, testi, settimane che entrano/che scorrono, tabelle, bordi, scroll verticale, input e modali. Distinguere mancato riconoscimento, ritardo guardia router e animazione interrotta. Il gesto deve restare annullabile e non attivare card per errore.
- Verificare che Home/Piano/Archivio mantengano dati e branding nei ritorni rapidi; ripetere dopo oltre 15 s e dopo app in background. Caricamento iniziale o dati scaduti non equivalgono a una regressione.
- Chat: ingresso/rientro, apertura conversazione, tastiera reale, scroll vecchi messaggi, invio con bozza successiva, chiusura tastiera, navbar e swipe verso Home. Usare account di test, niente dati personali in registrazione.
- Provare cambio account/palestra e logout, con account autorizzati e senza mostrare dati privati; verificare nessun contenuto dell'account precedente. Non eseguire prove distruttive in produzione.
- Per misure strumentali usare dev `?lfPerf=1`: lock gesture, applicazione transform (non paint hardware), cambio route, data-ready e long frame. La versione online non attiva questi log DEV. Il video non prova FPS renderizzati o costi Firebase; se rimangono scatti serve profilo DevTools su dispositivo.

**Decisione:** non accelerare ulteriormente navbar o swipe né introdurre KeepAlive globale, pre-mount di tutte le pagine o ulteriori cache private senza evidenza dal collaudo. E.7 è una chiusura tecnica candidata, non una garanzia di fluidità nativa o di release commerciale pronta. Le notifiche push della Chat, Gmail/Outlook, Stripe Billing/Connect e la readiness commerciale sono attività separate.
