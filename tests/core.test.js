import test from 'node:test';
import assert from 'node:assert/strict';
import { validateChatBody, buildInstructions } from '../api/chat.js';
import { HttpError, requireUuid, requireWorkspace, extractResponseText, bearer } from '../api/_lib.js';
const ID='4ead154d-fab0-469e-ae01-051efc701112';
test('request validation: approved workspace, length and ID',()=>{
 assert.deepEqual(validateChatBody({workspace:'personal',message:' hi ',conversationId:ID}),{workspace:'personal',message:'hi',conversationId:ID});
 for(const bad of [{workspace:'unknown',message:'hi'},{workspace:'legal',message:''},{workspace:'personal',message:'x'.repeat(6001)},{workspace:'personal',message:'hi',conversationId:'not-a-uuid'}]) assert.throws(()=>validateChatBody(bad),HttpError);
});
test('UUID and workspace validation',()=>{
 assert.equal(requireUuid(ID),ID);assert.equal(requireWorkspace('bridgebox'),'bridgebox');
 assert.throws(()=>requireUuid('fake'),HttpError);assert.throws(()=>requireWorkspace('../legal'),HttpError);
});
test('Bearer authentication required',()=>{
 assert.equal(bearer({headers:{authorization:'Bearer aaa.bbb.ccc'}}),'aaa.bbb.ccc');
 assert.throws(()=>bearer({headers:{}}),e=>e.status===401);
 assert.throws(()=>bearer({headers:{authorization:'Basic abc'}}),e=>e.status===401);
});
test('memory instructions only include supplied workspace notes; no execution claims',()=>{
 const text=buildInstructions('personal',[{content:'Likes concise replies'}]);
 assert.match(text,/Current workspace: personal/);assert.match(text,/Likes concise replies/);
 assert.match(text,/no computer-control or email-action tools/);
 assert.doesNotMatch(buildInstructions('legal',[]),/Likes concise replies/);
});
test('output parsing handles Responses API shape',()=>{
 assert.equal(extractResponseText({output:[{type:'message',content:[{type:'output_text',text:'Hello'}]}]}),'Hello');
 assert.equal(extractResponseText({output_text:'  ready  '}),'ready');
 assert.equal(extractResponseText({output:[]}), '');
});
