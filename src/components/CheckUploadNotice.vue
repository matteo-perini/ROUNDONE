<script setup lang="ts">
/** Lives in App shell, not the Check Zone view: ongoing uploads survive navigation. */
import {computed,onMounted,onUnmounted,ref,watch} from 'vue'
import type {StagingSession} from '../integrations/firebase/stagingSession'
import {getStagingClients} from '../integrations/firebase/stagingClient'
import {checkQueueActivity,checkQueueRows,discardQueuedCheck,lastCheckUploaded,retryCheckQueue,showCheckQueueFor,startCheckPhotoQueue,type CheckQueueScope} from '../features/progress/checkPhotoQueue'
const props=defineProps<{session:StagingSession}>()
const scope=computed<CheckQueueScope>(()=>({projectId:getStagingClients().db.app.options.projectId||'',gymId:props.session.gymId,uid:props.session.uid}))
const sending=computed(()=>checkQueueRows.value.filter(r=>r.state==='sending'||r.state==='queued'||r.state==='paused'))
const failures=computed(()=>checkQueueRows.value.filter(r=>r.state==='error'))
const total=computed(()=>sending.value.length+failures.value.length)
const uploaded=computed(()=>checkQueueRows.value.reduce((sum,r)=>sum+r.uploadedCount,0))
const photos=computed(()=>checkQueueRows.value.reduce((sum,r)=>sum+r.fileCount,0))
const completed=ref(false),retrying=ref(false),noticeError=ref('')
const active=computed(()=>checkQueueActivity.value?.key&&checkQueueRows.value.some(r=>r.key===checkQueueActivity.value?.key)?checkQueueActivity.value:null)
let timeout:ReturnType<typeof setTimeout>|null=null
watch(scope,next=>{completed.value=false;void showCheckQueueFor(next);startCheckPhotoQueue()},{immediate:true})
watch(lastCheckUploaded,event=>{
 if(!event||!event.key.startsWith(`${scope.value.projectId}:${scope.value.gymId}:${scope.value.uid}:`))return
 completed.value=true
 if(timeout)clearTimeout(timeout)
 timeout=setTimeout(()=>{completed.value=false;timeout=null},14000)
})
onMounted(()=>{startCheckPhotoQueue()})
onUnmounted(()=>{if(timeout)clearTimeout(timeout);void showCheckQueueFor(null)})
async function retry(){if(retrying.value)return;retrying.value=true;noticeError.value='';try{await retryCheckQueue(scope.value)}catch(e){noticeError.value=e instanceof Error?e.message:String(e)}finally{retrying.value=false}}
async function discard(){
 const failed=failures.value[0];if(!failed||retrying.value)return
 if(!window.confirm('Scartare questo Check Zone? Le foto locali verranno eliminate e NON saranno recuperabili.'))return
 retrying.value=true;noticeError.value=''
 try{await discardQueuedCheck(scope.value,failed.key)}catch(e){noticeError.value=e instanceof Error?e.message:String(e)}finally{retrying.value=false}
}
</script>
<template>
 <Teleport to="body">
 <aside v-if="total||completed" class="lf-r21e-upload-notice" :class="{'has-errors':failures.length}" aria-live="polite" aria-atomic="true">
  <template v-if="total">
   <strong>{{failures.length?'Foto in attesa di intervento':sending.some(x=>x.state==='sending')?'Check Zone: caricamento in corso':'Foto salvate sul dispositivo'}}</strong>
   <p v-if="sending.length">{{uploaded}} di {{photos}} foto inviate a Storage · {{sending.length}} check in attesa. Puoi continuare nell'app. Non cancellare i dati locali.</p>
   <p v-if="active" class="lf-r21e-progress">{{active.phase==='preparing'?'Ottimizzazione':active.phase==='uploading'?'Caricamento':'Verifica finale'}} · {{active.index}}/{{active.total}} <span v-if="active.phase==='uploading'">({{active.percent}}%)</span></p>
   <div v-if="active" class="lf-r21e-bar" role="progressbar" :aria-valuenow="active.percent" aria-valuemin="0" aria-valuemax="100" :aria-label="'Progresso invio Check Zone'"><span :style="{width:active.percent+'%'}"/></div>
   <p v-if="!sending.length&&failures.length">Le foto sono ancora su questo dispositivo e non risultano archiviate definitivamente su Firebase.</p>
   <p v-if="failures.length" class="lf-r21e-error">{{failures[0]?.error}}</p><p v-if="noticeError" class="lf-r21e-error" role="alert">{{noticeError}}</p>
   <button v-if="failures.length" class="secondary" type="button" :disabled="retrying" @click="retry">{{retrying?'Riavvio…':'Riprova invio'}}</button><button v-if="failures.length" class="secondary lf-r21e-discard" type="button" :disabled="retrying" @click="discard">Scarta check</button>
  </template>
  <div v-else class="lf-r21e-success"><strong>✓ Foto archiviate correttamente</strong><p>Il Check Zone è stato confermato su Firebase.</p></div>
 </aside>
 </Teleport>
</template>
<style scoped>
.lf-r21e-upload-notice{position:fixed;bottom:calc(78px + env(safe-area-inset-bottom,0px));right:16px;width:min(355px,calc(100vw - 32px));z-index:10000;border:1px solid var(--mint);border-radius:10px;padding:13px 15px;box-sizing:border-box;background:var(--card,#18242d);color:var(--text,#f0f4f3);box-shadow:0 11px 32px rgba(0,0,0,.27)}
.lf-r21e-upload-notice strong{display:block;font-size:13px}
.lf-r21e-upload-notice p{font-size:11px;line-height:1.4;margin:6px 0 0}
.lf-r21e-upload-notice button{min-height:37px;margin-top:8px;padding:7px 13px;font-size:12px}
.lf-r21e-upload-notice.has-errors{border-color:#d88665}
.lf-r21e-error{color:#e7a590}
.lf-r21e-success strong{color:var(--mint)}
.lf-r21e-upload-notice .lf-r21e-discard{margin-left:7px;color:#e7a590}
.lf-r21e-bar{height:6px;overflow:hidden;border-radius:8px;background:var(--border);margin-top:9px}
.lf-r21e-bar>span{display:block;height:100%;background:var(--mint);transition:width .18s ease}
@media(min-width:901px){.lf-r21e-upload-notice{bottom:18px}}
@media(max-width:600px){.lf-r21e-upload-notice{right:8px;width:calc(100vw - 16px);bottom:calc(78px + env(safe-area-inset-bottom,0px))}}
</style>
