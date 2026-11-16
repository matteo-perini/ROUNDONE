/** STEP 3S3: audit STATIC; no Firebase project connection, no deploy. */
import {readFileSync,existsSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {fileURLToPath} from 'node:url'
const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
const text=p=>readFileSync(join(root,p),'utf8')
let passes=0,fails=0
function check(ok,msg){if(ok){passes++;console.log('[PASS] '+msg)}else{fails++;console.error('[FAIL] '+msg)}}
// PATCH 2 retired assignment-based ACL. Coach assignment is a UI filter,
// not an authorization boundary. These are static checks, NOT a Rules test.
const athleteScope=(source,gym)=>source.includes(`where('gymId','==',${gym}),where('role','==','athlete')`)
const dashboard=text('src/views/DevCoachDashboard.vue')
check(athleteScope(dashboard,'s.gymId')&&dashboard.includes('readStagingDetails()')&&dashboard.includes('readVerifiedDevSession()')&&dashboard.includes("profile.data().gymId!==s.gymId")&&dashboard.includes("profile.data().role!=='admin'"),'Dashboard Coach: query atleti della palestra verificata')
const roster=text('src/views/LiveCoachAthletes.vue')
check(athleteScope(roster,'s.gymId')&&roster.includes('await readStagingDetails()')&&roster.includes("if(s.role==='atleta')throw")&&roster.includes("p.data().gymId!==s.gymId")&&roster.includes('labCoachRoster('),'Gestione Atleti: palestra, ruolo e proiezione roster verificati')
const templates=text('src/views/LiveCoachTemplates.vue')
check(athleteScope(templates,'verified.gymId')&&templates.includes('await readStagingSession()')&&templates.includes("!['titolare','collaboratore'].includes(verified.role)")&&templates.includes('labCoachRoster(')&&templates.includes('maySelectLabAthlete('),'Archivio Coach: roster della palestra e selezione limitata')
const trash=text('src/views/LiveCoachTrash.vue')
check(athleteScope(trash,'s.gymId')&&trash.includes('await readStagingSession()')&&trash.includes("if(s.role==='atleta')throw")&&trash.includes("u.data().gymId!==s.gymId")&&trash.includes("u.data().role!=='admin'")&&trash.includes("!athletes.value.some(x=>x.id===item.athleteId)"),'Cestino Coach: identita, palestra e ripristino limitati al roster')
const metrics=text('src/features/profile/coachMetrics.ts'),profile=text('src/views/DevProfileWorkspace.vue')
check(athleteScope(metrics,'gymId')&&profile.includes('readStagingDetails()')&&profile.includes("if(s.role!=='atleta')void readCoachMetrics(db,s.gymId,s.uid,s.role==='titolare')"),'Profilo Coach: metriche della sessione verificata')
const rosterModel=text('src/features/athletes/liveCoachRoster.ts'),membership=text('src/features/athletes/coachMembership.ts')
check(rosterModel.includes("data.gymId!==gymId||data.role!=='athlete'")&&rosterModel.includes('a.id===id&&a.gymId===gymId')&&membership.includes("if(mode==='tutti')return true"),'Roster: isolamento palestra e compatibilita atleti senza assegnazione')
const session=text('src/integrations/firebase/stagingSession.ts'),roles=text('src/features/auth/legacyRole.ts')
check(session.includes("getDocFromServer(doc(db,'users',user.uid))")&&session.includes("getDocFromServer(doc(db,'gyms',gymId))")&&session.includes('resolveLegacyGymRole(user.uid,d,g.data())')&&roles.includes("profile.membershipStatus==='revoked'")&&roles.includes('if(!owner)throw'),'Sessione: identita verificata, revoca e proprietario legacy')
const access=text('src/views/StagingAccess.vue')
check(access.includes('if(!mayWriteLive())throw new Error('),'Registrazione Coach non puo creare account in build senza scritture')
check(/async function register\(\).*?!mayWriteLive\(\)/.test(access),'Registrazione Atleta/Owner bloccata in build senza scritture')
check(/async function recoverRegistration\(\)[\s\S]{0,120}!mayWriteLive\(\)/.test(access),'Ripresa registrazione bloccata in build senza scritture')
const client=text('src/integrations/firebase/stagingConfig.ts')
check(client.includes("VITE_LIONFIT_LIVE_ACK==='LIVE_FIREBASE_RULES_CONFIRMED'"),'LIVE richiede ACK esplicito')
check(client.includes("VITE_LIONFIT_LIVE_WRITES===LIVE_WRITE_ACK"),'Scritture richiedono flag separato')
check(text('src/views/LiveCoachStaff.vue').includes("return 'https://www.lionfit.it'"),'Link inviti LIVE al dominio pubblico')
const proposedFire='security/step3s2-prod-proposed-FIRESTORE-NON-PUBBLICARE.rules'
const proposedStorage='security/step3s2-prod-proposed-STORAGE-NON-PUBBLICARE.rules'
check(existsSync(join(root,proposedFire)),'Rules Firestore proposte presenti soltanto come riferimento')
check(existsSync(join(root,proposedStorage)),'Rules Storage proposte presenti soltanto come riferimento')
if(existsSync(join(root,proposedFire))) {
 const rules=text(proposedFire)
 check(rules.includes('membershipStatus')&&rules.includes('ownerUid'),'Firestore: revoche e proprietario legacy presenti')
 check(rules.includes('spark_booking_reservations')&&rules.includes('archive_templates'),'Firestore: prenotazioni e archivio ancora previsti')
}
check(text('public/CNAME').trim()==='www.lionfit.it','CNAME GitHub Pages invariato')
check(existsSync(join(root,'public/www/index.html'))&&existsSync(join(root,'public/404.html')),'URL legacy e fallback GitHub Pages preservati')
check(text('android/app/build.gradle').includes('applicationId "com.roundone.app"'),'Package Android originale preservato')
check(text('.gitignore').includes('.env.*'),'Configurazioni locali ignorate da Git')
check(!existsSync(join(root,'dist/.env.production.local')),'Nessun .env privato nella build')
console.log(`\nLIONFIT compatibilita statica: ${passes} PASS, ${fails} FAIL. NESSUNA CONNESSIONE A PROD.`)
if(fails)process.exitCode=1
