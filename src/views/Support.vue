<script setup lang="ts">
import {onMounted,onUnmounted,ref} from 'vue'
import {useRouter} from 'vue-router'
import SupportTickets from '../components/SupportTickets.vue'
import {isStagingMode} from '../integrations/firebase/stagingConfig'
import {stagingSession} from '../integrations/firebase/stagingSession'
const router=useRouter()
const viewportHeight=ref<string>()
function fitViewport(){const v=window.visualViewport;viewportHeight.value=v&&v.scale===1?`${Math.floor(v.height)}px`:undefined}
onMounted(()=>{fitViewport();window.visualViewport?.addEventListener('resize',fitViewport)})
onUnmounted(()=>window.visualViewport?.removeEventListener('resize',fitViewport))
function exit(){void router.replace('/impostazioni')}
</script>
<template>
 <main class="lf-support-page" v-if="isStagingMode()&&stagingSession" :style="{maxHeight:viewportHeight}">
  <SupportTickets dedicated @exit="exit"/>
 </main>
</template>
<style scoped>
.lf-support-page{position:relative;width:100%;max-width:840px;margin:0 auto;flex:1;min-height:0;display:flex;flex-direction:column;padding:0;box-sizing:border-box}
</style>
