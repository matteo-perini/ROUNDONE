<script setup lang="ts">
import {computed,onBeforeUnmount,onMounted,ref,watch} from 'vue'
import {adjustRest,clampRest,pauseRest,restRemaining,startRest,type RestClock} from '../features/progress/restTimer'
import {uiText} from '../features/i18n/interfaceLanguage'
const props=defineProps<{seconds:number;resetToken:number}>()
const state=ref<RestClock>({remaining:clampRest(props.seconds),deadline:null}),remaining=ref(state.value.remaining),finished=ref(false),sound=ref(false),paused=ref(false)
const running=computed(()=>state.value.deadline!==null)
const display=computed(()=>`${String(Math.floor(remaining.value/60)).padStart(2,'0')}:${String(remaining.value%60).padStart(2,'0')}`)
let ticker:ReturnType<typeof setInterval>|null=null, audio:AudioContext|null=null
function stopTicker(){if(ticker!==null)clearInterval(ticker);ticker=null}
function signal(){if(!sound.value||document.hidden)return;try{if(audio?.state==='running'){const osc=audio.createOscillator(),gain=audio.createGain();osc.frequency.value=660;gain.gain.setValueAtTime(.09,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.3);osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(audio.currentTime+.3)}navigator.vibrate?.(180)}catch{}}
function sync(){remaining.value=restRemaining(state.value,Date.now());if(running.value&&remaining.value===0){state.value={remaining:0,deadline:null};stopTicker();finished.value=true;signal()}}
function toggle(){if(running.value){state.value=pauseRest(state.value,Date.now());paused.value=state.value.remaining>0;stopTicker();sync();return}if(state.value.remaining===0)state.value={remaining:clampRest(props.seconds),deadline:null};finished.value=false;paused.value=false;state.value=startRest(state.value,Date.now());sync();if(running.value){stopTicker();ticker=setInterval(sync,200)}}
function reset(){stopTicker();state.value={remaining:clampRest(props.seconds),deadline:null};finished.value=false;paused.value=false;sync()}
function adjust(delta:number){state.value=adjustRest(state.value,delta,Date.now());finished.value=false;sync();if(!running.value)stopTicker()}
function setDuration(e:Event){const seconds=Number((e.target as HTMLInputElement).value);if(running.value||!Number.isFinite(seconds))return;state.value={remaining:Math.max(1,clampRest(seconds)),deadline:null};finished.value=false;paused.value=false;sync()}
async function toggleSound(){sound.value=!sound.value;if(!sound.value)return;try{if(!audio&&typeof AudioContext!=='undefined')audio=new AudioContext();await audio?.resume()}catch{/* visual completion always works */}}
watch(()=>[props.seconds,props.resetToken],reset)
onMounted(()=>{document.addEventListener('visibilitychange',sync);window.addEventListener('pageshow',sync)})
onBeforeUnmount(()=>{stopTicker();document.removeEventListener('visibilitychange',sync);window.removeEventListener('pageshow',sync);if(audio)void audio.close().catch(()=>{})})
</script>
<template>
 <div class="lf-r5-timer" :class="{'is-finished':finished}">
  <div class="lf-r5-timer-top"><span class="eyebrow">{{uiText('Timer recupero')}}</span><button type="button" class="secondary lf-r5-sound" :aria-pressed="sound" @click="toggleSound">{{uiText(sound?'Suono attivo':'Suono disattivato')}}</button></div>
  <div class="lf-r5-time" role="timer" aria-live="off">{{display}}</div><p v-if="finished" role="status" class="lf-r5-finish">{{uiText('Recupero terminato')}}</p>
  <div class="lf-r5-timer-controls"><button type="button" class="secondary" @click="adjust(-15)">−15 s</button><button type="button" class="primary" @click="toggle">{{uiText(running?'Pausa':remaining===0?'Riavvia':paused?'Riprendi':'Avvia')}}</button><button type="button" class="secondary" @click="adjust(15)">+15 s</button><button type="button" class="secondary" :aria-label="uiText('Azzera timer')" @click="reset">↻</button></div>
  <label class="lf-r5-duration">{{uiText('Durata (secondi)')}} <input type="number" min="1" max="900" inputmode="numeric" :disabled="running" :value="remaining" @change="setDuration"/></label>
 </div>
</template>
<style scoped>
.lf-r5-timer{display:grid;gap:9px;border:1px solid var(--border);border-radius:16px;padding:13px;background:var(--card2);color:var(--text)}.lf-r5-timer-top{display:flex;align-items:center;justify-content:space-between;gap:8px}.lf-r5-timer-top .eyebrow{margin:0}.lf-r5-sound{font-size:11px;min-height:34px;padding:5px 8px}.lf-r5-time{font-size:clamp(38px,8vw,62px);font-weight:900;letter-spacing:-.045em;text-align:center;line-height:1;font-variant-numeric:tabular-nums;color:var(--text)}.lf-r5-timer-controls{display:grid;grid-template-columns:1fr 1.5fr 1fr auto;gap:5px}.lf-r5-timer-controls button{min-height:42px;padding:7px 4px;font-size:13px}.lf-r5-duration{display:flex;align-items:center;justify-content:center;gap:8px;margin:0;font-size:12px;color:var(--muted)}.lf-r5-duration input{width:74px;min-width:0;padding:5px 8px}.lf-r5-timer.is-finished{border-color:var(--mint)}.lf-r5-finish{text-align:center;color:var(--mint);font-weight:700;margin:0}
</style>
