/** PATCH 7/7 — interfaccia IT/EN reattiva e persistente.
 * I dati degli Atleti, nomi personalizzati delle schede, note del Coach, payload
 * Firebase ed errori di rete non vengono mai tradotti automaticamente.
 * Chiavi mancanti: fallback italiano, non testo generato/inventato.
 */
import {ref} from 'vue'
import enMessages from './en.json'
export type InterfaceLanguage='it'|'en'
const KEY='lionfit.interface.language.v1'
function initial():InterfaceLanguage{
 try{return typeof localStorage!=='undefined'&&localStorage.getItem(KEY)==='en'?'en':'it'}catch{return 'it'}
}
export const interfaceLanguage=ref<InterfaceLanguage>(initial())
export function setInterfaceLanguage(lang:string){
 if(lang!=='it'&&lang!=='en')return
 interfaceLanguage.value=lang
 try{localStorage.setItem(KEY,lang)}catch{/* Memoria in uso senza storage disponibile. */}
 if(typeof document!=='undefined')document.documentElement.lang=lang
}
const messages:Record<string,string>=enMessages
/** Usare in espressioni Vue (tracciamento reattivo della lingua). */
export function uiText(value:string):string{
 if(interfaceLanguage.value!=='en')return value
 const direct=messages[value]
 if(direct!==undefined)return direct
 // Solo countdown prodotti da programOverview.ts: mai testi liberi del Coach.
 const days=value.match(/^Mancano (\d+) giorni$/)
 if(days)return `${days[1]} days left`
 const weeks=value.match(/^Mancano (\d+) settimane$/)
 if(weeks)return `${weeks[1]} weeks left`
 return value
}
/** Parametri dinamici: traduce SOLO il modello, mai i valori utente. */
export function uiFormat(template:string,params:Record<string,string|number>):string{
 return uiText(template).replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g,(whole,name)=>
  Object.prototype.hasOwnProperty.call(params,name)?String(params[name]):whole)
}
export function localizedWeekday(short:string):string{
 return uiText(short)
}
