import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeVerifiedGoogle,existingLinkedUser} from '../model.mjs'
const google={sub:'a_google_identity_123',email:'test@example.com',email_verified:true}
const identity=normalizeVerifiedGoogle(google)
const record={uid:'existingUid1',email:'test@example.com',emailVerified:true,disabled:false,providerData:[{providerId:'google.com',uid:google.sub}]}
const profile={email:'test@example.com',role:'athlete',gymId:'gym_existing_1',membershipStatus:'active'}
test('verifica email Google obbligatoria',()=>{assert.equal(normalizeVerifiedGoogle({...google,email_verified:false}),null);assert.equal(normalizeVerifiedGoogle(google).email,'test@example.com')})
test('account esistente e provider Google stesso sub',()=>assert.equal(existingLinkedUser(record,identity,profile,true),true))
test('rifiuta utenti senza provider o con sub diverso',()=>{assert.equal(existingLinkedUser({...record,providerData:[]},identity,profile,true),false);assert.equal(existingLinkedUser(record,{...identity,googleSub:'DIFFERENT'},profile,true),false)})
test('rifiuta profili mancanti o disattivi',()=>{assert.equal(existingLinkedUser(record,identity,null,true),false);assert.equal(existingLinkedUser(record,identity,{...profile,membershipStatus:'revoked'},true),false)})
test('rifiuta palestra mancante o indirizzi diversi',()=>{assert.equal(existingLinkedUser(record,identity,profile,false),false);assert.equal(existingLinkedUser({...record,email:'other@example.com'},identity,profile,true),false)})
test('rifiuta utenti Auth disabilitati o non verificati',()=>{assert.equal(existingLinkedUser({...record,disabled:true},identity,profile,true),false);assert.equal(existingLinkedUser({...record,emailVerified:false},identity,profile,true),false)})
test('rifiuta account non Coach/Atleta',()=>assert.equal(existingLinkedUser(record,identity,{...profile,role:'platform'},true),false))
