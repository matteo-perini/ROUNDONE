<script setup lang="ts">
import {uiText} from '../features/i18n/interfaceLanguage'
/** PATCH 5: sola presentazione, nessuna lettura/scrittura dei dati Progressi. */
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import LionIcon from '../components/LionIcon.vue'
const route=useRoute()
const back=computed(()=>route.query.source==='emulator'?'/home?source=emulator':'/home')
</script>
<template>
 <section class="lf-athlete-coming" aria-labelledby="lf-athlete-coming-title">
  <span class="lf-athlete-coming-eyebrow">{{uiText("LION FIT · AREA ATLETA")}}</span>
  <span class="lf-athlete-coming-symbol"><LionIcon name="progress" :size="43"/></span>
  <h1 id="lf-athlete-coming-title">{{uiText("Progressi")}}</h1>
  <h2>{{uiText("Presto in arrivo")}}</h2>
  <p>{{uiText("Una nuova sezione per seguire i risultati reali dei tuoi allenamenti, lo storico e i miglioramenti nel tempo.")}}</p>
  <RouterLink class="lf-athlete-coming-back" :to="back">{{uiText("← Torna alla Home")}}</RouterLink>
 </section>
</template>
