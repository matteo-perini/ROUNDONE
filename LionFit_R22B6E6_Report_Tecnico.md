# Report tecnico — R22B.6E.6 Native Chat Experience

## Base e ambito
Ricostruzione dai due ZIP originali con patch R22 applicate in ordine fino a E.5.1. Modifica limitata a Chat e test; App.vue, router, motore gesture, backend, regole, configurazione, cache E.3 e dipendenze non modificati.

## Interventi
- Nuovo `chatViewport.ts`: calcola la geometria a partire dal viewport visibile e dal bordo superiore reale del dock. Ascolta `visualViewport.resize/scroll` (fallback `innerHeight`) e resize/scroll della finestra. Accorpa gli eventi con requestAnimationFrame. Riconosce la tastiera soltanto con focus sul campo e riduzione di almeno 100 px; ignora il pinch-to-zoom. Il dock Atleta (teleport) e quello Coach si nascondono solo in tale stato. Rimozione marker/listener all'uscita; geometria della pagina uscente conservata durante la normale animazione. Al cambio account/permessi, reset immediato.
- Layout mobile: workspace a dimensione disponibile, intestazione e composer separati dall'area scorrevole dei messaggi. Header compatto dentro una conversazione, ricerca sticky nell'elenco, padding della shell ridotto solo sulla Chat corrente. Coach mobile fino a 900 px, Atleta fino a 799 px.
- Ancoraggio messaggi: ResizeObserver e requestAnimationFrame con guardie di sessione/conversazione; chi sta leggendo indietro non viene forzato in fondo dal resize. Prepend dei messaggi precedenti mantiene la compensazione del delta di altezza. Scroll intenzionale in fondo all'invio e all'apertura conversazione già presente.
- Composer: non viene più disabilitato durante l'invio o il caricamento della cronologia quando autorizzato. Il pulsante rimane disabilitato per richieste concorrenti, messaggi vuoti o autorizzazione mancante. La bozza può essere scritta mentre l'invio precedente termina; la logica originale cancella solo se il contenuto coincide con quello inviato. Su mobile Enter crea nuova riga; desktop Enter invia, Shift+Enter va a capo, IME protetto. Previene la perdita di focus per il normale mousedown sul pulsante invia. Il comportamento della tastiera hardware/IME reale va verificato sul dispositivo.
- Non aggiunge listener Firebase, cache o richieste di rete; mantiene verifica server, token/generazione e protezioni dei messaggi. Il motore swipe rimane E.5.1.

## Test effettivi
- Vue TypeScript: `node node_modules/vue-tsc/bin/vue-tsc.js --noEmit`, OK.
- `node --experimental-strip-types --test tests/r22*.test.mjs`: 145/145, inclusi 11 nuovi test E.6. Due test storici sono stati aggiornati per iniettare il nuovo helper nel renderer simulato e per riflettere la scelta esplicita di lasciare la textarea abilitata durante un invio autorizzato (non viene rimosso alcun controllo di autorizzazione).
- Chromium headless: 35 asserzioni superate in harness isolato con il componente Vue compilato, CSS della app e servizi/viewport simulati. Quattro configurazioni mobile (Atleta 320x640 scuro, Atleta 390x844 chiaro, Coach 390x844 scuro, Coach 850x900 chiaro) e Coach desktop 1280x800. In ogni configurazione mobile: composer sopra dock; riduzione viewport e dock nascosto; ultimo messaggio ancorato; Enter nuova riga; focus mantenuto durante invio; nuova bozza preservata; chiusura tastiera e posizione storico; revoca accesso e dock ripristinato. Verificati inoltre uscita con geometria mantenuta, unmount e Enter desktop. Non è una prova con tastiera OS reale, Firebase LIVE o app completa; il dock e il backend erano simulati. Il test non misura latenza o FPS hardware. Il caso di viewport estremamente basso in landscape non è stato collaudato.
- Build Vite tentata e bloccata da `Cannot find module @rollup/rollup-linux-x64-gnu` (dipendenze originali Windows). Build da effettuare sul PC Windows. Suite storica completa non rieseguita in questa patch; E.7 sarà l'audit esteso.

## File
- `src/views/AthleteChatPreview.vue`
- `src/features/chat/chatViewport.ts`
- `tests/r22b6e3-session-data.test.mjs`
- `tests/r22b6e4-ui-polish.test.mjs`
- `tests/r22b6e6-native-chat.test.mjs`

## Decisioni e limiti
Navbar nascosta solo su tastiera rilevata, non su semplice focus. Nessuna apertura automatica della tastiera. La E.6 non cambia l'anteprima durante lo swipe E.5.1, non introduce notifica push Chat o nuove funzioni di messaggistica. Il comportamento di visualViewport varia fra Chrome Android, iOS PWA e WebView APK: verifica reale indispensabile prima di considerare concluso il ciclo.
