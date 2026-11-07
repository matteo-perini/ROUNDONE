/** UI interface labels only: never translate athlete notes, custom names or user content. */
import { ref } from 'vue'
export type InterfaceLanguage='it'|'en'
const KEY='lionfit.interface.language.v1'
function initial():InterfaceLanguage{
 try{return typeof localStorage!=='undefined'&&localStorage.getItem(KEY)==='en'?'en':'it'}catch{return'it'}
}
export const interfaceLanguage=ref<InterfaceLanguage>(initial())
export function setInterfaceLanguage(lang:string){
 if(lang!=='it'&&lang!=='en')return
 interfaceLanguage.value=lang
 try{localStorage.setItem(KEY,lang)}catch{/* Private mode; preference remains in memory. */}
}
const en:Record<string,string>={
 'HOME':'HOME','PIANO':'PLAN','ARCHIVIO':'ARCHIVE','TEAM':'TEAM','PRENOTA':'BOOK','PROFILO':'PROFILE',
 'DASHBOARD':'DASHBOARD','GESTIONE ATLETI':'ATHLETES','LIBRERIA ESERCIZI':'EXERCISE LIBRARY',
 'ARCHIVIO SCHEDE':'SHEET ARCHIVE','CALENDARIO APPUNTAMENTI':'BOOKING CALENDAR','CESTINO':'TRASH',
 'COACH DELLA PALESTRA':'GYM COACHES','PROFILO & PALESTRA':'PROFILE & GYM',
 'Impostazioni':'Settings','Generali':'General','Privacy e account':'Privacy & account',
 'App e supporto':'App & support','Tema':'Theme','Notifiche':'Notifications',
 'Lingua':'Language','Unità di misura':'Units','Modifica profilo':'Edit profile',
 'Sicurezza':'Security','Privacy':'Privacy','Termini e condizioni':'Terms & conditions',
 'Cookie e tecnologie locali':'Cookies & local technologies','Informazioni':'About',
 'Assistenza e feedback':'Support & feedback','Esci dall’account':'Sign out',
 'Scuro':'Dark','Chiaro':'Light','In aggiornamento':'Coming soon',
 'Il mio piano':'My plan','Le mie prenotazioni':'My bookings','Prenota':'Book',
 'CATALOGO ESERCIZI CONDIVISO LION FIT':'LIONFIT SHARED EXERCISE CATALOG',
 'Tutti i Muscoli':'All muscles','Mostra altri esercizi':'Show more exercises',
 'Nessun esercizio trovato.':'No exercises found.',
 'CHIUDI':'CLOSE','Mostra inglese':'Show English','Mostra italiano':'Show Italian',
}
export function uiText(value:string):string{return interfaceLanguage.value==='en'?(en[value]||value):value}
