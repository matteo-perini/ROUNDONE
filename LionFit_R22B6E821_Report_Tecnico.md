# LionFit R22B.6E.8.2.1 — Premium Motion Recovery

Base obbligatoria E.8.2. Verificati 14/14 hash del suo manifest prima delle modifiche. Intervento frontend, senza modifiche al router, al Page Track, alle soglie touch, alla Chat, al backend, alle Rules, alle configurazioni .env, alle query o ai listener Firebase. Nessuna dipendenza aggiunta.

## Causa e correzione delle animazioni invisibili
Il motore E.8.2 segnava i gruppi come presentati prima di verificare se un'animazione fosse consentita. Sulle navigazioni mobile, i gruppi già montati venivano saltati quasi sempre; il set globale `presented` sopprimeva anche i ritorni alla pagina. Inoltre il flag generico `data-lf-motion-paired` può rimanere nella shell fino a 1200 ms, oltre il termine del movimento effettivo.

- Rimosso il blocco dei ritorni caldi tra rotte: un ingresso per gruppo per navigazione confermata, non a ogni snapshot, filtro o remount della stessa rotta.
- Si attende l'effettivo termine del movimento (rail nativo, pair esterno, drag e classi Vue), ignorando il flag generico che può rimanere nella shell. Attesa limitata alla finestra esistente di 1600 ms e verifica dello stato globale al massimo ogni 40 ms tramite rAF; nessuna misurazione di layout. Se arriva un nuovo input o cambia la sessione, si annulla la presentazione pendente. Una volta riconosciuto un nuovo swipe, gli effetti già attivi si interrompono.
- Conservati i 550 ms, 28 px, stagger 55 ms con massimo 165 ms, massimo 8 elementi, curva `cubic-bezier(.16,1,.3,1)`. L'ingresso iniziale parte da opacità .12; sulle pagine già visibili dopo la transizione il reveal parte da .72, per evitare un nuovo flash. Il dato è reso disponibile prima dell'effetto. Non si prolunga la transizione navbar di 340 ms, non si ritarda il tocco.
- Agenda Atleta: gruppi reali hero, azioni e prossime lezioni; intestazione Agenda per entrambi i ruoli. Profilo: intestazione, hero, riepilogo, sezioni e azioni; escluso editor profilo. Nessuna animazione dei messaggi privati o del branding; mantenute le esclusioni per modali, pane inattivi e preferenza reduced motion. Sono gruppi selezionati, non ogni elemento su ogni rotta.

## Indicatore verde globale
Rimosso il Teleport `lf-quiet-indicator` da App.vue, rimossi CSS e animazione della barra. La direttiva esistente ora marca soltanto un indicatore locale, con role status e senza `aria-hidden` forzato. Il testo locale (piccolo, senza barra) viene presentato dopo 350 ms di attesa con fade 160 ms; senza animazione con reduced motion. Le etichette ausiliarie non collegate alla direttiva rimangono per i lettori di schermo. Nessun timer globale e nessun nuovo listener Firebase. Le schermate inattive non possono mostrare un indicatore globale. Il feedback di errore resta invariato.

## Limiti dichiarati
Questa patch non realizza il caricamento anticipato di tutti i componenti, né converte le anteprime esterne in pagine reali. Home, Piano, Archivio restano il Page Track effettivo; Chat e altre pagine esterne mantengono la soluzione E.7.4. Il nuovo feedback locale non è ancora il sistema skeleton completo previsto per la E.8.3. La resa delle animazioni dopo lo swipe è volutamente più delicata dell'anteprima iniziale, e richiede verifica su telefono.

## Verifiche effettive
- TypeScript: exit 0.
- Suite mirata: 25/25, R22: 201/201.
- Suite estesa: 787/802; stessi 15 fallimenti per nome della E.8.2 (783/798), nessun nuovo fallimento. Tre file di test esistenti aggiornati per verificare i comportamenti intenzionalmente sostituiti (reveal al ritorno, attesa del movimento, rimozione barra globale); aggiunti 4 test di regressione, 3 inclusi nella suite R22. Nessuno dei 15 test storici falliti è stato alterato.
- Chromium: 86 verifiche su viewport 320, 390, 850, 1280 e reduced motion; Vue reale, direttiva effettiva e CSS effettivo, componenti e router dimostrativi. Verificati rail con due pane montati e inert, attesa della stabilizzazione, ritorno caldo, durata e stagger WAAPI, aggiornamenti senza replay, annullamento su swipe/input, assenza barra globale e stato locale accessibile. Non è un collaudo dell'app completa LIVE e non misura FPS.
- Build Vite tentata e bloccata da @rollup/rollup-linux-x64-gnu mancante nelle dipendenze Windows originali. Eseguire sul PC Windows.

## Installazione / rollback
Backup dei nove file replace indicati nel manifest, estrazione nella root della E.8.2 con Sostituisci tutti i file. `npm.cmd run typecheck`, `npm.cmd run build`, `node --experimental-strip-types --test tests/r22*.test.mjs`. Verificare in palestra di prova: navigazione navbar e swipe, attendere che la transizione termini per osservare i gruppi, ritornare sulle stesse sezioni; nessuna linea verde; stato locale durante attesa reale; Chat utilizzabile. Poi WebDocs e commit/push. Nessun deploy Firebase. Rollback ripristinando i nove file dal backup, rigenerando WebDocs.
