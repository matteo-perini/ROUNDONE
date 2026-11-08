/** PATCH integrativa: installazione separata per preservare la navbar dell'utente. */
import { Capacitor } from '@capacitor/core'
import type { Router } from 'vue-router'
import router from '../../router'
import { homeForRoute, internalBackPath, shouldCloseOnSecondBack, EXIT_DOUBLE_BACK_MS } from './nativeBackPolicy'
import './polish.css'

// Il browser mantiene la propria history, il gestore hardware riguarda SOLO l'APK Android.
if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
  void router.isReady().then(() => installAndroidBack(router)).catch(error => console.warn('Back Android non installato:', error))
}

async function installAndroidBack(nav: Router) {
  const { App: NativeApp } = await import('@capacitor/app')
  let lastPress = 0
  let closing = false
  let dialog: HTMLElement | null = null

  function dismissExit() { dialog?.remove(); dialog = null; lastPress = 0 }
  nav.afterEach(() => dismissExit())

  function showExitPrompt() {
    if (dialog) return
    const backdrop = document.createElement('div')
    backdrop.className = 'lf-native-exit-shade'
    backdrop.setAttribute('role', 'presentation')
    backdrop.innerHTML = `
      <section class="lf-native-exit-dialog" role="alertdialog" aria-modal="true" aria-labelledby="lf-exit-title" aria-describedby="lf-exit-description">
        <div class="lf-exit-badge" aria-hidden="true">🦁</div>
        <h2 id="lf-exit-title">Vuoi chiudere Lion Fit?</h2>
        <p id="lf-exit-description">Premi di nuovo <strong>Indietro</strong> entro pochi secondi per uscire, oppure scegli qui sotto.</p>
        <div class="lf-exit-actions"><button type="button" data-lf-exit="cancel">Resta nell’app</button><button type="button" data-lf-exit="confirm">Chiudi app</button></div>
      </section>`
    backdrop.querySelector<HTMLButtonElement>('[data-lf-exit="cancel"]')?.addEventListener('click', dismissExit)
    backdrop.querySelector<HTMLButtonElement>('[data-lf-exit="confirm"]')?.addEventListener('click', () => { void exitNative() })
    backdrop.addEventListener('click', event => { if (event.target === backdrop) dismissExit() })
    document.body.append(backdrop)
    dialog = backdrop
    backdrop.querySelector<HTMLButtonElement>('[data-lf-exit="cancel"]')?.focus()
  }
  async function exitNative() {
    if (closing) return
    closing = true
    dismissExit()
    try { await NativeApp.exitApp() } catch (error) { console.warn('Uscita non riuscita:', error); closing = false }
  }
  function closeTopDialog(): boolean {
    // Prima chiudi il menu Coach senza uscire né cambiare pagina.
    const shade = document.querySelector<HTMLElement>('.coach-mobile-shade')
    if (shade) { shade.click(); return true }
    const overlays = [...document.querySelectorAll<HTMLElement>('.modal-overlay, .sheet-modal-bg, .athlete-day-overlay')]
      .filter(node => node.getClientRects().length > 0)
    if (!overlays.length) return false
    const overlay = overlays.at(-1)!
    // I componenti esistenti hanno già una chiusura non distruttiva.
    const close = [...overlay.querySelectorAll<HTMLButtonElement>('button')].find(button =>
      !button.disabled && (/^(chiudi|annulla|indietro)/i.test(button.textContent?.trim() || '') || /chiudi|annulla/i.test(button.getAttribute('aria-label') || '')))
    if (close) close.click()
    else window.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true }))
    return true
  }
  await NativeApp.addListener('backButton', async () => {
    if (closing) return
    if (dialog) {
      if (shouldCloseOnSecondBack(lastPress, Date.now())) { await exitNative(); return }
      lastPress = Date.now() // Ricomincia la finestra di conferma; mai uscita inattesa.
      return
    }
    if (closeTopDialog()) return
    const current = nav.currentRoute.value
    const previous = internalBackPath(window.history.state?.back, current.path)
    if (previous) { nav.back(); return }
    const role = current.path.startsWith('/coach') ? 'coach'
      : current.path === '/accesso' || current.path.startsWith('/dev/') ? 'none'
      : 'athlete'
    const root = homeForRoute(current.path, current.query, role)
    if (current.fullPath !== root && current.path !== root) {
      await nav.push(root)
      return
    }
    lastPress = Date.now()
    showExitPrompt()
  })
  // L'overlay di uscita non deve restare sopra la navbar dopo il ritorno
  // dall'elenco delle app recenti, uno sblocco schermo o una pausa Android.
  await NativeApp.addListener('appStateChange', ({isActive}) => {
    if (!isActive || dialog) dismissExit()
    if (isActive) lastPress = 0
  })
  // Non lasciare un livello trasparente sopra i touch quando WebView va in background.
  document.addEventListener('visibilitychange', () => { if (document.hidden) dismissExit() })
  console.info('Lion Fit: Indietro Android attivo (un passaggio per volta, uscita confermata).', EXIT_DOUBLE_BACK_MS)
}
