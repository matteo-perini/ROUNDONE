import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {parse,compileScript,compileStyle,compileTemplate} from '@vue/compiler-sfc'
import {chatViewportGeometry,chatNearBottom} from '../src/features/chat/chatViewport.ts'
const base={width:390,layoutHeight:844,visibleHeight:844,offsetTop:0,scale:1,pageTop:138,dockTop:776,focused:false,baselineHeight:844,mobile:true}
const size=(v={})=>chatViewportGeometry({...base,...v})
test('closed keyboard reserves the actual dock rather than a guessed nav height',()=>assert.deepEqual(size(),{keyboard:false,height:632}))
test('visual viewport keyboard uses visible bottom and ignores dock',()=>assert.deepEqual(size({visibleHeight:490,focused:true}),{keyboard:true,height:346}))
test('layout-resizing WebView detects keyboard from pre-focus baseline',()=>assert.deepEqual(size({layoutHeight:490,visibleHeight:490,focused:true}),{keyboard:true,height:346}))
test('hardware keyboard or modest browser chrome movement does not hide dock',()=>{assert.equal(size({focused:true}).keyboard,false);assert.equal(size({visibleHeight:790,focused:true}).keyboard,false)})
test('keyboard dismissed while field retains focus restores dock',()=>assert.deepEqual(size({focused:true}),size()))
test('visual viewport panning uses offsetTop, never treats scale as keyboard',()=>{assert.deepEqual(size({visibleHeight:420,offsetTop:70,focused:true}),{keyboard:true,height:346});assert.deepEqual(size({visibleHeight:420,focused:true,scale:1.8}),{keyboard:false,height:null})})
test('desktop and exhausted viewport geometry',()=>{assert.deepEqual(size({mobile:false}),{keyboard:false,height:null});assert.equal(size({pageTop:900}).height,null);assert.equal(size({dockTop:null}).height,700)})
test('reading old messages remains outside the near-bottom anchor',()=>{assert.equal(chatNearBottom({scrollHeight:1000,scrollTop:200,clientHeight:300}),false);assert.equal(chatNearBottom({scrollHeight:1000,scrollTop:620,clientHeight:300}),true);assert.equal(chatNearBottom({scrollHeight:150,scrollTop:0,clientHeight:300}),true)})
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');const file='src/views/AthleteChatPreview.vue',chat=read(file),helper=read('src/features/chat/chatViewport.ts')
test('chat SFC script, template and both styles compile',()=>{const {descriptor,errors}=parse(chat,{filename:file});assert.deepEqual(errors,[]);const script=compileScript(descriptor,{id:'e6'});assert.deepEqual(compileTemplate({id:'e6',source:descriptor.template.content,filename:file,compilerOptions:{bindingMetadata:script.bindings}}).errors,[]);for(const st of descriptor.styles)assert.deepEqual(compileStyle({id:'data-v-e6',source:st.content,filename:file,scoped:st.scoped}).errors,[])})
test('draft remains editable during send, send still requires verification and prevents duplicate writes',()=>{assert.match(chat,/<textarea[^>]+:disabled="!verified"/);assert.match(chat,/:disabled="!verified\|\|!draft.trim\(\)\|\|busy\|\|sending"/);assert.match(chat,/if\(draft.value.trim\(\)===text\)draft.value=''/);assert.match(chat,/!verified.value\|\|!active\(generation\)\|\|!currentId.value\|\|!text\|\|sending.value\|\|busy.value/);assert.match(chat,/!mobileChat\(\).*?!e.isComposing/)})
test('viewport has scoped lifetime, cleans listeners and preserves outgoing page only on ordinary route exit',()=>{assert.match(chat,/if\(!inChatRoute.value\)\{resetChatLayout\(true\)/);assert.match(chat,/resetChatLayout\(\);chatListHint.clear\(\);clearView\(\)/);assert.match(chat,/viewport\?\.dispose\(\)/);assert.match(helper,/removeEventListener\('resize',schedule\)/);assert.match(helper,/keyboardOwner===root/);assert.doesNotMatch(helper,/fetch\(|localStorage|sessionStorage|httpsCallable/)})
