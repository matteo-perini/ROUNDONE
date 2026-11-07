# LionFit V1 Modern — consolidamento STEP 3T.4 (7 novembre 2026)

**Sorgenti completi, puliti, preparati per il rilascio. NON è un APK né una build LIVE già attivata.**
Questa copia deriva da `LionFit-V1-Modern(7).zip` e include le modifiche fino alla STEP 3T.3.

## IMPORTANTE — Estrarre nella cartella NUOVA, vuota
1. Conserva intatta la vecchia cartella per rollback e come deposito dei file `.env.*`.
2. Estrai lo ZIP in **una nuova cartella vuota**. Non sovrascrivere la vecchia: estrarre non cancella `node_modules` o file obsoleti preesistenti.
3. Copia dalla vecchia cartella **soltanto sul tuo PC**, nella nuova: `.env.production.local` e `.env.staging.local`. NON includerli nei prossimi ZIP o in GitHub.
4. Apri il terminale nella cartella contenente `package.json`, quindi:

```cmd
npm.cmd ci
npm.cmd run typecheck
npm.cmd run release:finalcheck
npm.cmd run release:audit
npm.cmd run release:review
```

`release:review` riconosce la configurazione LIVE ma **deve riportare LIVE e scritture BLOCCATE** prima del passaggio coordinato a PROD.

## Cosa è stato escluso
- `node_modules/`: dipendenze da rigenerare con `npm ci`.
- `dist/`: build precedente (potenzialmente STAGING), da NON pubblicare.
- `.env.production.local`, `.env.staging.local`: valori locali, non da distribuire.
- vecchi `LEGGIMI-STEP...`, `RISULTATO...`, `TEST_STEP...`: test/report temporanei già superati.
- bozze delle pagine legali non collegate all'app (le pagine pubbliche finali restano).

**Non sono stati eliminati** catalogo di esercizi/SVG, componenti necessari alle schermate LIVE, file Android/Capacitor, PWA, vecchi URL per iPhone/GitHub Pages, security Rules di riferimento. I sorgenti `Dev*` ancora utilizzati da STAGING e LIVE restano nel progetto: in produzione i percorsi `dev/` sono disabilitati.

## Correzioni di protezione incluse
- Una build PROD senza ACK LIVE non può più mostrare menu Coach/Atleta basati sul ruolo demo locale.
- La dashboard Coach non mostra il fallback demo in produzione quando la configurazione LIVE è incompleta.
- `npm run android:sync` ora passa sempre da `release:build`, che richiede ACK LIVE e scritture confermate, prima di copiare la build su Android.
- Per un APK di collaudo STAGING, comando esplicito `npm run android:sync:staging` (NON DISTRIBUIRE agli utenti reali).
- Esegui `npm run release:finalcheck` per i controlli statici aggiuntivi, senza contattare Firebase.

## Prossimi gate da chiudere prima della pubblicazione
1. Esportazione Firestore aggiornata al giorno del rilascio (quella del 6/11 è storica); backup Auth già esportato separatamente; controllare bucket Storage utilizzati.
2. Comparazione finale delle Rules Firestore/Storage **attualmente PROD** con le proposte `security/step3s2-prod-proposed-*-NON-PUBBLICARE.rules`. Le Rules emulator-testate non sono state pubblicate automaticamente.
3. Autorizzazione esplicita dei gate `.env.production.local` soltanto quando Rules e backup sono validati. Non pubblicare prima.
4. Eseguire `npm.cmd run release:build` (non semplice `npm run build`) e verificare la cartella `dist` su PC Windows. Questa build conterrà la configurazione Firebase Web PROD, leggibile dal client per natura.
5. Per Android, dopo la build LIVE: `npx.cmd cap sync android`, `npx.cmd cap open android`; in Android Studio incrementare `android/app/build.gradle` `versionCode` da 8 a **9** e `versionName` da `0.29.7` a `0.29.8`, fare Gradle Sync e build APK.
6. Firmare con la **stessa chiave originale** (`%USERPROFILE%\.android\debug.keystore`, certificato SHA-256 `52f1236bf25d2f5329062ed73d9659475acc2e09c8461e49e650c08b3b5da8fb`). È una chiave debug già distribuita: conserva una copia privata, non caricarla. Confronta i due APK con `VERIFICA_FIRMA_APK_STEP3T3.cmd` prima di pubblicare.
7. Caricare sul repository GitHub Pages **solo il contenuto compilato di `dist/`**, preservando URL `/www/*`, `404.html`, manifest, icone, `CNAME` e aggiornamento PWA. NON caricare tutto il sorgente né i file `.env.*`.
8. Pubblicare nuovo APK su GitHub Releases con l'asset atteso `LionFit.apk`, dopo verifica package, versione e firma. Verificare aggiornamento sul dispositivo senza disinstallazione e login/dati storici.

**Nessun deploy e nessuna scrittura su Firebase PROD sono stati eseguiti preparando questo pacchetto.**
