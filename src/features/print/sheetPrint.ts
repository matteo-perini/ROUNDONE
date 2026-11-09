/** Stampa schede atleta: documento HTML sanificato per Android PrintManager.
 * Non accede a Firebase e non modifica né esercizi né schede.
 */
import type {ExerciseRecord} from '../sheets/domain'
export type PrintableSheet={title:string;exercises:readonly ExerciseRecord[]}
const escapeHtml=(value:unknown):string=>String(value??'').replace(/[&<>"']/g,ch=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[ch]||ch))
function detail(value:unknown):string{
 const text=String(value??'').trim()
 return text?escapeHtml(text):'—'
}
export function sheetPrintHtml(sheet:PrintableSheet):string{
 const rows=sheet.exercises.map((ex,index)=>{
  const kg=ex.load|| (typeof ex.kg==='number'&&Number.isFinite(ex.kg)?`${ex.kg} kg`:'')
  const part=ex.supersetWithPrevious?' · SUPERSET B':''
  const notes=String(ex.notes||'').trim()
  return `<tr><td>${index+1}</td><td><strong>${escapeHtml(ex.name)}</strong>${part?`<small>${part}</small>`:''}${notes?`<small>Note Coach: ${escapeHtml(notes)}</small>`:''}</td><td>${detail(ex.sets)}</td><td>${detail(ex.reps)}</td><td>${detail(kg)}</td><td>${detail(ex.rest)}</td></tr>`
 }).join('')
 return `<!doctype html><html lang="it"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(sheet.title)} — LionFit</title><style>
 @page{size:A4;margin:13mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#182a24;background:#fff;margin:0;font-size:11px}header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #158354;padding-bottom:10px;margin-bottom:15px}h1{font-size:20px;line-height:1.2;margin:0 0 5px}.brand{font-size:14px;font-weight:bold;color:#158354}.muted{color:#586762}table{width:100%;border-collapse:collapse;table-layout:fixed}th{text-align:left;background:#e5f5eb;color:#143b29}th,td{border-bottom:1px solid #d7e4db;padding:8px 5px;vertical-align:top;overflow-wrap:anywhere}th:first-child,td:first-child{width:32px;text-align:center}th:nth-child(2){width:40%}small{display:block;font-size:9px;color:#456154;margin-top:4px;white-space:pre-wrap}tr{break-inside:avoid}footer{border-top:1px solid #cbd9d1;padding-top:8px;margin-top:18px;color:#586762;font-size:9px}
 </style></head><body><header><div><h1>${escapeHtml(sheet.title)}</h1><span class="muted">Scheda di allenamento</span></div><div class="brand">LION FIT</div></header><table><thead><tr><th>#</th><th>Esercizio</th><th>Serie</th><th>Rip.</th><th>Carico</th><th>Recupero</th></tr></thead><tbody>${rows||'<tr><td colspan="6">Nessun esercizio presente nella scheda.</td></tr>'}</tbody></table><footer>Stampa generata da LionFit. I valori indicano le prescrizioni della scheda, non le prestazioni registrate.</footer></body></html>`
}
