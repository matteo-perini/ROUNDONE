/** FASE1J - rollout indipendente dalla futura ACL V2 per assegnazione Atleti.
 * Flag di UI, non autorizzazione. Le Firestore Rules restano l'unica autorita'.
 * Non abilitarlo finche la versione di Rules 1J non e' collaudata e pubblicata,
 * con backup/rollback verificato. Richiede anche VITE_LIONFIT_LIVE_WRITES.
 */
export const coachRevocationEnabled=()=>
 import.meta.env.PROD && import.meta.env.VITE_LIONFIT_COACH_REVOCATION==='ENABLED_AFTER_PHASE1J_RELEASE'
