import test from 'node:test'
import assert from 'node:assert/strict'
import {NATIVE_UPDATE_CHECK_MS,NATIVE_UPDATE_RETRY_MS,NATIVE_UPDATE_SNOOZE_MS,versionParts,isNewerAndroidVersion,permittedApkUrl,safeNewAndroidRelease,selectAndroidRelease,isSnoozed,makeUpdateGate,rateLimitUntil} from '../src/features/release/nativeUpdatePolicy.ts'
const url=tag=>`https://github.com/matteo-perini/ROUNDONE/releases/download/${tag}/LionFit.apk`
const release=(tag,extra={})=>({tag_name:tag,draft:false,prerelease:false,assets:[{name:'LionFit.apk',state:'uploaded',browser_download_url:url(tag)}],...extra})
test('numeric version, not lexicographic',()=>{assert.equal(isNewerAndroidVersion('v0.31.10','0.31.9'),true);assert.equal(isNewerAndroidVersion('v0.31.2','0.31.2'),false);assert.equal(isNewerAndroidVersion('v0.31.1','0.31.2'),false)})
test('reject dates and non-numeric tags',()=>{assert.equal(versionParts('2026-11-14'),null);assert.equal(versionParts('v0.31.3-beta'),null)})
test('android prefix allowed',()=>assert.equal(isNewerAndroidVersion('android-v0.31.3','0.31.2'),true))
test('highest valid APK regardless of API order',()=>assert.deepEqual(selectAndroidRelease([release('v0.31.2'),release('v0.31.10'),release('v0.31.3')],'0.31.1'),{kind:'available',candidate:{tag:'v0.31.10',url:url('v0.31.10')}}))
test('skip draft, prerelease and unrelated tags',()=>assert.equal(selectAndroidRelease([release('v1.0.0',{draft:true}),release('v2.0.0',{prerelease:true}),release('web-2026'),release('v0.31.3')],'0.31.2').candidate.tag,'v0.31.3'))
test('skip newer releases without APK when older valid update exists',()=>assert.equal(selectAndroidRelease([release('v0.31.4',{assets:[]}),release('v0.31.3')],'0.31.2').candidate.tag,'v0.31.3'))
test('newer release missing asset is error not current',()=>assert.equal(selectAndroidRelease([release('v0.31.3',{assets:[]})],'0.31.2').kind,'error'))
test('asset not uploaded or wrong name is rejected',()=>{for(const asset of [{name:'LionFit.apk',state:'new',browser_download_url:url('v0.31.3')},{name:'release.apk',state:'uploaded',browser_download_url:url('v0.31.3')}])assert.equal(safeNewAndroidRelease(release('v0.31.3',{assets:[asset]}),'0.31.2'),null)})
test('different tag URL rejected',()=>assert.equal(safeNewAndroidRelease(release('v0.31.3',{assets:[{name:'LionFit.apk',state:'uploaded',browser_download_url:url('v0.31.2')}]}),'0.31.2'),null))
test('only expected HTTPS repo and asset',()=>{assert.equal(permittedApkUrl(url('v0.31.3')),true);for(const s of [url('v0.31.3').replace('https:','http:'),url('v0.31.3').replace('github.com','evil.com'),url('v0.31.3').replace('ROUNDONE','other'),url('v0.31.3')+'?a=1',url('v0.31.3')+'#x'])assert.equal(permittedApkUrl(s),false)})
test('malformed payload, unknown installed version and empty list',()=>{assert.equal(selectAndroidRelease({},'0.31.2').kind,'error');assert.equal(selectAndroidRelease([],'0.31.2').kind,'error');assert.equal(selectAndroidRelease([release('v0.31.3')],'unknown').kind,'error')})
test('same and older releases report current',()=>assert.deepEqual(selectAndroidRelease([release('v0.31.2'),release('v0.31.1')],'0.31.2'),{kind:'current'}))
test('new process always starts with due check',()=>{const g=makeUpdateGate();g.record(1000,true);assert.equal(g.due(1001),false);assert.equal(makeUpdateGate().due(1001),true)})
test('success throttles exactly 30 min',()=>{const g=makeUpdateGate();g.record(1000,true);assert.equal(g.due(1000+NATIVE_UPDATE_CHECK_MS-1),false);assert.equal(g.due(1000+NATIVE_UPDATE_CHECK_MS),true);assert.equal(NATIVE_UPDATE_CHECK_MS,1800000)})
test('network error retry after five min',()=>{const g=makeUpdateGate();g.record(1000,false);assert.equal(g.due(1000+NATIVE_UPDATE_RETRY_MS-1),false);assert.equal(g.due(1000+NATIVE_UPDATE_RETRY_MS),true)})
test('snooze four hours, missing and future values ignored',()=>{assert.equal(NATIVE_UPDATE_SNOOZE_MS,14400000);assert.equal(isSnoozed(1000,1001),true);assert.equal(isSnoozed(1000,1000+NATIVE_UPDATE_SNOOZE_MS),false);assert.equal(isSnoozed(0,1000),false);assert.equal(isSnoozed(2000,1000),false)})
test('rate limit backoff fallback and headers',()=>{const now=1000000;assert.equal(rateLimitUntil(now,null,null),now+1800000);assert.equal(rateLimitUntil(now,'60',null),now+61000);assert.equal(rateLimitUntil(now,null,'1200'),1201000);assert.equal(rateLimitUntil(now,'99999',null),now+3600000)})
