export const plans=Object.freeze([{id:'monthly',months:1,cents:2999},{id:'quarterly',months:3,cents:6999},{id:'semiannual',months:6,cents:10999},{id:'annual',months:12,cents:19999}]);
export const day=86400000;
export const planOf=id=>plans.find(p=>p.id===id);
export function publicState(b={},exempt=false,now=Date.now()){
 const trialEnd=Number(b.trialEnd||0), failureAt=Number(b.failureAt||0), graceEnd=failureAt?failureAt+7*day:0;
 const stripeStatus=b.stripeStatus||'';let status='not_started';
 if(exempt)status='exempt';else if(stripeStatus==='active'||stripeStatus==='trialing')status='active';
 else if(['past_due','unpaid'].includes(stripeStatus))status=graceEnd>now?'grace':'expired';
 else if(['canceled','paused','incomplete_expired'].includes(stripeStatus))status='expired';
 else if(stripeStatus==='incomplete')status='pending';else if(trialEnd)status=trialEnd>now?'trial':'expired';
 return {status,trialEnd,graceEnd,plan:b.plan||'',stripeStatus,hasCustomer:!!b.customerId,renewalAt:Number(b.renewalAt||0),cancelAtPeriodEnd:b.cancelAtPeriodEnd===true,test:true};
}
export function verifiedPrice(price,plan){return !!price&&price.active===true&&price.livemode===false&&price.currency==='eur'&&Number.isInteger(price.unit_amount)&&price.unit_amount>0&&price.type==='recurring'&&price.recurring?.interval==='month'&&price.recurring?.interval_count===plan.months&&price.recurring?.usage_type==='licensed';}
export function safeReturn(raw){const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.hostname!=='lionfit-staging-test.web.app'&&u.hostname!=='lionfit-staging-test.firebaseapp.com')throw new Error('Return URL must be on staging Firebase Hosting');u.hash='';return u.toString();}
export const blocksCheckout=status=>!['canceled','incomplete_expired'].includes(status);
export function nextFailure(previous,status,now){return ['past_due','unpaid'].includes(status)?Number(previous||0)||now:0;}
export function canStartTrial(b={},exempt=false){return !exempt&&!b.trialEnd&&!b.customerId&&!b.stripeStatus;}
