<script setup lang="ts">
withDefaults(defineProps<{kind:'fighter'|'pesi'}>(),{kind:'fighter'})
</script>
<template>
 <span class="lf-booking-mark" :class="'lf-booking-mark-'+kind" aria-hidden="true">
  <!-- Vettori originali indipendenti dal tema; nessuna immagine raster o tasto incorporato. -->
  <!-- Primo disegno approvato: boxer in guardia (asset visivo senza testo/avatar/tasti). -->
  <img v-if="kind==='fighter'" class="lf-fighter-illustration" src="/lionfit-redesign/fighter-boxer-original.png" alt="" width="307" height="288" decoding="async" />
  <svg v-else viewBox="0 0 112 112" fill="none" xmlns="http://www.w3.org/2000/svg">
   <circle cx="56" cy="56" r="46" stroke="#24d86c" stroke-opacity=".30" stroke-width="1.6" stroke-dasharray="13 7 3 8"/>
   <path d="M17 77A44 44 0 0 1 20 31M91 31a44 44 0 0 1 3 48" stroke="#2fee80" stroke-width="3.8" stroke-linecap="round"/>
   <path d="M12 56h88" stroke="currentColor" stroke-width="5.5" stroke-linecap="round"/>
   <rect x="16" y="43" width="8" height="26" rx="2.5" fill="currentColor" fill-opacity=".24" stroke="currentColor" stroke-width="2.4"/>
   <rect x="25" y="33" width="8" height="46" rx="3" fill="currentColor" fill-opacity=".17" stroke="currentColor" stroke-width="2.5"/>
   <rect x="34" y="27" width="10" height="58" rx="3.4" fill="currentColor" fill-opacity=".28" stroke="currentColor" stroke-width="3"/>
   <rect x="68" y="27" width="10" height="58" rx="3.4" fill="currentColor" fill-opacity=".28" stroke="currentColor" stroke-width="3"/>
   <rect x="79" y="33" width="8" height="46" rx="3" fill="currentColor" fill-opacity=".17" stroke="currentColor" stroke-width="2.5"/>
   <rect x="88" y="43" width="8" height="26" rx="2.5" fill="currentColor" fill-opacity=".24" stroke="currentColor" stroke-width="2.4"/>
   <path d="M49 56h14M38 31v50M74 31v50" stroke="currentColor" stroke-width="2" stroke-opacity=".5"/>
  </svg>
 </span>
</template>
