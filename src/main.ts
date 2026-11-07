import { createApp } from 'vue'
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
import { installRoundOneMotion } from './features/motion/roundOneMotion'
createApp(App).use(createPinia()).use(router).mount('#app')
installRoundOneMotion(router)

// PATCH-7: updater opt-in soltanto per APK Android firmato e validato.
if (import.meta.env.PROD && import.meta.env.VITE_LIONFIT_UPDATE_CHECK === 'ENABLED_AFTER_APK_SIGNING') {
  void import('./features/release/nativeUpdates').then(({installNativeUpdateChecker}) => installNativeUpdateChecker())
}
