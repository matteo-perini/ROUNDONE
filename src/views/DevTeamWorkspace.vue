<script setup lang="ts">
/** Team pubblico: SOLO lettura di team_public della stessa palestra nell'emulatore. */
import { ref,computed,onMounted,onUnmounted } from 'vue'
import { collection,onSnapshot,query,where,type Unsubscribe } from 'firebase/firestore'
import { readVerifiedDevSession } from '../integrations/firebase/devSession'
import {isStagingMode} from '../integrations/firebase/stagingConfig'
import {readStagingSession} from '../integrations/firebase/stagingSession'
import {getStagingClients} from '../integrations/firebase/stagingClient'
import { getLocalEmulatorClients } from '../integrations/firebase/emulatorClient'
const search=ref(''),status=ref('Caricamento Team Firebase…')
const members=ref<{id:string;name:string;bio:string;photoURL:string}[]>([])
const shown=computed(()=>members.value.filter(m=>m.name.toLowerCase().includes(search.value.trim().toLowerCase())))
let alive=true;let stop:Unsubscribe|null=null
onMounted(async()=>{
 try{
  const s=isStagingMode()?await readStagingSession():await readVerifiedDevSession()
  if(!alive)return
  if(s.role!=='atleta'||(!isStagingMode()&&s.gymId!=='gym_lab2c_a'))throw new Error('Team: ruolo Atleta non autorizzato.')
  const {db}=isStagingMode()?getStagingClients():getLocalEmulatorClients()
  stop=onSnapshot(query(collection(db,'team_public'),where('gymId','==',s.gymId),where('role','==','athlete')),snap=>{
   if(!alive)return
   members.value=snap.docs.map(d=>({id:d.id,name:[String(d.data().name||'Atleta').slice(0,90),String(d.data().surname||'').slice(0,80)].filter(Boolean).join(' '),bio:String(d.data().bio||'').slice(0,160),photoURL:typeof d.data().photoURL==='string'&&d.data().photoURL.length<200000?d.data().photoURL:''})).sort((a,b)=>a.name.localeCompare(b.name,'it'))
   status.value=''
  },e=>{if(alive)status.value=`Team pubblico non leggibile: ${e.message}`})
 }catch(e){if(alive)status.value=e instanceof Error?e.message:String(e)}
})
onUnmounted(()=>{alive=false;stop?.()})
</script>
<template>
 <section class="panel athlete-team-screen"><div class="row between"><div><h2 class="card-heading">LION FIT TEAM</h2><p class="muted" style="margin:8px 0 0">ATLETI DELLA TUA PALESTRA</p></div><span class="pill pill-neutral">{{members.length}} membri</span></div>
 <div class="divider"/><input v-model="search" placeholder="Cerca un atleta..." aria-label="Cerca Team"/>
 <p v-if="status" class="muted" role="status">{{status}}</p><p v-else-if="!shown.length" class="muted">Nessun atleta nel Team pubblico della palestra.</p>
 <div class="stack athlete-team-list"><article v-for="member in shown" :key="member.id" class="action-card"><span class="action-icon"><img v-if="member.photoURL" :src="member.photoURL" alt="" style="width:42px;height:42px;border-radius:50%;object-fit:cover"/><span v-else>🦁</span></span><div><strong>{{member.name.toUpperCase()}}</strong><small>{{member.bio || 'ATLETA DELLA PALESTRA'}}</small></div></article></div>
 </section>
</template>
