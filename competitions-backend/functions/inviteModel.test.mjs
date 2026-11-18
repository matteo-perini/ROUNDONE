import test from 'node:test'
import assert from 'node:assert/strict'
import {validId,validEventId,validRecipients,activeMember,canInviteEvent,isInvitationPending,entryInviteLabel,pilotAllowed} from './inviteModel.mjs'
const event='01234567890123456789'
test('rejects invalid identifiers and duplicate/oversized recipient lists',()=>{
 assert.equal(validEventId(event),true);assert.equal(validEventId('../escape'),false)
 assert.equal(validId('user_1'),true);assert.equal(validId('user.a'),false)
 assert.equal(validRecipients(['a','a']),false);assert.equal(validRecipients(Array(36).fill('a')),false);assert.equal(validRecipients(['uid-1','uid-2']),true)
})
test('pending invited distinct from spontaneous request with same existing schema',()=>{
 assert.equal(isInvitationPending({status:'pending',athleteId:'atleta1',updatedBy:'coach1'}),true)
 assert.equal(entryInviteLabel({status:'pending',athleteId:'atleta1',updatedBy:'coach1'}),'Invitato · in attesa di risposta')
 assert.equal(entryInviteLabel({status:'pending',athleteId:'atleta1',updatedBy:'atleta1'}),null)
 assert.equal(entryInviteLabel({status:'approved',athleteId:'atleta1',updatedBy:'atleta1'}),'Partecipa')
 assert.equal(entryInviteLabel({status:'rejected',athleteId:'atleta1',updatedBy:'atleta1'}),'Non partecipa')
})
test('pilot is required and isolated by gym',()=>{
 assert.equal(pilotAllowed('gym_alpha','gym_alpha'),true)
 assert.equal(pilotAllowed('gym_alpha','gym_beta'),false)
 assert.equal(pilotAllowed('gym_alpha',undefined),false)
 assert.equal(pilotAllowed('../evil','../evil'),false)
})
test('roles and date scope fail closed',()=>{
 assert.equal(activeMember({role:'athlete',gymId:'g',membershipStatus:'active'},'g','athlete'),true)
 assert.equal(activeMember({role:'athlete',gymId:'other'},'g','athlete'),false)
 assert.equal(activeMember({role:'athlete',gymId:'g',membershipStatus:'suspended'},'g','athlete'),false)
 assert.equal(canInviteEvent({status:'published',startAt:{toMillis:()=>10000}},9000),true)
 assert.equal(canInviteEvent({status:'cancelled',startAt:{toMillis:()=>10000}},9000),false)
})
