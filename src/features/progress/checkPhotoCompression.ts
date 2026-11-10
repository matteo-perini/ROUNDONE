/**
 * LionFit Check Zone photos: only normalized JPEG bytes are uploaded to Storage.
 * Keep dimensions/quality high where possible, but enforce < 1,000,000 bytes.
 * Input originals (including EXIF/location metadata) are never uploaded.
 */
import {heicConverter} from '../profile/imageProcessing'

export const MAX_CHECK_PHOTO_BYTES = 1_000_000 // strict decimal MB, Storage rule must match
export const MAX_CHECK_INPUT_BYTES = 40 * 1024 * 1024
const TARGET_BYTES = 940_000 // breathing space under the server-side limit
const EXTENSIONS = /\.(jpe?g|png|webp|heic|heif|avif|gif|bmp|tiff?)$/i
const MIMES = /^image\/(jpeg|png|webp|heic|heif|heic-sequence|heif-sequence|avif|gif|bmp|tiff)$/i

export function supportedCheckPhoto(file:Pick<File,'name'|'type'|'size'>):boolean {
 return Number.isFinite(file.size) && file.size > 0 && file.size <= MAX_CHECK_INPUT_BYTES &&
   (MIMES.test(file.type) || EXTENSIONS.test(file.name))
}

function isHeif(file:Pick<File,'name'|'type'>):boolean {
 return /\.(heic|heif)$/i.test(file.name) || /^image\/he(i|if)/i.test(file.type)
}

function imageFrom(blob:Blob):Promise<HTMLImageElement> {
 return new Promise((resolve,reject)=>{
  const url=URL.createObjectURL(blob)
  const image=new Image()
  image.onload=()=>{URL.revokeObjectURL(url);resolve(image)}
  image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Formato immagine non decodificabile su questo dispositivo.'))}
  image.src=url
 })
}

async function decodePhoto(file:File):Promise<HTMLImageElement> {
 try{return await imageFrom(file)}
 catch(error){
  if(!isHeif(file))throw error
  try{
   const convert=await heicConverter()
   const result=await convert({blob:file,toType:'image/jpeg',quality:.92})
   const jpeg=Array.isArray(result)?result[0]:result
   if(!jpeg)throw new Error('HEIC senza fotogrammi leggibili.')
   return await imageFrom(jpeg)
  }catch{
   throw new Error('Impossibile convertire questa foto HEIC/HEIF. Controlla la connessione, oppure esportala come JPG.')
  }
 }
}

function toJpeg(canvas:HTMLCanvasElement,quality:number):Promise<Blob>{
 return new Promise((resolve,reject)=>canvas.toBlob(blob=>{
  if(blob && blob.type==='image/jpeg' && blob.size>0)resolve(blob)
  else reject(new Error('Il dispositivo non riesce a esportare la foto in JPEG.'))
 },'image/jpeg',quality))
}

/** Images that a browser cannot decode (e.g. camera RAW) fail clearly, never upload unchecked bytes. */
export async function compressCheckPhoto(file:File):Promise<Blob> {
 if(!supportedCheckPhoto(file))throw new Error('Foto non supportata o troppo grande (massimo 40 MB originali). Usa JPG, PNG, WebP, HEIC/HEIF, AVIF, GIF, BMP oppure TIFF se il dispositivo lo supporta.')
 const img=await decodePhoto(file)
 if(img.naturalWidth<1 || img.naturalHeight<1 || img.naturalWidth*img.naturalHeight>120_000_000)
  throw new Error('Dimensioni foto non valide o eccessive.')
 // Retain aspect ratio and avoid upscaling. Try large/high quality first; reduce only if needed.
 const longest=Math.max(img.naturalWidth,img.naturalHeight)
 for(const requestedSize of [2560,2200,1920,1600,1360,1120,900,720]){
  const scale=Math.min(1,requestedSize/longest)
  const canvas=document.createElement('canvas')
  canvas.width=Math.max(1,Math.round(img.naturalWidth*scale))
  canvas.height=Math.max(1,Math.round(img.naturalHeight*scale))
  const ctx=canvas.getContext('2d')
  if(!ctx)throw new Error('Compressione non disponibile su questo dispositivo.')
  // Transparent source image becomes white for consistent full-body photo previews.
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height)
  ctx.drawImage(img,0,0,canvas.width,canvas.height)
  for(const quality of [.92,.86,.79,.70,.60,.48,.36]){
   const blob=await toJpeg(canvas,quality)
   if(blob.size<TARGET_BYTES)return blob
  }
 }
 throw new Error('Non è possibile ottenere una foto sotto 1 MB con questo dispositivo. Prova un’altra immagine.')
}
