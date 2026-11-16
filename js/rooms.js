/* ============================================================
   КОМНАТЫ ПРОСЛУШИВАНИЯ
   общий синхронный плеер + чат, куда кидают треки и голосуют
   данные живут в отдельном лёгком узле firebase: oomy__rooms/<id>
   локальная копия — oomy.hide__rooms (в общий мир не уезжает)
   ============================================================ */
const ROOMS_KEY='oomy.hide__rooms';
const ROOMS_NODE='oomy__rooms';
const ROOM_MAX_CHAT=80;
let roomsOpenId=null, roomsTimer=null, roomsTick=0, roomsAudioOn=false;
let roomsPickOpen=false, roomsPickQ='', roomsPeekTs=0, roomsSig='';

let roomsCache=(function(){
  try{
    const v=JSON.parse(localStorage.getItem(ROOMS_KEY)||'{}');
    if(v&&typeof v==='object'&&v.rooms&&typeof v.rooms==='object')return v;
  }catch(e){}
  return {rooms:{}};
})();
function roomsLocalSave(){try{localStorage.setItem(ROOMS_KEY,JSON.stringify(roomsCache))}catch(e){}}
function rid(p){return (p||'x')+Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
function roomsNodeURL(id){
  const root=cloudRoot();if(!root)return '';
  const base=root.slice(0,-5)+ROOMS_NODE;
  return base+(id?('/'+encodeURIComponent(id)):'')+'.json';
}
function roomsList(){
  return Object.keys(roomsCache.rooms||{}).map(id=>roomsCache.rooms[id]).filter(r=>r&&r.id).sort((a,b)=>(b.ts||0)-(a.ts||0));
}
function roomsGet(id){return (roomsCache.rooms||{})[id]||null}
function roomMembers(r){
  const now=Date.now(),m=(r&&r.members)||{};
  return Object.keys(m).filter(u=>now-((m[u]&&m[u].ts)||0)<90000);
}
function roomVotes(q){return q&&q.votes?Object.keys(q.votes).filter(u=>q.votes[u]).length:0}
function roomHost(r){return !!(r&&me&&(r.by===me.user||isAdmin()))}
function roomsMerge(a,b){
  if(!a)return b;
  if(!b)return a;
  const out=Object.assign({},a,b);
  out.ts=Math.max(a.ts||0,b.ts||0);
  const mm=Object.assign({},a.members||{});
  Object.keys(b.members||{}).forEach(u=>{if(((b.members[u]&&b.members[u].ts)||0)>=((mm[u]&&mm[u].ts)||0))mm[u]=b.members[u];});
  out.members=mm;
  const qm=new Map();
  (a.queue||[]).concat(b.queue||[]).forEach(q=>{
    if(!q||!q.qid)return;
    const prev=qm.get(q.qid);
    if(!prev)qm.set(q.qid,q);
    else qm.set(q.qid,Object.assign({},prev,q,{votes:Object.assign({},prev.votes||{},q.votes||{})}));
  });
  out.queue=Array.from(qm.values()).sort((x,y)=>roomVotes(y)-roomVotes(x)||(x.ts||0)-(y.ts||0)).slice(0,40);
  const cm=new Map();
  (a.chat||[]).concat(b.chat||[]).forEach(c=>{
    if(!c||!c.cid)return;
    const prev=cm.get(c.cid);
    if(!prev)cm.set(c.cid,c);
    else cm.set(c.cid,Object.assign({},prev,c,{votes:Object.assign({},prev.votes||{},c.votes||{})}));
  });
  out.chat=Array.from(cm.values()).sort((x,y)=>(x.ts||0)-(y.ts||0)).slice(-ROOM_MAX_CHAT);
  const ac=a.cur,bc=b.cur;
  if(!ac)out.cur=bc||null;
  else if(!bc)out.cur=ac;
  else out.cur=((bc.startedAt||0)>=(ac.startedAt||0))?bc:ac;
  return out;
}
async function roomsPullAll(silent){
  const url=roomsNodeURL();if(!url)return false;
  try{
    const r=await cloudFetch(url);
    if(!r.ok)return false;
    const data=await r.json();
    if(!data||typeof data!=='object')return false;
    Object.keys(data).forEach(id=>{
      const rem=data[id];
      if(!rem||typeof rem!=='object')return;
      rem.id=rem.id||id;
      roomsCache.rooms[id]=roomsMerge(roomsCache.rooms[id],rem);
    });
    roomsLocalSave();
    if(!silent&&window.__PG==='rooms'){renderRooms();roomsSyncAudio();}
    return true;
  }catch(e){return false}
}
async function roomsPullOne(id){
  const url=roomsNodeURL(id);if(!url)return false;
  try{
    const r=await cloudFetch(url);
    if(!r.ok)return false;
    const rem=await r.json();
    if(!rem||typeof rem!=='object')return false;
    rem.id=rem.id||id;
    roomsCache.rooms[id]=roomsMerge(roomsCache.rooms[id],rem);
    roomsLocalSave();
    return true;
  }catch(e){return false}
}
async function roomsPush(id){
  const url=roomsNodeURL(id);if(!url)return false;
  let r=roomsGet(id);if(!r)return false;
  try{
    /* перед записью забираем свежее состояние: так чужие сообщения и треки,
       прилетевшие между опросами, не затираются нашей копией */
    try{
      const cur=await cloudFetch(url);
      if(cur.ok){
        const rem=await cur.json();
        if(rem&&typeof rem==='object'){
          rem.id=rem.id||id;
          r=roomsMerge(r,rem);
          roomsCache.rooms[id]=r;
          roomsLocalSave();
        }
      }
    }catch(e){}
    const res=await cloudFetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(r)});
    return res.ok;
  }catch(e){return false}
}
function roomsSyncStart(){
  roomsSyncStop();
  roomsPullAll();
  roomsTimer=setInterval(async()=>{
    if(window.__PG!=='rooms'){roomsSyncStop();return;}
    roomsTick++;
    try{
      if(roomsOpenId){
        await roomsPullOne(roomsOpenId);
        if(roomsTick%4===0)await roomsHeartbeat(roomsOpenId);
        roomsSyncAudio();
      }else if(roomsTick%3===0){
        await roomsPullAll(true);
      }
    }catch(e){}
    if(window.__PG==='rooms')renderRooms(true);
  },2600);
}
function roomsSyncStop(){
  if(roomsTimer){clearInterval(roomsTimer);roomsTimer=null;}
}
async function roomsHeartbeat(id){
  const r=roomsGet(id);
  if(!r||!me||!me.user||me.guest)return;
  r.members=r.members||{};
  const prev=r.members[me.user];
  if(prev&&Date.now()-((prev.ts)||0)<12000)return;
  r.members[me.user]={ts:Date.now(),ava:me.ava||'🐈',n:(prof()||{}).dn||me.user};
  const keep={};
  Object.keys(r.members).forEach(u=>{if(Date.now()-((r.members[u]&&r.members[u].ts)||0)<90000)keep[u]=r.members[u];});
  r.members=keep;
  roomsLocalSave();
  await roomsPush(id);
}
function roomsPeek(){
  if(Date.now()-roomsPeekTs<45000)return;
  roomsPeekTs=Date.now();
  roomsPullAll(true).then(ok=>{
    if(!ok)return;
    const t=document.getElementById('homeRooms');
    if(!t)return;
    const live=roomsList().filter(r=>roomMembers(r).length);
    const sub=t.querySelector('span');
    if(sub)sub.textContent=live.length?live.length+' в эфире — заходи и слушай вместе':'слушаем треки вместе · чат и голосование за треки';
  });
}
/* ---- отрисовка ---- */
function roomCoverHTML(tid,name,coverMid){
  const t=(tracksAll()||[]).find(x=>x.id===tid)||(tracksAll()||[]).find(x=>x.name===name);
  if(t)return coverHTMLFor(t);
  if(coverMid){
    const u=mediaURL(coverMid);
    if(u)return '<img src="'+esc(u)+'" alt="">';
  }
  return '🎵';
}
function roomsTeaserHTML(){
  const list=roomsList();
  const live=list.filter(r=>roomMembers(r).length);
  return `<div class="rooms-teaser" id="homeRooms">
    <div class="rt-ico"><svg class="mi" style="width:20px;height:20px"><use href="#i-rooms"/></svg></div>
    <div style="min-width:0"><b>комнаты прослушивания</b><span>${live.length?live.length+' в эфире — заходи и слушай вместе':'слушаем треки вместе · чат и голосование за треки'}</span></div>
    <span class="rt-go">зайти →</span>
  </div>`;
}
function roomsCardHTML(r){
  const mem=roomMembers(r).length;
  const q=(r.queue||[]).length;
  const cur=r.cur;
  return `<div class="room-card" data-room="${esc(r.id)}">
    <div class="room-card-top">
      <div class="room-card-ico"><svg class="mi" style="width:19px;height:19px"><use href="#i-rooms"/></svg></div>
      <div style="min-width:0;flex:1">
        <div class="room-card-name">${esc(r.name||'комната')}</div>
        <div class="room-card-sub">создал ${userLink(r.by||'—')} · ${mem} слушают</div>
      </div>
    </div>
    <div class="room-now">
      <div class="rc">${cur?roomCoverHTML(cur.tid,cur.name,cur.coverMid):'🎧'}</div>
      <div style="min-width:0;flex:1"><b>${cur?esc(cur.name):'пока тихо'}</b><span>${cur?(cur.artist?esc(cur.artist):'в эфире'):'кинь первый трек'}</span></div>
      ${cur?'<span class="eq3"><i></i><i></i><i></i><i></i></span>':''}
    </div>
    <div class="room-card-foot">
      <span class="room-live"><i></i>${mem?mem+' в комнате':'свободно'}</span>
      ${q?'<span>'+q+' в очереди</span>':''}
      <span style="margin-left:auto;color:var(--acc);font-weight:800">войти →</span>
    </div>
  </div>`;
}
function roomsQueueHTML(r){
  const q=(r.queue||[]).slice().sort((a,b)=>roomVotes(b)-roomVotes(a)||(a.ts||0)-(b.ts||0));
  if(!q.length)return '<div class="from-line" style="padding:2px 0">очередь пустая — нажми «+ трек» в чате</div>';
  const host=roomHost(r);
  return q.map((x,i)=>`<div class="room-q">
    <span class="from-line" style="width:14px;text-align:center;font-weight:800">${i+1}</span>
    <div class="qc">${roomCoverHTML(x.tid,x.name,x.coverMid)}</div>
    <div class="qm"><b>${esc(x.name||'трек')}</b><span>${x.artist?esc(x.artist)+' · ':''}кинул ${esc(x.by||'—')}</span></div>
    <button class="room-vote ${x.votes&&x.votes[me.user]?'on':''}" data-rvote="${esc(x.qid)}" title="голос за трек">▲ ${roomVotes(x)}</button>
    ${host?`<button class="minibtn" data-rnext="${esc(x.qid)}" style="padding:4px 9px">поставить</button>`:''}
  </div>`).join('');
}
function roomsChatHTML(r){
  const list=(r.chat||[]).slice(-ROOM_MAX_CHAT);
  if(!list.length)return '<div class="from-line" style="padding:4px 2px">тут пока тихо. напиши мяу или кинь трек ♫</div>';
  return list.map(c=>{
    const mine=me&&me.user&&c.u===me.user;
    const av=c.ava||((encLoad(LS.acc,{})[c.u]||{}).ava)||'🐈';
    return `<div class="room-msg${mine?' me':''}">
      <div class="ra" data-gu="${esc(c.u)}">${avaHTML(c.u,av)}</div>
      <div class="room-msg-mid">
        <div class="room-msg-name"><b style="${nickStyle(c.u)}">${esc(c.u)}</b><span>${timeAgo(c.ts||Date.now())}</span></div>
        ${c.text?`<div class="room-msg-text">${linkify(c.text)}</div>`:''}
        ${c.type==='track'?`<div class="room-trackmsg">
          <div class="qc">${roomCoverHTML(c.tid,c.name,c.coverMid)}</div>
          <div class="tm"><b>${esc(c.name||'трек')}</b><span>${c.artist?esc(c.artist):'oomy music'}</span></div>
          <button class="room-vote ${c.votes&&c.votes[me.user]?'on':''}" data-rvote="${esc(c.qid||'')}" title="голос за трек">▲ ${roomVotes(c)}</button>
        </div>`:''}
      </div>
    </div>`;
  }).join('');
}
function roomsPickHTML(){
  const q=roomsPickQ.trim().toLowerCase();
  const list=(tracksAll()||[]).filter(t=>t&&t.origin==='local'&&(!t.priv||isMyTrack(t)))
    .filter(t=>!q||String(t.name||'').toLowerCase().includes(q)||String(t.artist||'').toLowerCase().includes(q)).slice(0,40);
  return `<div class="room-pick">
    <input id="roomPickQ" placeholder="найди трек в oomy music…" value="${esc(roomsPickQ)}" autocomplete="off">
    <div class="room-pick-list">${list.map(t=>`<div class="room-pick-item" data-rtrack="${esc(t.id)}">
      <div class="qc">${coverHTMLFor(t)}</div>
      <div style="min-width:0;flex:1"><b>${esc(t.name||'трек')}</b><span>${esc(t.artist||'—')} · ${fmtT(t.dur)}</span></div>
      <span style="color:var(--acc);font-weight:800">+</span>
    </div>`).join('')||'<div class="from-line" style="padding:6px">ничего не нашлось</div>'}</div>
  </div>`;
}
function roomsRoomView(r){
  const mem=roomMembers(r).length;
  const host=roomHost(r);
  const cur=r.cur;
  const elapsed=cur?Math.max(0,Math.floor((Date.now()-(cur.startedAt||Date.now()))/1000)):0;
  return `<div class="room-shell">
    <div class="room-main">
      <div class="room-head">
        <button class="minibtn" id="roomBack">← комнаты</button>
        <div class="room-title">${esc(r.name||'комната')}</div>
        <span class="room-live"><i></i><span data-room-members>${mem}</span> слушают</span>
        <span class="from-line" style="margin-left:auto">создал ${userLink(r.by||'—')}</span>
      </div>
      <div class="room-card-box">
        <div class="room-stage">
          <div class="room-bigcover" data-room-cover>${cur?roomCoverHTML(cur.tid,cur.name,cur.coverMid):'🎧'}</div>
          <div class="room-stage-mid">
            <div class="room-stage-label">сейчас в комнате</div>
            <div class="room-stage-name" data-room-cur>${cur?esc(cur.name):'пока тихо'}</div>
            <div class="room-stage-artist" data-room-artist>${cur?(cur.artist?esc(cur.artist):'oomy music'):'кинь первый трек — начнём вместе'}</div>
            <div class="room-stage-actions">
              <button class="room-listen ${roomsAudioOn?'':'off'}" id="roomListen">${roomsAudioOn?'⏸ пауза':'▶ слушать вместе'}</button>
              <span class="room-clock" data-room-clock>${cur?'в эфире '+fmtT(elapsed):'тишина'}</span>
              <button class="minibtn" id="roomNext" ${host?'':'disabled style="opacity:.45;cursor:not-allowed"'} title="${host?'поставить трек из очереди':'переключает хозяин комнаты'}">следующий</button>
            </div>
          </div>
        </div>
        <div class="room-panel">
          <h4>очередь · голосуй за трек</h4>
          <div class="room-queue" id="roomQueue">${roomsQueueHTML(r)}</div>
        </div>
      </div>
    </div>
    <div class="room-chat">
      <div class="room-chat-head">💬 чат комнаты <span class="room-live"><i></i>live</span>
        <button class="minibtn" id="roomAddTrack" style="margin-left:auto" ${me&&me.guest?'disabled style="opacity:.45"':''}>+ трек</button>
      </div>
      <div class="room-chat-body" id="roomChatBody">${roomsChatHTML(r)}</div>
      <div id="roomPickSlot">${roomsPickOpen?roomsPickHTML():''}</div>
      <div class="room-chat-inp">
        <button class="room-ico-btn" id="roomPickBtn" title="кинуть трек" ${me&&me.guest?'disabled style="opacity:.45"':''}>♫</button>
        <input id="roomMsg" maxlength="200" placeholder="${me&&me.guest?'гостям писать нельзя — заведи аккаунт':'напиши в комнату…'}" ${me&&me.guest?'disabled':''}>
        <button class="room-ico-btn go" id="roomSend" ${me&&me.guest?'disabled style="opacity:.45"':''}>↑</button>
      </div>
    </div>
  </div>`;
}
function renderRooms(light){
  const box=document.getElementById('pg-rooms');
  if(!box)return;
  if(light){
    /* тихое обновление: не трогаем поле ввода и прокрутку целиком */
    const live=boxes=>{};
    if(roomsOpenId){
      const r=roomsGet(roomsOpenId);
      if(!r)return;
      const sig=JSON.stringify({q:r.queue,c:r.chat,cur:r.cur,m:roomMembers(r).length});
      if(sig===roomsSig)return;
      roomsSig=sig;
      const mem=box.querySelector('[data-room-members]');if(mem)mem.textContent=roomMembers(r).length;
      const cur=box.querySelector('[data-room-cur]');if(cur)cur.textContent=r.cur?r.cur.name:'пока тихо';
      const art=box.querySelector('[data-room-artist]');if(art)art.textContent=r.cur?(r.cur.artist||'oomy music'):'кинь первый трек — начнём вместе';
      const cov=box.querySelector('[data-room-cover]');
      if(cov){const html=r.cur?roomCoverHTML(r.cur.tid,r.cur.name,r.cur.coverMid):'🎧';if(cov.innerHTML!==html)cov.innerHTML=html;}
      const q=box.querySelector('#roomQueue');if(q)q.innerHTML=roomsQueueHTML(r);
      const body=box.querySelector('#roomChatBody');
      if(body){
        const near=body.scrollHeight-body.scrollTop-body.clientHeight<80;
        body.innerHTML=roomsChatHTML(r);
        if(near)body.scrollTop=body.scrollHeight;
      }
      const lbtn=box.querySelector('#roomListen');
      if(lbtn){lbtn.textContent=roomsAudioOn?'⏸ пауза':'▶ слушать вместе';lbtn.classList.toggle('off',!roomsAudioOn);}
      wireRoomParts(box);
    }else{
      const sig=JSON.stringify(roomsList().map(r=>[r.id,r.ts,roomMembers(r).length,r.cur&&r.cur.tid]));
      if(sig===roomsSig)return;
      roomsSig=sig;
      const grid=box.querySelector('#roomsGrid');
      if(grid){
        const list=roomsList();
        grid.innerHTML=list.length?list.map(roomsCardHTML).join(''):'<div class="room-empty" style="grid-column:1/-1">комнат пока нет. создай первую — и позови своих 🎧</div>';
        wireRoomParts(box);
      }
    }
    return;
  }
  roomsSig='';
  if(roomsOpenId){
    const r=roomsGet(roomsOpenId);
    if(!r){roomsOpenId=null;renderRooms();return;}
    box.innerHTML=roomsRoomView(r);
    wireRoomParts(box);
    const body=box.querySelector('#roomChatBody');
    if(body)body.scrollTop=body.scrollHeight;
    return;
  }
  const list=roomsList();
  box.innerHTML=`<div class="rooms-hero">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <h2><span class="eq3"><i></i><i></i><i></i><i></i></span>комнаты прослушивания</h2>
        <span class="room-live"><i></i>${list.filter(r=>roomMembers(r).length).length} в эфире</span>
      </div>
      <p>одна комната — один трек для всех. кидай музыку в чат, голосуй ▲ за лучшую, и слушайте вместе. работает и на телефоне, и на ПК — в реальном времени.</p>
      <div class="rooms-create">
        <input id="roomName" maxlength="32" placeholder="название комнаты, например «ночной phonk»" ${me&&me.guest?'disabled':''}>
        <button class="dan-btn" id="roomCreate" ${me&&me.guest?'disabled style="opacity:.5"':''}>создать комнату</button>
        <button class="minibtn" id="roomsRefresh">обновить</button>
      </div>
    </div>
    <div class="rooms-grid" id="roomsGrid">${list.length?list.map(roomsCardHTML).join(''):'<div class="room-empty" style="grid-column:1/-1">комнат пока нет. создай первую — и позови своих 🎧</div>'}</div>`;
  wireRoomParts(box);
  roomsSig=JSON.stringify(list.map(r=>[r.id,r.ts,roomMembers(r).length,r.cur&&r.cur.tid]));
}
function wireRoomParts(box){
  const back=box.querySelector('#roomBack');if(back)back.onclick=roomsLeave;
  box.querySelectorAll('[data-room]').forEach(c=>c.onclick=e=>{if(e.target.closest('[data-gu]'))return;roomsOpen(c.dataset.room);});
  box.querySelectorAll('[data-gu]').forEach(el=>el.onclick=()=>openUserPage(el.dataset.gu));
  const cr=box.querySelector('#roomCreate');
  if(cr)cr.onclick=roomsCreate;
  const rm=box.querySelector('#roomsRefresh');
  if(rm)rm.onclick=()=>{toast('обновляю комнаты…');roomsPullAll().then(renderRooms);};
  const listen=box.querySelector('#roomListen');
  if(listen)listen.onclick=roomsToggleListen;
  const next=box.querySelector('#roomNext');
  if(next)next.onclick=()=>roomsNext(false);
  const add=box.querySelector('#roomAddTrack');
  if(add)add.onclick=()=>roomsTogglePick(true);
  const pick=box.querySelector('#roomPickBtn');
  if(pick)pick.onclick=()=>roomsTogglePick(!roomsPickOpen);
  const send=box.querySelector('#roomSend');
  if(send)send.onclick=roomsSendMsg;
  const inp=box.querySelector('#roomMsg');
  if(inp)inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();roomsSendMsg();}});
  const pq=box.querySelector('#roomPickQ');
  if(pq){
    pq.addEventListener('input',()=>{
      roomsPickQ=pq.value;
      const slot=box.querySelector('#roomPickSlot');
      if(slot){slot.innerHTML=roomsPickHTML();wireRoomParts(box);const q2=box.querySelector('#roomPickQ');if(q2){q2.focus();q2.setSelectionRange(q2.value.length,q2.value.length);}}
    });
    pq.focus();
  }
  box.querySelectorAll('[data-rtrack]').forEach(el=>el.onclick=()=>roomsAddTrack(el.dataset.rtrack));
  box.querySelectorAll('[data-rvote]').forEach(b=>b.onclick=()=>roomsVote(b.dataset.rvote));
  box.querySelectorAll('[data-rnext]').forEach(b=>b.onclick=()=>roomsNext(true,b.dataset.rnext));
}
/* ---- действия ---- */
function roomsCreate(){
  if(!me||me.guest){toast('гостю комнату не создать — заведи аккаунт');return;}
  const inp=document.getElementById('roomName');
  const name=(inp&&inp.value.trim())||'комната '+((prof()||{}).dn||me.user);
  const id=rid('rm');
  const r={id:id,name:name.slice(0,32),by:me.user,ts:Date.now(),cur:null,queue:[],chat:[],members:{}};
  r.members[me.user]={ts:Date.now(),ava:me.ava||'🐈',n:(prof()||{}).dn||me.user};
  roomsCache.rooms[id]=r;
  roomsLocalSave();
  roomsOpen(id);
  roomsPush(id);
  toast('комната создана — кинь первый трек ♫');
}
function roomsOpen(id){
  const r=roomsGet(id);
  if(!r){toast('комната не нашлась — обнови список');return;}
  roomsOpenId=id;roomsPickOpen=false;roomsPickQ='';roomsAudioOn=false;
  roomsLocalSave();
  renderRooms();
  window.scrollTo({top:0,behavior:'smooth'});
  roomsHeartbeat(id);
  roomsPullOne(id).then(()=>{if(roomsOpenId===id)renderRooms();});
  if(!roomsTimer)roomsSyncStart();
}
function roomsLeave(){
  roomsOpenId=null;roomsPickOpen=false;roomsPickQ='';roomsAudioOn=false;
  renderRooms();
  roomsPullAll(true).then(()=>{if(window.__PG==='rooms'&&!roomsOpenId)renderRooms();});
}
function roomsSendMsg(){
  const r=roomsGet(roomsOpenId);if(!r)return;
  if(!me||me.guest){toast('гостям писать нельзя');return;}
  const inp=document.getElementById('roomMsg');
  const t=(inp&&inp.value.trim())||'';
  if(!t)return;
  r.chat=r.chat||[];
  r.chat.push({cid:rid('c'),u:me.user,ava:me.ava||'🐈',text:t.slice(0,200),ts:Date.now(),votes:{}});
  r.chat=r.chat.slice(-ROOM_MAX_CHAT);
  r.ts=Date.now();
  if(inp)inp.value='';
  roomsLocalSave();
  renderRooms(true);
  roomsPush(roomsOpenId).then(()=>roomsPullOne(roomsOpenId)).then(r2=>{
    if(r2&&roomsOpenId===r.id)renderRooms(true);
  });
}
function roomsTogglePick(on){
  roomsPickOpen=!!on;
  if(roomsPickOpen)roomsPickQ='';
  const slot=document.getElementById('roomPickSlot');
  if(slot){slot.innerHTML=roomsPickOpen?roomsPickHTML():'';wireRoomParts(document.getElementById('pg-rooms'));}
}
function roomsAddTrack(tid){
  const r=roomsGet(roomsOpenId);if(!r)return;
  if(!me||me.guest){toast('гостям треки не кинуть');return;}
  const t=(tracksAll()||[]).find(x=>x.id===tid);
  if(!t){toast('трек не нашёлся');return;}
  const qid=rid('q');
  r.queue=r.queue||[];
  r.queue.push({qid:qid,tid:t.id,name:t.name,artist:t.artist||'',coverMid:t.coverMid||null,by:me.user,ts:Date.now(),votes:{}});
  r.queue[r.queue.length-1].votes[me.user]=1;
  r.chat=r.chat||[];
  r.chat.push({cid:rid('c'),u:me.user,ava:me.ava||'🐈',text:'кинул трек',type:'track',qid:qid,tid:t.id,name:t.name,artist:t.artist||'',coverMid:t.coverMid||null,ts:Date.now(),votes:{}});
  r.chat[r.chat.length-1].votes[me.user]=1;
  r.chat=r.chat.slice(-ROOM_MAX_CHAT);
  if(!r.cur){
    /* первый трек сразу в эфир */
    r.cur={tid:t.id,name:t.name,artist:t.artist||'',coverMid:t.coverMid||null,startedAt:Date.now(),by:me.user};
    r.queue=r.queue.filter(x=>x.qid!==qid);
  }
  r.ts=Date.now();
  roomsPickOpen=false;roomsPickQ='';
  roomsLocalSave();
  renderRooms();
  toast(me.user===r.by?'трек в эфире':'трек в очереди — голосуй ▲');
  roomsPush(roomsOpenId).then(()=>roomsPullOne(roomsOpenId)).then(()=>{if(roomsOpenId)renderRooms(true);});
}
function roomsVote(qid){
  if(!qid)return;
  const r=roomsGet(roomsOpenId);if(!r)return;
  if(!me||me.guest){toast('гостям голосовать нельзя');return;}
  const q=(r.queue||[]).find(x=>x.qid===qid);
  if(q){
    q.votes=q.votes||{};
    if(q.votes[me.user])delete q.votes[me.user];else q.votes[me.user]=1;
  }
  (r.chat||[]).forEach(c=>{
    if(c.type==='track'&&c.qid===qid){
      c.votes=c.votes||{};
      if(c.votes[me.user])delete c.votes[me.user];else c.votes[me.user]=1;
    }
  });
  r.ts=Date.now();
  roomsLocalSave();
  renderRooms(true);
  roomsPush(roomsOpenId);
}
function roomsNext(force,qid){
  const r=roomsGet(roomsOpenId);if(!r)return;
  if(!roomHost(r)&&!force){toast('переключает хозяин комнаты — а ты голосуй ▲');return;}
  if(!roomHost(r)){toast('переключает хозяин комнаты');return;}
  const queue=(r.queue||[]).slice().sort((a,b)=>roomVotes(b)-roomVotes(a)||(a.ts||0)-(b.ts||0));
  const pick=qid?queue.find(x=>x.qid===qid):queue[0];
  if(!pick){toast('в очереди пока пусто');return;}
  r.cur={tid:pick.tid,name:pick.name,artist:pick.artist||'',coverMid:pick.coverMid||null,startedAt:Date.now(),by:me.user};
  r.queue=(r.queue||[]).filter(x=>x.qid!==pick.qid);
  r.ts=Date.now();
  roomsLocalSave();
  renderRooms();
  if(roomsAudioOn)roomPlayCurrent(true);
  roomsPush(roomsOpenId).then(()=>roomsPullOne(roomsOpenId)).then(()=>{if(roomsOpenId)renderRooms(true);});
}
function roomsToggleListen(){
  if(roomsAudioOn){roomsAudioOn=false;try{pausePlayer()}catch(e){}renderRooms();return;}
  if(!me||me.guest){toast('гостю можно слушать — просто нажми ещё раз');}
  roomsAudioOn=true;
  roomPlayCurrent(true);
  renderRooms();
}
function roomPlayCurrent(seek){
  const r=roomsGet(roomsOpenId);
  if(!r||!r.cur){roomsAudioOn=false;toast('в комнате пока нет трека');return;}
  const t=(tracksAll()||[]).find(x=>x.id===r.cur.tid)||(tracksAll()||[]).find(x=>x.name===r.cur.name);
  if(!t){roomsAudioOn=false;toast('этого трека нет в библиотеке устройства');return;}
  const offset=Math.max(0,(Date.now()-(r.cur.startedAt||Date.now()))/1000);
  if(player.currentId!==t.id){
    try{playQueueFrom(t.id);}catch(e){}
    setTimeout(()=>{
      try{player.audio.currentTime=Math.min(offset,Math.max(0,(player.audio.duration||offset)-.6));}catch(e){}
      try{seekFill();syncPlayerUI();}catch(e){}
    },650);
  }else{
    try{player.audio.currentTime=Math.min(offset,Math.max(0,(player.audio.duration||offset)-.6));}catch(e){}
    if(!player.playing){try{player.audio.play();player.playing=true;}catch(e){}}
    try{seekFill();syncPlayerUI();}catch(e){}
  }
}
/* если трек в комнате сменился или уехал по времени — подтягиваем звук */
function roomsSyncAudio(){
  if(!roomsAudioOn||!roomsOpenId)return;
  const r=roomsGet(roomsOpenId);
  if(!r||!r.cur){roomsAudioOn=false;return;}
  const offset=(Date.now()-(r.cur.startedAt||Date.now()))/1000;
  if(player.currentId!==r.cur.tid){
    roomPlayCurrent(true);
    return;
  }
  if(player.audio&&Math.abs((player.audio.currentTime||0)-offset)>8){
    try{player.audio.currentTime=Math.min(offset,Math.max(0,(player.audio.duration||offset)-.6));}catch(e){}
  }
  /* хозяин комнаты автоматически ставит следующий, когда трек закончился */
  if(roomHost(r)&&r.cur.startedAt&&player.dur&&Date.now()-(r.cur.startedAt)>player.dur*1000+2500){
    if((r.queue||[]).length)roomsNext(true);
  }
}
/* вернулись на вкладку/телефон — сразу подтягиваем свежее, не ждём опроса */
document.addEventListener('visibilitychange',()=>{
  try{
    if(document.hidden||window.__PG!=='rooms')return;
    if(roomsOpenId)roomsPullOne(roomsOpenId).then(()=>{renderRooms(true);roomsSyncAudio();});
    else roomsPullAll().then(()=>renderRooms(true));
  }catch(e){}
});
/* часы комнаты тикают даже между опросами */
setInterval(()=>{
  if(window.__PG!=='rooms'||!roomsOpenId)return;
  const r=roomsGet(roomsOpenId);if(!r||!r.cur)return;
  const el=document.querySelector('[data-room-clock]');
  if(el)el.textContent='в эфире '+fmtT(Math.max(0,Math.floor((Date.now()-(r.cur.startedAt||Date.now()))/1000)));
},1000);
/* открыли сайт сразу на комнатах: app.js успел вызвать go('rooms') до загрузки нас,
   поэтому дорисовываем и запускаем синхронизацию здесь */
if(window.__PG==='rooms'){
  try{renderRooms();roomsSyncStart();}catch(e){}
}
