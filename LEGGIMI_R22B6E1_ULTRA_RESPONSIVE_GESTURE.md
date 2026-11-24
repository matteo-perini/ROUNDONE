# LIONFIT — R22B.6E.1 Ultra Responsive Gesture

Base richiesta: R22B.6D (Premium Motion Final Polish) installata. Patch incrementale, nessun deploy Firebase. Non sostituisce l’intero progetto.

## Modifiche
- Una sola decisione di rilascio per tutte le pagine principali, Chat inclusa se autorizzata. Eliminati i fallback concorrenti solo dal gestore attivo; le funzioni storiche rimangono invariate.
- Aggancio da 7 px invece di 10; tolleranza orizzontale 1,25:1 invece di 1,45:1. L'intenzione verticale rimane bloccata e gli spostamenti ambigui favoriscono lo scroll verticale.
- Anteprima dal movimento di 7 px, prima 12; al passaggio per lo zero non parte un'animazione di ritorno mentre il dito è ancora appoggiato.
- Soglia di completamento 18% della larghezza (56–100 px); flick da 32 px se velocità media >= 0,48 px/ms. I trascinamenti deliberati non sono più rifiutati solo perché durano oltre 1,1 s. La componente verticale dominante resta esclusa.
- `touch-action: pan-y pinch-zoom` circoscritto alle pagine principali mobile e alle aree verticali della Chat; preservati i controlli nativi e l'esclusione dei veri scroller orizzontali. Nessuna modifica a rotte, ruoli, autorizzazioni, database, backend, Rules, navbar o durata del tap.
- Non realizza ancora l'anteprima della seconda schermata (E.2), né la cache di sessione (E.3).

## Backup e installazione
Prima di estrarre, copia in una cartella fuori dal progetto questi file (se esistono):
- `src/App.vue`
- `src/features/navigation/fluidSwipe.ts`
- `src/features/navigation/swipeIntent.ts`
- `src/views/AthleteChatPreview.vue`
- `tests/r22b-chat-contract.test.mjs`
- `tests/r22b6b-ultra-swipe.test.mjs`

Estrai lo ZIP nella cartella principale LionFit-Modern-Git, mantenendo le sottocartelle. In PowerShell, dalla cartella principale:

```powershell
node --experimental-strip-types --test tests/r22b6e1-responsive-gesture.test.mjs
npm.cmd run typecheck
npm.cmd run build
npm.cmd run dev -- --host 0.0.0.0
```

Sul telefono, stessa rete Wi-Fi, aprire l'URL Network mostrato da Vite. Usare gli account di test: dev normale usa Firebase LIVE. Verificare tap su card e link, swipe diagonali/rapidi/lenti in entrambi i sensi, swipe brevi annullati, scroll verticale, caroselli orizzontali, input, grafici, riordino e allenamenti. Controllare Home→Chat→Home anche partendo dalle conversazioni e verificare che la Chat continui a rispettare le autorizzazioni. Solo dopo prova mobile soddisfacente usare WebDocs e GitHub Desktop. Nessun nuovo deploy backend, nessuna modifica .env.

## Controlli effettivamente eseguiti
- Vue TypeScript: exit 0.
- Node 22 con --experimental-strip-types: 69/69 test della serie r22*.test.mjs superati, inclusi 7 nuovi test. Due test contrattuali precedenti aggiornati per verificare la nuova policy unica; funzioni storiche ancora testate.
- Chromium mobile headless: 7/7 prove su fixture isolata con gli effettivi gestori touch e CSS estratti dal codice, router simulato (non app completa né Firebase): tap card; swipe diagonale card→Chat; swipe Chat scrollport→Home; swipe card verso Piano; carosello nativo orizzontale; scroll verticale; gesto breve annullato senza click.
- Build Vite tentata, bloccata da @rollup/rollup-linux-x64-gnu assente nelle dipendenze Windows. Da verificare su Windows. Nessuna misura FPS o latenza su dispositivo reale.

## Rollback
Ripristinare tutti i file esistenti elencati nel backup; rimuovere il nuovo test `tests/r22b6e1-responsive-gesture.test.mjs`. Ricompilare e, se già pubblicato, ripubblicare WebDocs. Nessun rollback Firebase necessario.
