import test from 'node:test'
import assert from 'node:assert/strict'
import {defaultInviteStudio,studioMedia,renderStudioInviteEmail,validateStudio} from '../studioCore.mjs'
import {makeInviteUrl} from '../inviteCore.mjs'
const link=makeInviteUrl('https://www.lionfit.it','gym_abc','athlete','b'.repeat(48))
function mailFor(settings=defaultInviteStudio('Gym'),appearance={}){
 return renderStudioInviteEmail({gymName:'Gym',kind:'athlete',inviteUrl:link,studio:settings,attachments:studioMedia(appearance,settings)})
}
test('premium standard uses emerald palette, live HTML CTA and three safe deep links',()=>{
 const s=defaultInviteStudio('Gym'); assert.equal(s.accent,'#24E58C')
 const m=mailFor(s)
 assert.match(m.html,/Benvenuto nel team!/)
 assert.match(m.html,/Registrati su LionFit/)
 assert.match(m.html,/href="https:\/\/www.lionfit.it\/www\/index.html\?gym=/)
 assert.match(m.html,/Scarica per Android/)
 assert.match(m.html,/Guida iPhone \/ iPad/)
 assert.match(m.html,/cid:lionfit-logo/);assert.match(m.html,/cid:lionfit-cover/)
 assert.match(m.html,/role="presentation"/)
 assert.doesNotMatch(m.html,/<script|javascript:/)
 assert.match(m.text,/L'invito è personale/)
})
test('uploaded gym logo and photo override independently, broken entries fall back',()=>{
 const s=defaultInviteStudio('Gym'),custom='data:image/png;base64,aGVsbG8='
 const a=studioMedia({logo:custom},s),b=studioMedia({cover:custom},s)
 assert.equal(a[0].content,'aGVsbG8=');assert.notEqual(a[1].content,'aGVsbG8=')
 assert.notEqual(b[0].content,'aGVsbG8=');assert.equal(b[1].content,'aGVsbG8=')
 assert.equal(studioMedia({logo:'javascript:x',cover:'https://example.com/image'},s).length,2)
 assert.equal(studioMedia({}, {...s,showLogo:false,showCover:false}).length,0)
})
test('custom note escaped and no arbitrary HTML or URL injection',()=>{
 const s=validateStudio({...defaultInviteStudio('Gym'),senderName:'Safe Team',message:'Ti aspettiamo!\n<script>alert(1)</script>'})
 const m=mailFor(s)
 assert.match(m.html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
 assert.doesNotMatch(m.html,/<script>/)
 assert.equal(m.name,'Safe Team')
})
test('template uses a bounded official LionFit PNG and modern gym JPEG',()=>{
 const a=studioMedia({},defaultInviteStudio('Gym'))
 assert.equal(a.length,2)
 assert.equal(a[0].content_type,'image/png');assert.equal(a[1].content_type,'image/jpeg')
 const fs=a.map(x=>Buffer.from(x.content,'base64'))
 assert.equal(fs[0].subarray(1,4).toString(),'PNG')
 assert.equal(fs[1][0],0xff);assert.equal(fs[1][1],0xd8)
 assert.ok(fs[0].length>10000&&fs[0].length<120000)
 assert.ok(fs[1].length>10000&&fs[1].length<130000)
})
