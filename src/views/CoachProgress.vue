<script setup lang="ts">
import {uiText} from '../features/i18n/interfaceLanguage'
import {RouterLink} from 'vue-router'
import LionIcon from '../components/LionIcon.vue'
</script>
<template>
 <section class="lf-coming-progress">
  <span class="lf-coming-eyebrow">{{uiText("LION FIT · AREA COACH")}}</span>
  <div class="lf-coming-symbol"><LionIcon name="progress" :size="43"/></div>
  <h1>{{uiText("Progressi")}}</h1>
  <h2>{{uiText("Presto in arrivo")}}</h2>
  <p>{{uiText("Una nuova sezione per seguire gli allenamenti e i risultati reali degli Atleti della palestra.")}}</p>
  <RouterLink to="/coach/atleti" class="secondary">{{uiText("← Torna alla gestione atleti")}}</RouterLink>
 </section>
</template>
<style scoped>
.lf-coming-progress{min-height:clamp(280px,64vh,570px);border:1px solid var(--border);background:radial-gradient(circle at 50% 25%,rgba(10,173,95,.14),transparent 47%),var(--card);border-radius:18px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:13px;text-align:center;padding:27px}
.lf-coming-eyebrow{font-size:10px;letter-spacing:.16em;color:var(--mint);font-weight:900}
.lf-coming-symbol{border:1px solid var(--mint);background:var(--green-bg);color:var(--mint);width:94px;height:94px;display:grid;place-items:center;border-radius:24px;animation:lf-progress-arrive .5s ease-out both}
h1{font-size:28px;margin:0}h2{font-size:18px;color:var(--mint);margin:0}p{font-size:12px;color:var(--muted);line-height:1.6;max-width:450px;margin:0 0 8px}
@keyframes lf-progress-arrive{from{opacity:0;transform:translateY(9px) scale(.96)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){.lf-coming-symbol{animation:none}}
</style>