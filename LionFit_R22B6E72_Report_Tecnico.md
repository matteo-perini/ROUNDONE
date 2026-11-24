# LionFit R22B.6E.7.2 — Native Page Architecture 4.0

Base E.7.1 Critical Recovery. Pilot architecture: Home, Piano, Archivio dell'Atleta autenticato, mobile sotto 800 px, modalità operativa staging/LIVE. Patch frontend incrementale, non una riscrittura dell'app. Non modificare Firebase o .env.

## Implementazione
- I tre percorsi condividono già `AthleteLiveWorkspace.vue`: ora la stessa istanza contiene tre pannelli Vue reali, con chiavi stabili, e un solo rail fisico. Non sono snapshot DOM, immagini, card ricostruite o iframe. Durante il gesto si vedono due pannelli reali; il terzo resta invisibile. A riposo è interattivo solo il pannello della rotta corrente. Le pagine fuori schermo sono inert e aria-hidden. Su desktop si monta soltanto la pagina attiva.
- `nativePageTrack.ts`: il rail si sposta con una sola transform translate3d; il secondo pannello è a distanza pari alla larghezza effettiva del viewport del rail. La coppia e la geometria sono preparate una volta per gesto; i frame seguenti non leggono il layout. App.vue conserva Pointer Events, rAF, soglie E.7.1 e il controllo dei click. Quando la coppia è disponibile, non costruisce la cue. La navigazione si conferma soltanto al rilascio con Vue Router; dopo il commit il rail anima dall'ultimo offset dipinto. Navigazione negata o gesto annullato: ritorno sul pannello reale d'origine. Il tap navbar mantiene 340 ms, anche per salti non adiacenti; un tap che interrompe una transizione precedente la porta alla rotta già confermata, poi anima la nuova coppia. Non si promette ancora continuità assoluta in caso di tap rapidi concorrenti. Reduced motion e assenza di WAAPI: fallback senza animazione. Fuori dai tre percorsi, resta il vecchio motore E.7.1.
- Viewport: scroll verticale indipendente per ciascun pannello; altezza basata su geometria visibile, dock e VisualViewport, con fallback se invalida; osservatori e frame rimossi al teardown. Il pulsante Indietro entra nel pannello Piano/Archivio su mobile per evitare che il rail salti quando la rotta cambia. Header e dock restano nella shell. Il passaggio al workspace riposiziona lo scroll esterno all'inizio; all'interno le posizioni di scroll sono mantenute finché il workspace resta montato. La grafica dei componenti resta quella originale. `roundOneMotion` non anima gruppi delle pagine inattive o durante il movimento del rail.
- Confronto accountKey del workspace verificato e sessione della shell (UID, palestra, ruolo). Se differiscono, il rail viene invalidato, reso inert/nascosto, poi rimosso dal DOM. Nessuna nuova cache persistente o clonazione di pagine private; nessun aggiramento del router o delle Rules. Home e Piano chiudono dialoghi locali quando diventano inattivi; ProgramHistory chiude la propria scheda. La verifica server e i listener esistenti restano autoritativi. Non si garantisce rilevamento istantaneo di revoche remote non ancora ricevute.

## Costi e limiti architetturali
- Una sola chiamata useAthleteLive per il workspace. L'Archivio storico resta lazy: apre i due listener originali soltanto alla visita effettiva. Prima del primo ingresso mostra il suo vero stato di caricamento. Dopo la visita, il workspace usa le informazioni già disponibili.
- I tre componenti visivi sono montati insieme in questo perimetro limitato. Home contiene branding e highlights: le sottoscrizioni già presenti possono partire anche quando si entra direttamente nel Piano/Archivio e restare attive più a lungo, fino all'uscita dal workspace. Non vengono duplicati tipi di listener né creata una seconda istanza del workspace, ma possono aumentare la durata delle letture e il lavoro iniziale. Questo va profilato su account grandi prima dell'estensione. Non affermiamo che il costo Firebase sia invariato.
- Nessun pre-mount di Chat, Progressi, Agenda, Profilo o viste Coach. Queste continuano a usare il motore E.7.1; non sono ancora Page Track. Soglie del touch ed esclusioni native non modificate in questo passo. Se il nuovo motore non è disponibile (es. dati non ancora pronti), rimane la cue E.7.1 al confine del workspace. L'architettura è un pilot, non un collaudo di produzione.

## Verifiche eseguite
- TypeScript exit 0 (vue-tsc --noEmit).
- Serie R22: 166/166, di cui 7 nuovi test E.7.2. Quattro file di test storici aggiornati per rimpiazzare cinque asserzioni relative alla precedente Transition interna, conservando le verifiche del router, del motore esterno e dell'isolamento. Nessun test fallito storico alterato.
- Suite larga tests/*.mjs: 751/766; 15 fallimenti con gli stessi nomi della baseline E.7.1 (744/759), incluso test Auth Emulator non disponibile. Nessun nuovo fallimento.
- Chromium: 49 controlli riusciti (16 per ciascuna viewport 320x640, 390x844, 430x932; uno desktop 1280x800). SFC reali compilate di AthleteLiveWorkspace, AthletePlanContent, AthleteHomeContent e ProgramHistory, CSS di progetto, gestori touch reali; dati fittizi, servizi Firebase e router simulati, alcuni componenti figli sostituiti da stub (branding/highlights/SheetDetail). Controlli di coppia reale senza cue, distanza tra pannelli, annullamento, guard rifiutata, tap non adiacente, scroll verticale indipendente, invalidazione palestra e teardown. Non è un test end-to-end su Firebase o sul telefono, né una misurazione FPS.
- Ripetizione harness isolato Chat E.7.1: primi nove controlli passati, poi interruzione per timeout. File Chat e gestione viewport non modificati. Non si dichiara un collaudo Chat completo della nuova shell.
- Build Vite tentata: bloccata dalla dipendenza nativa Linux @rollup/rollup-linux-x64-gnu assente negli ZIP Windows. Verificare su Windows. Nessuna nuova dipendenza.

## Installazione e rollback
Backup di tutti i file con base_sha256 non nullo nel manifest. Estrarre nella root di LionFit sopra E.7.1, sostituendo tutti i file. Non installare come patch cumulativa su E.7 o precedenti. Eseguire typecheck, build e test R22. Poiché il layout cambia strutturalmente, raccomandato un collaudo breve su account test prima di pubblicare. Se si prova online, tenere a portata il precedente commit funzionante E.7.1. Provare Home/Piano/Archivio in entrambe le direzioni, scroll e dialoghi, passaggio a Chat e Progressi, tastiera, tema, rotazione e logout. Nessun deploy Firebase. Se problemi: ripristinare tutti i file sostituiti, rimuovere i due nuovi file di codice/test e i documenti della patch, rigenerare WebDocs. Non modificare i dati delle palestre.

## Elenco file verificabili
- `src/App.vue` (replace)
- `src/components/AthleteHomeContent.vue` (replace)
- `src/components/AthletePlanContent.vue` (replace)
- `src/components/ProgramHistory.vue` (replace)
- `src/features/motion/roundOneMotion.ts` (replace)
- `src/styles-continuous-motion.css` (replace)
- `src/views/AthleteLiveWorkspace.vue` (replace)
- `tests/r22b5-athlete-shared-screen-motion.test.mjs` (replace)
- `tests/r22b6d-motion-continuity.test.mjs` (replace)
- `tests/r22b6e2-continuous-motion.test.mjs` (replace)
- `tests/r22b6e5-native-swipe.test.mjs` (replace)
- `src/features/navigation/nativePageTrack.ts` (add)
- `tests/r22b6e72-native-page-track.test.mjs` (add)
