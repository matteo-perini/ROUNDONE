/** R22B.1 — integrazione E2E esclusivamente sugli emulatori locali.
 * Questo file interrompe il test se Auth e Firestore Emulator non sono entrambi avviati.
 * Eseguire con RUN_R22B1_EMULATOR.cmd dalla radice del progetto.
 */
import assert from 'node:assert/strict'
import {initializeApp as initAdmin, deleteApp as deleteAdmin} from 'firebase-admin/app'
import {getAuth as adminAuth} from 'firebase-admin/auth'
import {getFirestore as adminDb} from 'firebase-admin/firestore'
import {initializeApp as initClient, deleteApp as deleteClient} from 'firebase/app'
import {getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut} from 'firebase/auth'
import {getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc} from 'firebase/firestore'
import {getFunctions, connectFunctionsEmulator, httpsCallable} from 'firebase/functions'

const project='demo-lionfit-chat', gymId='gym_pilotTest'
const fh=process.env.FIRESTORE_EMULATOR_HOST, ah=process.env.FIREBASE_AUTH_EMULATOR_HOST
if(!fh||!ah||!/^((127\.0\.0\.1)|(localhost)):\d+$/.test(fh)||!/^((127\.0\.0\.1)|(localhost)):\d+$/.test(ah)) {
 throw new Error('BLOCCATO: test consentito SOLO con Firestore e Auth Emulator su localhost.')
}
if(process.env.GCLOUD_PROJECT&&process.env.GCLOUD_PROJECT!==project)throw new Error('BLOCCATO: progetto non demo.')
if(process.env.FIREBASE_PROJECT_ID&&process.env.FIREBASE_PROJECT_ID!==project)throw new Error('BLOCCATO: progetto non demo.')
if(process.env.LF_CHAT_ENABLED!=='true'||process.env.LF_CHAT_PILOT_GYM_ID!==gymId)throw new Error('BLOCCATO: flag pilot per emulator non configurati.')
const password='LocalEmulator_only_123!'
const users=[
 {uid:'ownerChat01',email:'owner-chat@example.test',role:'admin',coachRole:'owner',gymId},
 {uid:'coachChat01',email:'coach-chat@example.test',role:'admin',coachRole:'collaborator',gymId},
 {uid:'coachUnassigned01',email:'coach-unassigned@example.test',role:'admin',coachRole:'collaborator',gymId},
 {uid:'athleteChat01',email:'athlete-chat@example.test',role:'athlete',gymId,primaryCoachUid:'coachChat01'},
 {uid:'ownerOther01',email:'owner-other@example.test',role:'admin',coachRole:'owner',gymId:'gym_otherTest'},
 {uid:'athleteOther01',email:'athlete-other@example.test',role:'athlete',gymId:'gym_otherTest',primaryCoachUid:'ownerOther01'}
]
const adminApp=initAdmin({projectId:project},'lf-chat-seed'),adb=adminDb(adminApp),clients=[]
const run=async(uid,fn,data={})=>{
 const c=clients.find(x=>x.uid===uid);assert.ok(c,`client assente: ${uid}`)
 const result=await httpsCallable(c.functions,fn)(data)
 return result.data
}
const forbidden=async(f,why)=>{
 await assert.rejects(f,e=>{
  const code=String(e?.code||''),message=String(e?.message||'')
  return /permission-denied|unauthenticated/.test(code)||/PERMISSION_DENIED|permission/i.test(message)
 },why)
}
const setupClient=async(u)=>{
 const app=initClient({projectId:project,apiKey:'demo-api-key',appId:`1:123:web:${u.uid}`},`test-${u.uid}`)
 const auth=getAuth(app);connectAuthEmulator(auth,`http://${ah}`,{disableWarnings:true})
 const firestore=getFirestore(app);const [host,port]=fh.split(':');connectFirestoreEmulator(firestore,host,Number(port))
 const functions=getFunctions(app,'europe-west1');connectFunctionsEmulator(functions,'127.0.0.1',5001)
 await signInWithEmailAndPassword(auth,u.email,password)
 const client={uid:u.uid,app,auth,firestore,functions};clients.push(client)
 return client
}
try{
 const aauth=adminAuth(adminApp)
 await adb.doc(`gyms/${gymId}`).set({name:'Palestra pilota locale',ownerUid:'ownerChat01'})
 await adb.doc('gyms/gym_otherTest').set({name:'Altra palestra locale',ownerUid:'ownerOther01'})
 for(const u of users){
  await aauth.createUser({uid:u.uid,email:u.email,password,emailVerified:true})
  await adb.doc(`users/${u.uid}`).set({name:u.uid,...u,membershipStatus:'active'})
  await setupClient(u)
 }
 console.log('✓ Profili test creati SOLO negli emulatori')
 const contacts=await run('athleteChat01','lfChatContacts')
 assert.deepEqual(contacts.rows.map(x=>x.uid),['coachChat01'])
 await forbidden(()=>run('coachUnassigned01','lfChatOpen',{peerUid:'athleteChat01'}),'Coach non assegnato non può aprire chat')
 await forbidden(()=>run('athleteChat01','lfChatOpen',{peerUid:'athleteOther01'}),'Blocco inter-palestra')
 const opened=await run('athleteChat01','lfChatOpen',{peerUid:'coachChat01'})
 assert.match(opened.id,/^lfc_[a-f0-9]{64}$/)
 assert.equal((await run('coachChat01','lfChatOpen',{peerUid:'athleteChat01'})).id,opened.id)
 const key='r22b1_emulator_00000001',text='Ciao Coach!'
 const sent=await run('athleteChat01','lfChatSend',{threadId:opened.id,requestId:key,text})
 assert.equal(sent.duplicate,false)
 assert.equal((await run('athleteChat01','lfChatSend',{threadId:opened.id,requestId:key,text})).duplicate,true)
 const history=await run('coachChat01','lfChatHistory',{threadId:opened.id})
 assert.equal(history.rows.length,1);assert.equal(history.rows[0].text,text)
 assert.equal((await run('coachChat01','lfChatUnread')).unread,1)
 await run('coachChat01','lfChatMarkRead',{threadId:opened.id,seenAt:sent.createdAt})
 assert.equal((await run('coachChat01','lfChatUnread')).unread,0)
 const coachClient=clients.find(x=>x.uid==='coachChat01')
 const chatPath=`lf_private_chat_threads/${opened.id}`
 await forbidden(()=>getDoc(doc(coachClient.firestore,chatPath)),'Nessuna lettura diretta client')
 await forbidden(()=>setDoc(doc(coachClient.firestore,chatPath),{gymId,anything:true}),'Nessuna scrittura diretta client')
 const inboxPath=`lf_private_chat_inbox/coachChat01/threads/${opened.id}`
 await forbidden(()=>getDoc(doc(coachClient.firestore,inboxPath)),'Inbox riservata al server')
 await forbidden(()=>run('ownerOther01','lfChatHistory',{threadId:opened.id}),'Isolamento inter-palestra')
 await adb.doc('users/coachChat01').update({membershipStatus:'revoked'})
 await forbidden(()=>run('coachChat01','lfChatHistory',{threadId:opened.id}),'Revoca accesso coach')
 await forbidden(()=>run('athleteChat01','lfChatSend',{threadId:opened.id,requestId:'r22b1_emulator_00000002',text:'Prova revoca'}),'Revoca interrompe la chat')
 console.log('✓ PASS: chat, idempotenza, autorizzazioni, revoca, isolamento, Rules deny-by-default')
} finally {
 for(const c of clients){try{await signOut(c.auth)}catch{};await deleteClient(c.app)}
 await deleteAdmin(adminApp)
}
