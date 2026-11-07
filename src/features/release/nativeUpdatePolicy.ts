/** Policy pura: mai confrontare una data di release con versionName Android.
 * Per l'updater usare tag v0.30.0 (o android-v0.30.0) e LionFit.apk.
 */
export const NATIVE_APK_ASSET='LionFit.apk'
export const NATIVE_UPDATE_API='https://api.github.com/repos/matteo-perini/ROUNDONE/releases/latest'
export const NATIVE_UPDATE_CHECK_MS=8*60*60*1000
export const NATIVE_UPDATE_SNOOZE_MS=24*60*60*1000
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
  return u.protocol==='https:'&&u.hostname==='github.com'&&!u.port&&!u.username&&!u.password&&
   /^\/matteo-perini\/ROUNDONE\/releases\/download\/[^/]+\/LionFit\.apk$/.test(u.pathname)
 } catch{return false}
}
export type ReleaseCandidate={tag_name?:unknown;draft?:boolean;prerelease?:boolean;assets?:unknown}
export function safeNewAndroidRelease(release:ReleaseCandidate|null,installed:unknown):{tag:string;url:string}|null {
 if(!release||release.draft||release.prerelease||typeof release.tag_name!=='string')return null
 if(!isNewerAndroidVersion(release.tag_name,installed)||!Array.isArray(release.assets))return null
 for(const a of release.assets as Array<{name?:unknown;state?:unknown;browser_download_url?:unknown}>){
  if(a?.name===NATIVE_APK_ASSET&&a.state==='uploaded'&&permittedApkUrl(a.browser_download_url))return {tag:release.tag_name,url:a.browser_download_url}
 }
 return null
}
