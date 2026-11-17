import test from 'node:test'
import assert from 'node:assert/strict'
import {validateStudio,trustedStudio,defaultInviteStudio,imagePart,studioMedia,renderStudioInviteEmail} from '../studioCore.mjs'
import {makeInviteUrl} from '../inviteCore.mjs'
const settings={senderName:'Sparta Fight',subject:'Unisciti al nostro team',message:'Ti aspettiamo!\n<script>alert(1)</script>',accent:'#29a66b',theme:'dark',showLogo:true,showCover:true}
const gymId='gym_abc', token='a'.repeat(48), url=makeInviteUrl('https://www.lionfit.it',gymId,'athlete',token)
test('validates every field, rejects unknown fields and unsafe header markup',()=>{
 assert.equal(validateStudio(settings).accent,'#29A66B')
 for(const bad of [{...settings,script:'x'}, {...settings,senderName:'Name\r\nBcc:bad@x.com'}, {...settings,subject:'<script>'},{...settings,accent:'red'}, {...settings,message:'m'.repeat(601)},{...settings,showCover:'true'},{}])assert.throws(()=>validateStudio(bad))
 assert.equal(trustedStudio({...settings,theme:'invalid'}),null)
})
test('escaped personalized HTML preserves registration and both installation links',()=>{
 const mail=renderStudioInviteEmail({gymName:'GYM',kind:'athlete',inviteUrl:url,studio:validateStudio(settings)})
 assert.equal(mail.name,'Sparta Fight');assert.equal(mail.subject,settings.subject)
 assert.ok(mail.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
 assert.ok(!mail.html.includes('<script>'))
 assert.match(mail.html,/Registrati/);assert.match(mail.html,/Scarica per Android/);assert.match(mail.html,/Guida iPhone/)
 assert.ok(mail.text.includes('https://www.lionfit.it/www/index.html?gym='))
 assert.ok(!mail.html.includes('javascript:'))
})
test('without saved studio data, safe default branding preserves the existing three links',()=>{
 const def=defaultInviteStudio('GYM')
 assert.equal(def.senderName,'GYM')
 assert.equal(def.showLogo,true)
 assert.equal(def.showCover,true)
 assert.equal(defaultInviteStudio('').senderName,'LionFit Team')
 const attachments=studioMedia({},def)
 const mail=renderStudioInviteEmail({gymName:'GYM',kind:'coach',inviteUrl:makeInviteUrl('https://www.lionfit.it',gymId,'coach',token),studio:null,attachments})
 assert.equal(mail.name,'GYM')
 assert.match(mail.html,/Registrati/)
 assert.match(mail.html,/Scarica per Android/)
 assert.match(mail.html,/Guida iPhone/)
 assert.match(mail.html,/cid:lionfit-logo/)
 assert.match(mail.html,/cid:lionfit-cover/)
 assert.equal(mail.attachments.length,2)
})
test('image CID supports bounded PNG/JPEG and excludes webp and hostile URLs',()=>{
 const png='data:image/png;base64,aGVsbG8='
 assert.equal(imagePart(png).content,'aGVsbG8=')
 assert.equal(imagePart('https://evil.com/x'),null)
 assert.equal(imagePart('data:image/webp;base64,aGVsbG8='),null)
 assert.equal(imagePart('data:image/png;base64,aGVsbG8=',4),null)
 const parts=studioMedia({logo:png,cover:png},settings)
 assert.deepEqual(parts.map(x=>x.content_id),['lionfit-logo','lionfit-cover'])
 const mail=renderStudioInviteEmail({gymName:'GYM',kind:'athlete',inviteUrl:url,studio:settings,attachments:parts})
 assert.match(mail.html,/cid:lionfit-logo/)
 assert.match(mail.html,/cid:lionfit-cover/)
 assert.equal(mail.attachments.length,2)
})
test('tenant-independent data is not accepted as link by email renderer',()=>{
 assert.throws(()=>renderStudioInviteEmail({gymName:'GYM',kind:'athlete',inviteUrl:'javascript:alert(1)',studio:settings}))
})

test('default asset attachments are bounded, non-empty and consistent across tenants',()=>{
 const opts=defaultInviteStudio('A')
 const a=studioMedia(null,opts),b=studioMedia({logo:'https://evil.example/logo',cover:'data:image/webp;base64,aGVsbG8='},opts)
 assert.deepEqual(a.map(x=>x.content_id),['lionfit-logo','lionfit-cover'])
 assert.deepEqual(b,a)
 assert.ok(a.every(x=>x.content.length>500&&x.content.length<350000))
 assert.equal(a[0].content_type,'image/png')
 assert.equal(a[1].content_type,'image/jpeg')
 assert.notEqual(a[0].content,a[1].content)
})
test('tenant custom logo and cover independently override fallback defaults',()=>{
 const custom='data:image/png;base64,aGVsbG8='
 const opts=defaultInviteStudio('Gym')
 const all=studioMedia({logo:custom,cover:custom},opts)
 assert.equal(all[0].content,'aGVsbG8=')
 assert.equal(all[1].content,'aGVsbG8=')
 const logoOnly=studioMedia({logo:custom},opts)
 assert.equal(logoOnly[0].content,'aGVsbG8=')
 assert.notEqual(logoOnly[1].content,'aGVsbG8=')
 assert.deepEqual(studioMedia({}, {...opts,showLogo:false,showCover:false}),[])
})
test('untrusted studio is ignored and safe defaults are applied',()=>{
 assert.equal(trustedStudio({senderName:'<script>'}),null)
 const html=renderStudioInviteEmail({gymName:'GYM',kind:'athlete',inviteUrl:url,studio:trustedStudio({senderName:'<script>'}),attachments:studioMedia({},defaultInviteStudio('GYM'))}).html
 assert.match(html,/cid:lionfit-logo/)
 assert.doesNotMatch(html,/<script>/)
})
