import {hash,prefs} from './model.mjs';
export const accountKey=({uid,gym})=>hash(JSON.stringify([uid,gym]));
export const defaultPrefs=()=>({booked:true,cancelled:true,leads:[1440,30]});
export const sameAccount=(d,u)=>d?.uid===u.uid&&d.gym===u.gym;
export function storedPrefs(account,devices,u){
 if(sameAccount(account,u)){try{return prefs(account.prefs)}catch{/* legacy invalid */}}
 const ordered=devices.filter(d=>sameAccount(d,u)).sort((a,b)=>(b.updated||0)-(a.updated||0));
 for(const d of ordered){try{return prefs(d.prefs)}catch{/* skip invalid */}}
 return null;
}
