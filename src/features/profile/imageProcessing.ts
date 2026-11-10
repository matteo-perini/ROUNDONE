/** Avatar V1-compatible: binary output is deliberately far below 1 MiB Firestore
 * document cap (base64 expands 33%). No Storage Rules deployment is needed.
 * iOS Safari can decode HEIC natively; other browsers load heic2any on demand.
 */
export const MAX_AVATAR_INPUT=40*1024*1024
export const MAX_AVATAR_OUTPUT=140*1024
export function photoFileSupported(file:Pick<File,'name'|'type'|'size'>){
 return file.size>0&&file.size<=MAX_AVATAR_INPUT&&(
  /^image\/(jpeg|png|webp|heic|heif|avif|gif|bmp)$/i.test(file.type)||/\.(jpe?g|png|webp|heic|heif|avif|gif|bmp)$/i.test(file.name))
}
type Converter=(a:{blob:Blob;toType:string;quality:number})=>Promise<Blob|Blob[]>
declare global{interface Window{heic2any?:Converter}}
let converterTask:Promise<Converter>|null=null
export async function heicConverter():Promise<Converter>{
 if(window.heic2any)return window.heic2any
 if(!converterTask)converterTask=new Promise<Converter>((resolve,reject)=>{
  // Original V1 already used this version. External fallback only if the browser
  // cannot decode HEIC; no remote library can be loaded while offline.
  const script=document.createElement('script')
  script.src='https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js'
  script.async=true
  script.onload=()=>window.heic2any?resolve(window.heic2any):reject(new Error('Convertitore HEIC non disponibile'))
  script.onerror=()=>reject(new Error('Impossibile caricare il convertitore HEIC. Riprova con internet attivo o usa JPG.'))
  document.head.appendChild(script)
 }).catch(e=>{converterTask=null;throw e})
 return converterTask!
}
function asImage(blob:Blob):Promise<HTMLImageElement>{
 const url=URL.createObjectURL(blob)
 return new Promise((resolve,reject)=>{
  const img=new Image();img.onload=()=>{URL.revokeObjectURL(url);resolve(img)}
  img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Immagine non decodificabile'))};img.src=url
 })
}
export async function compressedAvatar(file:File):Promise<string>{
 if(!photoFileSupported(file))throw new Error('Formato non supportato oppure foto troppo pesante (massimo 40 MB in ingresso).')
 let img:HTMLImageElement
 try{img=await asImage(file)}catch(e){
  if(!/\.(heic|heif)$/i.test(file.name)&&!/^image\/hei/i.test(file.type))throw e
  const convert=await heicConverter(),result=await convert({blob:file,toType:'image/jpeg',quality:.82})
  img=await asImage(Array.isArray(result)?result[0]:result)
 }
 const side=Math.min(img.naturalWidth,img.naturalHeight)
 if(!side)throw new Error('Immagine priva di dimensioni valide')
 let size=480
 while(size>=220){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas non disponibile')
  ctx.fillStyle='#e8ebe9';ctx.fillRect(0,0,size,size)
  ctx.drawImage(img,(img.naturalWidth-side)/2,(img.naturalHeight-side)/2,side,side,0,0,size,size)
  for(const quality of [.82,.7,.58,.45,.32]){
   const data=canvas.toDataURL('image/jpeg',quality)
   if(data.length*3/4<=MAX_AVATAR_OUTPUT)return data
  }
  size=Math.floor(size*.78)
 }
 throw new Error('Non riesco a comprimere la foto al limite previsto. Prova un’immagine diversa.')
}
