import { createApp } from 'vue'
import { watch } from 'vue'
import {interfaceLanguage} from './features/i18n/interfaceLanguage'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles.css'
import './styles-patch6.css' // Rifinitura grafica isolata: RoundOne / Modern PATCH-6
import './styles-patch72-extra.css' // Patch integrativa 7.2: solo rifiniture, non modifica shell o Firebase
import './styles-profile-7_3.css' // Nuovo profilo condiviso Atleta/Admin/Collaboratore
import './styles-patch73-nav.css' // Nav Atleta esclusiva desktop/mobile e puntini calendario
import './styles-refinements-7_3.css' // Ripristino rapido, booking, SVG e responsive 7.3
import './styles-patch75.css' // Base integrativa 7.5
import './styles-patch76.css' // Override 7.6: navbar desktop fixed, SVG, card verticali
import './styles-lionfit-redesign.css' // Tema globale e dashboard/Home V1, ultimo override grafico
import './styles-restyling-finale.css' // 06Nov2026: palette globale, sfondi ripuliti, SVG con fondo scuro
import './styles-patch5-athlete.css' // PATCH 5: V3 Atleta, sidebar desktop, navbar a tutta larghezza
import './styles-patch7-final.css' // PATCH 7: safe-area, temi e testi IT/EN responsive
import { installRoundOneMotion } from './features/motion/roundOneMotion'
// Rispetta lingua memorizzata: accessibilita' e formati anche dopo il riavvio dell'APK.
watch(interfaceLanguage,lang=>{document.documentElement.lang=lang},{immediate:true})
import {installNavigationRecovery,navigationFailure} from './features/auth/navigationRecovery'
import {finishProfileSwitchAtBoot,startLinkedProfileObserver} from './integrations/firebase/linkedProfiles'
async function bootstrap(){
 // Do not render a half-initialized shell or the preceding user's interface.
 const root=document.getElementById('app')
 if(root){const status=document.createElement('div');status.setAttribute('role','status');status.textContent='Caricamento LionFit…';status.style.cssText='min-height:100dvh;display:grid;place-items:center;background:#0c1118;color:#eaf4f0;font:600 16px system-ui';root.replaceChildren(status)}
 await finishProfileSwitchAtBoot()
 startLinkedProfileObserver()
 installNavigationRecovery(router)
 const app=createApp(App).use(createPinia()).use(router)
 try{await router.isReady()}catch{if(!navigationFailure.value)navigationFailure.value={kind:'navigation',path:router.currentRoute.value.fullPath}}
 app.mount('#app')
 installRoundOneMotion(router)
}
void bootstrap().catch(()=>{
 const root=document.getElementById('app');if(!root)return
 const panel=document.createElement('div');panel.style.cssText='min-height:100dvh;background:#0c1118;color:#eaf4f0;padding:32px;font:600 16px system-ui';panel.setAttribute('role','alert');panel.textContent='Impossibile inizializzare LionFit. Controlla la connessione e ricarica la pagina.'
 const retry=document.createElement('button');retry.textContent='Ricarica';retry.style.cssText='display:block;margin-top:16px;padding:12px 18px';retry.onclick=()=>window.location.reload();panel.append(retry);root.replaceChildren(panel)
})

// PATCH-7: updater opt-in soltanto per APK Android firmato e validato.
if (import.meta.env.PROD && import.meta.env.VITE_LIONFIT_UPDATE_CHECK === 'ENABLED_AFTER_APK_SIGNING') {
  void import('./features/release/nativeUpdates').then(({installNativeUpdateChecker}) => installNativeUpdateChecker())
}
// Correzione Home approvata: importata per ultima, sopra gli override delle PATCH 5–7.
import './styles-home-approved-correction.css'
// Correzione layout avatar e tasto Indietro: ultima regola, senza alterare il tema.
import './styles-profile-back-fix.css'

// Correttiva download Android esterno e pannello aggiornamenti Info app.
import './styles-update-download-fix.css'

// PATCH 1: correzioni di feedback prenotazioni e validazione programma.
import './styles-patch1-corrections.css'

// PATCH 05: UI Atleta V4 isolata, ultimo override senza cambiare dati o navbar.
import './styles-patch05-ux.css'

// PATCH 05 correttiva: una sola navigazione Atleta per viewport.
import './styles-patch05-fix-nav.css'

// Progressi 360 + due correzioni grafiche Prenotazioni.
import './styles-progress360.css'

// PATCH 14: identity, search and platform settings.
import './styles-patch14.css'

import "./styles-patch20b2-mobile.css"
