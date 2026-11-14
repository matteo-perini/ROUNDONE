/* Independent service worker; does not cache or intercept the LionFit application. */
self.addEventListener('notificationclick',event=>{
  event.stopImmediatePropagation();event.notification.close();
  const target=new URL('/accesso?open=bookings',self.location.origin).href;
  event.waitUntil((async()=>{const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});const found=windows.find(c=>new URL(c.url).origin===self.location.origin);if(found){await found.navigate(target);await found.focus()}else await self.clients.openWindow(target)})());
});
importScripts('/lf-push-sdk/firebase-app-compat.js','/lf-push-sdk/firebase-messaging-compat.js');
const q=new URL(self.location.href).searchParams;
const cfg={apiKey:q.get('apiKey'),projectId:q.get('projectId'),appId:q.get('appId'),messagingSenderId:q.get('messagingSenderId')};
if(!cfg.apiKey||!cfg.appId||!cfg.projectId||!cfg.messagingSenderId)throw new Error('Configurazione push incompleta');
firebase.initializeApp(cfg);firebase.messaging();
