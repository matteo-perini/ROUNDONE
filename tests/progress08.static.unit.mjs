import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const file=n=>readFileSync(new URL(`../${n}`,import.meta.url),'utf8')
const component=file('src/components/ProgressWorkspace.vue')
const compress=file('src/features/progress/checkPhotoCompression.ts')
const storage=file('src/integrations/firestore/progress.ts')
const css=file('src/styles-progress360.css')
test('Atleta: selezione scheda precede editor carichi',()=>{
 assert.ok(component.indexOf('class="lf-p360-sheet-list lf-p360-compact-list"')<component.indexOf('REGISTRA ALLENAMENTO'))
 assert.match(component,/@click="openSheet\(s\)"/)
 assert.match(component,/v-model="search"/)
 assert.match(component,/lf-p360-picker-filters/)
})
test('Coach senza Registro carichi; Check Zone nominata ovunque',()=>{
 assert.match(component,/v-if="role==='athlete'" class="lf-p12-hero"/)
 assert.match(component,/tab==='record'&&role==='athlete'/)
 assert.match(component,/Check Zone/)
 assert.doesNotMatch(component,/Check fisico/)
})
test('Foto compressa prima di ogni invio, nessun originale nello Storage',()=>{
 assert.match(component,/const resized=await compressCheckPhoto\(file\)/)
 assert.match(component,/uploaded.push\(await uploadCheckPhoto[^\n]*resized\)/)
 assert.match(compress,/MAX_CHECK_PHOTO_BYTES = 1_000_000/)
 assert.match(compress,/const TARGET_BYTES = 940_000/)
 assert.match(compress,/canvas.toBlob/)
 assert.match(storage,/blob.size>=MAX_CHECK_PHOTO_BYTES/)
})
test('Formati HEIC e comuni + errore se dispositivo non decodifica',()=>{
 assert.match(component,/accept="image\/\*,\.heic,\.heif,\.avif,\.bmp,\.tif,\.tiff"/)
 assert.match(compress,/heicConverter\(\)/)
 assert.match(compress,/non decodificabile/)
})
test('Navigazione e lista schede compact su mobile',()=>{
 assert.match(css,/lf-p360-compact-sheet\{min-height:57px/)
 assert.match(css,/lf-p360-compact-list/)
 assert.match(css,/lf-p360-tabs-coach/)
})
