<script setup lang="ts">
import {ref,watch,onUnmounted} from 'vue'
import {stagingSession} from '../integrations/firebase/stagingSession'
import {isStagingMode,mayWriteLive} from '../integrations/firebase/stagingConfig'
import {watchDashboard,saveDashboard} from '../integrations/firestore/platform'
import {accountKey,widgets,type WidgetId} from '../features/platform/platformModel'
const hidden=ref<WidgetId[]>([]),ready=ref(false),busy=ref(false),dirty=ref(false),message=ref('');let stop:(()=>void)|undefined
watch(()=>accountKey(stagingSession.value),()=>{const s=stagingSession.value;stop?.();ready.value=false;dirty.value=false;hidden.value=[];if(!isStagingMode()||!s||s.role==='atleta')return;stop=watchDashboard(s,v=>{ready.value=true;if(!dirty.value)hidden.value=v},()=>{ready.value=false;message.value='Preferenze non leggibili: verifica Firestore.'})},{immediate:true});onUnmounted(()=>stop?.())
function toggle(id:WidgetId){hidden.value=hidden.value.includes(id)?hidden.value.filter(x=>x!==id):[...hidden.value,id];dirty.value=true}
async function save(){busy.value=true;message.value='';try{await saveDashboard([...hidden.value],accountKey(stagingSession.value));dirty.value=false;message.value='Preferenze salvate per il tuo account.'}catch(e){message.value=(e as Error).message}finally{busy.value=false}}
</script>
<template><section v-if="stagingSession&&stagingSession.role!=='atleta'" class="panel lf14-preferences"><h2>Personalizza dashboard</h2><p class="muted small">Seleziona i riquadri della tua Home Coach. Le preferenze seguono il tuo account su PC e smartphone; non cambiano quelle degli altri Coach.</p><div v-if="ready"><label v-for="w in widgets" :key="w.id" class="lf14-toggle"><span>{{w.label}}</span><input type="checkbox" :checked="!hidden.includes(w.id)" :disabled="busy" @change="toggle(w.id)"/></label><div class="row"><button class="secondary" :disabled="busy" @click="hidden=[];dirty=true">Ripristina</button><button class="primary" :disabled="!dirty||busy||!mayWriteLive()" @click="save">Salva</button></div></div><p v-else class="muted">{{message||'Caricamento preferenze…'}}</p><p v-if="ready&&message" role="status" class="notice">{{message}}</p></section></template>
