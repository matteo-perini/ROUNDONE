// A failed transport must never leave a private-photo panel waiting indefinitely.
export const CHECK_PHOTO_TIMEOUT_MS = 15000
export async function withCheckPhotoDeadline<T>(request:Promise<T>,timeoutMs=CHECK_PHOTO_TIMEOUT_MS):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined
 try{
  return await Promise.race([request,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error('Tempo di caricamento foto scaduto.'),{code:'check-photo/timeout'})),timeoutMs)})])
 }finally{if(timer!==undefined)clearTimeout(timer)}
}
