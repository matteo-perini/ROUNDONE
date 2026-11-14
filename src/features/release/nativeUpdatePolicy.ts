/** Android release policy: use the native versionName, never a release date. */
export const NATIVE_APK_ASSET='LionFit.apk'
export const NATIVE_UPDATE_API='https://api.github.com/repos/matteo-perini/ROUNDONE/releases?per_page=30'
export const NATIVE_UPDATE_CHECK_MS=30*60*1000
export const NATIVE_UPDATE_RETRY_MS=5*60*1000
export const NATIVE_UPDATE_SNOOZE_MS=4*60*60*1000
export function versionParts(text:unknown):number[]|null {
 const match=String(text??'').trim().match(/^(?:android-)?v?(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?$/i)
 if(!match)return null
 const parts=match.slice(1).filter(x=>x!==undefined).map(Number)
 return parts.every(x=>Number.isSafeInteger(x)&&x>=0&&x<=999999)?parts:null
}
export function isNewerAndroidVersion(remote:unknown,installed:unknown):boolean {
 const a=versionParts(remote),b=versionParts(installed)
 if(!a||!b)return false
 for(let i=0;i<Math.max(a.length,b.length);i++){
  if((a[i]??0)!==(b[i]??0))return (a[i]??0)>(b[i]??0)
 }
 return false
}
export function permittedApkUrl(raw:unknown):raw is string {
 if(typeof raw!=='string')return false
 try {
  const u=new URL(raw)
  return u.protocol==='https:'&&u.hostname==='github.com'&&!u.port&&!u.username&&!u.password&&!u.search&&!u.hash&&
   /^\/matteo-perini\/ROUNDONE\/releases\/download\/(?:android-)?v?\d+\.\d+\.\d+(?:\.\d+)?\/LionFit\.apk$/i.test(u.pathname)
 } catch{return false}
}
export type ReleaseCandidate={tag_name?:unknown;draft?:boolean;prerelease?:boolean;assets?:unknown}
export type AndroidCandidate={tag:string;url:string}
export function safeNewAndroidRelease(release:ReleaseCandidate|null,installed:unknown):AndroidCandidate|null {
 if(!release||release.draft!==false||release.prerelease!==false||typeof release.tag_name!=='string')return null
 if(!isNewerAndroidVersion(release.tag_name,installed)||!Array.isArray(release.assets))return null
 for(const a of release.assets as Array<{name?:unknown;state?:unknown;browser_download_url?:unknown}>){
  if(a?.name===NATIVE_APK_ASSET&&a.state==='uploaded'&&permittedApkUrl(a.browser_download_url)&&
   new URL(a.browser_download_url).pathname===`/matteo-perini/ROUNDONE/releases/download/${release.tag_name}/${NATIVE_APK_ASSET}`)return {tag:release.tag_name,url:a.browser_download_url}
 }
 return null
}
export type ReleaseSelection={kind:'available';candidate:AndroidCandidate}|{kind:'current'}|{kind:'error';message:string}
/** One page, one HTTP request. Do not report current if a newer numeric release has no valid APK. */
export function selectAndroidRelease(raw:unknown,installed:unknown):ReleaseSelection {
 if(!versionParts(installed))return {kind:'error',message:'Versione Android installata non riconosciuta.'}
 if(!Array.isArray(raw))return {kind:'error',message:'Risposta GitHub non valida. Riprova.'}
 let best:AndroidCandidate|null=null, newestBad:string|null=null, hasComparable=false
 for(const r of raw){
  if(!r||r.draft!==false||r.prerelease!==false||typeof r.tag_name!=='string'||!versionParts(r.tag_name))continue
  hasComparable=true
  if(!isNewerAndroidVersion(r.tag_name,installed))continue
  const c=safeNewAndroidRelease(r,installed)
  if(c){if(!best||isNewerAndroidVersion(c.tag,best.tag))best=c}
  else if(!newestBad||isNewerAndroidVersion(r.tag_name,newestBad))newestBad=r.tag_name
 }
 if(best)return {kind:'available',candidate:best}
 if(newestBad)return {kind:'error',message:`Release ${newestBad} pubblicata, ma LionFit.apk non è ancora disponibile o valido. Riprova più tardi.`}
 if(!hasComparable)return {kind:'error',message:'Nessuna release Android stabile con tag di versione riconosciuto.'}
 return {kind:'current'}
}
export function isSnoozed(since:number,now:number):boolean {
 return since>0&&since<=now&&now-since<NATIVE_UPDATE_SNOOZE_MS
}
/** Process-local; a full app reload checks again. Resume events share one throttle. */
export function makeUpdateGate(){
 let next=0
 return {
  due:(now:number)=>now>=next,
  record:(now:number,success:boolean)=>{next=now+(success?NATIVE_UPDATE_CHECK_MS:NATIVE_UPDATE_RETRY_MS)},
 }
}
/** GitHub rate limiting must survive a cold start. Cap stale headers to one hour. */
export function rateLimitUntil(now:number,retryAfter:string|null,reset:string|null):number {
 const retry=retryAfter?Number(retryAfter):NaN
 const resetMs=reset?Number(reset)*1000:NaN
 const validRetry=Number.isFinite(retry)&&retry>0?now+retry*1000:NaN
 const end=Math.max(Number.isFinite(validRetry)?validRetry:0,Number.isFinite(resetMs)?resetMs:0)
 return Math.min(now+60*60*1000,end>now?end+1000:now+NATIVE_UPDATE_CHECK_MS)
}
