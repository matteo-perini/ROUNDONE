const key=(uid:string,gymId:string)=>`lionfit.work.badge.v1:${uid}:${gymId}`
export function badgeEnabled(uid:string,gymId:string){try{return localStorage.getItem(key(uid,gymId))==='1'}catch{return false}}
export function setBadgeEnabled(uid:string,gymId:string,value:boolean){try{localStorage.setItem(key(uid,gymId),value?'1':'0');return true}catch{return false}}
