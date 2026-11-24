# LIONFIT — PATCH R22B.5 | Transizioni Home, Piano e Archivio Atleta

Patch **incrementale**, successiva a **R22B.4**. Corregge la differenza osservata su telefono: passando da **Home → Piano** e **Piano → Archivio**, appariva ancora la vecchia transizione invece dello scorrimento orizzontale Premium Motion.

## Perché succedeva

In modalità operativa, le tre rotte `/home`, `/piano`, `/archivio` utilizzano tutte `AthleteLiveWorkspace.vue`, differenziato dalla prop `screen`. Vue Router conserva la stessa istanza quando cambia la prop; di conseguenza la transizione esterna di `App.vue` non scatta come sulle altre rotte, che usano componenti diversi.

## Modifica

- Transizione **interna** tra le tre viste, con contenuto identificato da `:key="props.screen"` e direzione coerente con la navbar.
- Verso sinistra per passare da Home a Piano e da Piano ad Archivio; inverso per tornare.
- Durata **340 ms**; stessa curva Premium Motion delle altre sezioni.
- Su desktop, non vengono introdotte nuove animazioni orizzontali.
- Rispettata la preferenza di sistema per il movimento ridotto.
- L'istanza esterna `AthleteLiveWorkspace` **non viene rimontata** tra queste tre sezioni: non si riavviano per questo motivo gli ascoltatori Firebase.
- Nessuna modifica a chat, backend, Cloud Functions, Rules, navigazione Coach o abbonamenti.

## File da copiare

```text
src/App.vue                                   (sostituisci)
src/views/AthleteLiveWorkspace.vue            (sostituisci)
tests/r22b5-athlete-shared-screen-motion.test.mjs  (nuovo)
```

## Installazione

1. **R22B.4 deve essere già installata.** Chiudi la sessione `npm run dev` con `Ctrl+C`.
2. Fai un backup **fuori dal repository** di `src/App.vue` e `src/views/AthleteLiveWorkspace.vue`.
3. Estrai lo ZIP nella cartella **principale** `LionFit-Modern-Git` mantenendo la struttura, sovrascrivendo solo i due `.vue`.
4. In PowerShell, nella cartella principale, esegui:

```powershell
node --experimental-strip-types --test tests/r22b5-athlete-shared-screen-motion.test.mjs
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev
```

5. Sul telefono, apri il link Network restituito dal server Vite (PC e telefono nella stessa rete), oppure prova con gli strumenti di emulazione mobile del browser. Esegui il test con **LION FIT TEST**, poiché il normale dev può utilizzare Firebase LIVE.
6. Verifica i tocchi navbar e gli swipe nei due sensi per **Home ↔ Piano ↔ Archivio**. Le tre transizioni ora devono avere lo stesso effetto orizzontale degli altri passaggi. Controlla anche che le schede, le programmazioni, gli archivi, le ricerche e le modali si aprano normalmente. Prova un cambio rapido di sezione, lo scroll verticale e le altre voci della navbar.
7. Se qualcosa non funziona, **non pubblicare WebDocs** e segnala il passaggio esatto. Se funziona, puoi usare `LIONFIT_PREPARA_WEB_E_DOCS.cmd`, verificare gli esiti e pubblicare con GitHub Desktop solo dopo controllo file e esclusione degli `.env`.

## Rollback

Ripristina i backup di `src/App.vue` e `src/views/AthleteLiveWorkspace.vue` e rimuovi il test `tests/r22b5-athlete-shared-screen-motion.test.mjs`. Riesegui `typecheck` e `build`. Non è necessario alcun rollback Firebase.

## Verifiche svolte nella preparazione

- `vue-tsc --noEmit`: **OK**.
- Test mirati Chat/gesture R22A–R22B.5: **36/36 superati**.
- Test sulle schermate Home, Piano e Archivio e sulla navigazione R22B.4/R22B.5: **59/59 superati**.
- **Build Vite completa non eseguibile** qui per mancanza del modulo Rollup nativo Linux nelle dipendenze Windows presenti negli ZIP. Da verificare con `npm.cmd run build` sul PC.
- Test visivo manuale su smartphone **da eseguire**.

**Nessuna scrittura su Firebase, nessun deploy e nessun push sono stati effettuati nella preparazione.**
