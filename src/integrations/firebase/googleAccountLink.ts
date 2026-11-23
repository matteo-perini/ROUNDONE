/**
 * LionFit R21N: primo passo Google Auth, solo collegamento ad un UID esistente.
 * Non chiama signInWithPopup, createUser, né scrive dati Firestore.
 * Nella fase successiva sarà aggiunto l'accesso Google per profili già collegati.
 */
import {GoogleAuthProvider,linkWithPopup,reload,sendEmailVerification,unlink,type User} from 'firebase/auth'
import {getStagingClients} from './stagingClient'
import {isLiveMode} from './stagingConfig'
import {stagingSession} from './stagingSession'

const GOOGLE_PROVIDER=GoogleAuthProvider.PROVIDER_ID
const RECENT_LOGIN_MS=10*60*1000
export const googleLinkEnabled=()=>isLiveMode()&&import.meta.env.VITE_LIONFIT_GOOGLE_LINK==='ENABLED_AFTER_PROVIDER_REVIEW'

export function linkedGoogleEmail(user:User|null):string|null {
 const match=user?.providerData.find(p=>p.providerId===GOOGLE_PROVIDER)
 return match?.email||null
}

function checkedUser():User {
 if(!googleLinkEnabled())throw new Error('Collegamento Google non ancora abilitato per questa versione.')
 const user=getStagingClients().auth.currentUser
 const session=stagingSession.value
 if(!user||!session||user.uid!==session.uid)throw new Error('Per collegare Google, accedi prima al tuo account LionFit.')
 if(!user.email||user.email.trim().toLowerCase()!==session.email.trim().toLowerCase())throw new Error('Sessione non coerente: esci e accedi nuovamente.')
 return user
}

function requireRecentLogin(user:User){
 const last=Date.parse(user.metadata.lastSignInTime||'')
 if(!Number.isFinite(last)||Date.now()-last>RECENT_LOGIN_MS||last>Date.now()+60_000)
  throw new Error('Per sicurezza esci e accedi di nuovo con la tua password, poi collega Google entro 10 minuti.')
}

export async function requestGoogleLinkVerification():Promise<void>{
 const user=checkedUser()
 if(user.emailVerified)throw new Error('La tua email è già verificata. Ora puoi collegare Google.')
 await sendEmailVerification(user)
}

export async function reloadGoogleLinkStatus():Promise<{linkedEmail:string|null;verified:boolean}>{
 const user=checkedUser()
 await reload(user)
 if(getStagingClients().auth.currentUser?.uid!==user.uid)throw new Error('Sessione cambiata. Accedi di nuovo.')
 return {linkedEmail:linkedGoogleEmail(user),verified:user.emailVerified}
}

export async function linkGoogleToExistingAccount():Promise<string>{
 // Le verifiche sincrone prima del popup conservano il gesto dell'utente
 // sui browser che bloccano finestre aperte dopo un await.
 const user=checkedUser()
 if(linkedGoogleEmail(user))throw new Error('Google è già collegato a questo account LionFit.')
 requireRecentLogin(user)
 if(!user.emailVerified)throw new Error('Verifica prima la tua email LionFit per collegare Google.')
 const expectedUid=user.uid
 const expectedEmail=user.email!.toLowerCase()
 const provider=new GoogleAuthProvider()
 provider.setCustomParameters({prompt:'select_account'})
 // Firebase collega la credenziale a user.uid, non crea un nuovo utente Auth.
 const result=await linkWithPopup(user,provider)
 if(result.user.uid!==expectedUid||getStagingClients().auth.currentUser?.uid!==expectedUid)
  throw new Error('Il collegamento non è verificabile: sessione cambiata. Accedi nuovamente e contatta l’assistenza.')
 const googleEmail=linkedGoogleEmail(result.user)
 // Policy R21N: stessa email, per impedire di associare accidentalmente
 // un account Google differente. In caso di errore tentiamo il rollback.
 if(!googleEmail||googleEmail.trim().toLowerCase()!==expectedEmail){
  try{await unlink(result.user,GOOGLE_PROVIDER)}
  catch{throw new Error('Google è stato collegato con un’email diversa: per sicurezza non uscire dall’account e contatta l’assistenza per rimuovere il collegamento.')}
  throw new Error('Scegli l’account Google con la stessa email del tuo account LionFit. Il collegamento diverso è stato annullato.')
 }
 return googleEmail
}

export function googleLinkErrorMessage(error:unknown):string {
 const code=typeof error==='object'&&error!==null&&'code'in error?String(error.code):''
 switch(code){
  case 'auth/popup-closed-by-user': return 'Operazione annullata: finestra Google chiusa.'
  case 'auth/cancelled-popup-request': return 'È già aperta un’altra richiesta Google. Riprova.'
  case 'auth/popup-blocked': return 'Il browser ha bloccato la finestra Google: autorizza i popup per LionFit e riprova da un browser normale.'
  case 'auth/operation-not-allowed': return 'Provider Google non ancora abilitato in Firebase Authentication.'
  case 'auth/unauthorized-domain': return 'Dominio non autorizzato in Firebase Authentication: verifica lionfit.it e il dominio di prova.'
  case 'auth/credential-already-in-use':
  case 'auth/email-already-in-use': return 'Questo account Google è già collegato a un altro utente Firebase. Nessun profilo è stato unito: contatta l’assistenza.'
  case 'auth/requires-recent-login': return 'Esci e accedi nuovamente con la password, poi riprova subito.'
  case 'auth/network-request-failed': return 'Connessione interrotta: controlla la rete e riprova.'
  default: return error instanceof Error?error.message:'Collegamento Google non riuscito.'
 }
}
