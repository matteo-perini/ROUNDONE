/** LionFit STEP 3T.13: verifica statica offline. Nessun accesso a Firebase o a GitHub. */
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {resolve,dirname} from 'node:path'
const project=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const load=name=>readFileSync(resolve(project,'src','views',name),'utf8')
const screens={
  models:load('LiveCoachTemplates.vue'),
  athletes:load('LiveCoachAthletes.vue'),
  bookings:load('LiveBookingWorkspace.vue'),
  trash:load('LiveCoachTrash.vue'),
  archive:load('AthleteLiveWorkspace.vue')
}
let ok=0,bad=0
function check(description,condition){
  console.log(`${condition?'PASS':'FAIL'} - ${description}`)
  if(condition)ok++;else bad++
}
const noGate=(body,gate)=>!body.includes(gate)
check('Archivio Coach senza spunta obbligatoria', noGate(screens.models,'consent') && noGate(screens.models,'resetConsent'))
check('Gestione atleti senza spunta obbligatoria', noGate(screens.athletes,'consent.value') && !screens.athletes.includes('v-model="consent"'))
check('Prenotazioni senza spunta obbligatoria', noGate(screens.bookings,'approved'))
check('Cestino senza spunta obbligatoria', noGate(screens.trash,'allowWrites'))
check('Archivio atleta senza spunta obbligatoria', noGate(screens.archive,'hideApproved'))
for(const [name,body] of Object.entries(screens)){
 check(`${name}: guardia scritture LIVE preservata`,body.includes('mayWriteLive('))
}
check('Archivio Coach: sessione e ruolo verificati',screens.models.includes('verifyCoachEditor(') && screens.models.includes('verifyCoachArchiveEditor('))
check('Archivio Coach: cancellazione chiede conferma',/async function trash\([\s\S]{0,480}window\.confirm\(/.test(screens.models))
check('Gestione atleti: blocco scritture non autorizzate',screens.athletes.includes('!canWrite.value'))
check('Gestione atleti: conferma cestino singolo',/function trashCurrentWeek\([\s\S]{0,350}window\.confirm\(/.test(screens.athletes))
check('Gestione atleti: conferma cestino multiplo',/function trashMultipleWeeks\([\s\S]{0,380}window\.confirm\(/.test(screens.athletes))
check('Gestione atleti: conferma scollegamento',/function unlinkExact\([\s\S]{0,300}window\.confirm\(/.test(screens.athletes))
check('Gestione atleti: bozza attività protetta',screens.athletes.includes('discardIfDirty('))
check('Prenotazioni: annullamento chiede conferma',/async function cancelBookingRow\([\s\S]{0,230}window\.confirm\(/.test(screens.bookings))
check('Prenotazioni: sincronizzazione 30 giorni chiede conferma',/async function persistAvailability\([\s\S]{0,400}window\.confirm\(/.test(screens.bookings))
check('Prenotazioni: scelta disponibilità attiva mantenuta',screens.bookings.includes('Disponibilità attiva'))
check('Archivio Coach: opzione salvataggio condiviso mantenuta',screens.models.includes('v-model="saveAlsoShared"'))
check('Cestino: ripristino ID originale e conferma',screens.trash.includes('restoreFromTrash(') && /async function restore\([\s\S]{0,750}window\.confirm\(/.test(screens.trash))
check('Archivio atleta: nascondimento non elimina documenti',screens.archive.includes('hideArchiveCopy(id)') && /async function hideCopy\([\s\S]{0,550}window\.confirm\(/.test(screens.archive))
check('Archivio atleta: copie collegate non nascondibili',screens.archive.includes('isArchiveCopyLinkedOrEquivalent('))
console.log(`\nSTEP 3T.13: ${ok} PASS, ${bad} FAIL. NESSUN DEPLOY.`)
if(bad)process.exitCode=1
