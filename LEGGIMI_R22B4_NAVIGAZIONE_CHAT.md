# LIONFIT — PATCH R22B.4 | Chat in alto + navigazione orizzontale Premium Motion

**Patch incrementale** per chi ha già installato R22A → R22B → R22B.1 → R22B.2 → R22B.3. Basata sui due ZIP del progetto unificati e su tutte queste patch. **Nessuna Cloud Function, Firestore/Storage Rule, dipendenza o configurazione Firebase modificata.**

## Cosa cambia

- Coach desktop: il link «Messaggi» NON è più nel piede della sidebar; un pulsante con icona verde compare **in alto a destra** nell'area del contenuto. Sulla Dashboard si sposta leggermente a sinistra per non sovrapporsi alla campanella.
- Coach e Atleta mobile: icona Messaggi più leggibile, stessa collocazione nell'intestazione, badge di non letti già basato sul backend.
- Atleta mobile: Chat a sinistra della Home. **Dalla Home, swipe a destra → Chat; dalla Chat, swipe a sinistra → Home**. Da Home, swipe a sinistra → Piano; swipe inverso torna a Home.
- Coach mobile: Chat a sinistra della sua Home; swipe avanti/indietro tra le **6 sezioni visualizzate nel dock**.
- Le altre sezioni primarie mobile Coach/Atleta seguono l'ordine già visibile nella navbar. Lo swipe è opzionale, la navbar continua a funzionare esattamente come prima. Le pagine secondarie (impostazioni, assistenza, sottopagine e modali) non partecipano al cambio sezione.
- Transizione orizzontale Premium Motion **340 ms** su tap navbar o swipe tra sezioni principali, con riduzione del movimento per chi la richiede nelle impostazioni di accessibilità.
- Protezione gesture: nessuno swipe su pulsanti/link/campi, immagini, tabelle, video, SVG e grafici, caroselli, aree con scroll orizzontale, overlay; non si catturano i primi/ultimi 32 px dello schermo (gesture di sistema) o gli swipe prevalentemente verticali.

## File da copiare

```text
src/App.vue                             (sostituisci)
src/components/LionIcon.vue             (sostituisci)
src/features/navigation/sectionSwipe.ts (nuovo)
tests/r22b4-section-swipe.test.mjs      (nuovo)
tests/r22b-chat-contract.test.mjs       (test precedente aggiornato a R22B.3)
```

Non cancellare altri file. Non copiare il contenuto dello ZIP in `src`: estrailo **alla radice** del progetto `LionFit-Modern-Git` mantenendo i percorsi.

## Prima dell'installazione

1. Verifica di aver applicato la R22B.3 e che la Chat pilota funzioni in locale sui due account autorizzati.
2. Crea una copia di sicurezza dei 3 file già esistenti elencati sopra (App.vue, LionIcon.vue, test `r22b-chat-contract.test.mjs`) **fuori dal repository**.
3. Estrai ZIP nella cartella principale e conferma la sovrascrittura dei file interessati.
4. Non modificare `.env.production.local`, `chat-backend/functions/.env`, né i permessi sul backend. Non occorre un nuovo `firebase deploy`.

## Verifiche su Windows (PowerShell nella radice LionFit-Modern-Git)

```powershell
node --test tests/r22b4-section-swipe.test.mjs
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

I test usano il caricamento nativo di moduli TypeScript (Node 22 recente). Se la tua versione di Node 22 non lo supporta direttamente, esegui:

```powershell
node --experimental-strip-types --test tests/r22b4-section-swipe.test.mjs
```

**`npm run dev` può usare Firebase LIVE:** accedi solo con gli account della palestra LION FIT TEST. Verifica su smartphone o con emulazione touch del browser:

- Coach desktop: pulsante Messaggi in alto a destra; nessun duplicato nel fondo della sidebar.
- Coach e Atleta su smartphone: icona verde Messaggi nell'intestazione; eventuale badge autentico.
- Atleta: swipe destra Home→Chat e sinistra Chat→Home; Home→Piano e ritorno; Archivio, Allenamenti, Agenda e Profilo nella sequenza reale.
- Coach: swipe in entrambi i versi tra le sei sezioni del dock; dalla Home a destra si apre Chat.
- Grafici, moduli, immagini, schede e scroll verticale non devono causare aperture involontarie.
- Toccare i sei link della navbar deve funzionare sempre; barra e navigazione originale restano invariate.
- Account di palestra diversa: la Chat resta nascosta (backend controllato dalle patch precedenti).

## Pubblicazione (soltanto dopo test locale)

1. Chiudi `npm run dev` con CTRL+C.
2. Fai doppio clic su `LIONFIT_PREPARA_WEB_E_DOCS.cmd` per effettuare il rilascio web e aggiornare `docs`.
3. Verifica il risultato e controlla in GitHub Desktop file modificati, branch `main`, ed esclusione di `.env` e altri segreti.
4. Commit e Push origin sono **manuali**; non inclusi nella patch.
5. Verifica sul sito reale con Coach e Atleta di test prima di ampliare il pilota.

## Rollback

Sostituisci `src/App.vue`, `src/components/LionIcon.vue` e `tests/r22b-chat-contract.test.mjs` con le copie di backup; rimuovi il nuovo `src/features/navigation/sectionSwipe.ts` e il test `tests/r22b4-section-swipe.test.mjs`. Poi riesegui TypeScript e build; se avevi pubblicato, riesegui WebDocs e pubblica la versione ripristinata. Il backend rimane intatto.

## Verifiche eseguite durante la preparazione

- Vue/TypeScript (`vue-tsc --noEmit`): **OK**.
- Test mirati R22A, R22B, R22B.2, R22B.3, R22B.4: **29/29 OK** usando Node 22 con type stripping.
- Build Vite nell'ambiente Linux di preparazione: **non eseguibile**, perché le dipendenze nello ZIP includono Rollup per Windows e non il modulo nativo Rollup per Linux; da verificare sul tuo PC Windows, senza attribuire questo errore al codice della patch.
- Test manuali sul dispositivo: **ancora da eseguire**.

**Nessun deploy Firebase, nessuna modifica ai dati reali e nessuna pubblicazione sono stati eseguiti durante la creazione dello ZIP.**
