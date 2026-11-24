# LionFit R22B.6E.7.1 — Critical Recovery & Continuous Preview Fix
Base: R22B.6E.7. Patch frontend incrementale. Nessun deploy Firebase.

## Correzione critica Chat
`chatViewportGeometry` non restituisce piu 0 per geometrie esaurite o non valide. Restituisce null, rimuove la variabile CSS obsoleta e usa una geometria CSS di fallback. Soglia senza tastiera 200 px, con tastiera 112 px. Sei tentativi automatici limitati, a 32/64/120/240/400/600 ms; annullati in teardown. Rimisurazione a transitionend/transitioncancel e scroll (anche contenitori interni). CSS mobile Coach e Atleta con fallback max(220px, calc(100dvh - 180px)) e min-height 112px. Conservato il comportamento desktop e la verifica server delle conversazioni.

Riproduzione isolata Chromium: prima, un rect iniziale errato (top 900) lasciava la Chat con altezza effettiva 4 px, stage 66 px, senza recupero dopo 1 secondo. Dopo: 632 px, stage 694 px, contatto disponibile e superficie touch utilizzabile; nessun resize richiesto; nessun errore JS. Questi valori appartengono al test isolato, non al telefono dell'utente.

## Anteprime
La superficie della cue ha ora larghezza esatta dello stage, posizione orizzontale coerente con lo span di transizione, altezza e posizione verticale calcolate sulla parte visibile; padding interno allineato alla pagina. Containment e sfondo opaco, layer non interattivo, aria-hidden e inert. Il riepilogo dati del workspace, solo quando ready e con accountKey corrispondente, contiene piu sezioni reali per Home/Piano/Archivio. Per le altre sezioni outline strutturali per rotta senza dati inventati o messaggi privati. Nessuna copia del DOM delle pagine, nessuna cache persistente o sottoscrizione aggiuntiva. La cue resta fino al DOM patch, viene rimossa al frame successivo; reset sessione e nuovo gesto la eliminano. Non e una seconda pagina reale completa, ne una garanzia di assenza di scatti su dispositivo reale. Le esclusioni native dei campi select/input restano inalterate.

## Test
- TypeScript: exit 0.
- R22: 159/159, inclusi 5 nuovi test. Due test storici aggiornati esplicitamente ai contratti corretti: geometria esaurita null (non zero) e handoff cue.
- Chromium: 35 prove Chat, 13 prove touch, 4 prove geometria cue con padding e scroll, piu riproduzione del difetto Chat. Ambienti isolati, servizi simulati.
- Suite larga tests/*.mjs: 744/759, 14 fallimenti con gli stessi nomi della baseline E.7 e un test Auth Emulator non eseguibile senza emulatore locale. Non sono stati modificati i test storici falliti. La selezione larga non coincide esattamente con quella precedente.
- Vite build tentata: bloccata dalla dipendenza nativa Linux Rollup assente nel pacchetto Windows. Build reale, Android/iOS, LIVE e diagnosi delle altre zone touch ancora da verificare.

## Installazione
Backup dei file in MANIFEST_R22B6E71.json. Estrarre direttamente nella root sopra E.7, sostituendo i file. Prima di pubblicare: npm.cmd run typecheck, npm.cmd run build, node --experimental-strip-types --test tests/r22*.test.mjs. Provare apertura Chat tramite icona e swipe, ritorno Home, tastiera, swipe in entrambe le direzioni dopo scroll. Solo se OK, WebDocs e GitHub Desktop. Nessuna modifica a Firebase, Rules, .env o dipendenze. Se produzione resta inutilizzabile, ripristinare l'ultimo commit web collaudato.

## Rollback
Ripristinare gli otto file sostituiti dal backup e rimuovere il nuovo test e i documenti specifici della patch. Rigenerare gli asset web; non toccare i dati Firebase.
