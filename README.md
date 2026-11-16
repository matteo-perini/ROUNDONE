# LionFit — progetto Modern
Aggiornamento documentazione: 16 novembre 2026 — Deep Clean 2.0.

## Stato del sorgente
- Base analizzata: PATCH 28 R1 / archivio alleggerito del 16 novembre 2026.
- App Vue 3 / TypeScript / Vite / Pinia; Firebase e Capacitor.
- Android: applicationId `com.roundone.app`, versionCode 23, versionName 0.31.4 nella copia analizzata.
- Questi sono valori del sorgente, non una verifica dell'APK pubblicato.
- Deep Clean 1.0/2.0 non modificano l'applicazione, Firebase o il numero di versione Android.

## Cartella originale e patch
Conservare la cartella di lavoro originale e il repository Git. Prima di applicare
una patch, fare una copia di sicurezza dei file interessati. Estrarre le patch
nella cartella contenente `package.json`, senza creare una cartella annidata.
Non usare gli ZIP alleggeriti come sostituto del progetto originale.
Non cancellare `.git`, configurazioni locali, chiavi di firma o `docs`.

## Struttura
- `src/`: sorgenti frontend (Vue, TypeScript, CSS).
- `public/`: risorse web, catalogo esercizi, PWA, pagine legacy e legali.
- `dist/`: build Vite rigenerabile, esclusa da Git.
- `docs/`: build destinata a GitHub Pages; non cancellarla dal progetto originale.
- `android/`: progetto nativo Capacitor; preservare i sorgenti.
- `*-backend/`, `billing-sandbox/`, `functions-lionfit-support/`: moduli backend.
  Conservare ciascun manifest npm, lockfile e configurazione Firebase.
- `security/`: Rules, bozze e riferimenti storici; non pubblicarle indiscriminatamente.
- `tests/`, `test-*-emulator/`: suite di regressione e test delle Rules.
- `scripts/`: strumenti di verifica, build e pubblicazione.

## Controlli locali
Dalla cartella principale, con Node/npm compatibili con le dipendenze installate:
```cmd
npm.cmd ci
npm.cmd run typecheck
npm.cmd run release:finalcheck
npm.cmd run release:audit
```
`npm ci` serve principalmente se le dipendenze mancano o vanno ricreate
(modifica node_modules); non occorre reinstallarle per ogni patch.
`release:finalcheck` e `release:audit` sono controlli statici locali, non un
collaudo completo. `release:compat` verifica staticamente l'attuale roster per palestra,
la sessione e i gate LIVE; non sostituisce le prove delle Rules in Emulator.

## Deep Clean 2.0 — pulizia reversibile
Dalla radice: `node scripts/deep-clean-2.mjs` mostra un'anteprima.
Con `node scripts/deep-clean-2.mjs --apply` si spostano esclusivamente i file
nell'elenco verificato in un backup esterno, nella cartella superiore.
Conservare il backup. Non vengono toccati .git, .env, docs, web, node_modules,
Android, backend, Rules o test esistenti. Dopo il trasferimento eseguire
`npm run typecheck`, `npm run release:compat` e `npm run release:finalcheck`.
Se occorre ripristinare, copiare il contenuto della sottocartella `files`
del backup nella radice, controllando prima eventuali file gia presenti.

## Pubblicazione web
Lo script Windows `LIONFIT_PREPARA_WEB_E_DOCS.cmd` richiama
`PREPARA_LIONFIT_WEB.cmd`, che esegue `npm.cmd run release:build` e
`scripts/prepara-pubblicazione-docs.mjs`. Non serve eseguire un'altra build
prima dello script. Utilizzare la configurazione LIVE locale approvata.
Verificare l'output e poi eseguire commit e push manualmente in GitHub Desktop
solo se si desidera pubblicare. GitHub Pages usa il ramo main e la cartella docs,
con il dominio configurato, URL legacy, manifest, CNAME e fallback SPA preservati.
Non eseguire deploy delle Rules insieme a una patch grafica.

## Android
La sincronizzazione LIVE si esegue con `npm.cmd run release:android:sync`,
che include la build controllata e `cap sync android`. Per collaudi STAGING
esiste il comando distinto `npm.cmd run android:sync:staging`: non distribuire
questo APK agli utenti reali.
Aprire Android Studio con `npm.cmd run android:open`.
Prima di distribuire un APK verificare il versionCode dell'ultima versione
effettivamente pubblicata, incrementarlo quando necessario, verificare lo stesso
applicationId e la stessa firma dell'APK precedente e testare un aggiornamento
senza disinstallare l'app. Non rigenerare o sostituire la chiave originale.
La chiave di firma resta privata e conservata separatamente.
La release Android è distinta dalla pubblicazione web.

## Firebase e sicurezza
Le configurazioni locali `.env.production.local`, `.env.staging.local` e
gli eventuali file `.env.*` dei backend restano sul PC e non negli ZIP condivisi.
Non copiare credenziali o chiavi private nei repository pubblici.
Preservare i gate LIVE/scrittura, backup e controlli di isolamento delle palestre.
Le diverse codebase Functions sono intenzionalmente separate; non accorparle
senza audit e collaudo della procedura di deploy.
I candidati Rules non rappresentano necessariamente le Rules attualmente
pubblicate: confrontare, testare con Emulator e ottenere approvazione prima
di qualsiasi modifica in produzione.

## ZIP per analisi
Escludere node_modules a ogni livello, `.git`, dist/docs generati,
android/app/build, android/app/src/main/assets/public (rigenerato da Capacitor),
cache, log e file privati. Mantenere sorgenti, lockfile, risorse pubbliche,
script e test. La copia alleggerita non è un backup completo.
