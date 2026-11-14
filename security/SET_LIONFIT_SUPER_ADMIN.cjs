// Run locally with Admin SDK and secure Application Default Credentials only.
// Never include in the client bundle, public/ or docs/, do not upload credentials.
const {initializeApp,applicationDefault}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
async function main(){
 const [projectId,uid,email,action,confirm]=process.argv.slice(2);
 if(!['app-palestra-b0b9d','lionfit-staging-test'].includes(projectId)||!uid||!email||!['grant','revoke'].includes(action)||confirm!=='CONFERMO')throw new Error('Uso: node SET_LIONFIT_SUPER_ADMIN.cjs PROGETTO UID EMAIL grant|revoke CONFERMO');
 const app=initializeApp({credential:applicationDefault(),projectId});const auth=getAuth(app);const user=await auth.getUser(uid);
 if(user.email?.toLowerCase()!==email.toLowerCase()||user.disabled||(action==='grant'&&!user.emailVerified))throw new Error('UID/email non corrispondenti, account disabilitato o email non verificata.');
 const claims={...user.customClaims};if(action==='grant')claims.lionfitSuperAdmin=true;else delete claims.lionfitSuperAdmin;
 await auth.setCustomUserClaims(uid,claims);if(action==='revoke')await auth.revokeRefreshTokens(uid);console.log('Permesso aggiornato. Effettua logout e login.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
