import {getFunctions,httpsCallable} from 'firebase/functions'
import {Browser} from '@capacitor/browser'
import {isTestMode,mayWriteLive} from './stagingConfig'
import {getStagingClients} from './stagingClient'
export type PlanId='monthly'|'quarterly'|'semiannual'|'annual'
export type Plan={id:PlanId;months:number;cents:number;configured:boolean}
export type Billing={status:string;trialEnd:number;graceEnd:number;plan:string;stripeStatus:string;hasCustomer:boolean;renewalAt:number;cancelAtPeriodEnd:boolean;test:true}
export type BillingView={billing:Billing;plans:Plan[]}
export type Catalog={plans:Plan[];priceIds:Partial<Record<PlanId,string>>}
export const billingSandboxEnabled=()=>isTestMode()&&import.meta.env.VITE_LIONFIT_BILLING_SANDBOX==='true'&&mayWriteLive()
export async function billingCall<T>(name:string,data:Record<string,unknown>={}):Promise<T>{if(!billingSandboxEnabled())throw new Error('Sandbox non abilitata.');const {auth}=getStagingClients();if(auth.app.options.projectId!=='lionfit-staging-test'||!auth.currentUser)throw new Error('Accesso STAGING richiesto.');return (await httpsCallable<Record<string,unknown>,T>(getFunctions(auth.app,'europe-west1'),name)(data)).data}
export async function billingOpen(url:string){const u=new URL(url);if(u.protocol!=='https:'||!['checkout.stripe.com','billing.stripe.com'].includes(u.hostname)||u.username||u.password)throw new Error('Indirizzo Stripe non valido.');await Browser.open({url:u.href})}
export const labels:Record<PlanId,string>={monthly:'Mensile',quarterly:'Trimestrale',semiannual:'Semestrale',annual:'Annuale'}
export const billingLabels:Record<string,string>={not_started:'Prova non iniziata',trial:'Prova gratuita',active:'Abbonamento attivo',exempt:'Palestra esente',grace:'Rinnovo non riuscito · tolleranza',expired:'Scaduto',pending:'Pagamento in attesa'}
export const money=(cents:number)=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(cents/100)
export const dateLabel=(ms:number)=>ms?new Date(ms).toLocaleDateString('it-IT'):'—'
