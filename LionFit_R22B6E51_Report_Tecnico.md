# LionFit R22B.6E.5.1 — Universal Native Motion Engine

Base: R22B.6E.5, ricostruita dagli ZIP originali e dalle patch incrementali fino a E.5. Frontend soltanto.

## Evidenza e decisioni
Il video E.5 ha mostrato swipe non agganciati sulla programmazione e una sensazione di scatto al cambio di pagina. Dal codice E.5 risultavano un limite di 28 CSS px sul trascinamento, esclusione indiscriminata dei label, scrollport delle settimane anche senza overflow e navigazione anticipata prima del rilascio. Questi elementi possono contribuire alla discontinuità; il video non misura la latenza hardware o FPS.

La patch mantiene Pointer Events, il fallback Touch Events e le soglie di riconoscimento E.5. Il gesto orizzontale resta reversibile fino al rilascio, con spostamento al 98% del dito e limite dell'88% della larghezza; al bordo senza destinazione resta un feedback elastico limitato a 18 px. L'anteprima inerte si sposta con la stessa distanza, mantenendo uno span di viewport. La navigazione passa sempre attraverso Vue Router e i suoi guard. Handoff da ultimo offset effettivamente applicato, durata adattiva 125–300 ms; 340 ms per tap navbar. Il tempo effettivo include anche risoluzione router e rendering.

## Universal Touch
- I label non sono più esclusi a priori. I select nativi, input, textarea, editor, slider, drag handle, modali, grafici e gesture di sistema restano protetti.
- Direttiva locale `v-lf-swipe-rails`: osserva le dimensioni di rail noti (settimane, carousel schede, filtri progressi, agenda) e dei relativi figli; gestisce variazioni DOM/dimensioni con un solo frame schedulato. Se il contenuto entra nel contenitore e non necessita di scroll verticale proprio, rimuove il comportamento di scrollport orizzontale. Se ritorna overflow, ripristina CSS originale. Solo mobile per ciascun ruolo. Non misura ogni nodo a ogni pointermove.
- Rimane la protezione dei contenitori con overflow orizzontale effettivo e dei carousel custom esplicitamente protetti. Non si afferma che tutte le superfici esistenti siano state provate su hardware reale.

## Continuous Motion e dati
- L'anteprima è una proiezione visuale non interattiva, NON una copia della pagina reale, un KeepAlive o un nuovo componente Vue montato.
- Solo il workspace Atleta già montato può fornire un breve riepilogo dal proprio stato già pronto e autorizzato (Home, Piano, Archivio se pronto). Stesso UID/palestra/ruolo verificato. Negli altri casi compare solo un titolo e una superficie neutra. Mai testo dei messaggi o snapshot privati della Chat. Nessun nuovo listener, fetch o storage. Il riepilogo esiste per il gesto/transizione di ritorno, poi è rimosso; invalidazione su identità, visibilità, resize e perdita della sessione/dati ready. Non garantisce la rilevazione istantanea di revoche remote oltre alle verifiche già esistenti.
- Conservata la geometria della pagina uscente prima del nuovo layout Vue. Le variabili per la transizione reale restano fissate per ogni pagina tramite continuousMotion. Le anteprime sono rimosse quando il router cambia rotta, o rientrano insieme al contenuto in caso di annullamento/rifiuto.
- Gli swipe consecutivi possono essere accettati mentre termina la transizione precedente; si attende che sia stabile. Timeout di sicurezza 500 ms: se persiste, si annulla l'intento invece di forzare sovrapposizioni. Nessun nuovo swipe viene sovrapposto deliberatamente a una transizione attiva.
- Smart Page Retention integrale non implementata: non vengono conservate pagine private smontate o istanze duplicate. Si riutilizzano i dati già disponibili secondo il perimetro sopra. È una scelta conservativa, non un motore nativo a due pagine reali precaricate.

## Verifica
- TypeScript: `node node_modules/vue-tsc/bin/vue-tsc.js --noEmit` OK.
- Serie R22: 134/134, inclusi 8 nuovi test E.5.1. Tre file di test di integrazione aggiornati per il cambiamento deliberato di policy (continuità/anteprima, niente commit anticipato, attesa senza sovrapposizione). I test puri E.5 restano.
- Chromium isolato con input touch CDP e gestori estratti dal vero App.vue, CSS e funzioni della patch: 13 controlli riusciti: rail con una settimana, trascinamento, nessun commit prematuro, riepilogo, handoff, label, inversione, tap normale, invalidazione, rifiuto router, rail con overflow, scroll orizzontale e protezione input. Il router e i dati in questa prova erano simulati. Non è un test E2E dell'app LIVE, né una misurazione FPS.
- Build Vite tentata ma bloccata dal pacchetto nativo Rollup Linux mancante negli ZIP Windows. Eseguire build sul PC dell'utente. Non è stata rieseguita tutta la suite storica.

## Installazione e rollback
Estrarre nella root LionFit-Modern-Git sopra E.5, dopo un commit/backup dei file riportati nel manifest. Eseguire `npm.cmd run typecheck`, `npm.cmd run build` e facoltativamente `node --experimental-strip-types --test tests/r22b6e51-universal-motion.test.mjs`. Se OK, WebDocs e commit/push come da workflow. Nessun deploy Firebase. Per rollback ripristinare il commit precedente o i file preesistenti e rimuovere i 3 file nuovi (universalMotion.ts, swipeRails.ts, test E.5.1), poi rigenerare WebDocs e ripubblicare. Non ripristinare database o configurazioni.
