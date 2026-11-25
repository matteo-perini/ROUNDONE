<script setup lang="ts">
withDefaults(defineProps<{label:string;variant?:'list'|'cards'|'profile'}>(),{variant:'list'})
</script>
<template>
 <div class="lf-local-skeleton" :class="'lf-local-skeleton-'+variant" role="status" :aria-label="label">
  <div class="lf-local-skeleton-shapes" aria-hidden="true">
   <div v-for="n in (variant==='profile'?2:3)" :key="n" class="lf-local-skeleton-item"><i/><span><b/><b/></span></div>
  </div>
 </div>
</template>
