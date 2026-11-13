const el = id => document.getElementById(id);
const state = { config:null, session:null, user:null, workspace:'personal', conversationId:null, busy:false, recorder:null, stream:null, chunks:[], timer:null, installPrompt:null, voiceResponse:false };
const SESSION_KEY = 'timmy.auth.session';
const WORKSPACE_KEY = 'timmy.workspace';
const ACTIVE_KEY = 'timmy.active-conversation';
const MIN_TOKEN_LIFETIME = 60;
function show(id) { for (const area of ['app','login','setup']) el(area).hidden = area !== id; }
function toast(message) { const t = el('errorToast'); t.textContent = message; t.hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => t.hidden = true, 7000); }
function status(value) { el('status').textContent = value; }
function setBusy(value) { state.busy = value; el('sendButton').disabled = value; el('message').disabled = value; }
function setSession(s) { state.session=s; if(s) localStorage.setItem(SESSION_KEY,JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY); }
async function apiFetch(url, init={}) {
 const res=await fetch(url,{cache:'no-store',...init});
 const data=await res.json().catch(()=>({}));
 if(!res.ok) throw Error(data.error||data.msg||`Request failed (${res.status})`);
 return data;
}
async function authRequest(path, body, token) {
 const headers={'apikey':state.config.supabaseKey};
 if(body!==undefined) headers['Content-Type']='application/json';
 if(token) headers.Authorization=`Bearer ${token}`;
 const res=await fetch(`${state.config.supabaseUrl}/auth/v1/${path}`,{method:body===undefined?'GET':'POST',headers,...(body!==undefined?{body:JSON.stringify(body)}:{})});
 const data=await res.json().catch(()=>({}));
 if(!res.ok) throw Error(data.error_description||data.msg||data.message||'Sign-in failed');
 return data;
}
function saveAuthResponse(data) {
 if(!data.access_token||!data.refresh_token) throw Error('Login did not return a session');
 const expiresAt=Math.floor(Date.now()/1000)+Number(data.expires_in||3600);
 setSession({access_token:data.access_token, refresh_token:data.refresh_token, expires_at:expiresAt});
}
async function freshToken() {
 if(!state.session) throw Error('Please sign in');
 if(state.session.expires_at-Math.floor(Date.now()/1000)>MIN_TOKEN_LIFETIME) return state.session.access_token;
 try { const next=await authRequest('token?grant_type=refresh_token',{refresh_token:state.session.refresh_token}); saveAuthResponse(next); return state.session.access_token; }
 catch(e) { setSession(null); show('login'); throw Error('Session expired. Please sign in again.'); }
}
async function loadProfile() {
 const user=await authRequest('user',undefined,await freshToken());
 if(!user.id) throw Error('Invalid session');
 state.user=user; show('app');
 await loadConversations();
 const saved=localStorage.getItem(ACTIVE_KEY);
 if(saved){try { const o=JSON.parse(saved); if(o.workspace===state.workspace&&o.id) await openConversation(o.id); }catch{localStorage.removeItem(ACTIVE_KEY);} }
}
async function db(table, {query={},method='GET',body}={}) {
 const qs=new URLSearchParams(query).toString();
 const headers={'apikey':state.config.supabaseKey,Authorization:`Bearer ${await freshToken()}`};
 if(body!==undefined) headers['Content-Type']='application/json';
 if(method==='POST') headers.Prefer='return=representation';
 const res=await fetch(`${state.config.supabaseUrl}/rest/v1/${table}${qs?'?'+qs:''}`,{method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{})});
 if(!res.ok) throw Error(res.status===401?'Sign in again.':'The database request failed. Check permissions or database setup.');
 const raw=await res.text();return raw?JSON.parse(raw):[];
}
function eq(v){return `eq.${v}`;}
function closeDrawer(){el('drawer').classList.remove('open');el('backdrop').hidden=true;}
function newConversation() {state.conversationId=null;localStorage.removeItem(ACTIVE_KEY);el('chat').replaceChildren();el('chat').hidden=true;el('welcome').hidden=false;closeDrawer();highlightConversation();el('message').focus();}
function highlightConversation(){for(const node of document.querySelectorAll('.conversation-item'))node.classList.toggle('active',node.dataset.id===state.conversationId);}
async function loadConversations(){
 const data=await db('timmy_conversations',{query:{select:'id,title,workspace,updated_at',user_id:eq(state.user.id),workspace:eq(state.workspace),order:'updated_at.desc',limit:'50'}});
 const list=el('conversations');list.replaceChildren();
 if(!data.length){const item=document.createElement('p');item.textContent='No conversations yet';item.className='muted';list.append(item);return;}
 for(const c of data){const btn=document.createElement('button');btn.className='conversation-item';btn.textContent=c.title;btn.title=c.title;btn.dataset.id=c.id;btn.addEventListener('click',()=>openConversation(c.id).catch(e=>toast(e.message)));list.append(btn);}
 highlightConversation();
}
function appendBubble(role,content,pending=false){
 el('welcome').hidden=true;el('chat').hidden=false;
 const div=document.createElement('div');div.className=`bubble ${role}${pending?' loading-bubble':''}`;div.textContent=content;
 if(role==='assistant'&&!pending){const speak=document.createElement('button');speak.className='speak';speak.textContent='▶ Read aloud';speak.setAttribute('aria-label','Read answer aloud');speak.addEventListener('click',()=>speakText(content));div.append(speak);}
 el('chat').append(div);el('chat').scrollTop=el('chat').scrollHeight;return div;
}
async function openConversation(id){
 const convos=await db('timmy_conversations',{query:{select:'id',id:eq(id),workspace:eq(state.workspace),user_id:eq(state.user.id),limit:'1'}});
 if(!convos.length)throw Error('Conversation not found in this workspace');
 const messages=await db('timmy_messages',{query:{select:'role,content,created_at',conversation_id:eq(id),user_id:eq(state.user.id),order:'created_at.asc',limit:'120'}});
 state.conversationId=id;localStorage.setItem(ACTIVE_KEY,JSON.stringify({id,workspace:state.workspace}));
 el('chat').replaceChildren();el('welcome').hidden=messages.length>0;el('chat').hidden=messages.length===0;
 for(const m of messages)appendBubble(m.role,m.content);
 closeDrawer();highlightConversation();
}
async function sendMessage(text){
 const message=text.trim();if(!message||state.busy)return;setBusy(true);el('message').value='';el('message').style.height='auto';
 appendBubble('user',message);const pending=appendBubble('assistant','Thinking…',true);status('● Thinking');
 try {
  const data=await apiFetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await freshToken()}`},body:JSON.stringify({workspace:state.workspace,conversationId:state.conversationId,message})});
  pending.remove();appendBubble('assistant',data.reply);state.conversationId=data.conversationId;
  localStorage.setItem(ACTIVE_KEY,JSON.stringify({id:state.conversationId,workspace:state.workspace}));
  await loadConversations().catch(()=>{});
  if(state.voiceResponse)speakText(data.reply);
 } catch(e) {pending.remove();toast(e.message);el('message').value=message;}
 finally {setBusy(false);status(navigator.onLine?'● Ready':'● Offline');}
}
function speakText(text){
 if(!('speechSynthesis'in window)){toast('Voice playback is not supported in this browser.');return;}
 speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text.slice(0,3500));utterance.rate=1.02;utterance.pitch=1; speechSynthesis.speak(utterance);
}
async function listMemories(){const items=await db('timmy_memories',{query:{select:'id,content,created_at',user_id:eq(state.user.id),workspace:eq(state.workspace),order:'created_at.desc',limit:'80'}});const list=el('memoryList');list.replaceChildren();if(!items.length){const p=document.createElement('p');p.textContent='No memories saved in this workspace.';list.append(p);}
 for(const item of items){const card=document.createElement('div');card.className='memory-item';card.textContent=item.content;const del=document.createElement('button');del.textContent='Delete memory';del.addEventListener('click',async()=>{try{await db('timmy_memories',{method:'DELETE',query:{id:eq(item.id),user_id:eq(state.user.id)}});await listMemories();}catch(e){toast(e.message);}});card.append(del);list.append(card);}}
async function startRecording(){
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw Error('Microphone recording is not supported here.');
 const mime=['audio/mp4','audio/webm','audio/ogg'].find(type=>MediaRecorder.isTypeSupported(type));
 const stream=await navigator.mediaDevices.getUserMedia({audio:true});state.stream=stream;state.chunks=[];
 const rec=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);state.recorder=rec;rec.addEventListener('dataavailable',e=>{if(e.data.size)state.chunks.push(e.data);});rec.addEventListener('stop',()=>finishRecording(rec.mimeType).catch(e=>toast(e.message)));
 rec.start();el('micButton').classList.add('recording');el('voiceStatus').textContent='Recording… tap mic to stop';state.timer=setTimeout(()=>rec.state==='recording'&&rec.stop(),30000);
}
async function finishRecording(mime){
 clearTimeout(state.timer);el('micButton').classList.remove('recording');el('voiceStatus').textContent='Transcribing voice…';
 state.stream?.getTracks().forEach(t=>t.stop());state.stream=null;state.recorder=null;
 try {const blob=new Blob(state.chunks,{type:mime});state.chunks=[];if(!blob.size)return;if(blob.size>4_200_000)throw Error('Recording too large. Keep it under 30 seconds.');
  const buffer=await blob.arrayBuffer();const bytes=new Uint8Array(buffer);let str='';for(let i=0;i<bytes.length;i+=16384){str+=String.fromCharCode(...bytes.subarray(i,i+16384));}
  const audio=btoa(str);const data=await apiFetch('/api/transcribe',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await freshToken()}`},body:JSON.stringify({audio,mime:mime.split(';')[0]})});
  if(data.text){state.voiceResponse=true;await sendMessage(data.text);}else toast('No speech detected.');
 } finally {el('voiceStatus').textContent='Tap mic to speak · No background listening';}
}
async function init(){
 try {state.config=await apiFetch('/api/config');} catch(e){show('setup');el('setupMessage').textContent=e.message;return;}
 state.workspace=localStorage.getItem(WORKSPACE_KEY)||'personal';
 if(!Array.from(el('workspace').options).some(o=>o.value===state.workspace))state.workspace='personal';
 el('workspace').value=state.workspace;el('workspaceLabel').textContent=state.workspace.replaceAll('_',' ').toUpperCase()+' WORKSPACE';
 const hash=new URLSearchParams(location.hash.slice(1));
 if(hash.get('access_token')&&hash.get('refresh_token')){saveAuthResponse({access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token'),expires_in:hash.get('expires_in')});history.replaceState(null,'',location.pathname);}
 else if(hash.get('error_description')){show('login');el('loginStatus').textContent=hash.get('error_description');history.replaceState(null,'',location.pathname);return;}
 else {try{const saved=JSON.parse(localStorage.getItem(SESSION_KEY));if(saved?.access_token&&saved?.refresh_token)setSession(saved);}catch{setSession(null);}}
 if(state.session){try{await loadProfile();}catch(e){setSession(null);show('login');el('loginStatus').textContent='Please sign in again.';}}else show('login');
 if('serviceWorker'in navigator)navigator.serviceWorker.register('/service-worker.js').catch(()=>{});
}
el('loginForm').addEventListener('submit',async e=>{e.preventDefault();const email=el('email').value.trim();el('loginStatus').textContent='Sending sign-in code…';
 try{await authRequest('otp?redirect_to='+encodeURIComponent(location.origin),{email,create_user:false});el('loginStatus').textContent='If your email has access, you will receive a code or sign-in link.';el('codeForm').hidden=false;el('otp').focus();}
 catch(err){el('loginStatus').textContent=err.message;}
});
el('codeForm').addEventListener('submit',async e=>{e.preventDefault();el('loginStatus').textContent='Verifying code…';try{const session=await authRequest('verify',{email:el('email').value.trim(),token:el('otp').value.trim(),type:'email'});saveAuthResponse(session);await loadProfile();}catch(err){el('loginStatus').textContent=err.message;}});
el('menuButton').addEventListener('click',()=>{el('drawer').classList.add('open');el('backdrop').hidden=false;});el('closeDrawer').addEventListener('click',closeDrawer);el('backdrop').addEventListener('click',closeDrawer);
el('newChat').addEventListener('click',newConversation);
el('workspace').addEventListener('change',async e=>{if(state.busy){e.target.value=state.workspace;return;}state.workspace=e.target.value;localStorage.setItem(WORKSPACE_KEY,state.workspace);el('workspaceLabel').textContent=e.target.selectedOptions[0].text.toUpperCase()+' WORKSPACE';newConversation();await loadConversations().catch(err=>toast(err.message));});
el('sendButton').addEventListener('click',()=>sendMessage(el('message').value));
el('message').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage(el('message').value);}});
el('message').addEventListener('input',e=>{e.target.style.height='auto';e.target.style.height=Math.min(e.target.scrollHeight,150)+'px';});
for(const s of document.querySelectorAll('.suggestions button'))s.addEventListener('click',()=>{el('message').value=s.textContent.replace(/↗/g,'').trim();el('message').focus();});
el('micButton').addEventListener('click',async()=>{if(state.recorder){if(state.recorder.state==='recording')state.recorder.stop();return;}if(state.busy)return;try{await startRecording();}catch(e){toast(e.message);state.stream?.getTracks().forEach(t=>t.stop());}});
el('memoryButton').addEventListener('click',async()=>{closeDrawer();el('memoryDialog').showModal();try{await listMemories();}catch(e){toast(e.message);}});
el('closeMemory').addEventListener('click',()=>el('memoryDialog').close());
el('memoryForm').addEventListener('submit',async e=>{e.preventDefault();const content=el('memoryText').value.trim();if(!content)return;try{await db('timmy_memories',{method:'POST',body:{user_id:state.user.id,workspace:state.workspace,source:'user_explicit',content}});el('memoryText').value='';await listMemories();}catch(err){toast(err.message);}});
el('installButton').addEventListener('click',()=>{closeDrawer();el('installDialog').showModal();});el('closeInstall').addEventListener('click',()=>el('installDialog').close());
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.installPrompt=e;el('nativeInstall').hidden=false;});
el('nativeInstall').addEventListener('click',async()=>{if(state.installPrompt){await state.installPrompt.prompt();state.installPrompt=null;el('nativeInstall').hidden=true;}});
el('signOut').addEventListener('click',async()=>{const token=state.session?.access_token;setSession(null);state.user=null;state.conversationId=null;closeDrawer();show('login');el('loginStatus').textContent='You have signed out.';if(token){fetch(`${state.config.supabaseUrl}/auth/v1/logout`,{method:'POST',headers:{apikey:state.config.supabaseKey,Authorization:`Bearer ${token}`}}).catch(()=>{});} });
window.addEventListener('online',()=>status('● Ready'));window.addEventListener('offline',()=>status('● Offline'));
init().catch(e=>{show('setup');el('setupMessage').textContent=e.message;});
