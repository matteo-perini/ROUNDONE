import {ref,watch,onScopeDispose,type ComputedRef} from 'vue'
import type {PhotoRequest,PhotoScope} from './checkGallery'
import {photoError} from './checkGallery'
import {loadScopedCheckPhoto} from '../../integrations/firestore/progress'
// Only the explicitly selected gallery or comparison, no persistent photo cache.
export function useCheckPhotos(requests:ComputedRef<PhotoRequest[]>,scope:ComputedRef<PhotoScope>){
 const urls=ref<Record<string,string>>({}),errors=ref<Record<string,string>>({}),pending=ref<Record<string,boolean>>({})
 let generation=0
 function clear(){generation++;for(const url of Object.values(urls.value))URL.revokeObjectURL(url);urls.value={};errors.value={};pending.value={}}
 async function load(p:PhotoRequest){const key=p.storagePath;if(pending.value[key]||urls.value[key]||!requests.value.some(r=>r.storagePath===key))return;const ticket=generation;const snapshot={...scope.value};pending.value={...pending.value,[key]:true};errors.value={...errors.value,[key]:''};try{const url=await loadScopedCheckPhoto(snapshot,p);if(ticket!==generation){URL.revokeObjectURL(url);return}urls.value={...urls.value,[key]:url}}catch(e){if(ticket===generation)errors.value={...errors.value,[key]:photoError(e)}}finally{if(ticket===generation)pending.value={...pending.value,[key]:false}}}
 watch(()=>JSON.stringify([scope.value,requests.value.map(p=>p.storagePath)]),()=>{clear();for(const p of requests.value)void load(p)},{immediate:true,flush:'sync'})
 onScopeDispose(clear)
 function imageFailed(key:string,url:string){
  if(!url||urls.value[key]!==url)return
  URL.revokeObjectURL(url)
  const next={...urls.value};delete next[key];urls.value=next
  errors.value={...errors.value,[key]:photoError({code:'check-photo/decode'})}
 }
 return {urls,errors,pending,retry:load,imageFailed}
}
