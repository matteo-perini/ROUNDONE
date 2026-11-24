# LIONFIT — PATCH R22A · CHAT A SINISTRA (ANTEPRIMA UX)
23 novembre 2026

IMPORTANTE: questa patch è la PRIMA FASE (R22A) della nuova Chat Coach–Atleta.
Realizza navigazione, accessi, gesti e animazione, ma NON spedisce né salva messaggi:
non contiene ancora un backend chat, Firestore Rules per chat, notifiche push o contatori reali.
NON pubblicare come chat funzionante agli atleti reali.

## COSA CAMBIA
- Nuova schermata /messaggi per Atleta e /coach/messaggi per Coach (anteprima).
- In Dashboard Atleta, swipe VERSO DESTRA -> la Chat entra da sinistra.
- In Chat Atleta, swipe VERSO SINISTRA -> la Dashboard torna da destra.
- Tocco sull'icona Messaggi -> stessa navigazione, senza swipe obbligatorio.
- Breve suggerimento iniziale, chiudibile e mostrato una volta per browser.
- Durata transizione 340 ms, supporto prefers-reduced-motion.
- I gesti verticali, i tap sui controlli, gli scroller orizzontali e i bordi del sistema
  non attivano la navigazione per errore.
- Icona nell'intestazione mobile; scorciatoie discrete su desktop senza settimo bottone dock.
- Posizione per il contatore non letti predisposta, ma contatore disattivo finché R22B
  non avrà dati REALI. Nessun badge inventato.

## SICUREZZA PREVIEW (IMPORTANTE)
- DEV locale: anteprima visibile quando avvii l'app con npm run dev:lab.
- STAGING: puoi abilitarla esplicitamente nell'ambiente staging con
  VITE_LIONFIT_CHAT_PREVIEW=ON, dopo aver verificato il tuo staging esistente.
- LIVE: disattivata intenzionalmente anche se la variabile è impostata.
- Nessuna nuova Cloud Function e nessuna modifica a Firestore/Storage Rules.
- Nessun accesso ai dati privati o scrittura dei messaggi.

## FILE DELLA PATCH
  src/App.vue
  src/router/index.ts
  src/components/LionIcon.vue
  src/features/integrative/nativeBackPolicy.ts
  src/features/chat/chatPreview.ts
  src/features/chat/chatNavigation.ts
  src/views/AthleteChatPreview.vue
  tests/r22a-chat-navigation.test.mjs

## INSTALLAZIONE WINDOWS — COPIA MANUALE
1. CHIUDI la build/dev server e GitHub Desktop se sta aggiornando file.
2. Nella cartella principale del tuo progetto fai un backup di:
   src/App.vue
   src/router/index.ts
   src/components/LionIcon.vue
   src/features/integrative/nativeBackPolicy.ts
   Mantieni il backup FUORI dalla cartella che poi committi in Git.
3. Estrai questo ZIP nella radice di LionFit-Modern-Git.
   Mantieni la struttura delle cartelle e consenti di sovrascrivere SOLTANTO
   i quattro file esistenti sopra elencati. Gli altri sono nuovi.
4. Apri il terminale nella radice e lancia:
   npm run typecheck
5. Prova in ambiente DEV locale:
   npm run dev:lab
   Accedi con il profilo di laboratorio e apri /home.
6. Prova il pulsante Messaggi nell'intestazione e gli swipe in entrambe
   le direzioni. Prova anche la Dashboard in verticale e sui pulsanti.
7. Verifica su smartphone reale prima di abilitare la funzione pubblica.

## WEB-DOCS E PUBBLICAZIONE
Il tuo doppio clic LIONFIT_PREPARA_WEB_E_DOCS.cmd rimane invariato.
La build LIVE normale non espone la chat di questa patch per sicurezza.
NON usare questa patch come segnale che la chat reale è pronta o che le
nuove Firestore Rules siano già collaudate. Git commit/push rimangono manuali.

## TEST ESEGUITI QUI
- vue-tsc --noEmit: OK.
- 5 test nuovi su swipe e regressioni gesture: 5/5 superati.
- Test mirati su Home, Google Login, chat assistenza e agenda: 39/39 superati.
- Suite estesa: 578/595 superati, 17 falliti.
  Verificata anche la BASE ORIGINALE degli ZIP: 578/595 con gli stessi 17
  fallimenti. Non sono nuovi errori introdotti dalla R22A.
- Build Vite completa non eseguibile in questo container Linux: il node_modules
  originale estratto dagli ZIP non contiene il modulo native Linux Rollup
  @rollup/rollup-linux-x64-gnu. NON dichiarata una build riuscita.
  Da completare sul PC Windows con la tua build WebDocs.
- Nessun backend distribuito, nessun database modificato.

## ROLLBACK
1. Se una schermata ha problemi, ripristina dal tuo backup i quattro file esistenti.
2. Elimina i 4 file nuovi (chatPreview.ts, chatNavigation.ts, AthleteChatPreview.vue,
   r22a-chat-navigation.test.mjs) se vuoi ripristinare completamente lo stato precedente.
3. Esegui nuovamente npm run typecheck; non è necessario alcun rollback Firebase.

## PROSSIMA PATCH R22B
Messaggistica reale con schema dati, partecipanti verificati (Coach-Atleta),
isolamento per palestra, Rules in Emulator, invio/ricezione, stato lettura,
contatori REALI, pulizia listener e gestione errori.
La R22C completerà notifiche push e rifiniture prima di attivare la chat in LIVE.

Nota: le sigle R22A/B/C rappresentano la sequenza incrementale nuova;
non implicano modifica delle patch storiche già installate.
