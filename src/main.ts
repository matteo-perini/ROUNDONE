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
createApp(App).use(createPinia()).use(router).mount('#app')
installRoundOneMotion(router)

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
