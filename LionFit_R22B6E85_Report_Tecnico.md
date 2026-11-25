# LionFit R22B6E85 — Real Page Expansion Atleta

Base: R22B6E84. Patch incrementale frontend, 19 file di progetto (inclusi test). Nessuna modifica Functions, Rules o configurazione Firebase.

## Problema e intervento
Il video 1000304115.mp4 (13,05 s) mostra la differenza fra le prime tre sezioni e le successive. Il motore precedente limitava il movimento delle destinazioni esterne a 24 px e completava il cambio al rilascio. Ora Home, Piano, Archivio, Allenamenti (/progressi), Agenda (/prenotazioni) e Profilo condividono lo stesso componente di rotta operativo e la stessa geometria del rail mobile. Non vengono generate schermate simulate. Il caricamento dei moduli e dei dati rimane asincrono: in caso di attesa si vede un segnaposto locale, non una pagina finta. Restano separatore da 14 px, navbar 340 ms e nessuna entrata ritardata da 550 ms.

## Architettura e sicurezza
- Tutti i sei contenitori sono disponibili sul rail mobile; le viste aggiuntive operative sono montate nella finestra corrente e adiacente, e quelle uscenti restano durante l'assestamento. Le prime tre mantengono il loro modello di condivisione dati. La finestra viene ridotta dopo 560 ms.
- Le viste inattive sono inert e aria-hidden. Contesto verificato e invalidazione per cambio account/ruolo. I guard del router restano attivi.
- Allenamenti: blocco di scritture, sincronizzazioni, query di azione e timer quando inattivo; guard dedicato alle bozze/operazioni in corso anche tra route con lo stesso componente. Stream schede condiviso, mantenendo conferma server per cache offline.
- Agenda e Profilo: azioni legate alla pagina attiva, scope verificato, protezione navigazione durante operazioni. Stili Agenda circoscritti alla pagina. Archivio: lettura anticipata quando vicino, errore locale senza bloccare Home/Piano.
- Le letture autorizzate delle sezioni vicine possono avvenire prima rispetto alla E84; non è un intervento a costo zero su Firebase. L'effettivo numero letture e memoria richiedono misura sul dispositivo. Le pagine lontane aggiuntive vengono smontate; la finestra può allargarsi temporaneamente durante la transizione.
- Chat e Coach conservano l'architettura precedente. Desktop: rendering singola pagina; non collaudato integralmente. Nessuna modifica alle regole di autorizzazione server.

## Verifiche
- TypeScript: exit 0 (`node node_modules/vue-tsc/bin/vue-tsc.js --noEmit`; shim npm Linux non eseguibile).
- R22: 217/217. Suite estesa: 797/812, 15 fallimenti con gli stessi nomi della E84. Sei nuovi test; cinque file di test precedenti adattati alle nuove aspettative (inclusa verifica pagina inattiva). Compilazione SFC verificata dai test.
- Chromium isolato: 249 asserzioni, viewport 320/390/430 px, motore e modulo finestra effettivi con fixture Vue e contenuto dimostrativo: tutte le 10 transizioni adiacenti in entrambe le direzioni, presenza contenuto vicino, drag oltre 24 px, due pannelli visibili, inert, commit, cleanup, finestra, cancellazione. Non test end-to-end con dati reali o Firebase LIVE; nessuna misura FPS.
- Build Vite completa non verificata in questa sessione: dipendenza Rollup nativa Linux già mancante nell'archivio Windows della E84. Verificare su Windows.
- Hash baseline confrontati con gli ZIP disponibili: 17/17 file sostituiti; hash SHA256 di tutti i file patch e CRC ZIP verificati.

## Collaudo manuale prima del deploy
Backup; installare sopra E84. Typecheck e build. Verificare swipe lenti/veloci in entrambi i sensi fra tutte le sezioni, annullamento a metà, navbar, scroll, Archivio e Agenda con dati in arrivo. In Allenamenti verificare bozza, timer, conferma uscita e salvataggio; in Agenda prenotazione; in Profilo modifica e salvataggio. Verificare cambio account, tema, desktop e Chat. Non utilizzare dati reali per prove distruttive. Nessun deploy Firebase richiesto.

Se una sezione mostra un segnaposto a freddo, verificare il tempo reale di arrivo dei dati; la patch non può garantire che la rete risponda prima del gesto.
