/** Cronologia applicativa compatta per Android/PWA.
 * Non si affida a history.state.back: i tab e i redirect del router possono
 * aggiungere voci che causano rimbalzi tra Piano e Libreria.
 * Nessuna scrittura su dati Firebase o sui profili.
 */
function pathOnly(fullPath:string):string {return fullPath.split(/[?#]/,1)[0].replace(/\/$/,'')||'/'}
export function routeScope(path:string,context:'athlete'|'coach'|'none'='none'):'athlete'|'coach'|'none' {
 if(path==='/accesso'||path==='/staging'||path.startsWith('/dev/'))return 'none'
 if(path==='/impostazioni')return context==='coach'?'coach':'athlete'
 return path.startsWith('/coach')?'coach':'athlete'
}
export function appRoot(path:string,fullPath:string,scopeHint:'athlete'|'coach'|'none'='none'):string {
 const query=fullPath.includes('source=emulator')?'?source=emulator':''
 return routeScope(path,scopeHint)==='coach'?'/coach'+query:routeScope(path,scopeHint)==='athlete'?'/home'+query:'/accesso'
}
export class AppBackTrail {
 private entries:string[]=[]
 private scope:'athlete'|'coach'|'none'='none'
 record(fullPath:string,scopeHint:'athlete'|'coach'|'none'='none'):void {
  const path=pathOnly(fullPath)
  const scope=routeScope(path,scopeHint==='none'?this.scope:scopeHint)
  if(scope==='none'){this.entries=[];this.scope='none';return}
  const rootPath=scope==='coach'?'/coach':'/home'
  if(scope!==this.scope||path===rootPath){
   this.entries=[fullPath];this.scope=scope;return
  }
  const last=this.entries.at(-1)
  if(last&&pathOnly(last)===path){this.entries[this.entries.length-1]=fullPath;return}
  // Riutilizzare un tab gia' visitato scarta i passaggi avanti: non formare cicli.
  const already=this.entries.findIndex(entry=>pathOnly(entry)===path)
  if(already>=0){this.entries=this.entries.slice(0,already+1);this.entries[already]=fullPath;return}
  this.entries.push(fullPath)
  if(this.entries.length>24)this.entries.splice(1,this.entries.length-24)
 }
 currentScope():'athlete'|'coach'|'none'{return this.scope}
 previous(currentFullPath:string):string|null {
  const current=pathOnly(currentFullPath)
  if(this.entries.length===0||pathOnly(this.entries.at(-1)!)!==current)this.record(currentFullPath)
  if(this.entries.length<=1)return null
  this.entries.pop()
  return this.entries.at(-1)??null
 }
 // Utile solo quando il router rifiuta la navigazione; non crea la nuova voce.
 restore(currentFullPath:string):void {this.record(currentFullPath)}
 snapshot():readonly string[]{return [...this.entries]}
}
