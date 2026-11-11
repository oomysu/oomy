/* ============ ХРАНИЛИЩЕ + ШИФРОВАНИЕ ============ */
const LS={acc:'oomy.avault',logs:'oomy.lvault',posts:'oomy.posts',sess:'oomy.session',theme:'oomy.theme',
          profile:'oomy.profileX',chats:'oomy.chatsX',chatRead:'oomy.chatRead',notifsRead:'oomy.notifsRead',
          media:'oomy.media',tracks:'oomy.tracks',playlists:'oomy.playlists',accent:'oomy.accent',groups:'oomy.groups',
          stories:'oomy.storiesX',storySeen:'oomy.storySeen',wallet:'oomy.wallet',gifts:'oomy.gifts',
          clicks:'oomy.clicks',quests:'oomy.quests',keys:'oomy.keys',props:'oomy.giftProps',
          catalog:'oomy.giftCat',refs:'oomy.refs',wcount:'oomy.wcount',notifsD:'oomy.notifsD',
          notifSeen:'oomy.notifSeen',feedSeen:'oomy.feedSeen',buyHist:'oomy.buyHist',giftChain:'oomy.giftChain',mkt:'oomy.mkt',wins:'oomy.wins',
          friends:'oomy.friends',freq:'oomy.friendReq',bookmarks:'oomy.bookmarks',seen:'oomy.seen',
          visitors:'oomy.visitors',daily:'oomy.daily',blocks:'oomy.blocks',cloud:'oomy.cloud',tomb:'oomy.tomb'};
const ADMIN='oomy'; /* аккаунт главного администратора */
const XKEY='пушистый-ключ-neko-2026-厚い猫';
const load=(k,d)=>{try{const r=localStorage.getItem(k);return r===null?d:JSON.parse(r)}catch(e){return d}};
const save=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){saveWarn(v)}try{mirrorPut(k,v)}catch(e){}if(k!==LS.posts&&k!==LS.media)saveWarn(v);try{cloudPush(k)}catch(e){}};
let saveWarned=false;
function saveWarn(v){try{const s=JSON.stringify(v);if(s.length>3.5e6&&!saveWarned){saveWarned=true;toast('хранилище под завязку удали тяжёлые треки/файлы');}}catch(e){}}
/* ============ ОБЛАКО: общий мир через бесплатный firebase ============ */
/* у всех одна лента, общие аккаунты и чаты; без облака — у каждого свой мир */
var cloudReady=false;
function cloudURL(){try{return (localStorage.getItem(LS.cloud)||'').trim()}catch(e){return ''}}
function cloudRoot(){const u=cloudURL().replace(/\.json(\?.*)?$/,'');return /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(u)?u+'.json':''}
function cloudEnabled(){return !!cloudRoot()}
const rtN=k=>k.replace(/\./g,'__'); /* firebase не любит точки в ключах */
const CVKEY='oomy.vers'; /* карта версий: кто что менял */
let cloudOK=false,cloudErr='',cloudLast=0,cloudTimer=null,cloudPushT={},cloudKnown=null,cloudVisHook=false;
function cloudKnownGet(){if(!cloudKnown){try{cloudKnown=JSON.parse(localStorage.getItem('oomy.versKnown')||'{}')||{}}catch(e){cloudKnown={}}}return cloudKnown}
function cloudKnownSet(k,v){cloudKnownGet()[k]=v;try{localStorage.setItem('oomy.versKnown',JSON.stringify(cloudKnown))}catch(e){}}
function cloudStatus(){return {on:cloudEnabled(),url:cloudURL(),ok:cloudOK,err:cloudErr,last:cloudLast}}
function cloudFetch(url,opt){
  const ac=new AbortController();const t=setTimeout(()=>ac.abort(),9000);
  return fetch(url,Object.assign({cache:'no-store',signal:ac.signal},opt||{})).finally(()=>clearTimeout(t));
}
/* --- объединение данных: своё + чужое, без потери записей --- */
function unionById(a,b,tk){
  const m=new Map();
  a.concat(b).forEach(it=>{if(it&&typeof it==='object'&&it.id!==undefined)m.set(''+it.id,it);});
  let out=Array.from(m.values());
  if(tk){ /* надгробия: удалённое не воскресает */
    const tb=load(LS.tomb,{});
    out=out.filter(it=>{const ts=tb[tk+'/'+it.id];return !(ts&&((it.ts||0)<ts));});
  }
  return out;
}
function mergeVal(a,b,tk){
  if(Array.isArray(a)||Array.isArray(b)){
    if(Array.isArray(a)&&Array.isArray(b)&&a.length&&a[0]&&typeof a[0]==='object'&&a[0].id!==undefined)return unionById(a,b,tk);
    return b; /* остальное: на сервере всегда свежее */
  }
  if(a&&b&&typeof a==='object'&&typeof b==='object'){
    const out=Object.assign({},a);
    Object.keys(b).forEach(k=>{out[k]=(k in a)?mergeVal(a[k],b[k]):b[k];});
    return out;
  }
  return b;
}
function mergeCloud(k,remoteStr){
  if(remoteStr===null||remoteStr===undefined||remoteStr==='')return false;
  if(cloudExclKey(k))return false;
  let cur;try{cur=localStorage.getItem(k)}catch(e){return false}
  if(cur===remoteStr)return false;
  let R;try{R=JSON.parse(remoteStr)}catch(e){return false}
  if(cur===null){try{localStorage.setItem(k,remoteStr)}catch(e){return false}return true;}
  let L;try{L=JSON.parse(cur)}catch(e){try{localStorage.setItem(k,remoteStr)}catch(e){}return true;}
  if(R===null)return false;
  let m;try{m=mergeVal(L,R,k)}catch(e){return false}
  if(m===null||m===undefined)return false;
  let out;try{out=JSON.stringify(m)}catch(e){return false}
  if(out===cur)return false;
  try{localStorage.setItem(k,out)}catch(e){return false}
  return true;
}
function cloudExclKey(k){return [LS.sess,LS.theme,LS.accent,LS.cloud,'oomy.versKnown'].includes(k)}
/* --- забрать всё с сервера (первое подключение, проверка) --- */
async function cloudPullAll(){
  const root=cloudRoot();if(!root)return 0;
  try{
    const r=await cloudFetch(root);
    if(!r.ok){cloudOK=false;cloudErr='сервер ответил '+r.status;return 0;}
    const data=await r.json();
    cloudOK=true;cloudErr='';cloudLast=Date.now();
    if(!data||typeof data!=='object')return 0;
    let n=0;
    const vers=data[rtN(CVKEY)]||{};
    Object.keys(data).forEach(rk=>{
      if(rk===rtN(CVKEY))return;
      if(mergeCloud('oomy.'+rk.slice(6),data[rk]))n++;
    });
    Object.keys(vers).forEach(rk=>{cloudKnownSet('oomy.'+rk.slice(6),vers[rk]||0);});
    return n;
  }catch(e){cloudOK=false;cloudErr=(e&&e.name==='AbortError')?'сервер не отвечает':String(e&&e.message||e);return 0;}
}
/* --- лёгкая проверка «что изменилось» по карте версий --- */
async function cloudPoll(){
  const root=cloudRoot();if(!root)return 0;
  const vurl=root.slice(0,-5)+'/'+rtN(CVKEY)+'.json';
  try{
    const r=await cloudFetch(vurl);
    if(!r.ok){cloudOK=false;cloudErr='сервер ответил '+r.status;return 0;}
    const vers=await r.json();
    cloudOK=true;cloudErr='';cloudLast=Date.now();
    if(!vers||typeof vers!=='object')return 0;
    const kn=cloudKnownGet();
    const changed=[];
    Object.keys(vers).forEach(rk=>{
      const k='oomy.'+rk.slice(6);
      if(cloudExclKey(k))return;
      if((vers[rk]||0)>(kn[k]||0))changed.push(k);
    });
    if(changed.includes(LS.tomb)&&!changed.includes(LS.posts))changed.push(LS.posts);
    if(!changed.length)return 0;
    let n=0;
    await Promise.all(changed.map(async k=>{
      try{
        const r2=await cloudFetch(root.slice(0,-5)+'/'+rtN(k)+'.json');
        if(r2.ok){
          const v=await r2.json();
          if(mergeCloud(k,v)){n++;cloudKnownSet(k,vers[rtN(k)]||0);}
          else cloudKnownSet(k,vers[rtN(k)]||0);
        }
      }catch(e){}
    }));
    return n;
  }catch(e){cloudOK=false;cloudErr=(e&&e.name==='AbortError')?'сервер не отвечает':String(e&&e.message||e);return 0;}
}
/* --- отправить свой ключ на сервер (с отложкой, чтобы не спамить) --- */
function cloudPush(k){
  if(!cloudReady)return;
  if(cloudExclKey(k))return;
  clearTimeout(cloudPushT[k]);
  cloudPushT[k]=setTimeout(()=>{
    const root=cloudRoot();if(!root)return;
    let v;try{v=localStorage.getItem(k)}catch(e){return}
    if(v===null)return;
    if(v.length>8e6){cloudErr='ключ '+k+' слишком большой для облака';return;}
    const stamp=Date.now();
    const body={};body[rtN(k)]=v;body[rtN(CVKEY)]={};body[rtN(CVKEY)][rtN(k)]=stamp;
    cloudKnownSet(k,stamp);
    cloudFetch(root,{method:'PATCH',body:JSON.stringify(body)}).then(r=>{
      if(r.ok){cloudOK=true;cloudErr='';cloudLast=Date.now();}else{cloudOK=false;cloudErr='сервер ответил '+r.status;}
    }).catch(e=>{cloudOK=false;cloudErr=(e&&e.name==='AbortError')?'сервер не отвечает':String(e&&e.message||e);});
  },700);
}
/* --- надгробие для удалённых записей --- */
function tombAdd(kind,id){const t=load(LS.tomb,{});t[kind+'/'+id]=Date.now();save(LS.tomb,t);}
/* --- обновить экран, когда с сервера что-то пришло --- */
function cloudRefresh(){
  try{
    if(!me||!window.__PG)return;
    const ae=document.activeElement;
    if(ae&&/INPUT|TEXTAREA/.test(ae.tagName))return;
    if(['feed','home','notifs','bm','friends','groups'].includes(window.__PG)){buildPage(window.__PG);syncBadges();}
    else if(window.__PG==='msgs'&&openChatName)openChat(openChatName);
  }catch(e){}
}
function cloudStart(){
  if(!cloudEnabled()){if(cloudTimer){clearInterval(cloudTimer);cloudTimer=null;}return;}
  if(cloudTimer)clearInterval(cloudTimer);
  cloudPullAll().then(n=>{if(n)cloudRefresh();});
  cloudTimer=setInterval(async()=>{if(document.hidden)return;const n=await cloudPoll();if(n)cloudRefresh();},8000);
  if(!cloudVisHook){
    cloudVisHook=true;
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden||!cloudTimer)return;
      cloudPoll().then(n=>{if(n)cloudRefresh();});
    });
  }
}
function cloudRestart(){
  if(cloudTimer){clearInterval(cloudTimer);cloudTimer=null;}
  cloudKnown=null;
  try{localStorage.removeItem('oomy.versKnown')}catch(e){}
  cloudStart();
}
function copyText(t){
  const fb=()=>{const ta=document.createElement('textarea');ta.value=t;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy')}catch(e){}ta.remove();};
  try{if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t).catch(fb);else fb();}catch(e){fb();}
}
cloudReady=true;
function toast(msg){
  const box=document.getElementById('toast');
  if(!box)return;
  const t=document.createElement('div');t.className='toast-item';t.textContent=msg;
  box.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';t.style.transition='opacity .3s';setTimeout(()=>t.remove(),320);},10000);
  while(box.children.length>6)box.firstChild.remove();
}
function encSave(k,obj){
  const bytes=new TextEncoder().encode(JSON.stringify(obj));
  for(let i=0;i<bytes.length;i++)bytes[i]^=XKEY.charCodeAt(i%XKEY.length)%256;
  let bin='';for(const b of bytes)bin+=String.fromCharCode(b);
  save(k,{v:2,d:btoa(bin)});
}
function encLoad(k,dflt){
  const raw=load(k,null);
  if(!raw)return dflt;
  if(raw&&raw.v===2&&typeof raw.d==='string'){
    try{
      const bin=atob(raw.d);
      const bytes=new Uint8Array(bin.length);
      for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i)^(XKEY.charCodeAt(i%XKEY.length)%256);
      return JSON.parse(new TextDecoder().decode(bytes));
    }catch(e){return dflt}
  }
  return raw;
}
const now=()=>new Date().toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
function timeAgo(ts){const s=Math.floor((Date.now()-ts)/1000);if(s<60)return 'только что';if(s<3600)return Math.floor(s/60)+' мин назад';if(s<86400)return Math.floor(s/3600)+' ч назад';return new Date(ts).toLocaleDateString('ru-RU',{day:'numeric',month:'short'})}
function addLog(type,user,detail){
  const logs=encLoad(LS.logs,[]);
  logs.unshift({t:new Date().toISOString(),shown:now(),type,user,detail});
  encSave(LS.logs,logs.slice(0,800));
}
function esc(s){const d=document.createElement('i');d.textContent=s;return d.innerHTML;}
const rnd=a=>a[Math.floor(Math.random()*a.length)];
const fmtT=s=>{s=Math.max(0,Math.floor(s||0));return Math.floor(s/60)+':'+('0'+(s%60)).slice(-2)};

/* миграция */
(function migrate(){
  [['oomy.accounts',LS.acc],['oomy.chats',LS.chats],['oomy.logs',LS.logs]].forEach(([oldK,newK])=>{
    const raw=localStorage.getItem(oldK);
    if(raw){try{
      const o=JSON.parse(raw);
      if(o&&!o.v){ /* сливаем старые записи в зашифрованное хранилище, не затирая существующие */
        const cur=encLoad(newK,{});
        const merged=Object.assign(cur,o);
        encSave(newK,merged);
      }
    }catch(e){}}
    localStorage.removeItem(oldK);
  });
})();

/* главный администратор: @oomy — создаётся один раз, всегда админ, с галочкой */
(function seedAdmin(){
  const accs=encLoad(LS.acc,{});
  let changed=false;
  if(!accs[ADMIN]){
    accs[ADMIN]={pass:btoa('oomy07062008'),ava:'👑',createdAt:'день основания',lastLogin:null,admin:true};
    changed=true;
  }
  if(!accs[ADMIN].admin){accs[ADMIN].admin=true;changed=true;}
  if(changed)encSave(LS.acc,accs);
  /* у создателя всегда толстый кошелёк */
  const w=load(LS.wallet,{});
  if(w[ADMIN]===undefined){w[ADMIN]=10000;save(LS.wallet,w);}
})();
const isAdmin=()=>!!(me&&!me.guest&&me.user===ADMIN);
function adminBadgeHTML(){return isAdmin()||true?'<span class="admin-badge" title="аккаунт главного администратора создателя">✔</span>':''}
/* по имени автора — админ ли (для постов, чатов, поисковых строк) */
function userIsAdmin(u){return u===ADMIN}
function badgeFor(u){return userIsAdmin(u)?'<span class="admin-badge" title="аккаунт главного администратора создателя">✔</span>':''}

/* ============ ООНЕТКИ (валюта oomy) ============ */
const wallet=()=>load(LS.wallet,{});
const myOon=()=>{if(!me||me.guest)return 0;const w=wallet();return w[me.user]||0};
function addOon(n){if(!me||me.guest)return;const w=wallet();w[me.user]=(w[me.user]||0)+n;save(LS.wallet,w);refreshOonChip();}
function takeOon(n){if(myOon()<n){toast('оонеток не хватает');return false}addOon(-n);return true}
function refreshOonChip(){
  const c=document.getElementById('oonChip');
  if(!c)return;
  if(me&&!me.guest){c.classList.remove('hidden');c.innerHTML='<b>'+myOon()+'</b> оонеток';}
  else c.classList.add('hidden');
}

/* ============ МЕДИА ============ */
function putMedia(fileOrData,cb){
  const fin=id=>{addLog('media','—','файл сохранён ('+id.slice(0,10)+')');cb&&cb(id)};
  if(typeof fileOrData==='string'){const id=putMediaData(fileOrData);fin(id);return}
  const r=new FileReader();
  r.onload=()=>{const id=putMediaData(r.result);fin(id)};
  r.readAsDataURL(fileOrData);
}
function putMediaData(dataURL){
  const m=load(LS.media,{});
  const id='m'+Date.now().toString(36)+Math.floor(Math.random()*999);
  m[id]=dataURL;
  try{localStorage.setItem(LS.media,JSON.stringify(m))}catch(e){toast('файл слишком толстый для хранилища');return null}
  return id;
}
function mediaURL(id){const m=load(LS.media,{});return m[id]||null}
function readFile(f,cb){const r=new FileReader();r.onload=()=>cb(r.result);r.readAsDataURL(f);}

/* большое аудио (mp3 с SoundCloud) живёт в IndexedDB — там места много */
const IDB={p:null,open(){return this.p||(this.p=new Promise((res,rej)=>{const q=indexedDB.open('oomy-media',1);q.onupgradeneeded=()=>{try{q.result.createObjectStore('files')}catch(e){}};q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)}))},
  async put(k,blob){const db=await this.open();return new Promise((res,rej)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').put(blob,k);tx.oncomplete=()=>res(k);tx.onerror=()=>rej(tx.error)})},
  async get(k){const db=await this.open();return new Promise((res,rej)=>{const q=db.transaction('files').objectStore('files').get(k);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})}
};
/* ЗЕРКАЛО ХРАНИЛИЩА: каждый ключ дублируется в IndexedDB.
   Если браузер/обновление кода сбросило localStorage — всё восстанавливается автоматически. */
async function mirrorPut(k,v){
  try{
    if(typeof v!=='string')v=JSON.stringify(v);
    await IDB.put('kv:'+k,v);
  }catch(e){}
}
async function mirrorGet(k){
  const v=await IDB.get('kv:'+k);
  if(v===null||v===undefined)return null;
  try{return JSON.parse(v)}catch(e){return v}
}
async function restoreFromMirror(){
  let restored=0;
  for(const k of Object.values(LS)){
    if(localStorage.getItem(k)===null){
      try{
        const v=await mirrorGet(k);
        if(v!==null&&v!==undefined){localStorage.setItem(k,JSON.stringify(v));restored++;}
      }catch(e){}
    }
  }
  return restored;
}
function clipVideo(v){
  v.addEventListener('loadedmetadata',()=>{if(v.duration>5){v.addEventListener('timeupdate',()=>{if(v.currentTime>5)v.currentTime=0})}});
}
function avaHTML(user,fallbackEmoji){
  const av=(profOf(user)||{}).avatar;
  if(av&&av.type==='media'&&av.mid){
    const u=mediaURL(av.mid);
    if(u){
      if(av.kind==='video'){return '<video src="'+u+'" autoplay muted loop playsinline style="width:100%;height:100%;object-fit:cover" onloadedmetadata="clipVideo(this)"></video>'}
      return '<img src="'+u+'">';
    }
  }else if(av&&av.type==='emoji')fallbackEmoji=av.val;
  return (fallbackEmoji||'🐈');
}

/* оонетки: без картинки-монеты, только текст */
function oonReady(cb){try{cb(null)}catch(e){}}
function oonImg(){return ''}
function flushOon(){try{refreshOonChip()}catch(e){}}
/* ============ ООНЕТКИ (валюта oomy) ============ */


/* ============ УВЕДОМЛЕНИЯ ДИНАМИЧНЫЕ: ключи, переводы, подарки ============ */
function pushNotif(u,ic,t){
  if(!u||u==='котик-гость'||u==='гость-читатель')return;
  const n=load(LS.notifsD,{});
  (n[u]=n[u]||[]).unshift({ic,t,ts:Date.now()});
  n[u]=n[u].slice(0,50);
  save(LS.notifsD,n);
  pushBrowser('oomy',ic+' '+t,u);
}
/* push-уведомления браузера: прилетают, когда сайт свёрнут */
function pushBrowser(title,body,u){
  try{
    if(!('Notification' in window)||Notification.permission!=='granted')return;
    if(!document.hidden)return;
    const p=u?profOf(u):prof();
    if(!p||!p.push)return;
    const n=new Notification(title,{body:body,tag:'oomy-'+(u||'')});
    n.onclick=()=>{try{window.focus();n.close();}catch(e){}};
  }catch(e){}
}

/* ============ НЕДЕЛЬНЫЕ СЧЁТЧИКИ (для заданий) ============ */
const QUEST_DEFS=[
  {id:'like20',t:'Получи 20 лайков от других котиков на свои записи',d:'Лайки на твои записи этой недели. Новые и связанные аккаунты не считаются.',target:20,r:500,key:'likes'},
  {id:'cmt5',t:'Оставь 5 комментариев к чужим записям',d:'Под разными записями, от одного автора — не больше 3.',target:5,r:200,key:'cmts'},
  {id:'like10',t:'Получи 10 лайков от других котиков',d:'На записи этой недели, от разных людей.',target:10,r:250,key:'likes'},
  {id:'trk10',t:'Прослушай 10 треков в oomy music',d:'Разные треки, свои не считаются.',target:10,r:600,key:'trks'},
  {id:'up3',t:'Выложи 3 записи в ленту',d:'Любые свои записи этой недели.',target:3,r:150,key:'posts'}
];
function pnlStorage(){
  const all=load(LS.wcount,{});
  const d=new Date();d.setDate(d.getDate()-((d.getDay()+6)%7));d.setHours(0,0,0,0);
  if(all.wk!==d.getTime()){all.wk=d.getTime();all.users={};save(LS.wcount,all);}
  return all;
}
function wcMe(){
  const all=pnlStorage();
  const u=me?all.users[me.user]:null;
  return u||{likes:0,cmts:0,posts:0,upl:0,trks:{},claimed:{}};
}
function wcSave(u){const all=load(LS.wcount,{});if(!all.wk){pnlStorage();}const al=pnlStorage();al.users[me.user]=u;save(LS.wcount,al);}
function bumpLike(author){
  if(!me||me.guest||author===me.user)return;
  let all=pnlStorage();const u=all.users[me.user]=all.users[me.user]||{likes:0,cmts:0,posts:0,upl:0,trks:{},claimed:{}};
  u.likes=(u.likes||0)+1;save(LS.wcount,all);
}
function bumpCmt(author){
  if(!me||me.guest||author===me.user)return;
  let all=pnlStorage();const u=all.users[me.user]=all.users[me.user]||{likes:0,cmts:0,posts:0,upl:0,trks:{},claimed:{}};
  u.cmts=(u.cmts||0)+1;save(LS.wcount,all);
}
function bumpListen(trackId,byArtist){
  if(!me||me.guest)return;
  if(byArtist&&byArtist==='@'+me.user)return;
  let all=pnlStorage();const u=all.users[me.user]=all.users[me.user]||{likes:0,cmts:0,posts:0,upl:0,trks:{},claimed:{}};
  if(!u.trks[trackId]){u.trks[trackId]=1;save(LS.wcount,all);}
}
function bumpUpload(){
  if(!me||me.guest)return;
  let all=pnlStorage();const u=all.users[me.user]=all.users[me.user]||{likes:0,cmts:0,posts:0,upl:0,trks:{},claimed:{}};
  u.upl=(u.upl||0)+1;save(LS.wcount,all);
}
function bumpPost(){
  if(!me||me.guest)return;
  let all=pnlStorage();const u=all.users[me.user]=all.users[me.user]||{likes:0,cmts:0,posts:0,upl:0,trks:{},claimed:{}};
  u.posts=(u.posts||0)+1;save(LS.wcount,all);
}
function weekResetIn(){
  const d=new Date();const base=new Date(d);base.setDate(d.getDate()+(8-d.getDay())%7||7-((d.getDay()+6)%7)-1); /* понедельник */
  const nm=new Date(d);const days=(7-((d.getDay()+6)%7))%7||7;
  nm.setDate(d.getDate()+days);nm.setHours(0,0,0,0);
  const ms=nm-d.getTime();
  const h=Math.floor(ms/3600000);
  return h+' '+(h===1?'час':(h<5?'часа':'часов'));
}
function questClaim(qid){
  const all=pnlStorage();const u=all.users[me.user]||(all.users[me.user]={likes:0,cmts:0,posts:0,upl:0,trks:{},claimed:{}});
  const q=QUEST_DEFS.find(x=>x.id===qid);
  if(!q)return;
  const prog=q.key==='likes'?(u.likes||0):q.key==='cmts'?(u.cmts||0):q.key==='posts'?(u.posts||0):(Object.keys(u.trks||{}).length);
  u.claimed=u.claimed||{};
  if(u.claimed[qid]){toast('уже получено');return;}
  if(prog<q.target){toast('задание ещё не выполнено');return;}
  u.claimed[qid]=true;
  save(LS.wcount,all);
  addOon(q.r);
  pushNotif(me.user,'🏅','Задание выполнено: «'+q.t+'» — +'+q.r+' оонеток');
  addLog('quest',me.user,'выполнил задание: '+q.t+' (+'+q.r+')');
  toast('+'+q.r+' оонеток за задание!');
  if(window.__PG==='gifts'&&giftTab==='q'){renderGifts();refreshOonChip();}
}

/* ============ КОПИЛКА ============ */
const CLICK_CAP=676767,CLICKS_PER=5;
const dayKey=()=>{const d=new Date();return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2)};
function clickStats(){return load(LS.clicks,{})}
function myClickStats(){
  const s=me&&!me.guest?clickStats()[me.user]:null;
  const base={todayN:0,total:0,earned:0,today:dayKey()};
  if(!s)return base;
  return Object.assign(base,s,{todayN:s.today===dayKey()?s.todayN:0});
}
function coinClick(ev,wrap){
  if(me&&me.guest){toast('гостям нельзя копить, зарегайся');return;}
  const all=clickStats();
  let s=all[me.user]||{todayN:0,total:0,earned:0,today:dayKey()};
  if(s.today!==dayKey())s.todayN=0,s.today=dayKey();
  if(s.todayN>=CLICK_CAP){toast('дневной лимит выкликан ('+CLICK_CAP+'). приходи завтра!');renderGifts();return;}
  s.todayN++;s.total++;
  const got=s.todayN%CLICKS_PER===0;
  if(got){s.earned=(s.earned||0)+1;addOon(1);}
  all[me.user]=s;
  save(LS.clicks,all);
  /* плавающий +1 */
  const pl=document.createElement('span');pl.className='kp-plus';pl.textContent='+1';
  const r=wrap.getBoundingClientRect();
  pl.style.left=Math.max(6,Math.min(r.width-30,(ev.clientX-r.left)-10))+'px';
  pl.style.top=Math.max(0,(ev.clientY-r.top)-34)+'px';
  wrap.appendChild(pl);setTimeout(()=>pl.remove(),1000);
  const coin=wrap.querySelector('.kp-coin');
  if(coin){coin.style.transform='scale(.92) rotate(-3deg)';setTimeout(()=>coin.style.transform='',110);}
  /* живое обновление цифр */
  const set=(id,txt)=>{const el=document.getElementById(id);if(el)el.innerHTML=txt};
  set('kpDay','Сегодня '+s.todayN+' из '+CLICK_CAP+' кликов');
  /* шкала: 5 делений заполняются золотым за каждый клик */
  const bar=document.getElementById('kpBar');
  if(bar){
    const k=s.todayN%CLICKS_PER;
    bar.querySelectorAll('.kp-seg').forEach((seg,i)=>seg.classList.toggle('fill',i<k));
    const lab=document.getElementById('kpSegLab');if(lab)lab.textContent=k+' из 5';
  }
  set('kpBal',myOon());
  set('kpToday',s.todayN+' из '+CLICK_CAP);
  set('kpTot',s.total);
  set('kpEarn',s.earned);
  const streakEl=document.getElementById('kpStreak');
  if(streakEl)streakEl.textContent=dailyInfo().streak;
  if(got)toast('+1 оонетка в копилку!');
}

/* ежедневный бонус и стрик */
function dailyInfo(){
  const d=load(LS.daily,{})[me&&me.user||'']||{last:'',streak:0};
  return {last:d.last||'',streak:d.streak||0,today:dayKey(),claimed:d.last===dayKey()};
}
function claimDaily(){
  if(!me||me.guest){toast('гостям бонус не положен — зарегайся');return;}
  const all=load(LS.daily,{});
  const d=all[me.user]||{last:'',streak:0};
  if(d.last===dayKey()){toast('бонус уже забран — приходи завтра');return;}
  const y=new Date();y.setDate(y.getDate()-1);
  const yk=y.getFullYear()+'-'+('0'+(y.getMonth()+1)).slice(-2)+'-'+('0'+y.getDate()).slice(-2);
  d.streak=(d.last===yk)?(d.streak||0)+1:1;
  d.last=dayKey();
  all[me.user]=d;save(LS.daily,all);
  const reward=67+Math.floor(Math.random()*610);
  addOon(reward);
  pushNotif(me.user,'🎁','Ежедневный бонус: +'+reward+' оонеток · стрик '+d.streak+' дн.');
  addLog('daily',me.user,'бонус дня +'+reward+' (стрик '+d.streak+')');
  toast('+'+reward+' оонеток! стрик: '+d.streak+' дн.');
  renderGifts();refreshOonChip();
}

/* ============ ПОДАРКИ 2.0: хранилище ============ */
const LEGACY_GIFTS={
  '🐟':'рыбка мурчальная','🥛':'молочко', '🧶':'клубочек','🍖':'котлетка-легендарка','🎂':'тортик',
  '🎸':'гитара рока','🌈':'радуга','🐉':'малый дракон','👑':'корона толстости','💎':'оо-бриллиант','🎁':'оонетки'
};
const DEFAULT_GIFTS=[
  {id:'g1',ic:'🧸',name:'плюшевый котик',price:150,tiraj:100,a1:'oomy',a2:'',by:'oomy',ts:1},
  {id:'g2',ic:'🎂',name:'тортик',price:80,tiraj:200,a1:'oomy',a2:'',by:'oomy',ts:2},
  {id:'g3',ic:'👑',name:'корона толстости',price:500,tiraj:25,a1:'oomy',a2:'',by:'oomy',ts:3},
  {id:'g4',ic:'🌙',name:'лунная подушка',price:300,tiraj:60,a1:'oomy',a2:'',by:'oomy',ts:4},
  {id:'g5',ic:'🍕',name:'пицца для двоих',price:60,tiraj:300,a1:'oomy',a2:'',by:'oomy',ts:5}
];
function giftCatalog(){
  const raw=load(LS.catalog,null);
  /* seed только если каталога ещё нет: пустой массив = админ реально всё удалил */
  if(raw===null){save(LS.catalog,DEFAULT_GIFTS);return DEFAULT_GIFTS.slice();}
  /* каждому подарку — постоянный номер #N */
  let changed=false;raw.forEach((g,i)=>{if(!g.n){g.n=i+1;changed=true;}});
  if(changed)save(LS.catalog,raw);
  return raw;
}
function saveCatalog(c){save(LS.catalog,c)}
function bagOf(u){const g=load(LS.gifts,{});return (g[u]||[]).slice()}
function saveBag(u,list){const g=load(LS.gifts,{});g[u]=list;save(LS.gifts,g)}
/* удалённые из магазина подарки исчезают и из сумок всех котиков */
function cleanBag(){
  const ids=new Set(giftCatalog().map(g=>g.id));
  const g=load(LS.gifts,{});
  let n=0;
  Object.keys(g).forEach(u=>{
    const keep=(g[u]||[]).filter(it=>ids.has(it.gid));
    if(keep.length!==(g[u]||[]).length){n+=(g[u]||[]).length-keep.length;g[u]=keep;}
  });
  if(n)save(LS.gifts,g);
  return n;
}
function myGifts(){return me&&!me.guest?bagOf(me.user):[]}
function saveMyGifts(list){saveBag(me.user,list)}
function soldOf(gid){const g=load(LS.gifts,{});let n=0;Object.keys(g).forEach(u=>{(g[u]||[]).forEach(it=>{if(it.gid===gid)n++})});return n}
function giftOwners(gid){
  const g=load(LS.gifts,{});const out=[];
  Object.keys(g).forEach(u=>(g[u]||[]).forEach(it=>{if(it.gid===gid&&!out.includes(u))out.push(u)}));
  return out;
}
function openAllGifts(owner){
  const bag=bagOf(owner).filter(x=>!x.hidden);
  const body=document.getElementById('giftBody');if(!body)return;
  body.innerHTML=`<div class="pf-name" style="font-size:16px">все подарки @${esc(owner)} · ${bag.length}</div>
    <div class="gift-grid" style="grid-template-columns:repeat(auto-fill,minmax(96px,1fr));margin-top:12px">${bag.map((it,gi)=>{
      const gg=it.gid?giftCatalog().find(z=>z.id===it.gid):null;
      return `<div class="gift-card" data-ag="${gi}" style="cursor:pointer">
        ${bagItemHTML(it,58)}
        <div class="gn" style="font-size:11px">${gg?'#'+gg.n:''} ${esc(bagItemName(it))}</div>
        ${gg?`<div class="rar-badge rar-${gg.r||'common'}" style="font-size:10px">${RARITY[gg.r||'common']}</div>`:''}
      </div>`}).join('')||'<div class="empty-note">в сумке пусто</div>'}</div>`;
  body.querySelectorAll('[data-ag]').forEach(c=>c.onclick=()=>openGiftInfo(null,owner,Number(c.dataset.ag)));
  document.getElementById('giftBg').classList.add('open');
}
function closeGiftInfo(){const b=document.getElementById('giftBg');if(b)b.classList.remove('open');}
function openGiftInfo(gid,owner,bi){
  const cat=giftCatalog();
  const it=(owner!==undefined&&owner!==null&&bi!==undefined&&bi!==null)?(bagOf(owner)[bi]||null):null;
  const realGid=gid||(it&&it.gid)||'';
  const gg=realGid?cat.find(x=>x.id===realGid):null;
  const name=gg?gg.name:(it?bagItemName(it):'подарочек');
  const from=it&&it.from?it.from:null;
  const ts=it&&it.ts?it.ts:null;
  const body=document.getElementById('giftBody');
  if(!body)return;
  const mine=owner&&owner===me.user&&it;
  const dateStr=ts?new Date(ts).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'}):'';
  body.innerHTML=`
    <button class="minibtn" id="giBack">← назад</button>
    <div class="pf-name" style="font-size:19px;text-align:left;padding:12px 0 0">подарок ${esc(name)}${gg?' #'+(gg.n||'—')+' из '+gg.tiraj:''}</div>
    <div style="display:grid;grid-template-columns:auto minmax(0,1fr);gap:18px;margin-top:14px;align-items:start">
      <div style="display:flex;flex-direction:column;align-items:center;gap:8px">
        ${giftImgHTML(gg||{ic:(it&&it.ic)||'🎁'},118)}
        ${gg?`<span class="rar-badge rar-${gg.r||'common'}" style="text-align:center">${RARITY[gg.r||'common']} · #${gg.n||'—'} из ${gg.tiraj}</span>`:''}
      </div>
      <div style="min-width:0">
        ${gg?`<div class="stat-line"><span>автор дизайна</span><b>${userLink(gg.a1)}${gg.a2?' · '+userLink(gg.a2):''}</b></div>`:''}
        ${gg&&gg.cmt?`<div class="stat-line"><span>описание</span><b>${esc(gg.cmt)}</b></div>`:''}
        ${owner?`<div class="stat-line"><span>владелец</span><b>${userLink(owner)}</b></div>`:''}
        ${it?`<div class="stat-line"><span>копия / получен</span><b>${it.cn?'#'+it.cn+' из '+(gg?gg.tiraj:'')+' · ':''}${from&&from!=='магазин'?'@'+esc(from)+' · ':''}${dateStr||'давно'}</b></div>`:''}
        ${gg?`<div class="stat-line"><span>цена / тираж</span><b>${gg.price} оонеток / ${gg.tiraj} шт</b></div>`:''}
      </div>
    </div>
    ${!owner&&gg&&me&&!me.guest?`<button class="dan-btn" id="giBuy" style="width:100%;margin-top:16px">купить за ${gg.price} оонеток</button>`:''}
    ${mine&&gg?`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px">
      <button class="minibtn" id="giShelf">${it.shelf?'убрать с витрины':'на витрину'}</button>
      <button class="minibtn" id="giGive">передать</button>
      <button class="minibtn" id="giSell">продать</button>
      <button class="minibtn" id="giMore">⋯</button>
    </div>`:''}
    <div class="panel" style="margin-top:16px;padding:12px 16px">
      <b style="font-size:12.5px">история · кто кому</b>
      <div style="margin-top:8px;font-size:12.5px;color:var(--muted)" id="giHist">${it?(from&&from!=='магазин'?'@'+esc(from)+' → @'+esc(owner)+(ts?' · '+dateStr:''):'куплено в магазине'+(ts?' · '+dateStr:'')):'пока без истории'}</div>
    </div>`;
  body.querySelector('#giBack').onclick=closeGiftInfo;
  const buy=body.querySelector('#giBuy');
  if(buy)buy.onclick=()=>{closeGiftInfo();buyGift(gg,me.user,'');};
  body.querySelectorAll('[data-gu]').forEach(el=>el.onclick=()=>{closeGiftInfo();openUserPage(el.dataset.gu);});
  /* полная история передач по цепочке */
  const hist=body.querySelector('#giHist');
  if(hist){
    const chain=gg?(load(LS.giftChain,{})[gg.id]||[]):[];
    /* не дублируем собственное происхождение подарка */
    const same=(h)=>it&&h.a===(from||'')&&h.b===owner&&(h.msg||'')===(it.msg||'');
    const fm2=ts=>ts?new Date(ts).toLocaleDateString('ru-RU',{day:'numeric',month:'short',year:'2-digit'}):'';
    let rows='';
    if(it)rows+=`<div style="padding:3px 0;border-bottom:1px solid var(--line)">${from&&from!=='магазин'?'@'+esc(from)+' → ':'магазин → '}@${esc(owner||'—')}${ts?' · '+fm2(ts):''}${it.msg?' — «'+esc(it.msg)+'»':''}</div>`;
    chain.filter(h=>!same(h)).forEach(h=>{rows+=`<div style="padding:3px 0;border-bottom:1px solid var(--line)">@${esc(h.a)} → @${esc(h.b)}${h.ts?' · '+fm2(h.ts):''}${h.msg?' — «'+esc(h.msg)+'»':''}</div>`;});
    hist.innerHTML=rows||'пока без истории';
  }
  const sh=body.querySelector('#giShelf');
  if(sh)sh.onclick=()=>{
    const list=bagOf(me.user);const x=list[bi];if(!x)return;
    if(!x.shelf&&list.filter(g=>g.shelf).length>=6){toast('на витрине максимум 6 подарочков');return;}
    x.shelf=!x.shelf;saveBag(me.user,list);openGiftInfo(gid,owner,bi);
    if(!document.getElementById('pg-home').classList.contains('hidden'))renderHome();
    if(!document.getElementById('pg-gifts').classList.contains('hidden'))renderGifts();
    toast(x.shelf?'стоит на витрине профиля':'убрал с витрины');
  };
  const give=body.querySelector('#giGive');
  if(give)give.onclick=()=>{
    const list=bagOf(me.user);const x=list[bi];if(!x)return;
    const us=Object.keys(encLoad(LS.acc,{})).filter(u=>u!==me.user);
    if(!us.length){toast('других котиков пока нет');return;}
    /* форма: впиши юзер (подскажется) + подпись к подарку */
    const form=document.createElement('div');
    form.className='panel';form.style.cssText='margin-top:12px;padding:12px 16px';
    form.innerHTML=`<b style="font-size:12.5px">передать подарок</b>
      <input class="pill-input" id="giTo" list="giToDl" placeholder="юзер котика" style="margin-top:8px" autocomplete="off">
      <datalist id="giToDl">${us.map(u=>`<option value="${esc(u)}">`).join('')}</datalist>
      <input class="pill-input" id="giMsg" placeholder="подпись к подарку (необязательно)" maxlength="120" style="margin-top:8px">
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="dan-btn" id="giGo" style="padding:8px 18px">передать</button>
        <button class="minibtn" id="giCancel">отмена</button>
      </div>`;
    body.querySelector('#giGive').closest('div').insertAdjacentElement('afterend',form);
    form.querySelector('#giCancel').onclick=()=>form.remove();
    form.querySelector('#giGo').onclick=()=>{
      const to=form.querySelector('#giTo').value.trim();
      const msg=form.querySelector('#giMsg').value.trim();
      if(!encLoad(LS.acc,{}).hasOwnProperty(to)){toast('такого котика нет — проверь юзер');return;}
      const l=bagOf(me.user);const y=l[bi];if(!y)return;
      const g=giftCatalog().find(z=>z.id===y.gid);
      l.splice(bi,1);saveBag(me.user,l);
      const l2=bagOf(to);l2.unshift({gid:y.gid,ic:y.ic,cn:y.cn,from:me.user,ts:Date.now(),msg});saveBag(to,l2);
      if(g){const ch=load(LS.giftChain,{});(ch[g.id]=ch[g.id]||[]).unshift({a:me.user,b:to,ts:Date.now(),msg});save(LS.giftChain,ch);}
      if(g)pushNotif(to,'🎁','@'+me.user+' подарил вам «'+g.name+'»'+(msg?' — '+msg:''));
      addLog('gift',me.user,'передал подарок котику '+to+(msg?' с подписью':''));
      closeGiftInfo();toast('подарок улетел '+to+' 🚀');
      if(!document.getElementById('pg-gifts').classList.contains('hidden'))renderGifts();
      if(!document.getElementById('pg-home').classList.contains('hidden'))renderHome();
    };
  };
  const sell=body.querySelector('#giSell');
  if(sell)sell.onclick=()=>{
    const list=bagOf(me.user);const x=list[bi];if(!x||!gg)return;
    const sum=Math.max(1,Math.floor(gg.price/2));
    list.splice(bi,1);saveBag(me.user,list);
    if(x.shelf&&list.filter(g=>g.shelf).length===6){/* ничего */}
    addOon(sum);addLog('gift',me.user,'продал «'+gg.name+'» за '+sum+' оонеток');
    closeGiftInfo();refreshOonChip();
    if(!document.getElementById('pg-gifts').classList.contains('hidden'))renderGifts();
    if(!document.getElementById('pg-home').classList.contains('hidden'))renderHome();
    toast('продал за '+sum+' оонеток 💸');
  };
  const more=body.querySelector('#giMore');
  if(more)more.onclick=e=>{
    menuPop(e.clientX,e.clientY,[
      {t:'открыть страницу владельца',f:()=>{closeGiftInfo();openUserPage(owner);}},
      ...(mine?[{t:it.hidden?'показать в профиле':'скрыть в профиле (только для себя)',f:()=>{
        const l=bagOf(me.user);const y=l[bi];if(!y)return;
        y.hidden=!y.hidden;saveBag(me.user,l);closeGiftInfo();renderGifts();
        if(!document.getElementById('pg-home').classList.contains('hidden'))renderHome();
        toast(y.hidden?'скрыто — видно только тебе':'опять на витрине');
      }},
      {t:(prof().nickGift===bi)?'убрать подарочек с ника':'подарочек рядом с ником',f:()=>{
        const p=prof();
        if(p.nickGift===bi)delete p.nickGift;else p.nickGift=bi;
        saveProf(p);closeGiftInfo();
        if(!document.getElementById('pg-home').classList.contains('hidden'))renderHome();
        toast(p.nickGift===bi?'подарочек теперь рядом с твоим ником':'подарочек убран с ника');
      }}]:[]),
      ...(isAdmin()&&gg?[{t:gg.closed?'админ: открыть покупку':'админ: закрыть покупку («погоди»)',f:()=>{
        const cat2=giftCatalog();const z=cat2.find(q=>q.id===gg.id);if(!z)return;
        z.closed=!z.closed;saveCatalog(cat2);closeGiftInfo();renderGifts();
        toast(z.closed?'покупка закрыта — «погоди»':'покупка открыта');
      }}]:[])
    ]);
  };
  document.getElementById('giftBg').classList.add('open');
}
function propsAll(){return load(LS.props,[])}
function saveProps(p){save(LS.props,p)}
const RARITY={common:'обычный',rare:'редкий',pizdets:'пиздец',ebat:'ебать'};
function giftImgHTML(g,sz){
  const rar=(g&&g.r)||'common';
  let inner;
  if(g&&g.mid)inner='<img src="'+mediaURL(g.mid)+'" alt="'+esc(g.name||'подарок')+'" style="width:'+sz+'px;height:'+sz+'px;border-radius:9px">';
  else inner='<span style="width:'+sz+'px;height:'+sz+'px;display:inline-flex;align-items:center;justify-content:center;font-size:'+Math.round(sz*.7)+'px">'+esc(g&&g.ic||'🎁')+'</span>';
  return '<span class="gwrap rar-'+rar+'">'+inner+'</span>';
}
function bagItemHTML(it,sz){
  if(it.gid){const g=giftCatalog().find(x=>x.id===it.gid);return g?giftImgHTML(g,sz):giftImgHTML(null,sz)}
  return giftImgHTML({ic:it.ic},sz);
}
function bagItemName(it){
  if(it.gid){const g=giftCatalog().find(x=>x.id===it.gid);return g?g.name:'подарок удалён'}
  return LEGACY_GIFTS[it.ic]||'подарочек';
}
function userLink(u){return '<span class="g-auth" data-gu="'+esc(u)+'">@'+esc(u)+'</span>'}
function openUserPage(u){
  const accs=encLoad(LS.acc,{});const a=accs[u];
  if(!a){
    const known=load(LS.posts,[]).some(p=>p.author===u||(p.comments||[]).some(c=>c.user===u));
    if(!known){toast('такого котика нет');return;}
  }
  window.__viewUser=u;
  go('user');
}
function renderUserPage(){
  const box=document.getElementById('pg-user');
  const u=window.__viewUser||me.user;
  const accs=encLoad(LS.acc,{});const a=accs[u]||{};
  const pd=profOf(u);
  const isMe=u===me.user;
  /* скрытый аккаунт: чужим — только заглушка */
  if(pd.hiddenAcc&&!isMe&&!isAdmin()){
    box.innerHTML=`<div class="pcard" style="padding:36px 20px;text-align:center">
      <div style="font-size:46px">🙈</div>
      <div class="pf-name" style="font-size:17px;padding-top:8px">скрытый аккаунт</div>
      <div class="pf-sub">@${esc(u)} решил спрятаться — страница недоступна</div></div>`;
    return;
  }
  if(!isMe)addVisitor(u);
  const wall=load(LS.posts,[]).filter(p=>p.author===u&&!p.hidden);
  const likes=wall.reduce((s,p)=>s+(p.likes||0),0);
  const reposts=wall.filter(p=>p.repostFrom).length;
  const bag=bagOf(u);
  const shelf=bag.map((g,gi)=>({g,gi})).filter(x=>x.g.shelf&&!x.g.hidden);
  const trks=tracksAll().filter(t=>trackOwner(t)===u).length;
  const dn=pd.dn||u;
  const online=isOnline(u);
  const ownTrack=tracksAll().find(x=>x.id===pd.profileTrackId);
  const cov=ownTrack?(ownTrack.coverMid?'<img src="'+mediaURL(ownTrack.coverMid)+'">':esc((ownTrack.cover||'').slice(0,3)||'🎵')):'🎵';
  const bannerStyle=(pd.banner&&pd.banner.mid)?'background-image:url('+mediaURL(pd.banner.mid)+')':(pd.grad?'background:'+((GRADS.find(g=>g.n===pd.grad)||{}).g||''):'');
  box.innerHTML=`<div class="pcard profile-card"${pd.accent?' style="--acc:'+esc(pd.accent)+'"':''}>
    <div class="banner" style="${bannerStyle}">
      ${(pd.banner&&pd.banner.mid&&pd.banner.kind==='vid')?'<video src="'+mediaURL(pd.banner.mid)+'" autoplay muted loop playsinline></video>':''}
      <div class="banner-ov"></div>
    </div>
    <div class="pf-top">
      <div class="pf-ava-wrap">
        <div class="pf-ava">${avaHTML(u,a.ava||'🐈')}</div>
        <div class="pf-ava-border"></div>
      </div>
    </div>
    <div class="pf-info">
      <div style="min-width:0;flex:1">
        <div class="pf-name">${esc(dn)}${badgeFor(u)}${nickGiftHTML(u)}${a.banned?' <span class="from-line" style="color:var(--bad)">· заблокирован</span>':''}</div>
        <div class="pf-sub"><span class="online-dot ${online?'':'off'}"></span>@${esc(u)} · ${online?'в сети':esc(lastSeenText(u))}${a.createdAt?' · на oomy с '+esc(a.createdAt):''}</div>
        ${sectOn(pd,'status')&&pd.status?'<div class="pf-status">'+esc(pd.status)+'</div>':''}
        ${sectOn(pd,'bio')&&pd.bio?'<div class="pf-bio">'+esc(pd.bio)+'</div>':''}
      </div>
      <div class="pf-btns">
        ${isMe
          ?'<button class="minibtn" id="pfEdit">редактировать профиль</button><button class="minibtn" id="pfShare">поделиться</button>'
          :`<span id="upFriendBtns">${friendBtnHTML(u)}</span><button class="minibtn" id="upMsg">написать</button><button class="minibtn" id="upMore">⋯</button>`}
      </div>
    </div>
    ${sectOn(pd,'stats')?`<div class="pf-stats">
      <div class="stat"><b>${wall.filter(p=>!p.repostFrom).length}</b><span>записей</span></div>
      <div class="stat"><b>${likes}</b><span>лайков</span></div>
      <div class="stat"><b>${reposts}</b><span>репостов</span></div>
      <div class="stat"><b>${trks}</b><span>треков</span></div>
      <div class="stat"><b>${bag.length}</b><span>подарков</span></div>
      ${isMe&&!me.guest?`<div class="stat"><b>${wallet()[u]||0}</b><span>оонеток</span></div>`:''}
    </div>`:''}
    ${sectOn(pd,'shelf')?`<div class="sect">
      <h3>полка подарочков${shelf.length?' · '+Math.min(6,shelf.length)+'/6':''}</h3>
      <div class="pf-gifts">${shelf.slice(0,6).map(x=>{
        const gg=x.g.gid?giftCatalog().find(z=>z.id===x.g.gid):null;
        return `<span style="display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer" data-gift="${x.gi}" data-gowner="${esc(u)}" title="${esc(bagItemName(x.g))}${x.g.from?' · от '+esc(x.g.from):''}">${bagItemHTML(x.g,44)}<span style="font-size:10px;font-weight:700">${gg?'#'+gg.n+' · ':''}${esc(bagItemName(x.g))}</span>${gg?`<span class="rar-badge rar-${gg.r||'common'}" style="font-size:9px">${RARITY[gg.r||'common']}</span>`:''}</span>`}).join('')||'<span class="empty-shelf">полка пустая</span>'}</div>
      <div class="link" style="padding-top:6px" id="upAllGifts">все подарки · ${bag.filter(g=>!g.hidden).length}</div>
    </div>`:''}
    ${sectOn(pd,'track')?`<div class="sect">
      <h3>профильный трек</h3>
      ${isMe?'<div id="pfTrackBox"></div>':(ownTrack?`<div style="display:flex;align-items:center;gap:10px">
        <div class="tcover" style="width:44px;height:44px;font-size:18px">${cov}</div>
        <div style="flex:1;min-width:0"><div style="font-weight:700;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(ownTrack.name)}</div><div style="color:var(--muted2);font-size:11.5px">${ownTrack.artist?esc(ownTrack.artist)+' · ':''}трек страницы @${esc(u)}</div></div>
        <button class="minibtn" id="upTrackPlay" style="flex:none">${player.currentId===ownTrack.id&&player.playing?'⏸':'▶'}</button></div>`
        :'<span style="color:var(--muted2);font-size:12.5px">котик не выбрал трек</span>')}
    </div>`:''}
    ${sectOn(pd,'wall')?`<div class="sect">
      <h3>стена</h3>
      ${isMe&&!me.guest?`
      <div style="display:flex;gap:4px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
        <div style="display:flex;gap:12px;padding:10px 0 4px;align-items:flex-start;flex:1;min-width:0">
          <div class="ava" id="wallAva">${avaHTML(me.user,me.ava||'🐈')}</div>
          <textarea id="wallText" placeholder="накликай у себя на странице…" maxlength="400" style="flex:1;min-height:52px;resize:none;border:none;outline:none;background:transparent;font-family:inherit;font-size:14px;color:var(--text);padding:8px 0"></textarea>
        </div>
        <div id="wallAttSlot"></div>
        <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">
          <button class="att-btn" id="attWallImg" title="фото/gif"><svg class="mi"><use href="#i-img"/></svg></button>
          <button class="att-btn" id="attWallVid" title="видео"><svg class="mi"><use href="#i-film"/></svg></button>
          <button class="att-btn" id="attWallFile" title="файл"><svg class="mi"><use href="#i-clip"/></svg></button>
          <input type="file" id="fileWallImg" accept="image/*" class="hidden">
          <input type="file" id="fileWallVid" accept="video/*" class="hidden">
          <input type="file" id="fileWallFile" class="hidden">
          <button class="send-btn on" id="wallSend">на стену</button>
        </div>
      </div>`:''}
      <div id="wallPosts"></div>
    </div>`:''}
    ${sectOn(pd,'friends')?`<div class="sect">
      <h3>друзья · ${friendsOf(u).length}</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap;padding:2px 0 8px">
        ${friendsOf(u).slice(0,12).map(f=>`<span class="v" data-gu="${esc(f)}" style="display:flex;align-items:center;gap:6px;background:var(--card2);border:1px solid var(--line);border-radius:999px;padding:4px 10px 4px 4px;font-size:12px;cursor:pointer"><span class="ava" style="width:24px;height:24px;font-size:12px">${avaHTML(f,(encLoad(LS.acc,{})[f]||{}).ava||'🐈')}</span>${esc(f)}</span>`).join('')||'<span class="fsub">пока нет друзей</span>'}
      </div>
    </div>`:''}
    ${sectOn(pd,'ach')?`<div class="sect">
      <h3>достижения</h3>
      ${achHTML(u)}
    </div>`:''}
    ${isMe?`<div class="sect">
      <h3>гости моей страницы</h3>
      <div class="visitors">${visitorsOf(me.user).slice(0,10).map(v=>`<span class="v" data-gu="${esc(v.from)}"><span class="ava" style="width:24px;height:24px;font-size:12px">${avaHTML(v.from,'🐈')}</span>${esc(v.from)}</span>`).join('')||'<span class="fsub">пока никто не заглянул</span>'}</div>
    </div>
    <div class="sect">
      <h3>закладки · ${bookmarksOf(me.user).length}</h3>
      <div id="upBookmarks"></div>
    </div>`:''}
  </div>`;
  /* ---- проводка ---- */
  if(isMe){
    document.getElementById('pfEdit').onclick=openEditor;
    document.getElementById('pfShare').onclick=()=>toast('скопировано в миску: oomy/'+me.user+' ✅');
    const si=box.querySelector('#statusInput');
    const bioIn=box.querySelector('#bioInput');
    const stEl=box.querySelector('.pf-status');
    if(bioIn)bioIn.addEventListener('input',e=>{const p=prof();p.bio=e.target.value.trim();saveProf(p);toast('биография обновлена');});
    renderPfTrack();
    /* стена: композер */
    let wallAtt=null;
    const slot=box.querySelector('#wallAttSlot');
    const updSlot=()=>{if(!slot)return;slot.innerHTML=wallAtt?'<span class="att-chip" style="margin-right:0">📎 <span>'+esc(wallAtt.name)+'</span> <b id="rmWallAtt">✕</b></span>':'';const rm=box.querySelector('#rmWallAtt');if(rm)rm.onclick=()=>{wallAtt=null;updSlot();};};
    const pick=(el,kind)=>{if(!el)return;el.onchange=()=>{const f=el.files[0];if(!f)return;
      if(f.size>10*1024*1024){toast('файл больше 10МБ');el.value='';return;}
      putMedia(f,id=>{if(id){wallAtt={mid:id,name:f.name,kind};updSlot();}});el.value='';};};
    pick(box.querySelector('#fileWallImg'),'img');
    pick(box.querySelector('#fileWallVid'),'vid');
    pick(box.querySelector('#fileWallFile'),'file');
    const awi=box.querySelector('#attWallImg');if(awi)awi.onclick=()=>box.querySelector('#fileWallImg').click();
    const awv=box.querySelector('#attWallVid');if(awv)awv.onclick=()=>box.querySelector('#fileWallVid').click();
    const awf=box.querySelector('#attWallFile');if(awf)awf.onclick=()=>box.querySelector('#fileWallFile').click();
    const ws=box.querySelector('#wallSend');
    if(ws)ws.onclick=()=>{
      const el=box.querySelector('#wallText');const t=el.value.trim();
      if(!t&&!wallAtt){toast('напиши мяу или прицепи файл');return;}
      const posts=load(LS.posts,[]);
      const att=wallAtt?{mid:wallAtt.mid,name:wallAtt.name,kind:wallAtt.kind,src:mediaURL(wallAtt.mid)}:null;
      posts.unshift({id:Date.now(),author:me.user,ava:(me.ava)||'🐈',nameCls:'pink',time:'только что',text:t,likes:0,liked:false,views:0,at:'',comments:[],att});
      save(LS.posts,posts);addLog('post',me.user,'запись на стене'+(att?' + '+att.kind:''));
      wallAtt=null;updSlot();el.value='';renderUserPage();toast('на стене! проверяй');
    };
    /* закладки */
    const bmWrap=box.querySelector('#upBookmarks');
    if(bmWrap){
      const ids=bookmarksOf(me.user);
      if(!ids.length)bmWrap.innerHTML='<div class="fsub" style="padding:4px 0">сохраняй посты звёздочкой ★ — они появятся тут</div>';
      else{
        const all=load(LS.posts,[]);
        ids.slice(0,5).forEach(id=>{const p=all.find(x=>x.id===id);if(!p)return;const d=document.createElement('div');d.className='post';d.innerHTML=postHTML(p);wirePost(d,p);bmWrap.appendChild(d);});
      }
    }
  }else{
    const msg=box.querySelector('#upMsg');
    if(msg)msg.onclick=()=>{openChat(u);go('msgs');};
    const more=box.querySelector('#upMore');
    if(more)more.onclick=e=>{
      const blocked=isBlocked(u);
      menuPop(e.clientX,e.clientY,[
        {t:'пожаловаться',f:()=>{addLog('report',me.user,'жалоба на '+u);pushNotif(ADMIN,'🚨','@'+me.user+' пожаловался на @'+u);toast('жалоба отправлена главному коту');}},
        {t:blocked?'разблокировать':'заблокировать',danger:!blocked,f:()=>{blocked?unblockUser(u):blockUser(u);renderUserPage();}}
      ]);
    };
    wireFriendBtns(box);
    const tp=box.querySelector('#upTrackPlay');
    if(tp&&ownTrack)tp.onclick=()=>{if(player.currentId===ownTrack.id){togglePlay();tp.innerHTML=player.playing?'▶':'⏸';return;}playQueueFrom(ownTrack.id);tp.innerHTML='⏸';};
  }
  box.querySelectorAll('[data-gift]').forEach(el=>el.onclick=()=>openGiftInfo(null,el.dataset.gowner,Number(el.dataset.gift)));
  const upAllGifts=box.querySelector('#upAllGifts');
  if(upAllGifts)upAllGifts.onclick=()=>openAllGifts(u);
  box.querySelectorAll('[data-gu]').forEach(el=>el.onclick=()=>openUserPage(el.dataset.gu));
  wireAch(box);
  const wallBox=box.querySelector('#wallPosts');
  if(wallBox){
    if(!wall.length){wallBox.innerHTML='<div style="color:var(--muted2);font-size:13px">'+(isMe?'стененько пока голая — выложи фотку или напиши мяу':'котик ещё не муркнул')+'</div>';}
    else{
      const pinned=pd.pinned||[];
      wall.sort((x,y)=>((pinned.includes(x.id)?1:0)-(pinned.includes(y.id)?1:0))||(y.id-x.id));
      wall.forEach(p=>{
        const d=document.createElement('div');d.className='post'+(pinned.includes(p.id)?' pinned':'');
        d.innerHTML=postHTML(p);wirePost(d,p);wallBox.appendChild(d);
      });
    }
  }
  wireHoverCards(box);
}

/* ============ ПОДАРОЧКИ 2.0: рендер ============ */
let giftTab='shop';
let pfFile=null;
const GIFT_NAV=[
  {id:'shop',n:'магазин подарков'},
  {id:'mkt',n:'маркет'},
  {id:'mine',n:'мои подарки',cnt:()=>bagOf(me.user).length},
  {id:'tr',n:'перевести оонетки'},
  {id:'key',n:'активировать ключ'},
  {id:'prop',n:'предложить подарок'},
  {id:'kp',n:'копилка'},
  {id:'q',n:'задания'},
  {id:'ref',n:'рефералы'}
];
function renderGifts(){
  const box=document.getElementById('pg-gifts');
  if(!me||me.guest){box.innerHTML='<div class="pcard" style="padding:26px;text-align:center;color:var(--muted)">подарочки — для зарегистрированных котиков 🐾</div>';return;}
  const tabs=GIFT_NAV.slice();
  if(isAdmin())tabs.push({id:'props',n:'предложка',sup:true,cnt:()=>propsAll().filter(p=>p.status==='new').length});
  if(!tabs.some(t=>t.id===giftTab))giftTab='shop';
  const nav=tabs.map(t=>{
    const c=t.cnt?t.cnt():0;
    return '<li data-gt="'+t.id+'" class="'+(t.id===giftTab?'active':'')+(t.sup?' sup':'')+'"><span>'+esc(t.n)+'</span>'+(c?'<i class="g-nav-cnt">'+c+'</i>':'')+'</li>';
  }).join('');
  box.innerHTML=`<div class="gifts-shell">
    <div>
      <div class="pcard" style="padding:14px 18px;margin-bottom:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <div class="ava" style="width:42px;height:42px;font-size:0;background:var(--acc);color:var(--acc-fg);border-radius:12px"><svg class="mi" style="width:20px;height:20px"><use href="#i-gift"/></svg></div>
        <div style="flex:1;min-width:0">
          <div class="pf-name" style="font-size:18px">${esc(tabs.find(t=>t.id===giftTab).n)}${isAdmin()&&giftTab==='props'?' · очередь предложений':''}</div>
          <div class="pf-sub">валюта сайта — оонетки: копи, дари, питай подарками друзей</div>
        </div>
        <div class="oon-chip" style="font-size:14px;padding:8px 16px"><b>${myOon()}</b> оонеток</div>
      </div>
      <div id="giftTabBody"></div>
    </div>
    <aside class="gifts-rail">
      <div class="panel gift-nav"><ul class="rail-list" id="giftNavList">${nav}</ul></div>
      <div id="giftRailBody"></div>
    </aside>
  </div>`;
  box.querySelectorAll('#giftNavList li').forEach(li=>li.onclick=()=>{giftTab=li.dataset.gt;renderGifts();});
  const body=box.querySelector('#giftTabBody');
  const rail=box.querySelector('#giftRailBody');
  ({
    shop:tbShop,mkt:tbMkt,mine:tbMine,tr:tbTransfer,key:tbKey,prop:tbPropose,
    kp:tbKopilka,q:tbQuests,ref:tbRefs,props:tbProps
  })[giftTab](body,rail);
  body.querySelectorAll('[data-gu]').forEach(el=>el.onclick=e=>{e.stopPropagation();openUserPage(el.dataset.gu);});
}
function railWallet(rail){
  rail.innerHTML=`<div class="panel" style="padding:14px 16px">
    <div class="stat-line"><span>мой баланс</span><b>${myOon()}</b></div>
    <div class="stat-line"><span>мои подарки</span><b>${bagOf(me.user).length}</b></div>
    <div class="stat-line"><span>В копилке кликов всего</span><b>${myClickStats().total}</b></div>
    <button class="minibtn" id="rbKp" style="display:block;width:100%;padding:9px;margin-top:10px">чопилка: зарабатывать</button>
  </div>`;
  const b=rail.querySelector('#rbKp');if(b)b.onclick=()=>{giftTab='kp';renderGifts();};
}

/* ---- МАГАЗИН ---- */
const RAR_LIMIT={common:5,rare:3,pizdets:2,ebat:1};
function buyHistFor(u,gid){
  const h=load(LS.buyHist,{});
  const arr=(h[u]&&h[u][gid])||[];
  const now=Date.now();
  return arr.filter(ts=>now-ts<3600000);
}
function recBuy(u,gid){
  const h=load(LS.buyHist,{});h[u]=h[u]||{};(h[u][gid]=h[u][gid]||[]).push(Date.now());save(LS.buyHist,h);
}
function tbShop(body,rail){
  const cat=giftCatalog();
  const avail=cat.filter(g=>!g.closed&&soldOf(g.id)<(g.tiraj||100));
  const ended=cat.filter(g=>g.closed||soldOf(g.id)>=(g.tiraj||100));
  const card=(g,dead)=>{
    const rar=(g.r||'common');
    const left=Math.max(0,(g.tiraj||100)-soldOf(g.id));
    const cap=RAR_LIMIT[rar];
    const used=buyHistFor(me.user,g.id).length;
    return `<div class="gift-card" data-gg="${g.id}" style="display:flex;flex-direction:column;align-items:center;gap:2px">
      <span data-ginfo="${g.id}" style="cursor:pointer">${giftImgHTML(g,72)}</span>
      <div class="gn" data-ginfo="${g.id}" style="cursor:pointer">#${g.n||'—'} · ${esc(g.name)}</div>
      <div class="rar-badge rar-${rar}">${RARITY[rar]}</div>
      <div class="gp">${g.price} оонеток · ${soldOf(g.id)}/${g.tiraj}</div>
      <div class="from-line" style="font-size:10.5px">лимит в час: ${used}/${cap}</div>
      ${dead
        ?`<button class="minibtn" style="margin-top:5px;opacity:.6;cursor:default">закончились</button>`
        :`<button class="minibtn" data-buy="${g.id}" style="margin-top:5px">купить · ${g.price}</button>`}
      ${isAdmin()&&dead&&g.closed?`<button class="minibtn" data-open="${g.id}" style="margin-top:3px;font-size:10.5px">админ: открыть продажу</button>`:''}
    </div>`;
  };
  body.innerHTML=`<div class="pcard" style="padding:14px 18px 16px">
    ${(isAdmin()&&!pfDirectOpen)?'<button class="dan-btn" id="shopAdd" style="margin-bottom:10px">＋ добавить подарок</button>':''}
    <input class="pill-input" id="giftQ" placeholder="поиск подарков…" value="${esc(window.__giftQ||'')}" style="margin-bottom:12px">
    <input class="pill-input" id="giftTo" placeholder="юзер котика — подарить ему при покупке (необязательно)" style="margin-bottom:12px">
    ${cat.length?`<div class="gift-grid" style="grid-template-columns:repeat(auto-fill,minmax(128px,1fr))">${avail.map(g=>card(g,false)).join('')}</div>`
    :'<div class="empty-note">в магазине пока пусто — подарки добавляет администратор.<br>свой дизайн можно предложить во вкладке «предложить подарок»</div>'}
    ${ended.length?`<div style="margin-top:22px"><b style="font-size:13.5px;display:block;padding-bottom:8px">раскупленные подарочки</b>
      <div class="gift-grid" style="grid-template-columns:repeat(auto-fill,minmax(128px,1fr))">${ended.map(g=>card(g,true)).join('')}</div></div>`:''}
  </div>`;
  const add=body.querySelector('#shopAdd');
  if(add)add.onclick=()=>{pfDirectOpen=true;giftTab='prop';renderGifts();};
  const qi=body.querySelector('#giftQ');
  if(qi)qi.oninput=()=>{
    window.__giftQ=qi.value;
    const q=qi.value.trim().toLowerCase();
    body.querySelectorAll('.gift-card').forEach(c=>{
      const g=cat.find(x=>x.id===c.dataset.gg);
      c.style.display=g&&(g.name||'').toLowerCase().includes(q)?'':'none';
    });
  };
  body.querySelectorAll('[data-ginfo]').forEach(el=>el.onclick=e=>{e.stopPropagation();openGiftInfo(el.dataset.ginfo);});
  body.querySelectorAll('[data-open]').forEach(b=>b.onclick=e=>{
    e.stopPropagation();
    const cat2=giftCatalog();const g=cat2.find(x=>x.id===b.dataset.open);if(!g)return;
    g.closed=false;saveCatalog(cat2);toast('продажа открыта');renderGifts();
  });
  body.querySelectorAll('[data-buy]').forEach(b=>b.onclick=e=>{
    e.stopPropagation();
    const g=giftCatalog().find(x=>x.id===b.dataset.buy);
    if(!g)return;
    if(g.closed&&!isAdmin()){toast('погоди — покупку закрыл админ');return;}
    const left=Math.max(0,(g.tiraj||100)-soldOf(g.id));
    if(left<=0&&!isAdmin()){toast('весь тираж раскуплён');return;}
    /* купить другому котику: впиши юзер под ценой */
    const inp=body.querySelector('#giftTo');
    const to=inp&&inp.value.trim()?inp.value.trim():me.user;
    if(to!==me.user&&!encLoad(LS.acc,{}).hasOwnProperty(to)){toast('такого котика нет — проверь юзер');return;}
    buyGift(g,to,to===me.user?'':me.user);
    if(inp)inp.value='';
  });
  body.querySelectorAll('[data-gg]').forEach(c=>c.onclick=e=>{
    if(e.target.closest('[data-gu],[data-buy],[data-open]'))return;
    const g=giftCatalog().find(x=>x.id===c.dataset.gg);
    if(!g)return;
    openGiftInfo(g.id);
  });
}
let pfDirectOpen=false;
function oonCost(g){return '«'+g.name+'» за '+g.price+' оонеток'}
function buyGift(g,to,from,msg){
  if(g.closed&&!isAdmin()){toast('погоди — покупку закрыл админ');return;}
  if(myOon()<g.price){toast('оонеток не хватает');return;}
  const sold=soldOf(g.id);
  if(sold>=(g.tiraj||100)&&!isAdmin()){toast('весь тираж раскуплён');return;}
  const cap=RAR_LIMIT[g.r||'common'];
  if(buyHistFor(me.user,g.id).length>=cap){toast('погоди — за час можно купить '+cap+' шт. этого подарка');return;}
  addOon(-g.price);
  recBuy(me.user,g.id);
  const cn=sold+1; /* номер копии: поочерёдно, не больше тиража */
  const list=bagOf(to);
  list.unshift({gid:g.id,cn,from:from||'магазин',ts:Date.now(),msg:msg||''});
  saveBag(to,list);
  /* история передач: кто кому */
  const ch=load(LS.giftChain,{});(ch[g.id]=ch[g.id]||[]).unshift({a:me.user,b:to,ts:Date.now(),msg:msg||''});save(LS.giftChain,ch);
  if(from)pushNotif(to,'🎁','@'+from+' подарил вам «'+g.name+'»'+(msg?' — '+msg:''));
  else pushNotif(to,'🛍','вы купили «'+g.name+'» · копия #'+cn+'/'+(g.tiraj||100));
  addLog('gift',me.user,(from&&from!=='магазин'?'подарил ':'купил ')+'«'+g.name+'»'+(from&&from!=='магазин'?' → '+to:''));
  toast(from?'подарок улетел '+to+' 🎁':'«'+g.name+'» копия #'+cn+' — в сумке!');
  refreshOonChip();
  if(window.__PG==='gifts')renderGifts();
  if(!document.getElementById('pg-home').classList.contains('hidden'))renderHome();
}

/* ---- МАРКЕТ: барахолка котиков ---- */
function mktAll(){return load(LS.mkt,[])}
function saveMkt(l){save(LS.mkt,l)}
function tbMkt(body,rail){
  const list=mktAll();
  const mine=list.filter(x=>x.owner===me.user);
  body.innerHTML=`<div class="pcard" style="padding:14px 18px 16px">
    <div class="pf-sub" style="padding-bottom:10px">барахолка: выставляй свои подарки за свои оонетки — покупает любой котик, деньги падают тебе</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center">
      <select class="pill-input" id="mktPick" style="width:auto;max-width:260px">
        <option value="">— выбери подарок из сумки —</option>
        ${bagOf(me.user).map((it,bi)=>`<option value="${bi}">${esc(bagItemName(it))}${it.gid?'':' (без номера)'}</option>`).join('')}
      </select>
      <input class="pill-input" id="mktPrice" type="number" min="1" placeholder="цена, оонеток" style="width:140px">
      <button class="dan-btn" id="mktSell" style="padding:9px 18px">выставить</button>
    </div>
    ${mine.length?`<div style="margin-bottom:14px"><b style="font-size:13px">мои лоты · ${mine.length}</b>
      ${mine.map(m=>`<div class="mn-bag">${bagItemHTML({gid:m.gid,ic:m.ic},44)}<div style="flex:1"><b style="font-size:13px">${esc(m.name)}</b><div class="g-foot">${m.price} оонеток</div></div><button class="minibtn" data-unlot="${m.id}">снять лот</button></div>`).join('')}</div>`:''}
    ${list.filter(x=>x.owner!==me.user).length?`<b style="font-size:13px;display:block;padding-bottom:8px">лоты котиков · ${list.filter(x=>x.owner!==me.user).length}</b>
      ${list.filter(x=>x.owner!==me.user).map(m=>`<div class="mn-bag">
        ${bagItemHTML({gid:m.gid,ic:m.ic},44)}
        <div style="flex:1;min-width:0"><b style="font-size:13px">${esc(m.name)}</b><div class="g-foot">продает ${userLink(m.owner)}</div></div>
        <button class="minibtn" data-buylot="${m.id}">купить · ${m.price}</button>
      </div>`).join('')}`:'<div class="empty-note">чужих лотов пока нет — стань первым торговцем</div>'}
  </div>`;
  body.querySelector('#mktSell').onclick=()=>{
    const sel=body.querySelector('#mktPick'),pi=body.querySelector('#mktPrice');
    const bi=Number(sel.value),price=Math.floor(Number(pi.value));
    if(sel.value===''){toast('выбери подарок из сумки');return;}
    if(!price||price<1){toast('укажи цену — целое число');return;}
    const bag=bagOf(me.user);const it=bag[bi];if(!it)return;
    const name=bagItemName(it);
    const l=mktAll();
    l.unshift({id:'m'+Date.now().toString(36),owner:me.user,gid:it.gid||'',ic:it.ic||'🎁',name,price,ts:Date.now()});
    bag.splice(bi,1);saveBag(me.user,bag);saveMkt(l);
    addLog('mkt',me.user,'выставил лот «'+name+'» за '+price);
    toast('лот на барахолке!');
    renderGifts();
  };
  body.querySelectorAll('[data-unlot]').forEach(b=>b.onclick=()=>{
    const l=mktAll();const m=l.find(x=>x.id===b.dataset.unlot);if(!m)return;
    const bag=bagOf(me.user);bag.unshift({gid:m.gid||undefined,ic:m.gid?undefined:m.ic,from:'снят с маркета',ts:Date.now()});saveBag(me.user,bag);
    saveMkt(l.filter(x=>x.id!==m.id));toast('лот снят, подарок вернулся в сумку');renderGifts();
  });
  body.querySelectorAll('[data-buylot]').forEach(b=>b.onclick=()=>{
    const l=mktAll();const m=l.find(x=>x.id===b.dataset.buylot);if(!m)return;
    if(myOon()<m.price){toast('оонеток не хватает');return;}
    addOon(-m.price);
    const w=wallet();w[m.owner]=(w[m.owner]||0)+m.price;save(LS.wallet,w);
    const bag=bagOf(me.user);bag.unshift({gid:m.gid||undefined,ic:m.gid?undefined:m.ic,from:m.owner,ts:Date.now()});saveBag(me.user,bag);
    if(m.gid){const ch=load(LS.giftChain,{});(ch[m.gid]=ch[m.gid]||[]).unshift({a:m.owner,b:me.user,ts:Date.now(),msg:'продажа на маркете · '+m.price+' оонеток'});save(LS.giftChain,ch);}
    saveMkt(l.filter(x=>x.id!==m.id));
    pushNotif(m.owner,'💱','@'+me.user+' купил твой лот «'+m.name+'» за '+m.price+' оонеток');
    addLog('mkt',me.user,'купил лот «'+m.name+'» у '+m.owner);
    refreshOonChip();toast('лот куплен!');renderGifts();
  });
  body.querySelectorAll('[data-gu]').forEach(el=>el.onclick=e=>{e.stopPropagation();openUserPage(el.dataset.gu);});
}

/* ---- МОИ ПОДАРКИ ---- */
function tbMine(body,rail){
  const bag=bagOf(me.user);
  body.innerHTML=`<div class="pcard" style="padding:14px 18px 16px">
    <div class="empty-note">${bag.length?'':'в сумке пусто — купи в магазине, предложи дизайн или попроси друзей'}</div>
    ${bag.map((it,bi)=>`<div class="mn-bag">
      <span data-info="${bi}" style="cursor:pointer">${bagItemHTML(it,56)}</span>
      <div style="flex:1;min-width:0">
        <b style="font-size:13.5px;cursor:pointer" data-info="${bi}">${esc(bagItemName(it))}</b>
        <div class="g-foot">${it.from&&it.from!==me.user&&it.from!=='магазин'?'подарил(а) '+userLink(it.from):'куплено в магазине'}${it.cn?' · копия #'+it.cn:''}${it.shelf?' · стоит на полке профиля':''}${it.hidden?' · скрыт от гостей':''}</div>
      </div>
      <button class="minibtn" data-b="${bi}" data-act="shelf">${it.shelf?'убрать с полки':'на полку'}</button>
      <button class="minibtn" data-b="${bi}" data-act="hide">${it.hidden?'показать':'скрыть'}</button>
      <button class="minibtn" data-b="${bi}" data-act="gift">подарить</button>
    </div>`).join('')}
  </div>`;
  body.querySelectorAll('[data-info]').forEach(el=>el.onclick=()=>openGiftInfo(null,me.user,Number(el.dataset.info)));
  body.querySelectorAll('[data-b]').forEach(b=>b.onclick=e=>{
    const bi=Number(b.dataset.b);const list=bagOf(me.user);const it=list[bi];
    if(b.dataset.act==='shelf'){
      if(!it.shelf&&list.filter(g=>g.shelf).length>=6){toast('на полке максимум 6 подарочков');return;}
      it.shelf=!it.shelf;saveBag(me.user,list);renderGifts();
      if(!document.getElementById('pg-home').classList.contains('hidden'))renderHome();
      toast(it.shelf?'стоит на полке в профиле':'убрал с полки');
    }else if(b.dataset.act==='hide'){
      it.hidden=!it.hidden;saveBag(me.user,list);renderGifts();
      if(!document.getElementById('pg-home').classList.contains('hidden'))renderHome();
      toast(it.hidden?'скрыт — видишь только ты':'опять на витрине');
    }else{
      const us=Object.keys(encLoad(LS.acc,{})).filter(u=>u!==me.user);
      if(!us.length){toast('других котиков пока нет');return;}
      menuPop(e.clientX,e.clientY,us.map(u=>({t:u,f:()=>{
        const g=giftCatalog().find(x=>x.id===it.gid);
        list.splice(bi,1);saveBag(me.user,list);
        const l2=bagOf(u);l2.unshift({gid:it.gid,ic:it.ic,cn:it.cn,from:me.user,ts:Date.now()});saveBag(u,l2);
        if(g){const ch=load(LS.giftChain,{});(ch[g.id]=ch[g.id]||[]).unshift({a:me.user,b:u,ts:Date.now(),msg:''});save(LS.giftChain,ch);}
        if(g)pushNotif(u,'🎁','@'+me.user+' подарил вам «'+g.name+'»');
        addLog('gift',me.user,'переподарил подарок котику '+u);
        toast('подарок улетел '+u+' 🚀');renderGifts();
      }})));
    }
  });
}

/* ---- ПЕРЕВЕСТИ ООНЕТКИ ---- */
function tbTransfer(body,rail){
  const others=Object.keys(encLoad(LS.acc,{})).filter(u=>u!==me.user);
  body.innerHTML=`<div class="pcard" style="padding:16px 18px">
    <div class="pf-name" style="font-size:16px">перевести оонетки другу</div>
    <div class="pf-sub" style="padding-bottom:4px">оонетки улетают моментально и зачисляются получателю на баланс</div>
    <label class="f-lbl">кому</label>
    <input class="inp-line" id="trTo" placeholder="юзернейм" readonly value="${window.__trTo||''}">
    <div style="margin-top:7px"><button class="link-red" id="trPick">выбрать из друзей</button></div>
    <label class="f-lbl">сколько</label>
    <input class="inp-line" id="trAmt" type="number" min="1" step="1" placeholder="например 50" value="${window.__trAmt||''}">
    <label class="f-lbl">комментарий</label>
    <input class="inp-line" id="trCmt" maxlength="80" placeholder="необязательно" value="${window.__trCmt||''}">
    <div style="display:flex;align-items:center;gap:14px;margin-top:16px;flex-wrap:wrap">
      <button class="dan-btn" id="trGo">Перевести</button>
      <span class="from-line" id="trBal">с вашего баланса: ${myOon()} оонеток</span>
    </div>
  </div>`;
  const to=body.querySelector('#trTo'),amt=body.querySelector('#trAmt'),cmt=body.querySelector('#trCmt');
  amt.oninput=()=>{const n=Math.floor(Number(amt.value)||0);body.querySelector('#trBal').innerHTML='с вашего баланса: '+myOon()+' оонеток'+(n>0?' · после перевода останется '+Math.max(0,myOon()-n):'');};
  body.querySelector('#trPick').onclick=e=>{
    if(!others.length){toast('пока нет других котиков');return;}
    menuPop(e.clientX,e.clientY,others.map(u=>({t:u+' · '+(wallet()[u]||0)+' оонеток',f:()=>{to.value=u;to.dataset.u=u;}})),true);
  };
  body.querySelector('#trGo').onclick=()=>{
    const rc=to.value||to.dataset.u||'';
    if(!rc){toast('выбери, кому переводим');return;}
    const n=Math.floor(Number(amt.value)||0);
    if(n<=0){toast('надо число больше нуля');return;}
    if(!others.includes(rc)){toast('нет такого котика');return;}
    if(n>myOon()){toast('оонеток не хватает. баланс: '+myOon());return;}
    addOon(-n);
    const w=wallet();w[rc]=(w[rc]||0)+n;save(LS.wallet,w);
    pushNotif(rc,'💸','@'+me.user+' перевёл тебе '+n+' оонеток'+(cmt.value.trim()?': «'+cmt.value.trim()+'»':''));
    addLog('gift',me.user,'перевёл '+n+' оонеток котику '+rc);
    toast(''+n+' оонеток улетели '+rc+'!');
    window.__trTo='';window.__trAmt='';window.__trCmt='';
    renderGifts();refreshOonChip();
  };
}

/* ---- КЛЮЧИ ---- */
function genKey(){
  const A='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const blk=()=>Array.from({length:4},()=>A[Math.floor(Math.random()*A.length)]).join('');
  return blk()+'-'+blk()+'-'+blk()+'-'+blk();
}
function tbKey(body,rail){
  const keys=load(LS.keys,{});
  const mine=Object.keys(keys).filter(k=>keys[k].used===me.user);
  body.innerHTML=`<div class="pcard" style="padding:16px 18px">
    <div class="pf-name" style="font-size:16px">Активировать ключ</div>
    <div class="pf-sub" style="padding-bottom:4px">ключ даёт оонетки. формат ключа: XXXX-XXXX-XXXX-XXXX</div>
    <label class="f-lbl">Ключ</label>
    <input class="inp-line" id="krKey" maxlength="19" placeholder="XXXX-XXXX-XXXX-XXXX" value="${window.__krKey||''}" style="text-transform:uppercase;letter-spacing:2px">
    <label class="f-lbl">Пароль, если есть</label>
    <input class="inp-line" id="krPass" type="password" placeholder="необязательно">
    <div style="margin-top:16px;flex-wrap:wrap">
      <button class="minibtn" id="krGo" style="background:#2b2f36;color:#fff;border-color:#2b2f36;padding:10px 26px;font-weight:800">Активировать</button>
    </div>
    ${mine.length?'<div style="margin-top:12px"><b style="font-size:12.5px">активировано мной:</b>'+mine.map(k=>`<div class="from-line" style="padding-top:4px">${keys[k].a} оонеток — ${esc(k)}</div>`).join('')+'</div>':''}
    ${isAdmin()?admKeysBlock(keys):''}
  </div>`;
  const ki=body.querySelector('#krKey'),kp=body.querySelector('#krPass');
  ki.oninput=()=>{ki.value=ki.value.toUpperCase().replace(/[^A-Z0-9-]/g,'');window.__krKey=ki.value;};
  body.querySelector('#krGo').onclick=()=>{
    const k=ki.value.trim().toUpperCase();
    if(!/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(k)){toast('формат ключа: XXXX-XXXX-XXXX-XXXX');return;}
    const ks=load(LS.keys,{});
    const kk=ks[k];
    if(!kk){toast('такого ключа нет');return;}
    if(kk.used){toast('ключ уже использован');return;}
    if(kk.p&&kp.value!==kk.p){toast('нужен правильный пароль к ключу');return;}
    kk.used=me.user;kk.usedTs=Date.now();save(LS.keys,ks);
    addOon(kk.a);
    pushNotif(me.user,'🔑','Ключ активирован: +'+kk.a+' оонеток'+(kk.p?' (был с паролем)':''));
    addLog('key',me.user,'активировал ключ на '+kk.a+' оонеток');
    toast('ключ активирован: +'+kk.a+' оонеток 🎉');
    window.__krKey='';
    renderGifts();refreshOonChip();
  };
  if(isAdmin())wireAdminKeys(body);
}
function admKeysBlock(keys){
  const list=Object.keys(keys).map(k=>{
    const kk=keys[k];
    return `<div class="adm-row"><b style="letter-spacing:1px">${esc(k)}</b><span class="from-line">${kk.a} оонеток${kk.p?' · с паролем':''}${kk.used?' · использован: '+esc(kk.used):' · свободен'}</span><button class="minibtn" data-copy="${esc(k)}">копировать</button><button class="x" data-delkey="${esc(k)}">✕</button></div>`;
  }).join('');
  return `<div style="margin-top:16px;padding-top:10px;border-top:1px solid var(--line)">
    <b style="font-size:13px;color:var(--acc)">ключи администратора (${Object.keys(keys).length})</b>
    <div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <button class="dan-btn" id="keyNew" style="padding:9px 18px">＋ Создать ключ</button>
      <span class="from-line">выдаёшь ключи котикам: сумма + (по желанию) пароль</span>
    </div>
    ${list}
  </div>`;
}
function wireAdminKeys(body){
  const mk=body.querySelector('#keyNew');
  if(!mk)return;
  mk.onclick=()=>{
    const a=prompt('сколько оонеток даст ключ?','500');
    const n=Math.floor(Number(a)||0);
    if(n<=0){toast(n===0?'введи сумму':'отменено');return;}
    if(n>100000){toast('слишком много generosity в одном ключе (до 100000)');return;}
    const p=prompt('пароль к ключу (можно пусто — без пароля):','');
    if(p===null)return;
    const code=genKey();
    const ks=load(LS.keys,{});
    ks[code]={a:n,p:p.trim(),by:me.user,ts:Date.now(),used:null};
    save(LS.keys,ks);
    try{navigator.clipboard&&navigator.clipboard.writeText(code);}catch(e){}
    toast('ключ создан и скопирован: '+code);
    addLog('admin',me.user,'создал ключ на '+n+' оонеток');
    renderGifts();
  };
  body.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>{
    try{navigator.clipboard&&navigator.clipboard.writeText(b.dataset.copy);}catch(e){}
    toast('скопировано: '+b.dataset.copy);
  });
  body.querySelectorAll('[data-delkey]').forEach(b=>b.onclick=()=>{
    const ks=load(LS.keys,{});delete ks[b.dataset.delkey];save(LS.keys,ks);renderGifts();
    addLog('admin',me.user,'удалил ключ');toast('ключ удалён');
  });
}

/* ---- ПРЕДЛОЖИТЬ ПОДАРОК ---- */
function tbPropose(body,rail){
  const direct=pfDirectOpen&&isAdmin();
  pfDirectOpen=false;
  const my=propsAll().filter(p=>p.by===me.user);
  body.innerHTML=`<div class="pcard" style="padding:16px 18px">
    <div class="pf-name" style="font-size:16px">${direct?'Добавить подарок (админ)':'Предложить подарок'}</div>
    <div class="pf-sub" style="padding-bottom:4px">${direct?'подарок сразу появится в общем магазине у всех котиков':'администратор рассмотрит и, если всё ок, добавит в общий магазин'}</div>
    <div class="cat-item" style="align-items:center;cursor:pointer" id="pfPickRow">
      <span class="prop-prev" id="pfPrev"><span style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted2);font-size:12px">${pfFile?'':'нет картинки'}</span></span>
      <div style="flex:1;min-width:0">
        <button class="dan-btn" id="pfPick" style="padding:9px 16px;font-size:12.5px">Выберите файл</button>
        <span class="from-line" id="pfFileName" style="margin-left:10px">${pfFile?esc(pfFile.name):'Файл не выбран'}</span>
      </div>
    </div>
    <label class="f-lbl">Название</label>
    <input class="inp-line" id="pfName" maxlength="40" placeholder="например: Рыбка мурчальная" value="${window.__pfName||''}">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div><label class="f-lbl">Цена</label><input class="inp-line" id="pfPrice" type="number" min="1" placeholder="оонеток" value="${window.__pfPrice||''}"></div>
      <div><label class="f-lbl">Тираж</label><input class="inp-line" id="pfTiraj" type="number" min="1" value="${window.__pfTiraj||100}"></div>
    </div>
    <label class="f-lbl">Редкость</label>
    <div style="display:flex;gap:8px;flex-wrap:wrap" id="pfRars">
      ${['common','rare','pizdets','ebat'].map(r=>`<button type="button" class="minibtn rarbtn rar-${r}${((window.__pfR||'common')===r)?' on':''}" data-r="${r}">${RARITY[r]}</button>`).join('')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div><label class="f-lbl">Автор дизайна</label><input class="inp-line" id="pfA1" placeholder="@юзернейм" value="${window.__pfA1||('@'+me.user)}"></div>
      <div><label class="f-lbl">Второй автор</label><input class="inp-line" id="pfA2" placeholder="@юзернейм (необязательно)" value="${window.__pfA2||''}"></div>
    </div>
    <label class="f-lbl">Комментарий</label>
    <textarea class="inp-line" id="pfCmt" rows="3" maxlength="300" placeholder="что за подарок, почему достойный">${window.__pfCmt||''}</textarea>
    <button class="dan-btn" id="pfGo" style="margin-top:14px">${direct?'Добавить в общий магазин':'Отправить'}</button>
    ${my.length?'<div style="margin-top:14px"><b style="font-size:12.5px;color:var(--muted)">мои предложения</b>'+my.map(p=>`<div class="adm-row"><span style="font-size:18px">${giftImgHTML({mid:p.mid,ic:'🎁'},26)}</span><b>${esc(p.name)}</b><span class="from-line">${p.price} оонеток · тираж ${p.tiraj} · ${p.status==='pub'?'✅ в магазине':'на рассмотрении'}</span></div>`).join('')+'</div>':''}
  </div>`;
  const fi=body.querySelector('#pfFileSlot')||body.appendChild(Object.assign(document.createElement('input'),{type:'file',accept:'image/*',className:'hidden',id:'pfFileSlot'}));
  fi.onchange=()=>{const f=fi.files[0];if(!f)return;
    if(!f.type.startsWith('image/')){toast('нужна картинка');fi.value='';return;}
    if(f.size>3.5*1024*1024){toast('картинка до 3.5МБ');fi.value='';return;}
    pfFile=f;
    body.querySelector('#pfFileName').textContent=f.name;
    const pv=body.querySelector('#pfPrev');pv.innerHTML='';
    const im=document.createElement('img');im.src=URL.createObjectURL(f);im.className='prop-prev';im.style.borderStyle='solid';
    pv.replaceWith(im);im.id='pfPrev';
    fi.value='';
  };
  body.querySelector('#pfPick').onclick=()=>fi.click();
  body.querySelector('#pfPickRow').onclick=e=>{if(e.target.id!=='pfPick')fi.click();};
  body.querySelectorAll('#pfRars .rarbtn').forEach(b=>b.onclick=()=>{
    window.__pfR=b.dataset.r;
    body.querySelectorAll('#pfRars .rarbtn').forEach(x=>x.classList.toggle('on',x===b));
  });
  body.querySelector('#pfGo').onclick=()=>{
    const name=body.querySelector('#pfName').value.trim();
    const price=Math.floor(Number(body.querySelector('#pfPrice').value)||0);
    const tiraj=Math.max(1,Math.floor(Number(body.querySelector('#pfTiraj').value)||100));
    const a1=body.querySelector('#pfA1').value.trim().replace(/^@/,'');
    const a2=body.querySelector('#pfA2').value.trim().replace(/^@/,'');
    const cmt=body.querySelector('#pfCmt').value.trim();
    window.__pfName=name;window.__pfPrice=body.querySelector('#pfPrice').value;window.__pfA1=body.querySelector('#pfA1').value;window.__pfA2=body.querySelector('#pfA2').value;window.__pfCmt=cmt;
    const r=window.__pfR||'common';
    if(!pfFile){toast('выбери картинку подарка');return;}
    if(!name){toast('напиши название');return;}
    if(price<1){toast('цена — целое число оонеток');return;}
    const accs=encLoad(LS.acc,{});
    if(!accs[a1]){toast('автор дизайна: не найден аккаунт @'+a1);return;}
    if(a2&&!accs[a2]){toast('второй автор: не найден аккаунт @'+a2);return;}
    putMedia(pfFile,mid=>{
      if(!mid){toast('не удалось сохранить картинку');return;}
      if(direct){
        const cat=giftCatalog();
        cat.unshift({id:'g'+Date.now().toString(36),n:cat.reduce((m,g)=>Math.max(m,g.n||0),0)+1,mid,name,price,tiraj,a1,a2,cmt,r,by:me.user,ts:Date.now()});
        saveCatalog(cat);
        addLog('admin',me.user,'добавил подарок «'+name+'» в магазин');
        toast('подарок «'+name+'» в общем магазине!');
      }else{
        const ps=propsAll();
        ps.unshift({id:'pr'+Date.now().toString(36)+Math.floor(Math.random()*99),by:me.user,mid,name,price,tiraj,a1,a2,cmt,r,ts:Date.now(),status:'new'});
        saveProps(ps);
        pushNotif(ADMIN,'📦','@'+me.user+' предложил подарок «'+name+'» — посмотри предложку');
        addLog('gift',me.user,'предложил подарок «'+name+'»');
        toast('отправлено в предложку — админ рассмотрит');
      }
      pfFile=null;window.__pfName=window.__pfPrice=window.__pfA1=window.__pfA2=window.__pfCmt='';window.__pfR='common';
      syncGiftBadge();renderGifts();
    });
  };
}

/* ---- КОПИЛКА ---- */
function tbKopilka(body,rail){
  const s=myClickStats();
  body.innerHTML=`<div class="pcard" style="padding:18px">
    <div class="kp-wrap" id="kpWrap" style="text-align:center">
      <div class="kp-coin" id="kpCoin" role="button" tabindex="0" title="жми — копи оонетки">О</div>
    </div>
    <div style="text-align:center;font-size:14.5px">каждые <b>5 кликов</b> — <b>1 оонетка</b>.</div>
    <div class="from-line" style="text-align:center;margin-top:7px" id="kpDay">Сегодня ${s.todayN} из ${CLICK_CAP} кликов</div>
    <div id="kpBar" style="display:flex;gap:5px;justify-content:center;margin-top:10px">
      ${[0,1,2,3,4].map(i=>`<span class="kp-seg" style="width:44px;height:10px;border-radius:6px;border:1px solid var(--line);background:var(--card2);transition:background .2s"></span>`).join('')}
    </div>
    <div class="from-line" style="text-align:center;margin-top:5px" id="kpSegLab">${s.todayN%CLICKS_PER} из 5</div>    <div style="display:flex;gap:8px;justify-content:center;align-items:center;margin-top:12px;flex-wrap:wrap">
      <button class="dan-btn" id="kpDaily" style="padding:9px 18px"><svg class="mi"><use href="#i-gift"/></svg> бонус дня</button>
      <span class="from-line">стрик: <b id="kpStreak">${dailyInfo().streak}</b> дн.</span>
    </div>
    <div class="from-line" style="text-align:center;margin-top:8px">лимит в день: ${CLICK_CAP} кликов — это ${Math.floor(CLICK_CAP/CLICKS_PER)} оонеток</div>
    <div class="panel" style="margin-top:16px;padding:14px 16px;text-align:left">
      <b style="font-size:13px;display:block;padding-bottom:4px">статистика</b>
      <div class="stat-line"><span>баланс</span><b id="kpBal">${myOon()}</b></div>
      <div class="stat-line"><span>сегодня</span><b id="kpToday">${s.todayN} из ${CLICK_CAP}</b></div>
      <div class="stat-line"><span>всего кликов</span><b id="kpTot">${s.total}</b></div>
      <div class="stat-line"><span>заработано</span><b id="kpEarn">${s.earned}</b></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
        <button class="minibtn" id="rbShop">потратить на подарки</button>
        <button class="minibtn" id="rbRef">пригласить друзей</button>
      </div>
    </div>
    <div class="panel" style="padding:14px 16px;margin-top:12px;text-align:left">
      <b style="font-size:13px;display:block;padding-bottom:6px">лучшие копильщики</b>
      ${leadRows()}
    </div>
  </div>`;
  const wrap=body.querySelector('#kpWrap');
  const coin=wrap.querySelector('#kpCoin');
  wrap.onclick=e=>{
    if(e.target.closest('.kp-plus'))return;
    coinClick(e,wrap);
  };
  coin.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();coinClick({clientX:wrap.getBoundingClientRect().left+90,clientY:wrap.getBoundingClientRect().top+90},wrap);}};
  body.querySelector('#kpDaily').onclick=claimDaily;
  body.querySelector('#rbShop').onclick=()=>{giftTab='shop';renderGifts();};
  body.querySelector('#rbRef').onclick=()=>{giftTab='ref';renderGifts();};
}
function leadRows(){
  const c=clickStats();
  const rows=Object.keys(c).map(u=>({u,t:c[u].total||0})).filter(r=>r.t>0).sort((a,b)=>b.t-a.t).slice(0,10);
  if(!rows.length)return '<div class="from-line">пока никто не кликает — стань первым!</div>';
  return rows.map((r,i)=>`<div class="stat-line"><span>${i+1}. ${esc(r.u)}${badgeFor(r.u)}</span><b>${r.t} ▹</b></div>`).join('');
}

/* ---- ЗАДАНИЯ ---- */
function tbQuests(body,rail){
  const w=wcMe();
  body.innerHTML=`<div class="pcard" style="padding:14px 18px 16px">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding-bottom:2px">
      <div class="pf-name" style="font-size:17px">задания недели</div>
      <div class="grow"></div>
      <span class="from-line" id="qTimer">Новые задания через ${weekResetIn()}.</span>
    </div>
    ${QUEST_DEFS.map(q=>{
      const prog=q.key==='likes'?(w.likes||0):q.key==='cmts'?(w.cmts||0):q.key==='posts'?(w.posts||0):(Object.keys(w.trks||{}).length);
      const done=prog>=q.target;
      const cl=(w.claimed||{})[q.id];
      const pct=Math.min(100,Math.round(prog*100/q.target));
      return `<div class="q-item" style="display:flex;gap:14px">
        <div style="flex:1;min-width:0">
          <b style="font-size:13.5px">${esc(q.t)}</b>
          <div class="from-line" style="margin-top:3px">${esc(q.d)}</div>
          <div class="q-bar"><i style="width:${pct}%"></i></div>
          <div class="from-line" style="margin-top:5px">${Math.min(prog,q.target)} из ${q.target}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end;justify-content:center">
          <span class="${cl?'q-out':'q-rw'}">${cl?'Получено':'+'+q.r+' оонеток'}</span>
          ${(done&&!cl)?'<button class="dan-btn" data-qc="'+q.id+'" style="padding:8px 16px;font-size:12.5px">Получить</button>':''}
        </div>
        </div>
      </div>`;
    }).join('')}
  </div>`;
  body.querySelectorAll('[data-qc]').forEach(b=>b.onclick=()=>questClaim(b.dataset.qc));
}

/* ---- РЕФЕРАЛЫ ---- */
function tbRefs(body,rail){
  const r=load(LS.refs,{});
  const mine=(r[me.user]||[]).filter(Boolean);
  const link=location.href.split('#')[0]+'#ref='+encodeURIComponent(me.user);
  body.innerHTML=`<div class="pcard" style="padding:16px 18px">
    <div class="pf-name" style="font-size:16px">рефералы</div>
    <div class="pf-sub" style="padding-bottom:8px">по твоей ссылке приходит котик — получаешь <b>+200</b> оонеток сразу</div>
    <div class="cat-item" style="align-items:center;margin-top:0">
      <input class="inp-line" id="refLk" readonly value="${esc(link)}" style="flex:1">
      <button class="minibtn" id="refCopy" style="padding:10px 16px">скопировать</button>
    </div>
    <div class="stat-line" style="margin-top:10px"><span>Приглашено котиков</span><b>${mine.length}</b></div>
    ${mine.length?'<div style="margin-top:4px">'+mine.map(u=>`<div class="adm-row"><span style="font-size:18px">${avaHTML(u,'🐈')}</span><b>${esc(u)}${badgeFor(u)}</b><span class="from-line">пришёл по твоей ссылке</span></div>`).join('')+'</div>':'<div class="from-line" style="margin-top:6px">пока никого. кинь ссылку друзьям — они регистрируются, тебе падают оонетки</div>'}
  </div>`;
  body.querySelector('#refCopy').onclick=()=>{
    const ok=n=>toast(n?'скопировано!':'скопируй руками: '+link);
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(link).then(()=>ok(1),()=>ok(0));
    else ok(0);
  };
}

/* ---- ПРЕДЛОЖКА (админ) ---- */
function tbProps(body,rail){
  const ps=propsAll();
  const fresh=ps.filter(p=>p.status==='new');
  const old=ps.filter(p=>p.status!=='new');
  body.innerHTML=`<div class="pcard" style="padding:14px 18px 16px">
    <b style="font-size:14px">предложка · новые (${fresh.length})</b>
    ${fresh.length?'':'<div class="empty-note">новых предложений нет — котики отдыхают</div>'}
    ${fresh.map(p=>`<div class="cat-item">
      ${giftImgHTML(p,66)}
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><b>${esc(p.name)}</b><span class="oon-chip" style="padding:2px 10px">${p.price} оонеток</span></div>
        <div class="g-foot">от ${userLink(p.by)} · тираж ${p.tiraj} · ${new Date(p.ts).toLocaleString('ru-RU')}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:3px">автор дизайна: ${userLink(p.a1)}${p.a2?' · второй: '+userLink(p.a2):''}</div>
        ${p.cmt?'<div style="font-size:12px;color:var(--text);margin-top:4px">Комментарий: '+esc(p.cmt)+'</div>':''}
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="dan-btn" data-pok="${p.id}" style="padding:8px 16px;font-size:12.5px">Добавить в магазин</button>
          <button class="minibtn" data-pno="${p.id}" style="padding:8px 14px">отклонить</button>
        </div>
      </div>
    </div>`).join('')}
    ${old.length?'<b style="font-size:13px;display:block;margin-top:14px">история</b>'+old.map(p=>`<div class="adm-row">${giftImgHTML(p,24)||''}<b style="flex:1;min-width:0">${esc(p.name)} · ${p.price} оонеток · от ${esc(p.by)}</b><span class="${p.status==='pub'?'q-out':''} from-line">${p.status==='pub'?'✅ в магазине':'отклонён'}</span></div>`).join(''):''}
  </div>`;
  body.querySelectorAll('[data-pok]').forEach(b=>b.onclick=()=>{
    const ps2=propsAll();
    const p=ps2.find(x=>x.id===b.dataset.pok);
    if(!p)return;
    const cat=giftCatalog();
    cat.unshift({id:'g'+Date.now().toString(36),n:cat.reduce((m,g)=>Math.max(m,g.n||0),0)+1,mid:p.mid,name:p.name,price:p.price,tiraj:p.tiraj,a1:p.a1,a2:p.a2,cmt:p.cmt,r:p.r||'common',by:p.by,ts:Date.now()});
    saveCatalog(cat);
    p.status='pub';saveProps(ps2);
    pushNotif(p.by,'✅','Твой подарок «'+p.name+'» приняли в магазин!');
    addLog('admin',me.user,'принял в магазин «'+p.name+'» от '+p.by);
    toast('«'+p.name+'» теперь у всех в магазине');
    syncGiftBadge();renderGifts();
  });
  body.querySelectorAll('[data-pno]').forEach(b=>b.onclick=()=>{
    const ps2=propsAll();
    const p=ps2.find(x=>x.id===b.dataset.pno);
    if(!p)return;
    p.status='no';saveProps(ps2);
    pushNotif(p.by,'❌','Админ отклонил подарок «'+p.name+'»');
    addLog('admin',me.user,'отклонил «'+p.name+'» от '+p.by);
    toast('предложение отклонено');
    syncGiftBadge();renderGifts();
  });
}

/* ============ ИСТОРИИ ============ */
function storiesAll(){return load(LS.stories,[])}
function saveStories(s){save(LS.stories,s)}
function freshStories(){return storiesAll().filter(s=>Date.now()-s.ts<24*3600*1000)}
function renderStories(){
  const bar=document.getElementById('storyBar');if(!bar)return;
  const seen=load(LS.storySeen,[]);
  const fresh=freshStories();
  bar.innerHTML=(me&&!me.guest?'<div style="text-align:center"><button class="story-add" id="storyNew" title="своё сторис">＋</button><div class="story-cap">моя история</div></div>':'')
    +(fresh.length?fresh.map(s=>`<div style="text-align:center" data-vv="${s.id}"><div class="story-ring ${seen.includes(s.id)?'seen':''}"><div class="ava2">${s.mid?'<img src="'+mediaURL(s.mid)+'">':esc(s.ava||'🐈')}</div></div><div class="story-cap">${esc(s.user)}</div></div>`).join(''):(me&&me.guest?'<div class="empty-note" style="padding:6px">сторис пока нет</div>':''));
  const add=document.getElementById('storyNew');
  if(add)add.onclick=()=>{const p=document.createElement('input');p.type='file';p.accept='image/*,video/*';
    p.onchange=()=>{const f=p.files[0];if(!f)return;
      if(f.size>10*1024*1024){toast('файл до 10МБ');return;}
      putMedia(f,mid=>{if(!mid)return;
        askForm('подпись к сторис (можно пусто)',[{ph:'подпись…'}],cap=>{
          const all=storiesAll();all.unshift({id:'s'+Date.now().toString(36),user:me.user,ava:me.ava||'🐈',mid,cap:(cap||'').trim(),kind:f.type.startsWith('video')?'vid':'img',ts:Date.now()});
          saveStories(all);addLog('story',me.user,'выложил сторис');toast('история живёт 24 часа!');renderStories();
        });
      });};
    p.click();};
  bar.querySelectorAll('[data-vv]').forEach(el=>el.onclick=()=>viewStory(el.dataset.vv));
}
/* просмотрщик: полоски сверху, автопереход, тап влево/вправо, ← → на клавиатуре */
function viewStory(id){
  const fresh=freshStories();if(!fresh.length)return;
  let idx=Math.max(0,fresh.findIndex(x=>x.id===id));
  if(document.querySelector('.story-view'))document.querySelector('.story-view').remove();
  const v=document.createElement('div');v.className='story-view';
  document.body.appendChild(v);
  let timer=null;
  const dur=s=>s.kind==='vid'?7000:5500;
  const markSeen=s=>{const seen=load(LS.storySeen,[]);if(!seen.includes(s.id)){seen.push(s.id);save(LS.storySeen,seen);}};
  function show(){
    clearTimeout(timer);
    const s=fresh[idx];if(!s){close();return;}
    markSeen(s);
    const bars=fresh.map((x,i)=>`<i class="${i<idx?'done':i===idx?'live':''}" style="--dur:${dur(x)}ms"></i>`).join('');
    const media=s.mid
      ?(s.kind==='vid'?`<video src="${mediaURL(s.mid)}" autoplay loop playsinline></video>`:`<img src="${mediaURL(s.mid)}" alt="">`)
      :`<div style="height:70vh;display:flex;align-items:center;justify-content:center;font-size:90px;background:#000;border-radius:14px">${esc(s.ava||'🐈')}</div>`;
    v.innerHTML=`<div class="sb">
      <div class="sbbar">${bars}</div>
      <div class="st-head">
        <div class="st-av">${esc(s.ava||'🐈')}</div>
        <div style="flex:1"><div class="st-name">@${esc(s.user)}</div><div class="st-time">${timeAgo(s.ts)}</div></div>
        ${(isAdmin()||s.user===(me&&me.user))?'<button class="icon-btn" id="stDel" title="удалить">🗑</button>':''}
        <button class="icon-btn" id="stClose" title="закрыть">✕</button>
      </div>
      ${media}
      ${s.cap?`<div class="st-cap">${esc(s.cap)}</div>`:''}
      <div class="st-zone"><b data-z="prev"></b><b data-z="next"></b></div>
    </div>`;
    v.querySelector('#stClose').onclick=close;
    const del=v.querySelector('#stDel');
    if(del)del.onclick=()=>{saveStories(storiesAll().filter(x=>x.id!==s.id));close();renderStories();toast('сторис удалено');};
    v.querySelectorAll('.st-zone b').forEach(z=>z.onclick=()=>{z.dataset.z==='next'?next():prev();});
    const vid=v.querySelector('video');
    if(vid)vid.onloadedmetadata=()=>{if(vid.duration&&vid.duration<8){fresh[idx]=Object.assign({},s,{_d:vid.duration*1000});}};
    timer=setTimeout(next,(s._d?Math.min(s._d,10000):dur(s)));
    const seenNow=load(LS.storySeen,[]);renderStories();
  }
  function next(){if(idx<fresh.length-1){idx++;show();}else close();}
  function prev(){if(idx>0){idx--;show();}else show();}
  function close(){clearTimeout(timer);v.remove();renderStories();}
  v.onkeydown=e=>{if(e.key==='ArrowRight'||e.key===' ')next();if(e.key==='ArrowLeft')prev();if(e.key==='Escape')close();};
  v.tabIndex=0;setTimeout(()=>v.focus(),30);
  show();
}
/* досрочная смерть сторис-хранилища: чистим мёртвые на luzke */
(function cleanStories(){const alive=storiesAll().filter(s=>Date.now()-s.ts<24*3600*1000);if(alive.length!==storiesAll().length)saveStories(alive);})();

/* ============ МАЛЕНЬКАЯ ВИЗИТКА ПРИ НАВЕДЕНИИ ============ */
function hoverCard(el,user){
  const accs=encLoad(LS.acc,{});
  const a=accs[user]||{};
  const pd=profOf(user);
  const wall=load(LS.posts,[]).filter(p=>p.author===user).length;
  const trs=tracksAll().filter(t=>t.origin==='local'&&!t.priv&&t.artist===user).length;
  const c=document.createElement('div');c.className='hcard';
  c.innerHTML=`<div style="display:flex;gap:10px;align-items:center"><div class="ava" style="width:38px;height:38px;font-size:20px">${avaHTML(user,a.ava||'🐈')}</div>
    <div><div class="hn">${esc(pd.dn||user)}${badgeFor(user)}</div><div class="hsub">@${esc(user)}${userIsAdmin(user)?' · главный кот':''}${isOnline(user)?' · <span style="color:var(--good)">в сети</span>':''}</div></div></div>
    ${pd.status?'<div class="hst" style="color:var(--text);font-size:12px">'+esc(pd.status)+'</div>':''}
    <div class="hst" style="color:var(--muted2);font-size:12px">${esc(a.createdAt?('на oomy с '+a.createdAt):'котик на oomy')} · друзей: ${friendsOf(user).length}</div>
    <div class="htr">📝 ${wall} записей · 🎵 ${trs} треков · 🎁 ${(load(LS.gifts,{})[user]||[]).length} подарков</div>`;
  document.body.appendChild(c);
  const r=el.getBoundingClientRect();
  c.style.left=Math.min(Math.max(10,r.left),innerWidth-244)+'px';
  c.style.top=Math.min(r.bottom+8,innerHeight-120)+'px';
  el._hc=c;
  const kill=()=>{el._hc&&(el._hc.remove(),el._hc=null)};
  el.addEventListener('mouseleave',kill,{once:true});
  setTimeout(kill,6000);
}
function wireHoverCards(scope){
  scope.querySelectorAll('.cmt-name,.p-name[data-author]').forEach(el=>{
    if(el._hcw)return;el._hcw=true;
    el.addEventListener('mouseenter',()=>{const u=el.dataset.author||el.textContent.replace('✔','').trim();if(u&&u.indexOf('#')!==0)hoverCard(el,u);});
  });
}
/* ============ МАЛЕНЬКАЯ ВИЗИТКА ПРИ НАВЕДЕНИИ (конец) ============ */

/* ============ ТЕМА + АКЦЕНТ ============ */
const themeBtn=document.getElementById('themeBtn');
function applyTheme(t,persist=true){document.documentElement.dataset.theme=t;themeBtn.textContent=t==='dark'?'🌙':'🌞';save(LS.theme,t);if(persist&&me&&me.user&&!me.guest){const p=prof();p.theme=t;saveProf(p);}}
function applyAccent(c,persist=true){
  document.documentElement.style.setProperty('--acc',c);
  document.documentElement.dataset.acc=c==='#ffffff'||c==='#f8fafc'?'light':'dark';
  const m=c.replace('#','');const r=parseInt(m.slice(0,2),16),g=parseInt(m.slice(2,4),16),b=parseInt(m.slice(4,6),16);
  const lum=(0.299*r+0.587*g+0.114*b)/255;
  document.documentElement.style.setProperty('--acc-fg',lum>0.66?'#111114':'#fff');
  save(LS.accent,c);
  if(persist&&me&&me.user&&!me.guest){const p=prof();p.siteAccent=c;saveProf(p);}
}
function applyThemePreset(name){
  const presets={neon:'#00f2ff',rose:'#ff4d7d',emerald:'#22c55e',amber:'#f59e0b',violet:'#a855f7',orange:'#fb923c',cyan:'#06b6d4',pink:'#ec4899'};
  if(presets[name])applyAccent(presets[name]);
}
applyTheme(load(LS.theme,'dark'),false);
applyAccent(load(LS.accent,'#7a6cff'),false);
themeBtn.onclick=()=>{
  const next=document.documentElement.dataset.theme==='dark'?'light':'dark';
  const r=themeBtn.getBoundingClientRect(),m=Math.max(innerWidth,innerHeight)*2.4;
  const rip=document.createElement('div');rip.className='theme-ripple';
  rip.style.cssText='left:'+(r.left+22)+'px;top:'+(r.top+22)+'px;width:'+m+'px;height:'+m+'px;margin-left:'+(-m/2)+'px;margin-top:'+(-m/2)+'px;background:radial-gradient(circle,'+(next==='light'?'rgba(255,255,255,.35)':'rgba(20,22,30,.45)')+' 0%,transparent 70%)';
  document.body.appendChild(rip);setTimeout(()=>rip.remove(),850);
  applyTheme(next);
};

/* ============ ЭКРАНЫ ============ */
const scrLogin=document.getElementById('screenLogin'),scrReg=document.getElementById('screenReg'),scrFeed=document.getElementById('screenFeed');
function showScreen(name){[scrLogin,scrReg,scrFeed].forEach(s=>s.classList.add('hidden'));name.classList.remove('hidden');}

/* ============ СЕССИЯ ============ */
let me=null;
function setSession(s){save(LS.sess,s);if(s.temporary)sessionStorage.setItem(LS.sess,JSON.stringify(s));}

/* ============ ВХОД ============ */
const liUser=document.getElementById('li-user');
const liPass=document.getElementById('li-pass');
const liErr=document.getElementById('li-err');
const liShow=document.getElementById('li-show');
const loginForm=document.getElementById('loginForm');
liShow.onclick=()=>{liPass.type=liPass.type==='password'?'text':'password';liShow.textContent=liPass.type==='password'?'показать':'скрыть';};
document.getElementById('forgot').onclick=()=>{
  askForm('восстановление пароля',[{ph:'твой юзернейм'},{ph:'секретное слово (которое придумал при регистрации)'}],(u,s)=>{
    u=(u||'').trim().replace(/^@/,'');
    const accs=encLoad(LS.acc,{});
    const key=Object.keys(accs).find(k=>k.toLowerCase()===u.toLowerCase());
    if(!key){liErr.textContent='такого котика нет';return false;}
    const a=accs[key];
    if(!a.secret){liErr.textContent='у этого аккаунта нет секретного слова — спроси у хозяина сайта';return false;}
    if(a.secret!==btoa(unescape(encodeURIComponent((s||'').trim())))){liErr.textContent='секретное слово не то, киса';return false;}
    liErr.style.color='var(--good)';
    liErr.textContent='вот твой пароль: '+decodeURIComponent(escape(atob(a.pass)))+' — запиши его!';
    liUser.value=key;addLog('recovery',key,'пароль восстановлен по секретному слову');
  });
};
loginForm.onsubmit=async e=>{
  e.preventDefault();
  liErr.style.color='';
  /* общий мир: свежие аккаунты с сервера, вдруг друга зарегистрировали на другом устройстве */
  if(cloudEnabled())await cloudPoll();
  const u=liUser.value.trim(),p=liPass.value;
  const accs=encLoad(LS.acc,{});
  if(!u||!p){liErr.textContent='киса, заполни оба поля';return failShake();}
  const key=Object.keys(accs).find(k=>k.toLowerCase()===u.toLowerCase());
  if(!key){addLog('failed',u,'аккаунт не найден');liErr.textContent='такого котика нет. может, ты перепутал?';return failShake();}
  if(accs[key].pass!==btoa(unescape(encodeURIComponent(p)))){
    addLog('failed',key,'неверный пароль');liErr.textContent='пароль не тот. котик недоволен';return failShake();
  }
  if(accs[key].banned){addLog('failed',key,'заблокирован');liErr.textContent='аккаунт заблокирован администратором';return failShake();}
  accs[key].lastLogin=now();encSave(LS.acc,accs);
  const remember=document.getElementById('li-remember').checked;
  setSession({user:key,ava:accs[key].ava,temporary:!remember,admin:!!accs[key].admin});
  addLog('login',key,remember?'вход (запомнён)':'вход (сессия)');
  enterFeed();
};
function failShake(){loginForm.classList.add('shake');setTimeout(()=>loginForm.classList.remove('shake'),420);return false;}
document.getElementById('guestBtn').onclick=()=>{
  setSession({user:'котик-гость',ava:'🐈',guest:true,temporary:true});
  addLog('guest','котик-гость','вход без регистрации');
  enterFeed();
};
document.getElementById('readNews').onclick=()=>{
  setSession({user:'гость-читатель',ava:'😽',guest:true,temporary:true});
  addLog('guest','гость-читатель','чтение без регистрации');
  enterFeed();
};
function logout(){
  if(me)addLog('logout',me.user,'выход');
  localStorage.removeItem(LS.sess);sessionStorage.removeItem(LS.sess);
  me=null;openChatName=null;
  showScreen(scrLogin);document.title='oomy — вход';
  liPass.value='';liErr.textContent='';liUser.value='';
  pausePlayer();
}

/* ============ РЕГИСТРАЦИЯ ============ */
const rUser=document.getElementById('r-user');
const rHint=document.getElementById('r-user-hint');
const rPass=document.getElementById('r-pass');
const rPass2=document.getElementById('r-pass2');
const rSecret=document.getElementById('r-secret');
const rP2=document.getElementById('r-p2-hint');
const rScore=document.getElementById('r-mscore');
const rSegs=document.querySelectorAll('#r-meter i');
const rShow=document.getElementById('r-show');
rShow.onclick=()=>{rPass.type=rPass.type==='password'?'text':'password';rShow.textContent=rPass.type==='password'?'показать':'скрыть';};
rUser.addEventListener('input',()=>{
  const v=rUser.value.trim();rHint.className='hint';
  if(!v){rHint.textContent='только английский: буквы, цифры и _ (от 3 до 20)';return;}
  if(!/^[A-Za-z0-9_.#-]+$/.test(v)){rHint.textContent='только английские буквы, цифры и _ — кириллица не подойдёт';rHint.classList.add('bad');return;}
  if(v.length<3){rHint.textContent='слишком коротко, добавь мяу';rHint.classList.add('bad');return;}
  const accs=encLoad(LS.acc,{});
  if(Object.keys(accs).some(k=>k.toLowerCase()===v.toLowerCase())){
    rHint.textContent='уже занят другим котиком. придумай другой!';rHint.classList.add('bad');return;
  }
  rHint.textContent='отличный позывной, свободен!';rHint.classList.add('ok');
});
rPass.addEventListener('input',()=>{
  const v=rPass.value;let s=0;
  if(v.length>=6)s++;if(v.length>=10)s++;
  if(/[a-zа-яё]/.test(v)&&/[A-ZА-ЯЁ]/.test(v))s++;
  if(/\d/.test(v))s++;if(/[^\w\s]/.test(v))s++;
  const labels=['тощий котик','слабый пароль','так себе','неплохой кот','мощный кот','толстый кот-чемпион'];
  const colors=['#ff5b5b','#ff7a4d','#ffc44d','#ffe066','#8be26f','#5dd39e'];
  rScore.textContent=v?('надёжность: '+labels[s]):'';
  rScore.style.color=v?colors[s]:'';
  rSegs.forEach((el,i)=>{el.style.background=i<s?colors[s]:'var(--card2)';el.style.transform=i<s?'scaleY(1.5)':'scaleY(1)';});
});
rPass2.addEventListener('input',()=>{
  if(!rPass2.value){rP2.textContent='';rP2.className='hint';return;}
  if(rPass2.value===rPass.value){rP2.textContent='пароли совпадают';rP2.className='hint ok';}
  else{rP2.textContent='пароли разные, киса';rP2.className='hint bad';}
});
const DOGS=['🐕','🐶','🐩','🦮','🐕‍🦺','🐺'];
const CATS=['🐱','😺','😸','😻','🐈','🐈‍⬛'];
let capOk=false;
function buildCaptcha(){
  capOk=false;
  const res=document.getElementById('capRes');res.textContent='';res.className='cap-res';
  const grid=document.getElementById('capGrid');grid.innerHTML='';
  const dogs=[...DOGS].sort(()=>Math.random()-.5).slice(0,4);
  const items=dogs.map(e=>({e,cat:false}));
  items.splice(Math.floor(Math.random()*5),0,{e:rnd(CATS),cat:true});
  items.forEach(it=>{
    const b=document.createElement('button');b.type='button';b.textContent=it.e;
    b.onclick=()=>{
      if(it.cat){
        capOk=true;b.style.borderColor='var(--good)';b.style.filter='brightness(1.4)';
        res.textContent='верификация пройдена! ты человек (или очень умный котик)';
        res.className='cap-res ok';addLog('captcha-ok','—','капча: кошка найдена');
      }else{
        capOk=false;b.classList.add('wrong');
        res.textContent='мяу! это же пёс. коты переехали на новые места…';
        res.className='cap-res bad';setTimeout(buildCaptcha,900);
      }
    };
    grid.appendChild(b);
  });
}
document.getElementById('regForm').onsubmit=async e=>{
  e.preventDefault();
  /* общий мир: свежие аккаунты с сервера, чтобы ник не столкнулся с только что занятым */
  if(cloudEnabled())await cloudPoll();
  const form=e.target,u=rUser.value.trim(),p=rPass.value,p2=rPass2.value;
  const fail=msg=>{
    let box=form.querySelector('.err-line');
    if(!box){box=document.createElement('div');box.className='err-line';box.style.cssText='color:var(--bad);font-size:12.5px;margin-top:10px';form.appendChild(box);}
    box.textContent=msg;form.classList.add('shake');setTimeout(()=>form.classList.remove('shake'),420);
  };
  if(u.length<3)return fail('юзернейм хотя бы 3 символа, киса');
  if(!/^[A-Za-z0-9_.#-]+$/.test(u))return fail('юзернейм — только английские буквы, цифры и _');
  const accs=encLoad(LS.acc,{});
  if(Object.keys(accs).some(k=>k.toLowerCase()===u.toLowerCase())){
    addLog('failed-reg',u,'юзернейм занят');
    rHint.textContent='уже занят другим котиком!';rHint.className='hint bad';
    return fail('этот юзернейм занят навсегда. выбери другой');
  }
  if(p.length<6)return fail('пароль маловат — от 6 символов');
  if(p!==p2)return fail('пароли не совпадают');
  if(!rSecret.value||rSecret.value.trim().length<3)return fail('придумай секретное слово (от 3 символов) — оно спасёт тебя, если забудешь пароль');
  if(!capOk)return fail('сначала пройди верификацию: найди кошку среди псов');
  accs[u]={pass:btoa(unescape(encodeURIComponent(p))),secret:btoa(unescape(encodeURIComponent(rSecret.value.trim()))),ava:rnd(['🐈','🐈‍⬛','🐱','😼','😹','🐆','🐯']),createdAt:now(),lastLogin:null};
  encSave(LS.acc,accs);
  /* новый котик получает абсолютно чистый профиль и настройки */
  const pAll=profileAll();pAll[u]={};save(LS.profile,pAll);
  /* реферал: если регистрация по ссылке друга — пригласившему +200 оонеток */
  try{
    const rm=(location.hash||'').match(/#ref=([A-Za-z0-9_.#-]+)/);
    if(rm&&encLoad(LS.acc,{}).hasOwnProperty(rm[1])&&rm[1]!==u){
      const w=wallet();w[rm[1]]=(w[rm[1]]||0)+200;save(LS.wallet,w);
      const rs=load(LS.refs,{});(rs[rm[1]]=rs[rm[1]]||[]).push(u);save(LS.refs,rs);
      pushNotif(rm[1],'🐾','По твоей ссылке пришёл котик @'+u+': +200 оонеток');
    }
  }catch(e){}
  addLog('register',u,'аккаунт создан навсегда');
  form.querySelector('.err-line')?.remove();
  const okBox=document.createElement('div');
  okBox.className='err-line';okBox.style.cssText='color:var(--good);font-size:13px;margin-top:10px';
  okBox.textContent='аккаунт сохранён навсегда! теперь войди';
  form.appendChild(okBox);
  setTimeout(()=>{
    liUser.value=u;liErr.textContent='';
    rUser.value='';rPass.value='';rPass2.value='';rSecret.value='';rScore.textContent='';buildCaptcha();
    okBox.remove();showScreen(scrLogin);liUser.focus();
    toast('аккаунт готов! внедряйся');
  },1200);
};
document.getElementById('goReg').onclick=()=>{
  document.getElementById('regForm').querySelector('.err-line')?.remove();
  showScreen(scrReg);document.title='oomy — регистрация';buildCaptcha();
};
document.getElementById('goLogin').onclick=()=>{showScreen(scrLogin);document.title='oomy — вход';};

/* ============ ЛЕНТА ============ */
function seedPosts(){
  let posts=load(LS.posts,null);
  if(!posts){
    posts=[
      {id:1,author:'ксиуша мурс торт',ava:'🌸',nameCls:'blue',time:'сегодня в 00:59',text:'я спать! доброй ночи и приятных снов, любимый сайтик',likes:0,liked:false,views:4,at:'',comments:[]},
      {id:2,author:'романаwashy#числы',ava:'🌵',nameCls:'green',time:'сегодня в 00:59',text:'понимаю, какое у меня дурное лицо, но я буду записывать липсинги под треки аширо',likes:1,liked:false,views:31,at:'',comments:[
        {user:'aShiro#добрый',ava:'😈',text:'ну нует',time:'сегодня в 00:59',likes:1,liked:false},
        {user:'романаwashy#числы',ava:'🌵',text:'да',time:'сегодня в 00:59',likes:1,liked:false,replyTo:'aShiro#добрый'}]},
      {id:3,author:'принц',ava:'😼',nameCls:'pink',time:'сегодня в 00:58',text:'я потерял последний повод — подарю тебе любовь',likes:2,liked:false,views:12,at:'',comments:[]},
      {id:4,author:'кисюша',ava:'😹',nameCls:'blue',time:'вчера в 22:14',text:'сегодня съел полнорму корма. и свою. и чужую. не говори ветеринару',likes:5,liked:false,views:58,at:'',comments:[]}
    ];
    save(LS.posts,posts);
  }
}
function persistPost(p){
  const posts=load(LS.posts,[]);const i=posts.findIndex(x=>x.id===p.id);
  if(i>-1)posts[i]=p;else posts.unshift(p);save(LS.posts,posts);
}
function attHTML(p){
  if(!p.att)return'';
  if(p.att.kind==='img'){return '<div class="att"><img src="'+p.att.src+'" onclick="toast(\'фото по клику не растёт, но мило\')"></div>';}
  if(p.att.kind==='vid'){return '<div class="att"><video src="'+p.att.src+'" controls muted></video></div>';}
  if(p.att.kind==='aud'){return '<div class="att"><audio src="'+p.att.src+'" controls></audio></div>';}
  return '<div class="att"><a class="file" href="'+p.att.src+'" download="'+esc(p.att.name)+'" style="text-decoration:none;color:var(--text);background:var(--card2);box-shadow:0 0 0 .5px var(--line);border-radius:10px;display:flex;padding:12px 14px;gap:10px;font-size:13px">📎 <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(p.att.name)+'</span> <span style="margin-left:auto;color:var(--muted2)">скачать</span></a></div>';
}
/* превращает #хештеги и @упоминания в кликабельные чипы, экранируя остальное */
function linkify(t){
  let s=esc(t||'');
  s=s.replace(/(^|[\s(>])#([A-Za-zА-Яа-яёЁ0-9_]{2,24})/g,'$1<span class="tag-chip" data-tag="$2">#$2</span>');
  s=s.replace(/(^|[\s(>])@([A-Za-z0-9_.#-]{2,32})/g,'$1<span class="mention-chip" data-mn="$2">@$2</span>');
  return s;
}
function postHTML(p){
  return `
    <div class="post-head">
      <div class="ava p-ava" data-author="${esc(p.author)}" style="cursor:pointer">${avaHTML(p.author,p.ava)}</div>
      <div>
        <div class="p-name ${p.nameCls||'blue'}" data-author="${esc(p.author)}" style="cursor:pointer">${esc(p.author)}${badgeFor(p.author)}</div>
        <div class="p-time">${p.time}</div>
      </div>
      ${p.pinned?'<div class="pinflag">закреп</div>':''}
      <button class="p-more">⋯</button>
    </div>
    ${p.repostFrom?`<div class="repost-tag">репост записи от <b>${esc(p.repostFrom.author)}</b>${avaHTML(p.repostFrom.author,p.repostFrom.ava)}</div>${p.repostFrom.text?`<div class="repost-quote" style="margin:8px 0;padding:10px 14px;background:var(--card2);border-left:3px solid var(--acc);border-radius:10px;color:var(--text);font-size:13.5px">${linkify(p.repostFrom.text)}</div>`:''}`:''}
    ${p.text?`<div class="p-text">${linkify(p.text)}</div>`:''}
    ${attHTML(p)}
    <div class="p-actions">
      <button class="act like ${p.liked?'on':''}"><svg class="mi"><use href="#i-heart"/></svg><span class="cnt">${p.likes||''}</span></button>
      <button class="act cmz"><svg class="mi"><use href="#i-cmt"/></svg><span class="cnt">${p.comments.length||''}</span></button>
      <button class="act rp" title="репост в свой профиль"><svg class="mi"><use href="#i-rp"/></svg></button>
      <button class="act bm ${isBookmarked(p.id)?'on':''}" title="в закладки">★</button>
      <button class="act sh" title="поделиться"><svg class="mi"><use href="#i-sh"/></svg></button>
      <span class="views"><svg class="mi"><use href="#i-eye"/></svg> ${p.views??0}</span>
    </div>
    <div class="cmts">
      ${p.comments.map((c,ci)=>`
        <div class="cmt">
          <div class="ava cmt-ava" data-author="${esc(c.user)}" style="width:28px;height:28px;font-size:14px;cursor:pointer">${c.ava}</div>
          <div style="flex:1;min-width:0">
            <div class="cmt-name" data-author="${esc(c.user)}" style="cursor:pointer">${esc(c.user)}${badgeFor(c.user)}</div>
            <div style="margin-top:2px">${linkify(c.text)}</div>
            <div class="cmt-time">${c.time}</div>
          </div>
          ${me&&c.user===me.user?'<button class="cmt-x" data-ci="'+ci+'" title="удалить">✕</button>':''}
        </div>`).join('')}
      ${me&&!me.guest?`
      <div class="cmt-bar">
        <input placeholder="комментарий…"><button class="cmt-up">↑</button>
      </div>`:''}
    </div>`;
}
function wirePost(d,p){
  const goUser=u=>{if(!u)return;if(!me||me.guest){toast('зарегайся, чтобы смотреть страницы котиков');return;}openUserPage(u);};
  const np=d.querySelector('.p-name');if(np)np.onclick=()=>goUser(p.author);
  const pa=d.querySelector('.p-ava');if(pa)pa.onclick=()=>goUser(p.author);
  d.querySelector('.like').onclick=e=>{
    if(me&&me.guest){toast('гостям нельзя жмякать, зарегайся');return;}
    p.liked=!p.liked;p.likes+=p.liked?1:-1;
    if(p.liked){addLog('like',me.user,'лайк записи '+p.author);bumpLike(p.author);}
    const cur=e.currentTarget||d.querySelector('.like');
    if(cur){
      cur.classList.toggle('on',p.liked);
      cur.querySelector('.cnt').textContent=p.likes||'';
      cur.classList.add('pop-heart');setTimeout(()=>cur.classList.remove('pop-heart'),360);
    }
    persistPost(p);
  };
  /* двойной клик по записи = лайк (как в соцсетях) */
  d.addEventListener('dblclick',e=>{
    if(!me||me.guest||prof().dblLike===false)return;
    if(e.target.closest('button,a,input,textarea,.cmts'))return;
    const lk=d.querySelector('.like');
    if(lk&&!lk.classList.contains('on'))lk.click();
  });
  d.querySelector('.cmz').onclick=()=>{const c=d.querySelector('.cmts');c.style.maxHeight=c.style.maxHeight?'':(c.scrollHeight+'px');c.scrollIntoView({behavior:'smooth',block:'nearest'});};
  d.querySelector('.rp').onclick=()=>{
    if(me&&me.guest){toast('гостям нельзя, зарегайся');return;}
    const repostSc=p.att&&p.att.src;
    const np2={id:Date.now(),author:me.user,ava:(me.ava)||'🐈',nameCls:rnd(['blue','green','pink']),time:'только что',text:'',repostFrom:{author:p.author,ava:p.ava,text:p.text,src:repostSc},likes:0,liked:false,views:0,at:'',comments:[]};
    persistPost(np2);addLog('repost',me.user,'репост записи от '+p.author);
    toast('запись репостнута на твою страницу');
    if(!document.getElementById('pg-feed').classList.contains('hidden'))buildPosts();
  };
  /* закладка */
  const bm=d.querySelector('.act.bm');
  if(bm)bm.onclick=e=>{e.stopPropagation();const now=toggleBookmark(p.id);bm.classList.toggle('on',now);};
  d.querySelector('.sh').onclick=async()=>{
    const link=location.href.split('#')[0]+'#post='+p.id;
    try{await navigator.clipboard.writeText(link);toast('ссылка на запись скопирована ✅');}
    catch(err){toast('ссылка: '+link);}
  };
  d.querySelector('.p-more').onclick=e=>{
    const items=[];
    if(me&&(p.author===me.user||isAdmin())){
      if(isAdmin()&&p.author!==me.user)items.push({t:'админ: закрепить/открепить',f:()=>{p.pinned=!p.pinned;persistPost(p);addLog('admin',me.user,'закреп поста '+p.author);buildPosts();}});
      items.push({t:p.pinned?'открепить':'закрепить на странице',f:()=>{p.pinned=!p.pinned;persistPost(p);addLog('pin',me.user,(p.pinned?'закрепил':'открепил')+' свою запись');toast('готово');buildPosts();renderHome();}});
      items.push({t:'редактировать запись',f:()=>{
        const nt=prompt('текст записи:',p.text||'');
        if(nt===null)return;
        p.text=nt.trim();persistPost(p);addLog('post-edit',me.user,'отредактировал запись');toast('запись обновлена');buildPosts();if(window.__PG==='user')renderUserPage();
      }});
      items.push({t:'копировать текст',f:()=>{navigator.clipboard&&navigator.clipboard.writeText(p.text||'');toast('текст скопирован');}});
      items.push({t:'удалить'+(isAdmin()&&p.author!==me.user?' (админ)':''),danger:true,f:()=>{
        const posts=load(LS.posts,[]).filter(x=>x.id!==p.id);save(LS.posts,posts);tombAdd(LS.posts,p.id);
        addLog('post-del',me.user,'удалил запись '+p.author);toast('запись удалена');buildPosts();if(window.__PG==='user')renderUserPage();
      }});
    }else{
      items.push({t:'написать автору',f:()=>{go('msgs');openChat(p.author);toast('личка открыта');}});
      items.push({t:'открыть страницу',f:()=>goUser(p.author)});
    }
    menuPop(e.clientX,e.clientY,items);
  };
  /* хештеги: клик — поиск по тегу */
  d.querySelectorAll('.tag-chip').forEach(t=>t.onclick=()=>{go('feed');const s=document.getElementById('search');s.value='#'+t.dataset.tag;buildPosts();});
  /* упоминания: клик — страница котика */
  d.querySelectorAll('.mention-chip').forEach(t=>t.onclick=()=>goUser(t.dataset.mn));
  /* клик по автору комментария */
  d.querySelectorAll('.cmt-name,.cmt-ava').forEach(el=>{
    if(el.dataset.author&&el.dataset.author!==p.author)el.onclick=()=>goUser(el.dataset.author);
  });
  const px=d.querySelector('.cmt-x');
  if(px)px.onclick=()=>{p.comments.splice(Number(px.dataset.ci),1);persistPost(p);addLog('cmt-del',me.user,'удалил комментарий');buildPosts();};
  const inp=d.querySelector('.cmt-bar input'),up=d.querySelector('.cmt-up');
  if(inp&&up){
    const send=()=>{
      const t=inp.value.trim();if(!t)return;
      p.comments.push({user:me.user,ava:(me.ava)||'🐈',text:t,time:'только что',likes:0,liked:false});
      /* уведомления упомянутым и автору поста */
      const accs=encLoad(LS.acc,{});
      const mentioned=(t.match(/@([A-Za-z0-9_.#-]{2,32})/g)||[]).map(x=>x.slice(1));
      mentioned.forEach(m=>{if(accs[m]&&m!==me.user)pushNotif(m,'💬','@'+me.user+' упомянул(а) тебя в комментарии');});
      if(p.author!==me.user&&!mentioned.includes(p.author))pushNotif(p.author,'💬','@'+me.user+' оставил(а) комментарий к твоей записи');
      bumpCmt(p.author);
      inp.value='';persistPost(p);addLog('cmt',me.user,'комментарий '+p.author+' ('+t.length+' симв.)');buildPosts();toast('комментарий замурчал');
    };
    up.onclick=send;inp.onkeydown=e=>{if(e.key==='Enter')send()};
  }
}
function buildPosts(){
  const q=(document.getElementById('search').value||'').toLowerCase();
  const wrap=document.getElementById('posts');wrap.innerHTML='';
  let posts=load(LS.posts,[]);
  posts=posts.filter(p=>!p.hidden&&p.author!=='__system__');
  if(me&&!me.guest){const bl=blockedBy(me.user);if(bl.length)posts=posts.filter(p=>!bl.includes(p.author));}
  /* тренды: самые частые хештеги */
  const counts={};
  posts.forEach(p=>{const m=(p.text||'').match(/#([A-Za-zА-Яа-яёЁ0-9_]{2,24})/g)||[];m.forEach(t=>{const k=t.slice(1);counts[k]=(counts[k]||0)+1;});});
  const top=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,8);
  if(!q){
    const td=document.createElement('div');td.className='trend-card';
    td.innerHTML='<h3>тренды oomy</h3><div class="trend-tags">'+(top.length?top.map(([k,n])=>'<span class="tag-chip" data-tag="'+esc(k)+'">#'+esc(k)+' · '+n+'</span>').join(''):'<span class="fsub">пока нет хештегов — добавь #мяу в запись</span>')+'</div>';
    td.querySelectorAll('.tag-chip').forEach(t=>t.onclick=()=>{const s=document.getElementById('search');s.value='#'+t.dataset.tag;buildPosts();});
    wrap.appendChild(td);
  }
  if(q)posts=posts.filter(p=>(p.text||'').toLowerCase().includes(q)||p.author.toLowerCase().includes(q));
  posts.forEach(p=>{
    const d=document.createElement('div');d.className='post'+(p.pinned?' pinned':'');
    d.innerHTML=postHTML(p);wirePost(d,p);wrap.appendChild(d);
  });
  wireHoverCards(wrap);
  if(!posts.length)wrap.innerHTML='<div class="card" style="padding:34px;text-align:center;color:var(--muted)">тишина. ни один котик не муркнул</div>';
}
let feedAtt=null;
function wireComposer(){
  const cText=document.getElementById('composerText');
  const cSend=document.getElementById('sendBtn');
  const upd=()=>{cSend.classList.toggle('on',cText.value.trim().length>0||!!feedAtt);cText.style.height='auto';cText.style.height=Math.min(cText.scrollHeight,220)+'px';};
  cText.addEventListener('input',upd);
  cText.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();cSend.click();}});
  const setAtt=id=>{feedAtt=id;const slot=document.getElementById('feedAttSlot');
    slot.innerHTML=id?'<span class="att-chip">📎 <span>'+esc(id.name)+'</span> <b id="rmAtt">✕</b></span>':'';
    document.getElementById('feedAtt').style.display=id?'block':'none';
    document.getElementById('rmAtt')&&(document.getElementById('rmAtt').onclick=()=>{feedAtt=null;slot.innerHTML='';upd();});
    upd();
  };
  const pick=(inputEl,kind)=>{inputEl.onchange=()=>{const f=inputEl.files[0];if(!f)return;
    if(f.size>10*1024*1024){toast('файл больше 10МБ');inputEl.value='';return;}
    putMedia(f,(id)=>{if(id)setAtt({mid:id,name:f.name,kind});});
    inputEl.value='';
  };};
  pick(document.getElementById('fileFeedImg'),'img');
  pick(document.getElementById('fileFeedVid'),'vid');
  pick(document.getElementById('fileFeedFile'),'file');
  document.getElementById('attFeedImg').onclick=()=>document.getElementById('fileFeedImg').click();
  document.getElementById('attFeedVid').onclick=()=>document.getElementById('fileFeedVid').click();
  document.getElementById('attFeedFile').onclick=()=>document.getElementById('fileFeedFile').click();
  cSend.onclick=()=>{
    const t=cText.value.trim();if(!t&&!feedAtt)return;
    const posts=load(LS.posts,[]);
    const att=feedAtt?{mid:feedAtt.mid,name:feedAtt.name,kind:feedAtt.kind,src:mediaURL(feedAtt.mid)}:null;
    posts.unshift({id:Date.now(),author:me.user,ava:(me.ava)||'🐈',nameCls:rnd(['blue','green','pink']),time:'только что',text:t,likes:0,liked:false,views:Math.floor(Math.random()*9)+1,at:'',comments:[],att});
    save(LS.posts,posts);
    addLog('post',me.user,'новая запись'+(att?' + '+att.kind:'')+' ('+t.length+' симв.)');
    addOon(10);bumpPost();
    cText.value='';feedAtt=null;document.getElementById('feedAttSlot').innerHTML='';upd();
    buildPosts();toast('запись опубликована! толстый кот одобряет');
  };
}
document.getElementById('search').addEventListener('input',()=>{
  if(!document.getElementById('pg-feed').classList.contains('hidden'))buildPosts();
});

/* ============ НАВИГАЦИЯ ============ */
const PAGES=['feed','home','groups','sound','msgs','gifts','games','casino','friends','notifs','bm','settings','admin','user','search'];
let hist=['feed'],hIdx=0;
function go(p,noHist){
  if(p==='logout'){logout();return;}
  if(!PAGES.includes(p))p='feed';
  if(p==='admin'&&!isAdmin())p='feed';
  PAGES.forEach(x=>document.getElementById('pg-'+x).classList.toggle('hidden',x!==p));
  document.querySelectorAll('#sideMenu li[data-go]').forEach(li=>li.classList.toggle('active',li.dataset.go===p));
  buildPage(p);
  /* фон страницы: свой — на «омя страничк», чужой — на его странице; ушёл с страницы — фон пропал */
  applyPageBg(p==='user'?(window.__viewUser||me.user):(p==='home'?me.user:null));
  if(p==='user')applyBarStyle((profOf(window.__viewUser||me.user)||{}).barStyle);else applyBarStyle();
  /* отметки «прочитано» для плашек */
  const mark={};mark[me.user]=Date.now();
  if(p==='feed'){const s=load(LS.feedSeen,{});s[me.user]=Date.now();save(LS.feedSeen,s);}
  if(p==='notifs'){const s=load(LS.notifSeen,{});s[me.user]=Date.now();save(LS.notifSeen,s);}
  syncBadges();
  document.title='oomy — '+({feed:'лента',home:'омя страничк',groups:'группы',sound:'oomy music',msgs:'личны сообще',gifts:'подарочки',games:'шпилки',casino:'казинак',friends:'друзя',notifs:'уведомлялк',bm:'закладки',settings:'настройки',admin:'админ-панель',user:'страница котика'})[p];
  if(!noHist){hist=hist.slice(0,hIdx+1);hist.push(p);hIdx++;}
  window.scrollTo({top:0,behavior:'instant'});
}
function refreshAdminNav(){const n=document.getElementById('adminNav');if(n)n.classList.toggle('hidden',!isAdmin());}
document.querySelectorAll('#sideMenu li[data-go]').forEach(li=>li.onclick=()=>go(li.dataset.go));
document.getElementById('topLogo').onclick=()=>go('feed');
/* живой поиск: аккаунты (ник/юзернейм) и треки */
const sInput=document.getElementById('search'),sDrop=document.getElementById('searchDrop');
sInput.addEventListener('input',()=>{
  const q=sInput.value.trim().toLowerCase();
  if(q.length<2){sDrop.classList.add('hidden');return;}
  const users=Object.entries(encLoad(LS.acc,{}))
    .filter(([u,a])=>u.toLowerCase().includes(q)||(a.dn||'').toLowerCase().includes(q))
    .slice(0,8).map(([u,a])=>({kind:'user',u,dn:a.dn||u,ava:a.ava||'🐱'}));
  const trs=tracksAll().filter(t=>!t.priv).filter(t=>t.name.toLowerCase().includes(q)||(t.artist||'').toLowerCase().includes(q)).slice(0,8)
    .map(t=>({kind:'tr',t}));
  if(!users.length&&!trs.length){sDrop.innerHTML='<div class="srow" style="cursor:default;color:var(--muted2)">ничего не нашлось 🐾</div>';sDrop.classList.remove('hidden');return;}
  sDrop.innerHTML=users.map(x=>`<div class="srow" data-su="${esc(x.u)}"><span class="ava" style="width:28px;height:28px;font-size:14px">${esc(x.ava)}</span><div style="flex:1;min-width:0"><div style="font-weight:700">${esc(x.dn)}</div><div class="st">@${esc(x.u)}</div></div><span class="st">аккаунт</span></div>`).join('')
    +trs.map(x=>`<div class="srow" data-st="${x.t.id}"><div class="tcover" style="width:28px;height:28px;font-size:13px">${x.t.coverMid?'<img src="'+mediaURL(x.t.coverMid)+'">':esc((x.t.cover||'🎵').slice(0,3))}</div><div style="flex:1;min-width:0"><div style="font-weight:700">${esc(x.t.name)}</div><div class="st">${esc(x.t.artist||'трек')}</div></div><span class="st">▶ трек</span></div>`).join('');
  sDrop.classList.remove('hidden');
  sDrop.querySelectorAll('[data-su]').forEach(r=>r.onclick=()=>{
    sDrop.classList.add('hidden');sInput.value='';
    openUserPage(r.dataset.su);
  });
  sDrop.querySelectorAll('[data-st]').forEach(r=>r.onclick=()=>{
    sDrop.classList.add('hidden');sInput.value='';
    const t=tracksAll().find(x=>x.id===r.dataset.st);if(!t)return;
    if(t.origin==='local'){playQueueFrom(t.id);}
    else{go('sound');scEmbed(t);}
  });
});
document.addEventListener('click',e=>{if(!sDrop.contains(e.target)&&e.target!==sInput)sDrop.classList.add('hidden');});

document.getElementById('topLogo').onclick=()=>go('feed');
/* на ховер логотипа выскакивает один случайный котик из разных мест */
const barCats=[...document.querySelectorAll('.topbar-cat')];let catT=null;
document.getElementById('topLogo').addEventListener('mouseenter',()=>{
  barCats.forEach(c=>c.classList.remove('live'));
  const c=barCats[Math.floor(Math.random()*barCats.length)];
  void c.offsetWidth;c.classList.add('live');
  clearTimeout(catT);catT=setTimeout(()=>c.classList.remove('live'),1700);
});
document.getElementById('chipBtn').onclick=()=>go(me.guest?'settings':'home');
document.getElementById('oonChip').onclick=()=>go('gifts');
function buildPage(p){
  window.__PG=p;
  if(p==='feed'){buildPosts();buildRail();renderStories();}
  if(p==='home')renderHome();
  if(p==='groups')renderGroups();
  if(p==='sound')renderSound();
  if(p==='msgs')renderChats();
  if(p==='gifts')renderGifts();
  if(p==='games')renderGames();
  if(p==='casino')renderCasino();
  if(p==='friends')renderFriends();
  if(p==='notifs')renderNotifs();
  if(p==='bm')renderBm();
  if(p==='settings')renderSettings();
  if(p==='admin')renderAdmin();
  if(p==='user')renderUserPage();
  refreshAdminNav();
}
let openMenu=null;
function menuPop(x,y,items){
  closeMenu();
  const m=document.createElement('div');m.className='menu-pop';
  items.forEach(it=>{
    const d=document.createElement('div');d.textContent=it.t;if(it.danger)d.className='danger';
    d.onclick=()=>{closeMenu();it.f();};m.appendChild(d);
  });
  document.body.appendChild(m);
  m.style.left=Math.min(x,innerWidth-190)+'px';
  m.style.top=Math.min(y,innerHeight-m.offsetHeight-10)+'px';
  openMenu=m;
  setTimeout(()=>document.addEventListener('click',closeMenu,{once:true}),50);
}
function closeMenu(){openMenu&&(openMenu.remove(),openMenu=null);}
/* ask-форма: маленькое окошко с полями вместо prompt() */
function askForm(title,fields,onOk){
  const old=document.querySelector('.ask-ov');if(old)old.remove();
  const ov=document.createElement('div');ov.className='ask-ov';
  ov.innerHTML=`<div class="ask-box" style="padding:16px 18px;max-width:360px;width:92%">
    <b style="font-size:14px">${esc(title)}</b>
    ${fields.map((f,i)=>`<input class="pill-input" id="af${i}" ${f.type==='number'?'type="number" min="1" step="1"':''} placeholder="${esc(f.ph||'')}" style="margin-top:9px;width:100%;font-size:13.5px">`).join('')}
    <div style="display:flex;gap:8px;margin-top:13px;justify-content:flex-end">
      <button class="minibtn" id="afCancel">отмена</button>
      <button class="dan-btn" id="afOk" style="padding:7px 18px">ок</button>
    </div></div>`;
  document.body.appendChild(ov);
  ov.querySelector('#afCancel').onclick=()=>ov.remove();
  ov.querySelector('#afOk').onclick=()=>{
    const vals=fields.map((f,i)=>ov.querySelector('#af'+i).value);
    if(onOk(...vals)!==false)ov.remove();
  };
  ov.addEventListener('keydown',e=>{if(e.key==='Enter')ov.querySelector('#afOk').click();if(e.key==='Escape')ov.remove();});
  const f0=ov.querySelector('#af0');if(f0)f0.focus();
}

/* ============ МОЯ СТРАНИЦА ========= */
const GRADS=[
  {n:'неон',g:'linear-gradient(115deg,#7a6cff55,#ff7ab855,#37c26e55)'},
  {n:'закат',g:'linear-gradient(115deg,#ff9a3d55,#ff4d6d55,#c026d355)'},
  {n:'океан',g:'linear-gradient(115deg,#38bdf855,#6366f155,#14b8a655)'},
  {n:'матовый',g:'linear-gradient(115deg,#64748b55,#94a3b855,#cbd5e155)'},
  {n:'кислота',g:'linear-gradient(115deg,#a3e63555,#22d3ee55,#f472b655)'},
  {n:'мурмур',g:'linear-gradient(115deg,#f59e0b55,#ef444455,#8b5cf655)'}
];
const ACCENTS=['#ffffff','#000000','#8b5cf6','#6a5cff','#3b82f6','#06b6d4','#14b8a6','#22c55e','#f59e0b','#f97316','#ef4444','#f43f5e','#ec4899','#a855f7'];
const EMOJIS=['🐈','🐈‍⬛','🐱','😺','😸','😻','😼','😹','😽','🙀','😿','😾','🐆','🐯','🐅','🐾'];
function profileAll(){return load(LS.profile,{});}
function profOf(u){const all=profileAll();return (u&&all[u])||{};}
function prof(){return (me&&me.user)?profOf(me.user):{};}
function saveProf(p){const all=profileAll();if(me&&me.user)all[me.user]=p;save(LS.profile,all);}
function saveProfOf(u,p){const all=profileAll();all[u]=p;save(LS.profile,all);}
/* какие разделы страницы показывать (настраивается в настройках) */
const SECT_LABELS={stats:'статистика',shelf:'полка подарочков',status:'статус',bio:'биография',track:'профильный трек',wall:'стена',friends:'друзья',ach:'достижения',guests:'гости страницы',bm:'закладки на странице'};
const sectOn=(pd,k)=>!(pd.sects)||pd.sects[k]!==false;
/* подарочек рядом с ником: наведи — увидишь тираж и название */
function nickGiftHTML(u){
  const pd=profOf(u);const bi=pd.nickGift;
  if(bi===undefined||bi===null)return '';
  const it=bagOf(u)[bi];if(!it)return '';
  const gg=it.gid?giftCatalog().find(z=>z.id===it.gid):null;
  const tip=(gg?'#'+gg.n+' · ':'')+bagItemName(it)+(gg?' · тираж '+gg.tiraj+' шт':'');
  return `<span class="nick-gift" title="${esc(tip)}">${bagItemHTML(it,18)}</span>`;
}
/* старый плоский профиль → карта по юзернеймам (у каждого котика теперь своё) */
(function migrateProfiles(){
  const raw=load(LS.profile,null);
  if(!raw||typeof raw!=='object')return;
  const flatKeys=['avatar','dn','status','bio','banner','grad','pageBg','accent','privacy','notif','vol','autoplay','siteAccent','theme','pinned'];
  if(!Object.keys(raw).some(k=>flatKeys.includes(k)))return;
  const sess=load(LS.sess,null);
  const owner=(sess&&sess.user)||ADMIN;
  if(!raw.siteAccent)raw.siteAccent=load(LS.accent,'#8b7cff');
  if(!raw.theme)raw.theme=load(LS.theme,'dark');
  const map={};map[owner]=raw;save(LS.profile,map);
})();
/* ============ ДРУЗЬЯ, ЗАКЛАДКИ, ОНЛАЙН, ГОСТИ, ДОСТИЖЕНИЯ ============ */
const friendsAll=()=>load(LS.friends,{});
function friendsOf(u){const f=friendsAll();return Array.isArray(f[u])?f[u].slice():[]}
function areFriends(a,b){return !!a&&!!b&&friendsOf(a).includes(b)}
function saveFriendsAll(o){save(LS.friends,o)}
function friendReqAll(){return load(LS.freq,{})}
function saveFriendReq(o){save(LS.freq,o)}
function incomingReqs(u){const q=friendReqAll();return Array.isArray(q[u])?q[u].slice():[]}
function outgoingReq(to){if(!me||me.guest)return false;const q=friendReqAll();return (q[to]||[]).some(r=>r.from===me.user)}
function sendFriendReq(to){
  if(!me||me.guest){toast('зарегайся, чтобы дружить');return;}
  if(!to||to===me.user){toast('с собой дружить не надо — ты и так классный');return;}
  if(areFriends(me.user,to)){toast('вы уже друзья');return;}
  const q=friendReqAll();
  if((q[me.user]||[]).some(r=>r.from===to)){acceptFriendReq(to);return;}
  if((q[to]||[]).some(r=>r.from===me.user)){toast('заявка уже отправлена');return;}
  (q[to]=q[to]||[]).push({from:me.user,ts:Date.now()});saveFriendReq(q);
  pushNotif(to,'🐾','@'+me.user+' хочет добавить тебя в друзья');
  addLog('friend',me.user,'заявка в друзья → '+to);
  toast('заявка отправлена @'+to);
  if(window.__PG==='user'||window.__PG==='friends'){renderUserPage();renderFriends();}
}
function acceptFriendReq(from){
  if(!me||me.guest)return;
  const f=friendsAll();
  f[me.user]=Array.from(new Set([...(f[me.user]||[]),from]));
  f[from]=Array.from(new Set([...(f[from]||[]),me.user]));
  saveFriendsAll(f);
  const q=friendReqAll();q[me.user]=(q[me.user]||[]).filter(r=>r.from!==from);saveFriendReq(q);
  pushNotif(from,'✅','@'+me.user+' принял(а) твою заявку в друзья');
  addLog('friend',me.user,'принял заявку от '+from);
  toast('теперь вы друзья с @'+from);
  if(window.__PG==='user')renderUserPage();
  if(window.__PG==='friends')renderFriends();
}
function declineFriendReq(from){
  const q=friendReqAll();q[me.user]=(q[me.user]||[]).filter(r=>r.from!==from);saveFriendReq(q);
  toast('заявка от @'+from+' отклонена');
  if(window.__PG==='friends')renderFriends();
}
function removeFriend(u){
  if(!me||me.guest)return;
  const f=friendsAll();
  f[me.user]=(f[me.user]||[]).filter(x=>x!==u);
  f[u]=(f[u]||[]).filter(x=>x!==me.user);
  saveFriendsAll(f);addLog('friend',me.user,'удалил из друзей '+u);toast('@'+u+' больше не в друзьях');
  if(window.__PG==='friends')renderFriends();
  if(window.__PG==='user')renderUserPage();
}
function friendBtnHTML(u){
  if(!me||me.guest)return '<button class="minibtn" data-fr="'+esc(u)+'">добавить в друзья</button>';
  if(areFriends(me.user,u))return '<button class="minibtn" data-unfr="'+esc(u)+'">✓ в друзьях</button>';
  if(incomingReqs(me.user).some(r=>r.from===u))return '<button class="minibtn" data-acc="'+esc(u)+'">принять заявку</button>';
  if(outgoingReq(u))return '<button class="minibtn" disabled style="opacity:.6">заявка отправлена</button>';
  return '<button class="minibtn" data-fr="'+esc(u)+'">добавить в друзья</button>';
}
function wireFriendBtns(scope){
  scope.querySelectorAll('[data-fr]').forEach(b=>b.onclick=e=>{e.stopPropagation();sendFriendReq(b.dataset.fr);});
  scope.querySelectorAll('[data-acc]').forEach(b=>b.onclick=e=>{e.stopPropagation();acceptFriendReq(b.dataset.acc);});
  scope.querySelectorAll('[data-unfr]').forEach(b=>b.onclick=e=>{e.stopPropagation();if(confirm('удалить @'+b.dataset.unfr+' из друзей?'))removeFriend(b.dataset.unfr);});
}
function bookmarksOf(u){const b=load(LS.bookmarks,{});return Array.isArray(b[u])?b[u].slice():[]}
function isBookmarked(id){return !!me&&!me.guest&&bookmarksOf(me.user).includes(id)}
function toggleBookmark(id){
  if(!me||me.guest){toast('зарегайся, чтобы сохранять');return false;}
  const b=load(LS.bookmarks,{});const list=b[me.user]||[];
  const i=list.indexOf(id);
  if(i>=0)list.splice(i,1);else list.unshift(id);
  b[me.user]=list;save(LS.bookmarks,b);
  toast(i>=0?'убрано из закладок':'сохранено в закладки ★');
  return i<0;
}
function touchSeen(){if(!me||me.guest)return;const s=load(LS.seen,{});s[me.user]=Date.now();save(LS.seen,s);}
/* блокировки */
function blocksAll(){return load(LS.blocks,{})}
function blockedBy(u){const b=blocksAll();return Array.isArray(b[u])?b[u].slice():[]}
function isBlocked(u){return !!me&&!me.guest&&blockedBy(me.user).includes(u)}
function blockUser(u){
  if(!me||me.guest)return;
  const b=blocksAll();b[me.user]=Array.from(new Set([...(b[me.user]||[]),u]));save(LS.blocks,b);
  const f=friendsAll();f[me.user]=(f[me.user]||[]).filter(x=>x!==u);f[u]=(f[u]||[]).filter(x=>x!==me.user);saveFriendsAll(f);
  addLog('block',me.user,'заблокировал '+u);toast('@'+u+' заблокирован');
  if(window.__PG==='feed')buildPosts();
}
function unblockUser(u){
  if(!me||me.guest)return;
  const b=blocksAll();b[me.user]=(b[me.user]||[]).filter(x=>x!==u);save(LS.blocks,b);
  toast('@'+u+' разблокирован');
}
function isOnline(u){const s=load(LS.seen,{});return !!s[u]&&Date.now()-s[u]<5*60*1000}
function lastSeenText(u){
  if(isOnline(u))return 'в сети';
  const s=load(LS.seen,{});if(!s[u])return 'давно не заходил(а)';
  const d=Date.now()-s[u];
  if(d<3600e3)return 'был(а) '+Math.max(1,Math.floor(d/60e3))+' мин назад';
  if(d<86400e3)return 'был(а) '+Math.floor(d/3600e3)+' ч назад';
  return 'был(а) '+Math.floor(d/86400e3)+' дн назад';
}
function visitorsOf(u){const v=load(LS.visitors,{});return Array.isArray(v[u])?v[u].slice():[]}
function addVisitor(target){
  if(!me||me.guest||target===me.user)return;
  const v=load(LS.visitors,{});
  const list=(v[target]||[]).filter(x=>x.from!==me.user);
  list.unshift({from:me.user,ts:Date.now()});
  v[target]=list.slice(0,40);save(LS.visitors,v);
}
function statsFor(u){
  const posts=load(LS.posts,[]).filter(p=>p.author===u&&!p.repostFrom);
  const likes=posts.reduce((a,p)=>a+(p.likes||0),0);
  return {
    posts:posts.length,likes,
    tracks:tracksAll().filter(t=>t.origin==='local'&&t.artist===u).length,
    friends:friendsOf(u).length,
    gifts:bagOf(u).length,
    oon:(wallet()[u]||0),
    clicks:((clickStats()[u]||{}).total||0)
  };
}
function achievementsFor(u){
  const s=statsFor(u);
  return [
    {ic:'🐾',n:'новичок',d:'за первую запись на стене',k:'posts',t:1,got:s.posts>=1},
    {ic:'✍️',n:'блогер',d:'за 10 записей на стене',k:'posts',t:10,got:s.posts>=10},
    {ic:'❤️',n:'любимчик',d:'за 50 лайков на твоих записях',k:'likes',t:50,got:s.likes>=50},
    {ic:'🎵',n:'меломан',d:'за 5 загруженных треков в oomy music',k:'tracks',t:5,got:s.tracks>=5},
    {ic:'🤝',n:'душа компании',d:'за 5 друзей',k:'friends',t:5,got:s.friends>=5},
    {ic:'🎁',n:'коллекционер',d:'за 5 подарков в сумке',k:'gifts',t:5,got:s.gifts>=5},
    {ic:'💰',n:'богатей',d:'за 1000 оонеток на балансе',k:'oon',t:1000,got:s.oon>=1000},
    {ic:'🖱',n:'копильщик',d:'за 100 кликов в копилке',k:'clicks',t:100,got:s.clicks>=100}
  ];
}
function achHTML(u){
  const s=statsFor(u);
  const prog={posts:s.posts,likes:s.likes,tracks:s.tracks,friends:s.friends,gifts:s.gifts,oon:s.oon,clicks:s.clicks};
  return '<div class="ach-row">'+achievementsFor(u).map(a=>{
    return `<span class="ach${a.got?' got':''}" data-ach="${esc(a.n)}" data-d="${esc(a.d)}" data-p="${prog[a.k]||0}" data-t="${a.t}" data-g="${a.got?1:0}"><b>${a.ic}</b>${esc(a.n)}</span>`;
  }).join('')+'</div>';
}
function wireAch(root){
  (root||document).querySelectorAll('[data-ach]').forEach(el=>el.onclick=()=>{
    const got=el.dataset.g==='1';
    toast('🏅 «'+el.dataset.ach+'» — '+el.dataset.d+' · прогресс: '+el.dataset.p+' из '+el.dataset.t+(got?' · получено ✓':''));
  });
}
function applyPageBg(owner){
  const box=document.getElementById('pageBg');if(!box)return;
  /* фон профиля виден ТОЛЬКО на странице котика */
  const pr=owner?profOf(owner):null;
  const bg=pr&&pr.pageBg;
  const old=box.querySelector('img,video');if(old)old.remove();
  box.style.backgroundImage='';
  document.body.style.backgroundImage='';
  if(!bg||!bg.mid){box.classList.add('hidden');return;}
  box.classList.remove('hidden');
  const u=mediaURL(bg.mid);if(!u)return;
  if(bg.kind==='vid'){
    const v=document.createElement('video');v.src=u;v.autoplay=true;v.muted=true;v.loop=true;v.playsInline=true;
    box.insertBefore(v,box.firstChild);
  }else{
    const im=document.createElement('img');im.src=u;im.alt='';
    box.insertBefore(im,box.firstChild);
  }
}
function clearPageBg(){const p=prof();delete p.pageBg;saveProf(p);applyPageBg(window.__viewUser||me.user);toast('фон сайта убран');}
/* профильный трек — 1 трек из oomy music на страницу */
function renderPfTrack(){
  const box=document.getElementById('pfTrackBox');if(!box)return;
  const pr=prof();
  const t=tracksAll().find(x=>x.id===pr.profileTrackId);
  const trs=tracksAll().filter(x=>x.origin==='local');
  const cov=t?(t.coverMid?'<img src="'+mediaURL(t.coverMid)+'">':esc((t.cover||'').slice(0,3)||'🎵')):'🎵';
  box.innerHTML=`<div style="display:flex;align-items:center;gap:10px">
    ${t?`<div class="tcover" style="width:44px;height:44px;font-size:18px">${cov}</div>
    <div style="flex:1;min-width:0">
      <div style="font-weight:700;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.name)}</div>
      <div style="color:var(--muted2);font-size:11.5px">${t.artist?esc(t.artist)+' · ':''}трек твоей страницы</div>
    </div>
    <button class="minibtn" id="pfTrackPlay" style="flex:none">${player.currentId===t.id&&player.playing?ICON_PAUSE:ICON_PLAY}</button>`:'<span style="color:var(--muted2);font-size:12.5px">'+(trs.length?'не выбран':'сначала загрузи трек в oomy music')+'</span>'}
    ${trs.length?'<button class="minibtn" id="pfTrackPick" style="flex:none">сменить</button>':''}
  </div>`;
  if(t)document.getElementById('pfTrackPlay').onclick=()=>{
    if(player.currentId===t.id){togglePlay();return;}
    playQueueFrom(t.id);toast('профильный трек: «'+t.name+'»');
  };
  if(trs.length)document.getElementById('pfTrackPick').onclick=e=>{
    menuPop(e.clientX,e.clientY,trs.map(tr=>({t:tr.name,f:()=>{
      pr.profileTrackId=tr.id;saveProf(pr);renderPfTrack();
      addLog('profile',me.user,'сменил профильный трек на «'+tr.name+'»');toast('трек на странице готов');
    }})));
  };
}
function renderHome(){
  const box=document.getElementById('pg-home');
  const pr=prof();  const wall=load(LS.posts,[]).filter(p=>p.author===me.user);
  const likes=wall.reduce((a,p)=>a+(p.likes||0),0);
  const reposts=wall.filter(p=>p.repostFrom).length;
  const myShelf=myGifts().map((g,gi)=>({g,gi})).filter(x=>x.g.shelf&&!x.g.hidden);
  const dn=pr.dn||me.user;
  box.innerHTML=`
    <div class="pcard profile-card"${pr.accent?' style="--acc:'+esc(pr.accent)+'"':''}>
      <div class="banner" id="pfBanner" style="${(pr.banner&&pr.banner.mid)?'background-image:url('+mediaURL(pr.banner.mid)+')':(pr.grad?'background:'+((GRADS.find(g=>g.n===pr.grad)||{}).g||''):'')}">
        ${(pr.banner&&pr.banner.mid&&pr.banner.kind==='vid')?'<video src="'+mediaURL(pr.banner.mid)+'" autoplay muted loop playsinline></video>':''}
        <div class="banner-ov"></div>
      </div>
      <div class="pf-top">
        <div class="pf-ava-wrap">
          <div class="pf-ava" id="pfAva">${avaHTML(me.user,me.ava||'🐈')}</div>
          <div class="pf-ava-border"></div>
        </div>
      </div>
      <div class="pf-info">
        <div style="min-width:0;flex:1">
          <div class="pf-name">${esc(dn)}${badgeFor(me.user)}${nickGiftHTML(me.user)}</div>
          <div class="pf-sub">@${esc(me.user)}${isAdmin()?' · главный кот сайта':''}</div>
          ${pr.status?'<div class="pf-status" id="pfStatus">'+esc(pr.status)+'</div>':''}
          ${pr.bio?'<div class="pf-bio" id="pfBio">'+esc(pr.bio)+'</div>':''}
        </div>
        <div class="pf-btns">
          <button class="minibtn" id="pfEdit">редактировать профиль</button>
          <button class="minibtn" id="pfShare">поделиться</button>
        </div>
      </div>
      ${sectOn(pr,'stats')?`<div class="pf-stats">
        <div class="stat"><b>${wall.filter(p=>!p.repostFrom).length}</b><span>записей</span></div>
        <div class="stat"><b>${likes}</b><span>лайков</span></div>
        <div class="stat"><b>${reposts}</b><span>репостов</span></div>
        <div class="stat"><b>${tracksAll().filter(t=>isMyTrack(t)).length}</b><span>треков</span></div>
        <div class="stat"><b>${myGifts().length}</b><span>подарков</span></div>
        <div class="stat"><b>${(pr.pinned||[]).length}</b><span>закрепов</span></div>
        ${me.guest?'':`<div class="stat"><b>${myOon()}</b><span>оонеток</span></div>`}
      </div>`:''}
      ${sectOn(pr,'shelf')?`<div class="sect" id="pfGiftsSect">
        <h3>полка подарочков${myShelf.length?' · '+Math.min(6,myShelf.length)+'/6':''}</h3>
        <div class="pf-gifts" id="pfGifts">${myShelf.slice(0,6).map(x=>{
          const gg=x.g.gid?giftCatalog().find(z=>z.id===x.g.gid):null;
          return `<span style="display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer" data-pfgift="${x.gi}" title="${esc(bagItemName(x.g))}${x.g.from?' · от '+esc(x.g.from):''}">${bagItemHTML(x.g,44)}<span style="font-size:10px;font-weight:700">${gg?'#'+gg.n+' · ':''}${esc(bagItemName(x.g))}</span>${gg?`<span class="rar-badge rar-${gg.r||'common'}" style="font-size:9px">${RARITY[gg.r||'common']}</span>`:''}</span>`}).join('')||'<span class="empty-shelf">полка пустая — загляни в подарочки 🎁</span>'}</div>
        <div class="link" style="padding-top:6px" id="pfAllGifts">все подарки · ${myGifts().filter(g=>!g.hidden).length}</div>
      </div>`:''}
      ${sectOn(pr,'status')?`<div class="sect">
        <h3>статус</h3>
        <input class="pill-input" id="statusInput" maxlength="60" value="${pr.status?esc(pr.status):''}" placeholder="напиши статус…">
      </div>`:''}
      ${sectOn(pr,'bio')?`<div class="sect">
        <h3>биография</h3>
        <textarea class="pill-input" id="bioInput" maxlength="160" rows="2" placeholder="расскажи о себе…">${pr.bio?esc(pr.bio):''}</textarea>
      </div>`:''}
      ${sectOn(pr,'track')?`<div class="sect">
        <h3>профильный трек</h3>
        <div id="pfTrackBox"></div>
      </div>`:''}
      ${sectOn(pr,'wall')?`<div class="sect">
        <h3>стена</h3>
        ${me.guest?'':`
        <div style="display:flex;gap:4px;align-items:center;margin-bottom:10px;flex-wrap:wrap">
          <div style="display:flex;gap:12px;padding:10px 0 4px;align-items:flex-start;flex:1;min-width:0">
            <div class="ava" id="wallAva">${avaHTML(me.user,me.ava||'🐈')}</div>
            <textarea id="wallText" placeholder="накликай у себя на странице…" maxlength="400" style="flex:1;min-height:52px;resize:none;border:none;outline:none;background:transparent;font-family:inherit;font-size:14px;color:var(--text);padding:8px 0"></textarea>
          </div>
          <div id="wallAttSlot"></div>
          <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">
            <button class="att-btn" id="attWallImg" title="фото/gif"><svg class="mi"><use href="#i-img"/></svg></button>
            <button class="att-btn" id="attWallVid" title="видео"><svg class="mi"><use href="#i-film"/></svg></button>
            <button class="att-btn" id="attWallFile" title="файл"><svg class="mi"><use href="#i-clip"/></svg></button>
            <input type="file" id="fileWallImg" accept="image/*" class="hidden">
            <input type="file" id="fileWallVid" accept="video/*" class="hidden">
            <input type="file" id="fileWallFile" class="hidden">
            <button class="send-btn on" id="wallSend">на стену</button>
          </div>
        </div>`}
        <div id="wallPosts"></div>
      </div>`:''}
      ${sectOn(pr,'friends')?`<div class="sect">
        <h3>друзья · ${friendsOf(me.user).length}</h3>
        <div style="display:flex;gap:8px;flex-wrap:wrap;padding:2px 0 8px">
          ${friendsOf(me.user).slice(0,12).map(u=>`<span class="v" data-gu="${esc(u)}" style="display:flex;align-items:center;gap:6px;background:var(--card2);border:1px solid var(--line);border-radius:999px;padding:4px 10px 4px 4px;font-size:12px;cursor:pointer"><span class="ava" style="width:24px;height:24px;font-size:12px">${avaHTML(u,(encLoad(LS.acc,{})[u]||{}).ava||'🐈')}</span>${esc(u)}</span>`).join('')||'<span class="fsub">пока нет друзей — загляни в раздел «друзья»</span>'}
        </div>
      </div>`:''}
      ${sectOn(pr,'ach')?`<div class="sect">
        <h3>достижения</h3>
        ${achHTML(me.user)}
      </div>`:''}
      ${sectOn(pr,'guests')?`<div class="sect">
        <h3>гости моей страницы</h3>
        <div class="visitors">${visitorsOf(me.user).slice(0,10).map(v=>`<span class="v" data-gu="${esc(v.from)}"><span class="ava" style="width:24px;height:24px;font-size:12px">${avaHTML(v.from,'🐈')}</span>${esc(v.from)}</span>`).join('')||'<span class="fsub">пока никто не заглянул</span>'}</div>
      </div>`:''}
      ${sectOn(pr,'bm')?`<div class="sect">
        <h3>закладки · ${bookmarksOf(me.user).length}</h3>
        <div id="homeBookmarks"></div>
      </div>`:''}
    </div>`;
  const stIn=document.getElementById('statusInput');
  if(stIn)stIn.addEventListener('change',e=>{
    const pr=prof();pr.status=e.target.value.trim();saveProf(pr);
    if(pr.status){document.getElementById('pfStatus').style.display='';document.getElementById('pfStatus').textContent=pr.status;}
    else{document.getElementById('pfStatus').style.display='none';}
    addLog('profile',me.user,'сменил статус');toast('статус сохранён');
  });
  const bioIn=document.getElementById('bioInput');
  if(bioIn)bioIn.addEventListener('input',e=>{
    const pr=prof();pr.bio=e.target.value.trim();saveProf(pr);
    addLog('profile',me.user,'обновил биографию');toast('биография обновлена');document.getElementById('pfBio').textContent=pr.bio;
  });
  document.getElementById('pfEdit').onclick=openEditor;
  document.getElementById('pfShare').onclick=()=>toast('скопировано в миску: oomy/'+me.user+' ✅');
  box.querySelectorAll('[data-gu]').forEach(el=>el.onclick=()=>openUserPage(el.dataset.gu));
  box.querySelectorAll('[data-pfgift]').forEach(el=>el.onclick=()=>openGiftInfo(null,me.user,Number(el.dataset.pfgift)));
  const pfa=box.querySelector('#pfAllGifts');if(pfa)pfa.onclick=()=>openAllGifts(me.user);
  const bmWrap=document.getElementById('homeBookmarks');
  if(bmWrap){
    const ids=bookmarksOf(me.user);
    if(!ids.length)bmWrap.innerHTML='<div class="fsub" style="padding:4px 0">сохраняй посты звёздочкой ★ — они появятся тут</div>';
    else{
      const all=load(LS.posts,[]);
      ids.slice(0,5).forEach(id=>{const p=all.find(x=>x.id===id);if(!p)return;const d=document.createElement('div');d.className='post';d.innerHTML=postHTML(p);wirePost(d,p);bmWrap.appendChild(d);});
    }
  }
  renderPfTrack();
  renderWall();
  wireAch(box);
  if(!me.guest){
    let wallAtt=null;
    const slot=document.getElementById('wallAttSlot');
    if(!slot){renderPfTrack&&null;}
    const updSlot=()=>{if(!slot)return;slot.innerHTML=wallAtt?'<span class="att-chip" style="margin-right:0">📎 <span>'+esc(wallAtt.name)+'</span> <b id="rmWallAtt">✕</b></span>':'';document.getElementById('rmWallAtt')&&(document.getElementById('rmWallAtt').onclick=()=>{wallAtt=null;updSlot();});};
    if(slot){
    const pick=(el,kind)=>{if(!el)return;el.onchange=()=>{const f=el.files[0];if(!f)return;
      if(f.size>10*1024*1024){toast('файл больше 10МБ');el.value='';return;}
      putMedia(f,id=>{if(id){wallAtt={mid:id,name:f.name,kind};updSlot();}});el.value='';};};
    pick(document.getElementById('fileWallImg'),'img');
    pick(document.getElementById('fileWallVid'),'vid');
    pick(document.getElementById('fileWallFile'),'file');
    const awi=document.getElementById('attWallImg');if(awi)awi.onclick=()=>document.getElementById('fileWallImg').click();
    const awv=document.getElementById('attWallVid');if(awv)awv.onclick=()=>document.getElementById('fileWallVid').click();
    const awf=document.getElementById('attWallFile');if(awf)awf.onclick=()=>document.getElementById('fileWallFile').click();
    const wsend=document.getElementById('wallSend');
    if(wsend)wsend.onclick=()=>{
      const el=document.getElementById('wallText');const t=el.value.trim();
      if(!t&&!wallAtt){toast('напиши мяу или прицепи файл');return;}
      const posts=load(LS.posts,[]);
      const att=wallAtt?{mid:wallAtt.mid,name:wallAtt.name,kind:wallAtt.kind,src:mediaURL(wallAtt.mid)}:null;
      posts.unshift({id:Date.now(),author:me.user,ava:(me.ava)||'🐈',nameCls:'pink',time:'только что',text:t,likes:0,liked:false,views:0,at:'',comments:[],att});
      save(LS.posts,posts);addLog('post',me.user,'запись на стене'+(att?' + '+att.kind:''));
      wallAtt=null;updSlot();el.value='';renderWall();toast('на стене! проверяй');
    };
    }
  }
}
function renderWall(){
  const wrap=document.getElementById('wallPosts');if(!wrap)return;
  const pr=prof();const pinned=pr.pinned||[];
  let wall=load(LS.posts,[]).filter(p=>p.author===me.user);
  wall.sort((a,b)=>{
    const pa=pinned.includes(a.id)?1:0,pb=pinned.includes(b.id)?1:0;
    if(pa!==pb)return pb-pa;
    return b.id-a.id;
  });
  wrap.innerHTML=wall.length?'':'<div style="color:var(--muted2);font-size:13px">стененько пока голая — выложи фотку или напиши мяу</div>';
  wall.forEach(p=>{
    const d=document.createElement('div');d.className='post'+(pinned.includes(p.id)?' pinned':'');
    d.innerHTML=postHTML(p);wirePost(d,p);wrap.appendChild(d);
  });
  wireHoverCards(wrap);
}
function openEditor(){
  const pr=prof();
  const body=document.getElementById('edBody');
  const upl=(accept,cb)=>{
    const inp=document.createElement('input');inp.type='file';inp.accept=accept;
    inp.onchange=()=>{const f=inp.files[0];if(!f)return;
      if(f.size>10*1024*1024){toast('файл больше 10МБ — уменьши и попробуй снова');return;}
      putMedia(f,mid=>{if(mid)cb({mid,kind:accept.startsWith('video')?'vid':'img',name:f.name});else toast('не удалось сохранить файл');});};
    inp.click();
  };
  body.innerHTML=`
    <div class="label">аватарка (смайлик, фото, gif или видео — 5 сек по кругу)</div>
    <div style="display:flex;gap:14px;align-items:center">
      <div class="pf-ava" style="width:64px;height:64px;font-size:32px" id="edAva"></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="minibtn" id="edAvaImg">🖼 фото/gif</button>
        <button class="minibtn" id="edAvaVid">🎞 видео (5 сек)</button>
        <button class="minibtn" id="edAvaNone">сбросить</button>
      </div>
    </div>
    <div class="emo-grid" id="edEmos" style="margin-top:10px"></div>

    <div class="label" style="margin-top:18px">шапка профиля · баннер (фото / gif / видео до 10МБ)</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
      <button class="minibtn" id="edBanImg">🖼 фото/gif</button>
      <button class="minibtn" id="edBanVid">🎞 видео</button>
      <button class="minibtn" id="edBanNone">сбросить</button>
    </div>
    <div class="grid2" id="edGrads" style="margin-top:10px"></div>

    <div class="label" style="margin-top:18px">фон всего сайта (фото / gif / видео до 10МБ)</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
      <button class="minibtn" id="edBgImg">🖼 фото/gif</button>
      <button class="minibtn" id="edBgVid">🎞 видео</button>
      <button class="minibtn" id="edBgNone">сбросить</button>
    </div>
    <div class="hint" style="color:var(--muted2)">фон применяется ко всему сайту сразу и сохраняется навсегда</div>

    <div class="label" style="margin-top:16px">акцентный цвет профиля</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap" id="edAccs"></div>
    <div class="hint" style="color:var(--muted2)">меняет цвет именно этого профиля — у других котов он виден, но общий акцент сайта не трогает</div>

    <div class="label" style="margin-top:16px">отображаемое имя</div>
    <input class="pill-input" id="edDn" maxlength="24" value="${esc(pr.dn||me.user)}">
    <div class="label" style="margin-top:12px">стиль баров на моей странице</div>
    <select class="pill-input" id="edBar">
      <option value="default"${((pr.barStyle||'default')==='default')?' selected':''}>обычный</option>
      <option value="translucent"${pr.barStyle==='translucent'?' selected':''}>полупрозрачный</option>
      <option value="transparent"${pr.barStyle==='transparent'?' selected':''}>прозрачный</option>
    </select>
    <div class="hint" style="color:var(--muted2)">так видят твою страницу другие котики — бары сверху и меню</div>
    <div class="label" style="margin-top:12px">статус</div>
    <input class="pill-input" id="edStatus" maxlength="80" value="${esc(pr.status||'')}" placeholder="одна строка о настроении">
    <div class="label" style="margin-top:12px">о себе</div>
    <textarea class="pill-input" id="edBio" maxlength="240" rows="3" style="border-radius:12px;resize:vertical" placeholder="пара слов о себе">${esc(pr.bio||'')}</textarea>
    <button class="big-btn" id="edSave" style="margin-top:18px">сохранить</button>`;
  const drawAva=()=>{document.getElementById('edAva').innerHTML=avaHTML(me.user,me.ava)};
  drawAva();
  const emoBox=document.getElementById('edEmos');
  [...new Set(EMOJIS)].forEach(e=>{
    const b=document.createElement('button');b.textContent=e;
    if(!pr.avatar&&me.ava===e)b.classList.add('on');
    b.onclick=()=>{const p=prof();p.avatar={type:'emoji',val:e};saveProf(p);addLog('profile',me.user,'сменил аватарку ('+e+')');drawAva();refreshAvas();toast('аватарка: '+e);};
    emoBox.appendChild(b);
  });
  document.getElementById('edAvaImg').onclick=()=>upl('image/*',a=>{const p=prof();p.avatar={type:'media',mid:a.mid,kind:a.kind};saveProf(p);addLog('profile',me.user,'сменил аватарку (файл '+a.name+')');drawAva();refreshAvas();toast('красиво!');});
  document.getElementById('edAvaVid').onclick=()=>upl('video/*',a=>{const p=prof();p.avatar={type:'media',mid:a.mid,kind:'video'};saveProf(p);addLog('profile',me.user,'сменил аватарку (видео)');drawAva();refreshAvas();toast('крутая живая ава!');});
  document.getElementById('edAvaNone').onclick=()=>{const p=prof();delete p.avatar;saveProf(p);addLog('profile',me.user,'сбросил аватарку');drawAva();refreshAvas();toast('аватарка сброшена');};

  const drawGrads=()=>{
    const g=document.getElementById('edGrads');g.innerHTML='';
    GRADS.forEach(gr=>{const d=document.createElement('div');d.className='grad-p'+(pr.grad===gr.n?' on':'');d.style.background=gr.g;d.title=gr.n;
      d.onclick=()=>{const p=prof();p.grad=gr.n;saveProf(p);drawGrads();const b=document.getElementById('pfBanner');if(b){b.style.backgroundImage=gr.g;b.style.backgroundSize='cover';}addLog('profile',me.user,'шапка: '+gr.n);toast('шапка: '+gr.n);};
      g.appendChild(d);});
  };
  drawGrads();
  document.getElementById('edBanImg').onclick=()=>upl('image/*',a=>{const p=prof();p.banner={mid:a.mid,kind:a.kind};delete p.grad;saveProf(p);addLog('profile',me.user,'шапка профиля (фото)');closeEditor();if(window.__PG==='home')renderHome();toast('шапка профиля обновлена');});
  document.getElementById('edBanVid').onclick=()=>upl('video/*',a=>{const p=prof();p.banner={mid:a.mid,kind:'vid'};delete p.grad;saveProf(p);addLog('profile',me.user,'шапка профиля (видео)');closeEditor();if(window.__PG==='home')renderHome();toast('живая шапка!');});
  document.getElementById('edBanNone').onclick=()=>{const p=prof();delete p.banner;delete p.grad;saveProf(p);if(window.__PG==='home')renderHome();toast('шапка сброшена');};
  document.getElementById('edBgImg').onclick=()=>upl('image/*',a=>{const p=prof();p.pageBg={mid:a.mid,kind:a.kind};saveProf(p);applyPageBg(window.__viewUser||me.user);addLog('profile',me.user,'фон всего сайта');toast('фон сайта поставлен');});
  document.getElementById('edBgVid').onclick=()=>upl('video/*',a=>{const p=prof();p.pageBg={mid:a.mid,kind:'vid'};saveProf(p);applyPageBg(window.__viewUser||me.user);addLog('profile',me.user,'живой фон сайта');toast('живой фон сайта!');});
  document.getElementById('edBgNone').onclick=()=>{clearPageBg();};

  const ac=document.getElementById('edAccs');
  ACCENTS.forEach(c=>{const s=document.createElement('div');s.className='swatch'+(pr.accent===c?' on':'');s.style.background=c;s.title=c;
    s.onclick=()=>{const p=prof();p.accent=c;saveProf(p);addLog('profile',me.user,'акцент профиля: '+c);ac.querySelectorAll('.swatch').forEach(x=>x.classList.remove('on'));s.classList.add('on');if(window.__PG==='home')renderHome();toast('акцент профиля изменён');};
    ac.appendChild(s);});
  document.getElementById('edSave').onclick=()=>{
    const p=prof();
    p.dn=(document.getElementById('edDn').value.trim()||me.user);
    p.status=document.getElementById('edStatus').value.trim();
    p.bio=document.getElementById('edBio').value.trim();
    p.barStyle=document.getElementById('edBar').value;
    saveProf(p);addLog('profile',me.user,'обновил профиль');
    closeEditor();renderHome();refreshChips();applyBarStyle();toast('сохранено');
  };
  document.getElementById('edBg').classList.add('open');
}
function closeEditor(){document.getElementById('edBg').classList.remove('open');}
function refreshAvas(){
  document.getElementById('chipAva').innerHTML=avaHTML(me.user,me.ava||'🐈');
  document.getElementById('meAva').innerHTML=avaHTML(me.user,me.ava||'🐈');
  if(!document.getElementById('pg-home').classList.contains('hidden'))renderHome();
}
function refreshChips(){
  const pr=prof();
  document.getElementById('chipName').innerHTML=esc(pr.dn||me.user)+badgeFor(me.user);
  document.getElementById('chipAva').innerHTML=avaHTML(me.user,me.ava||'🐈');
}

/* ============ ГРУППЫ ============ */
function seedGroups(){
  let groups=load(LS.groups,null);
  if(!groups){
    groups=[
      {id:'g1',name:'толстые котики',icon:'🐈',desc:'для любителей пушистых и круглых котиков',owner:'котик-гость',members:12,posts:[]},
      {id:'g2',name:'oomy music фанаты',icon:'🎵',desc:'обсуждаем треки и плейлисты',owner:'принц',members:8,posts:[]},
      {id:'g3',name:'мяу-чат',icon:'💬',desc:'просто поболтать о всего',owner:'кисюша',members:15,posts:[]}
    ];
    save(LS.groups,groups);
  }
}
function renderGroups(){
  seedGroups();
  const box=document.getElementById('pg-groups');
  const groups=load(LS.groups,[]);
  box.innerHTML=`
    <div class="pcard">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px 6px">
        <h3 style="color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.7px">группы</h3>
        ${!me.guest?`<button class="minibtn" id="grpCreate">создать группу</button>`:''}
      </div>
      <div style="padding:0 18px 18px">
        ${groups.map(g=>`
          <div class="frow" style="cursor:pointer" onclick="openGroup('${g.id}')">
            <div class="ava" style="font-size:20px">${g.icon}</div>
            <div class="fmid"><div class="fname">${esc(g.name)}</div><div class="fsub">${esc(g.desc)} · ${g.members} участников</div></div>
            <button class="minibtn">войти</button>
          </div>
        `).join('')}
        ${!groups.length?'<div style="color:var(--muted2);font-size:13px;padding:10px">групп пока нет — создай первую!</div>':''}
      </div>
    </div>`;
  if(!me.guest)document.getElementById('grpCreate').onclick=()=>{
    const n=prompt('название группы:');
    if(!n)return;
    const g={id:'g'+Date.now().toString(36),name:n,icon:rnd(['🐈','🎵','💬','🐾','🍖','🧶']),desc:'',owner:me.user,members:1,posts:[]};
    const all=load(LS.groups,[]);all.unshift(g);save(LS.groups,all);
    addLog('group',me.user,'создал группу '+n);
    toast('группа создана');renderGroups();
  };
}
function openGroup(gid){
  const groups=load(LS.groups,[]);
  const g=groups.find(x=>x.id===gid);if(!g)return;
  const box=document.getElementById('pg-groups');
  box.innerHTML=`
    <div class="pcard">
      <div class="chat-head" style="border-bottom:1px solid var(--line)">
        <button class="icon-btn" id="grpBack" title="к списку">◂</button>
        <div class="ava" style="font-size:24px">${g.icon}</div>
        <div><div class="fname">${esc(g.name)}</div><div class="fsub">${g.members} участников · владелец ${esc(g.owner)}</div></div>
        ${g.owner===me.user?`<button class="minibtn" id="grpEdit">редактировать</button>`:''}
      </div>
      <div class="chat-msgs" id="grpMsgs" style="max-height:none;overflow-y:auto;padding:16px">
        <div style="color:var(--muted2);font-size:12px;padding:8px 0">${g.desc||'описание группы пока не добавлено'}</div>
        <div id="grpPosts" style="margin-top:12px"></div>
        ${me.guest?'':`
        <div class="chat-inp" style="border-top:1px solid var(--line);position:sticky;bottom:0;background:var(--card);padding:10px 16px">
          <input id="grpInput" placeholder="напиши в группу…" maxlength="500">
          <button class="go" id="grpSend">↪</button>
        </div>`}
      </div>
    </div>`;
  function renderGrpPosts(){
    const wrap=document.getElementById('grpPosts');if(!wrap)return;
    wrap.innerHTML='';
    (g.posts||[]).slice().reverse().forEach(p=>{
      const d=document.createElement('div');d.className='post';
      d.innerHTML=postHTML({...p,author:p.author||me.user,ava:p.ava||'🐈',time:p.time||'только что'});wrap.appendChild(d);
    });
    if(!(g.posts||[]).length)wrap.innerHTML='<div style="color:var(--muted2);font-size:13px">в группе пока пусто — напиши первым!</div>';
  }
  renderGrpPosts();
  document.getElementById('grpBack').onclick=()=>renderGroups();
  if(g.owner===me.user)document.getElementById('grpEdit').onclick=()=>{
    const d=prompt('новое описание группы:',g.desc||'');if(d===null)return;
    g.desc=d;const all=load(LS.groups,[]);const ix=all.findIndex(x=>x.id===g.id);if(ix>-1)all[ix]=g;save(LS.groups,all);
    renderGrpPosts();toast('описание обновлено');
  };
  if(!me.guest){
    document.getElementById('grpSend').onclick=()=>{
      const el=document.getElementById('grpInput');const t=el.value.trim();if(!t)return;
      g.posts=g.posts||[];g.posts.push({author:me.user,ava:me.ava||'🐈',text:t,time:'только что',likes:0,liked:false,comments:[]});
      const all=load(LS.groups,[]);const ix=all.findIndex(x=>x.id===g.id);if(ix>-1)all[ix]=g;save(LS.groups,all);
      addLog('group',me.user,'запись в группе '+g.name);
      el.value='';renderGrpPosts();toast('опубликовано в группе');
    };
    document.getElementById('grpInput').onkeydown=e=>{if(e.key==='Enter')document.getElementById('grpSend').click();};
  }
}

/* ============ oomy music ============ */
/* ============ МОДАЛКА ЗАГРУЗКИ ТРЕКА ============ */
let upCoverMid=null;
function openUpload(){
  const bg=document.getElementById('upBg');
  bg.classList.add('open');
  const f=document.getElementById('upFile'),p=document.getElementById('upPick');
  p.textContent='нажми, чтобы выбрать mp3 / wav / ogg';
  p.onclick=()=>f.click();
  f.onchange=()=>{if(f.files[0])p.textContent='🎵 '+f.files[0].name;};
  upCoverMid=null;
  const cn=document.getElementById('upCoverName');
  if(cn)cn.textContent='без обложки';
  const cb=document.getElementById('upCover');
  if(cb)cb.onclick=()=>{
    const inp=document.createElement('input');inp.type='file';inp.accept='image/*';
    inp.onchange=()=>{
      const file=inp.files[0];if(!file)return;
      if(file.size>1024*1024){toast('обложка до 1МБ');return;}
      putMedia(file,mid=>{
        if(!mid){toast('обложка слишком большая для хранилища');return;}
        upCoverMid=mid;
        if(cn)cn.textContent='обложка выбрана';
        toast('обложка готова');
      });
    };
    inp.click();
  };
}
document.getElementById('upGo').onclick=publishUpload;
function closeUpload(){document.getElementById('upBg').classList.remove('open');}
async function publishUpload(){
  const f=document.getElementById('upFile').files[0];
  const name=document.getElementById('upName').value.trim();
  const artist=document.getElementById('upArtist').value.trim();
  const priv=document.getElementById('upPrivate').checked;
  if(!f){toast('сначала выбери аудиофайл');return;}
  toast('сохраняю трек навсегда…');
  let mid=null,ib=null;
  try{
    if(f.size>1.5*1024*1024){ib=await IDB.put('mp3:'+Date.now().toString(36),f);}
    else{mid=await new Promise((res)=>putMedia(f,id=>res(id)));}
  }catch(e){}
  if(!mid&&!ib){toast('не получилось сохранить файл, он слишком толстый');return;}
  const trk={id:'t'+Date.now().toString(36)+Math.floor(Math.random()*999),
    name:name||f.name.replace(/\.[^.]+$/,''),
    artist:artist||me.user,
    owner:me.user,
    cover:rnd(['🎵','🎧','🎹','🔥','🌙','⚡']),
    coverMid:upCoverMid||null,
    origin:'local',mid,ib,priv,plays:0,dur:0,liked:false};
  const all=tracksAll();all.unshift(trk);tracksSave(all);
  addLog('music',me.user,'загрузил трек «'+trk.name+'»'+(priv?' (приватно)':''));
  addOon(25);bumpUpload();
  const probe=new Audio();
  if(mid)probe.src=mediaURL(mid);
  else if(ib){const bl=await IDB.get(ib);if(bl)probe.src=URL.createObjectURL(bl);}
  probe.onloadedmetadata=()=>{const tt=tracksAll();const x=tt.find(x=>x.id===trk.id);if(x){x.dur=probe.duration;tracksSave(tt);}};
  document.getElementById('upName').value='';document.getElementById('upArtist').value='';
  document.getElementById('upFile').value='';document.getElementById('upPrivate').checked=false;
  upCoverMid=null;
  const ucn=document.getElementById('upCoverName');if(ucn)ucn.textContent='без обложки';
  closeUpload();
  toast(priv?'трек сохранён — приватный, только в «моих треках»':'трек в oomy music, чарте и витрине!');
  if(!document.getElementById('pg-sound').classList.contains('hidden'))renderSound();
  playQueueFrom(trk.id);
}

/* ============ ООMY SOUND (страница музыки) ============ */
function tracksAll(){return load(LS.tracks,[]);}
function tracksSave(t){save(LS.tracks,t);}
function trackOwner(t){return t&&(t.owner||t.artist)||''}
function isMyTrack(t){return t.origin==='local'&&(t.owner?t.owner===me.user:(t.artist||'')===me.user)}
let soundTab='my',soundQuery='',soundSort='new',viewPlId=null;
function soundFiltered(list){
  const q=soundQuery.trim().toLowerCase();
  let out=q?list.filter(t=>(t.name||'').toLowerCase().includes(q)||(t.artist||'').toLowerCase().includes(q)):list.slice();
  if(soundSort==='plays')out.sort((a,b)=>(b.plays||0)-(a.plays||0));
  else if(soundSort==='likes')out.sort((a,b)=>(b.likes||0)-(a.likes||0));
  else if(soundSort==='name')out.sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  else out.sort((a,b)=>(b.id||'').localeCompare(a.id||''));
  return out;
}
function renderSound(){
  const box=document.getElementById('pg-sound');
  const trs=tracksAll();
  const pl=load(LS.playlists,[]);
  const pub=trs.filter(t=>t.origin==='local'&&!t.priv);
  const my=trs.filter(t=>isMyTrack(t));
  const artists=new Set(my.map(t=>t.artist||'—')).size;
  const totalPlays=my.reduce((a,t)=>a+(t.plays||0),0);
  box.innerHTML=`
    <div class="snd-hero">
      <div style="position:relative;z-index:1">
        <div class="snd-big">oomy music</div>
        <div class="snd-sub">музыка толстых котиков · ${my.length} треков · ${artists} исполнителей · ${totalPlays} прослушиваний</div>
        <div class="snd-actions">
          <button class="snd-playall" id="sndPlayAll">▶ слушать ${soundTab==='fav'?'избранное':soundTab==='chart'?'чарт':soundTab==='shop'?'витрину':'всё подряд'}</button>
          <button class="minibtn" id="trkOpen" style="background:var(--card2)">⬆ загрузить трек</button>
          <button class="minibtn" id="waveBtn" style="background:var(--card2)">🎲 волна</button>
        </div>
      </div>
    </div>
    <div class="pcard" style="padding:0 0 10px">
      <div class="subtabs">
        <button class="stab ${soundTab==='my'?'active':''}" data-st="my">мои треки · ${my.length}</button>
        <button class="stab ${soundTab==='chart'?'active':''}" data-st="chart">чарт · ${pub.length}</button>
        <button class="stab ${soundTab==='shop'?'active':''}" data-st="shop">витрина · ${pub.length}</button>
        <button class="stab ${soundTab==='pl'?'active':''}" data-st="pl">плейлисты · ${pl.length}</button>
        <button class="stab ${soundTab==='fav'?'active':''}" data-st="fav">избранное · ${trs.filter(t=>t.liked).length}</button>
        <button class="stab ${soundTab==='sc'?'active':''}" data-st="sc">SoundCloud</button>
      </div>
      ${soundTab==='sc'||soundTab==='plview'?'':`<div class="snd-search">
        <input id="sndQ" placeholder="поиск по названию или исполнителю…" value="${esc(soundQuery)}">
        <select id="sndSort" title="сортировка">
          <option value="new"${soundSort==='new'?' selected':''}>сначала новые</option>
          <option value="plays"${soundSort==='plays'?' selected':''}>по прослушиваниям</option>
          <option value="likes"${soundSort==='likes'?' selected':''}>по лайкам</option>
          <option value="name"${soundSort==='name'?' selected':''}>по названию</option>
        </select>
      </div>`}
      <div id="sndBody"></div>
    </div>`;
  box.querySelectorAll('.stab').forEach(b=>b.onclick=()=>{soundTab=b.dataset.st;renderSound();});
  box.querySelector('#trkOpen').onclick=()=>openUpload();
  box.querySelector('#waveBtn').onclick=()=>{
    if(!pub.length){toast('на витрине пока пусто — загрузи первый трек');return;}
    const t=rnd(pub);
    player.queue=pub.map(x=>x.id);
    setCurrent(t.id);
    toast('🎲 волна: «'+t.name+'»'+(t.artist?' — '+t.artist:'')+' · только публичные треки');
  };
  const bodyEl=box.querySelector('#sndBody');
  let playList=[];
  if(soundTab==='my'){
    playList=soundFiltered(my);
    bodyEl.innerHTML=playList.length?playList.map(t=>trackHTML(t)).join(''):`<div class="snd-empty">${my.length?'ничего не нашлось — измени запрос':'пусто… жми «загрузить трек» и стань легендой oomy music'}</div>`;
  }else if(soundTab==='chart'){
    playList=soundFiltered(pub);
    if(soundSort==='new')playList.sort((a,b)=>((b.plays||0)-(a.plays||0))||((b.likes||0)-(a.likes||0)));
    bodyEl.innerHTML=playList.length?playList.map((t,i)=>rankHTML(t,i+1)).join(''):'<div class="snd-empty">чарт пуст — загрузи трек и стань №1</div>';
  }else if(soundTab==='shop'){
    playList=soundFiltered(pub);
    bodyEl.innerHTML=playList.length?playList.map((t,i)=>rankHTML(t,i+1)).join(''):'<div class="snd-empty">витрина пока пустая — пополним?</div>';
  }else if(soundTab==='fav'){
    playList=soundFiltered(trs.filter(t=>t.liked));
    bodyEl.innerHTML=playList.length?playList.map(t=>trackHTML(t)).join(''):'<div class="snd-empty">сердечек пока нет. жмякни ❤ на треке</div>';
  }else if(soundTab==='plview'){
    const p=pl.find(x=>x.id===viewPlId);
    if(!p){soundTab='pl';renderSound();return;}
    const canSeePrivate=p.owner===me.user||(p.members||[]).includes(me.user);
    playList=(p.trackIds||[]).map(id=>tracksAll().find(x=>x.id===id)).filter(t=>t&&(!t.priv||canSeePrivate||isMyTrack(t)));
    bodyEl.innerHTML=playlistViewHTML(p,playList);
    bindPlaylistView(bodyEl,p,playList);
  }else if(soundTab==='sc'){
    const scTracks=trs.filter(t=>t.origin==='sc'||t.scSource);
    bodyEl.innerHTML=`
      <div class="snd-tip"><b>как добавить трек с soundcloud</b><br>1. скопируй ссылку вида <b>soundcloud.com/исполнитель/трек</b><br>2. вставь её ниже — oomy сам вытащит mp3 и сохранит на сайте.<br>3. если soundcloud закрыл доступ, скачай mp3 в браузере и загрузи кнопкой «вручную» — трек всё равно будет играть здесь.</div>
      <div style="padding:4px 16px 10px;display:flex;gap:8px;flex-wrap:wrap">
        <input class="pill-input" id="scUrl" style="flex:1;min-width:200px" placeholder="https://soundcloud.com/…">
        <button class="send-btn on" id="scAdd" style="padding:0 20px;border:none;border-radius:12px;background:var(--acc);color:var(--acc-fg);font-weight:700;cursor:pointer;pointer-events:auto">скачать на сайт</button>
        <button class="minibtn" id="scManual">⬆ mp3 вручную</button>
        <input type="file" id="scManualFile" accept="audio/*" class="hidden">
      </div>
      <div class="snd-sec"><h3>уже добавлено с SoundCloud · ${scTracks.length}</h3><a href="https://soundcloud.com/search?q=" target="_blank" rel="noopener" style="color:var(--acc);font-size:12px;text-decoration:none">искать на SoundCloud →</a></div>
      ${scTracks.length?scTracks.map(t=>trackHTML(t)).join(''):'<div class="snd-empty">пока ничего не добавлено</div>'}`;
    const add=()=>{
      const u=box.querySelector('#scUrl').value.trim();
      if(!u.includes('soundcloud.com')){toast('это не похоже на ссылку SoundCloud');return;}
      addFromSoundCloud(u);
    };
    box.querySelector('#scAdd').onclick=add;
    box.querySelector('#scUrl').onkeydown=e=>{if(e.key==='Enter')add()};
    const mf=box.querySelector('#scManualFile');
    box.querySelector('#scManual').onclick=()=>mf.click();
    mf.onchange=()=>{const f=mf.files[0];if(!f)return;document.getElementById('upFile').files=mf.files;openUpload();toast('файл выбран — проверь название и жми «опубликовать»');};
  }else{
    bodyEl.innerHTML=pl.length?pl.map(p=>{
      const own=p.owner===me.user;
      return `<div class="plcard" data-pl="${p.id}">
        <div class="tcover" style="width:54px;height:54px">${plCoverHTML(p,54)}</div>
        <div class="tmid"><div class="tn">${esc(p.name)}</div><div class="td">${(p.trackIds||[]).length} треков · ${own?'мой плейлист':'@'+esc(p.owner||'—')}${(p.members||[]).length?' · соавторы: '+esc(p.members.map(m=>'@'+m).join(', ')):''}${p.savedFrom?' · сохранён от @'+esc(p.savedFrom):''}</div></div>
        <button class="minibtn">играть</button>
        <button class="heartbtn">⋯</button>
      </div>`;
    }).join(''):'<div class="snd-empty">плейлистов пока нет — создай первый</div>';
    bodyEl.innerHTML+=`<div style="padding:6px 16px 16px;display:flex;gap:8px;align-items:center">
      <input class="pill-input" id="plName" style="flex:1" placeholder="создать плейлист…">
      <button class="minibtn" id="plCreate">＋ создать</button>
    </div>`;
    bodyEl.querySelectorAll('.plcard').forEach(c=>{
      const pl0=load(LS.playlists,[]).find(x=>x.id===c.dataset.pl);
      c.querySelector('.minibtn').onclick=e=>{e.stopPropagation();playPlaylist(pl0.id);};
      c.querySelector('.heartbtn').onclick=e=>{e.stopPropagation();playlistMenu(e,pl0.id);};
      c.onclick=()=>openPlaylist(pl0.id);
    });
    box.querySelector('#plCreate').onclick=()=>{
      const n=box.querySelector('#plName').value.trim();
      if(!n){toast('дай плейлисту имя');return;}
      const acc=load(LS.playlists,[]);
      acc.unshift({id:'p'+Date.now().toString(36),name:n,cover:rnd(['📼','🧨','🧀','🌕','🧁']),trackIds:[],owner:me.user,members:[]});
      save(LS.playlists,acc);addLog('music',me.user,'создал плейлист «'+n+'»');
      toast('плейлист готов');renderSound();
    };
    box.querySelector('#plName').onkeydown=e=>{if(e.key==='Enter')box.querySelector('#plCreate').click()};
  }
  const qEl=box.querySelector('#sndQ');
  if(qEl)qEl.oninput=()=>{soundQuery=qEl.value;const pos=qEl.selectionStart;renderSound();const nq=document.getElementById('sndQ');if(nq){nq.focus();nq.setSelectionRange(pos,pos);}};
  const sEl=box.querySelector('#sndSort');
  if(sEl)sEl.onchange=()=>{soundSort=sEl.value;renderSound();};
  box.querySelector('#sndPlayAll').onclick=()=>{
    if(!playList.length){toast('в этом разделе пока нет треков');return;}
    player.queue=playList.filter(t=>t.origin!=='sc').map(t=>t.id);
    if(!player.queue.length){toast('здесь только SoundCloud-треки');return;}
    setCurrent(player.queue[0]);
    toast('играю '+player.queue.length+' треков подряд');
  };
  wireTracks(box);
}
function plCoverHTML(p,sz){
  const style='width:'+sz+'px;height:'+sz+'px;object-fit:cover;border-radius:'+(sz>60?16:8)+'px';
  if(p&&p.coverMid){const u=mediaURL(p.coverMid);if(u)return '<img src="'+esc(u)+'" style="'+style+'">';}
  if(p&&p.coverUrl)return '<img src="'+esc(p.coverUrl)+'" style="'+style+'">';
  return '<span style="font-size:'+Math.round(sz*.46)+'px">'+esc((p&&p.cover)||'📼')+'</span>';
}
function openPlaylist(plId){
  viewPlId=plId;soundTab='plview';
  renderSound();
  window.scrollTo({top:0,behavior:'smooth'});
}
function playlistTrackHTML(t,canEdit){
  let cover=esc(t.cover||'🎵');
  if(t.coverUrl)cover='<img src="'+esc(t.coverUrl)+'">';
  if(t.coverMid){const u=mediaURL(t.coverMid);if(u)cover='<img src="'+u+'">';}
  return `<div class="track" data-t="${t.id}">
    <div class="tcover">${cover}<button class="tplay">▶</button></div>
    <div class="tmid"><div class="tn">${esc(t.name)}${t.priv?' <span class="tag-private">приватный</span>':''}</div><div class="td">${t.artist?esc(t.artist)+' · ':''}${esc(fmtT(t.dur))} · ▶${t.plays||0}</div></div>
    ${canEdit?`<button class="minibtn pl-rm" data-rm="${t.id}" title="убрать из плейлиста">✕</button>`:''}
    <button class="heartbtn tmenu">⋯</button>
  </div>`;
}
function playlistViewHTML(p,list){
  const owner=p.owner||'—';
  const isOwner=p.owner===me.user||(p.members||[]).includes(me.user);
  const saved=load(LS.playlists,[]).some(x=>x.owner===me.user&&x.fromPl===p.id);
  return `<div class="pcard" style="padding:16px;margin:12px">
    <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
      <div class="pl-bigcover">${plCoverHTML(p,112)}</div>
      <div style="flex:1;min-width:180px">
        <div class="pf-name" style="font-size:23px">${esc(p.name)}</div>
        <div class="pf-sub">плейлист · ${list.length} треков · создал ${userLink(owner)}${(p.members||[]).length?' · соавторы: '+esc(p.members.map(m=>'@'+m).join(', ')):''}${p.savedFrom?' · сохранён от @'+esc(p.savedFrom):''}</div>
      </div>
      <div class="pl-actions">
        <button class="dan-btn" id="plvPlay">▶ играть</button>
        ${!isOwner?`<button class="minibtn" id="plvSave">${saved?'уже сохранён':'сохранить себе'}</button>`:''}
        ${isOwner?`<button class="minibtn" id="plvCover">🖼 обложка</button>`:''}
        ${isOwner?`<button class="minibtn" id="plvAdd">＋ треки</button>`:''}
        <button class="minibtn" id="plvMenu">⋯</button>
        <button class="minibtn" id="plvBack">← к плейлистам</button>
      </div>
    </div>
  </div>
  <div style="margin:12px 0 0">
    ${list.length?list.map(t=>playlistTrackHTML(t,isOwner)).join(''):'<div class="snd-empty">в плейлисте пока нет треков'+(isOwner?' — жми «＋ треки»':'')+'</div>'}
  </div>`;
}
function bindPlaylistView(scope,p){
  const play=scope.querySelector('#plvPlay');if(play)play.onclick=()=>playPlaylist(p.id);
  const back=scope.querySelector('#plvBack');if(back)back.onclick=()=>{soundTab='pl';viewPlId=null;renderSound();};
  const menu=scope.querySelector('#plvMenu');if(menu)menu.onclick=e=>playlistMenu(e,p.id);
  const sv=scope.querySelector('#plvSave');if(sv)sv.onclick=()=>savePlaylistToSelf(p.id);
  const cv=scope.querySelector('#plvCover');if(cv)cv.onclick=()=>setPlaylistCover(p.id);
  const add=scope.querySelector('#plvAdd');if(add)add.onclick=e=>addTracksToPlaylist(e,p.id);
  scope.querySelectorAll('[data-gu]').forEach(el=>el.onclick=()=>openUserPage(el.dataset.gu));
  scope.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{
    const acc=load(LS.playlists,[]);const x=acc.find(z=>z.id===p.id);if(!x)return;
    x.trackIds=(x.trackIds||[]).filter(id=>id!==b.dataset.rm);
    save(LS.playlists,acc);
    addLog('music',me.user,'убрал трек из плейлиста «'+x.name+'»');
    toast('трек убран из плейлиста');renderSound();
  });
}
function savePlaylistToSelf(plId){
  const src=load(LS.playlists,[]).find(x=>x.id===plId);if(!src)return;
  if(src.owner===me.user){toast('это твой плейлист');return;}
  const mine=load(LS.playlists,[]);
  if(mine.some(x=>x.owner===me.user&&x.fromPl===src.id)){toast('этот плейлист уже сохранён');return;}
  const copyIds=(src.trackIds||[]).filter(id=>{const t=tracksAll().find(x=>x.id===id);return t&&(!t.priv||isMyTrack(t));});
  mine.unshift({id:'p'+Date.now().toString(36),name:src.name,cover:src.cover,coverMid:src.coverMid||null,coverUrl:src.coverUrl||'',trackIds:copyIds,owner:me.user,members:[],fromPl:src.id,savedFrom:src.owner||''});
  save(LS.playlists,mine);
  addLog('music',me.user,'сохранил плейлист «'+src.name+'» от '+(src.owner||'—'));
  toast('плейлист «'+src.name+'» сохранён себе');
  renderSound();
}
function setPlaylistCover(plId){
  const inp=document.createElement('input');inp.type='file';inp.accept='image/*';
  inp.onchange=()=>{
    const f=inp.files[0];if(!f)return;
    if(f.size>1024*1024){toast('обложка до 1МБ');return;}
    putMedia(f,mid=>{
      if(!mid){toast('обложка слишком большая');return;}
      const acc=load(LS.playlists,[]);const p=acc.find(x=>x.id===plId);
      if(p){p.coverMid=mid;save(LS.playlists,acc);addLog('music',me.user,'обложка плейлиста «'+p.name+'»');renderSound();toast('обложка плейлиста готова');}
    });
  };
  inp.click();
}
function addTracksToPlaylist(e,plId){
  const p=load(LS.playlists,[]).find(x=>x.id===plId);if(!p)return;
  const have=new Set(p.trackIds||[]);
  const avail=tracksAll().filter(t=>t.origin==='local'&&!have.has(t.id)&&(!t.priv||isMyTrack(t)));
  if(!avail.length){toast('все треки уже в плейлисте');return;}
  menuPop(e.clientX,e.clientY,avail.map(t=>({t:(t.priv?'🔒 ':'')+t.name+(t.artist?' — '+t.artist:''),f:()=>{
    const acc=load(LS.playlists,[]);const x=acc.find(z=>z.id===plId);if(!x)return;
    x.trackIds=x.trackIds||[];if(x.trackIds.includes(t.id)){toast('уже в плейлисте');return;}
    x.trackIds.push(t.id);save(LS.playlists,acc);
    addLog('music',me.user,'добавил «'+t.name+'» в плейлист «'+x.name+'»');
    toast('добавлено: '+x.name);renderSound();
  }})));
}
function trackHTML(t){
  let cover=esc(t.cover||'🎵');
  if(t.coverUrl)cover='<img src="'+esc(t.coverUrl)+'">';
  if(t.coverMid){const u=mediaURL(t.coverMid);if(u)cover='<img src="'+u+'">';}
  return `<div class="track" data-t="${t.id}">
    <div class="tcover">${cover}<button class="tplay">▶</button></div>
    <div class="tmid"><div class="tn">${esc(t.name)}${t.priv?' <span class="tag-private">приватный</span>':''}${t.scSource?' <span class="tag-private">с SoundCloud</span>':''}</div><div class="td">${t.artist?esc(t.artist)+' · ':''}${esc(fmtT(t.dur))} · ▶${t.plays||0}</div></div>
    <button class="heartbtn ${t.liked?'on':''}"><svg class="mi"><use href="#i-heart"/></svg></button>
    <button class="heartbtn tmenu">⋯</button>
  </div>`;
}
function rankHTML(t,place){
  let cover=esc(t.cover||'🎵');
  if(t.coverUrl)cover='<img src="'+esc(t.coverUrl)+'">';
  if(t.coverMid){const u=mediaURL(t.coverMid);if(u)cover='<img src="'+u+'">';}
  return `<div class="track" data-t="${t.id}">
    <div class="rank">${place}</div>
    <div class="tcover">${cover}<button class="tplay">▶</button></div>
    <div class="tmid"><div class="tn">${esc(t.name)}</div><div class="td">${t.artist?esc(t.artist)+' · ':''}${esc(fmtT(t.dur))} · ▶${t.plays||0}</div></div>
    <button class="heartbtn ${t.liked?'on':''}"><svg class="mi"><use href="#i-heart"/></svg></button>
    <button class="heartbtn tmenu">⋯</button>
  </div>`;
}
function wireTracks(scope){
  scope.querySelectorAll('.track').forEach(el=>{
    const t=tracksAll().find(x=>x.id===el.dataset.t);if(!t)return;
    const play=el.querySelector('.tplay');
    if(t.origin==='sc'){
      play.onclick=()=>scEmbed(t);
    }else{
      play.onclick=()=>{
        if(player.currentId===t.id){togglePlay();return;}
        playQueueFrom(t.id);
      };
    }
    if(player.currentId===t.id&&player.playing)play.classList.add('playing');
    const heart=el.querySelector('.heartbtn:not(.tmenu)');
    if(heart)heart.onclick=()=>{
      t.liked=!t.liked;const all=tracksAll();const x=all.find(x=>x.id===t.id);if(x)x.liked=t.liked;tracksSave(all);
      addLog('music',me.user,(t.liked?'лайкнул':'разлайкнул')+' трек «'+t.name+'»');
      heart.classList.toggle('on',t.liked);
      toast(t.liked?'в избранном':'убрал из избранного');
    };
    const tm=el.querySelector('.tmenu');
    if(tm)tm.onclick=e=>trackMenu(e,t);
  });
}
/* достаём mp3 с SoundCloud, обходя блокочки: cobalt API → офиц. API через 3 прокси → CDN напрямую */
const SC_PROXIES=[
  u=>u,
  u=>'https://corsproxy.io/?url='+encodeURIComponent(u),
  u=>'https://api.allorigins.win/raw?url='+encodeURIComponent(u),
  u=>'https://api.codetabs.com/v1/proxy?quest='+encodeURIComponent(u),
  u=>'https://thingproxy.freeboard.io/fetch/'+u,
  u=>'https://r.jina.ai/'+u
];
async function tryAll(url,as){
  let err;
  for(const p of SC_PROXIES){
    try{const r=await fetch(p(url),{signal:AbortSignal.timeout?AbortSignal.timeout(15000):undefined});
      if(!r.ok)continue;
      if(as==='json'){const j=await r.json();return j}
      if(as==='text'){const t=await r.text();return t}
      return r;
    }catch(e){err=e}
  }
  throw err||new Error('все пути блок');
}
/* путь №1: cobalt — публичный загрузчик медиа (тот же движок, чем пользуются сайты-качалки) */
async function cobaltAudio(u){
  const endpoints=[
    'https://api.cobalt.tools/',
    'https://co.wuk.sh/',
    'https://cobalt-api.kwiatekmiki.com/',
    'https://cobalt-backend.canine.tools/',
    'https://api.cobalt.best/',
    'https://api.cobalt.tools/api/json'
  ];
  for(const ep of endpoints){
    try{
      const r=await fetch(ep,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},
        body:JSON.stringify({url:u,downloadMode:'audio',audioFormat:'mp3',filenameStyle:'basic',vQuality:'128'})});
      if(!r.ok)continue;
      const j=await r.json();
      if(j&&(j.status==='tunnel'||j.status==='redirect'||j.status==='stream'||j.status==='picker')&&j.url)return j.url;
    }catch(e){}
  }
  throw new Error('cobalt молчит');
}
async function scGrab(u){
  const oembed='https://soundcloud.com/oembed?format=json&url='+encodeURIComponent(u);
  let meta=null;
  try{meta=await tryAll(oembed,'json')}catch(e){}
  /* путь №2: забираем страницу, ищем client_id и транскодинги */
  let cid=null,prog=null;
  try{
    const html=await tryAll(u,'text');
    cid=(html.match(/client_id["'\s:=]+([a-zA-Z0-9]{20,40})/)||[])[1];
    const tj=html.match(/"transcodings":(\[.*?\])/);
    if(cid&&tj){
      const trs=JSON.parse(tj[1]);
      prog=trs.find(x=>x.format&&x.format.protocol==='progressive'&&/mpeg|mp3/i.test(x.format.mime_type||''))||trs.find(x=>x.format&&x.format.protocol==='progressive');
    }
  }catch(e){}
  if(cid&&prog){
    const stream=await tryAll(prog.url+(prog.url.includes('?')?'&':'?')+'client_id='+cid,'json');
    if(stream.url){
      const r=await tryAll(stream.url);
      const blob=await r.blob();
      if(blob&&blob.size)return {meta,blob};
    }
  }
  /* путь №1 (если путь №2 не сработал): cobalt отдаёт прямую ссылку на mp3 */
  const audioUrl=await cobaltAudio(u);
  let r;
  try{r=await fetch(audioUrl)}catch(e){r=null}
  if(!r||!r.ok)r=await tryAll(audioUrl);
  const blob=await r.blob();
  if(!blob||!blob.size)throw new Error('пустой файл');
  return {meta,blob};
}
/* SoundCloud-ссылка → mp3-файл на Сайте: качаем в IndexedDB, трек играет в нижнем плеере как залитый */
async function addFromSoundCloud(u){
  toast('мур-мур, качаю mp3 с SoundCloud… это до минуты');
  let g;
  try{g=await scGrab(u);}
  catch(e){toast('саундклауд не отдал файл (линк правообладателя или капризы сети). попробуй другой трек');return;}
  const meta=g.meta||{},blob=g.blob;
  let title=meta.title||'',artist=meta.author_name||'';
  if(title&&artist&&title.endsWith(' by '+artist))title=title.slice(0,-(artist.length+4));
  if(!title)title=(u.split('/').slice(3,5).join(' · ')||'SoundCloud трек').slice(0,60);
  let ib=null,mid=null;
  try{ib=await IDB.put('mp3:'+Date.now().toString(36),blob);}catch(e){}
  if(!ib){
    const fr=new FileReader();
    const url=await new Promise(res=>{fr.onload=()=>res(fr.result);fr.readAsDataURL(blob);});
    const m=load(LS.media,{});mid='a'+Date.now().toString(36)+Math.floor(Math.random()*999);m[mid]=url;
    try{localStorage.setItem(LS.media,JSON.stringify(m))}catch(ex){toast('файл слишком толстый для хранилища');return}
  }
  const trk={id:'t'+Date.now().toString(36)+Math.floor(Math.random()*999),
    name:title.slice(0,80),artist:(artist||'').slice(0,60),
    owner:me.user,
    cover:rnd(['🎧','🎹','🔥','🌙','⚡']),coverUrl:meta.thumbnail_url||'',
    origin:'local',scSource:true,scUrl:u,liked:false,plays:0,dur:0,priv:false,
    ib:ib,mid:mid};
  const all=tracksAll();all.unshift(trk);tracksSave(all);
  addLog('music',me.user,'загрузил mp3 «'+trk.name+'» с SoundCloud');
  addOon(25);bumpUpload();
  toast('mp3 теперь на сайте! включаю в нижнем плеере');
  soundTab='my';renderSound();
  playQueueFrom(trk.id);
}
/* старые ссылки-метаданные: если файл есть — играем, нет — открываем на SoundCloud */
function scEmbed(t){
  if(t&&(t.ib||t.mid)){playQueueFrom(t.id);return;}
  toast('mp3 у этого трека нет — открываю на SoundCloud');
  if(t.scUrl)window.open(t.scUrl,'_blank');
}
function playlistMenu(e,plId){
  const pl=load(LS.playlists,[]).find(x=>x.id===plId);
  if(!pl)return;
  const canEdit=pl.owner===me.user||(pl.members||[]).includes(me.user);
  const isMine=pl.owner===me.user;
  const items=[
    {t:'открыть плейлист',f:()=>openPlaylist(plId)},
    {t:'играть',f:()=>playPlaylist(plId)},
    ...(!isMine?[{t:'сохранить себе',f:()=>savePlaylistToSelf(plId)}]:[]),
    ...(canEdit?[
      {t:'добавить треки',f:()=>addTracksToPlaylist(e,plId)},
      {t:'поставить обложку',f:()=>setPlaylistCover(plId)},
      {t:'пригласить котика',f:()=>{
        const us=Object.keys(encLoad(LS.acc,{})).filter(u=>u!==me.user&&!(pl.members||[]).includes(u));
        if(!us.length){toast('других котиков нет');return;}
        menuPop(e.clientX,e.clientY,us.map(u=>({t:'🐱 '+u,f:()=>{
          pl.members=pl.members||[];pl.members.push(u);
          save(LS.playlists,load(LS.playlists,[]).map(x=>x.id===pl.id?pl:x));
          addLog('music',me.user,'пригласил '+u+' в плейлист «'+pl.name+'»');
          toast(u+' теперь соавтор плейлиста');renderSound();
        }})));
      }}
    ]:[]),
    ...(isMine?[
      {t:'переименовать',f:()=>{
        const n=prompt('новое имя:',pl.name);if(!n)return;
        pl.name=n;save(LS.playlists,load(LS.playlists,[]).map(x=>x.id===plId?pl:x));addLog('music',me.user,'переименовал плейлист');renderSound();
      }},
      {t:'удалить',danger:true,f:()=>{
        save(LS.playlists,load(LS.playlists,[]).filter(x=>x.id!==plId));addLog('music',me.user,'удалил плейлист «'+pl.name+'»');soundTab='pl';viewPlId=null;renderSound();toast('плейлист удалён');
      }}
    ]:[])
  ];
  menuPop(e.clientX,e.clientY,items);
}
function copyTrackToSelf(t){
  const all=tracksAll();
  if(all.some(x=>x.owner===me.user&&x.copyOf===t.id)){toast('этот трек уже сохранён себе');return;}
  const copy={...t,id:'t'+Date.now().toString(36)+Math.floor(Math.random()*999),owner:me.user,liked:false,plays:0,cmts:[],copyOf:t.id,priv:false};
  all.unshift(copy);tracksSave(all);
  addLog('music',me.user,'добавил себе трек «'+t.name+'» от '+trackOwner(t));
  toast('трек «'+t.name+'» теперь в «моих треках»');
  renderSound();
}
function trackMenu(e,t){
  const items=[];
  const mine=isMyTrack(t);
  if(t.origin==='local'&&mine){
    items.push({t:'💬 комментарии к треку'+(t.cmts&&t.cmts.length?' · '+t.cmts.length:''),f:()=>trackCmts(t)});
    items.push({t:'переименовать',f:()=>{
      const a=prompt('имя автора (исполнителя):',t.artist||'');if(a===null)return;
      const n=prompt('название трека:',t.name);if(!n)return;
      const all=tracksAll();const x=all.find(x=>x.id===t.id);if(x){x.artist=a.trim();x.name=n;tracksSave(all);}
      addLog('music',me.user,'переименовал трек в «'+(a.trim()&&a.trim()+' · ')+n+'»');renderSound();
      toast('переименовал: «'+n+'»');
    }});
    items.push({t:'поставить обложку',f:()=>{
      const inp=document.createElement('input');inp.type='file';inp.accept='image/*';
      inp.onchange=()=>{const f=inp.files[0];if(!f)return;
        if(f.size>1024*1024){toast('обложка до 1МБ');return;}
        putMedia(f,mid=>{const all=tracksAll();const x=all.find(x=>x.id===t.id);if(x){x.coverMid=mid;tracksSave(all);addLog('music',me.user,'обложка трека «'+t.name+'»');renderSound();toast('обложка поставлена');}});};
      inp.click();
    }});
    const pls=load(LS.playlists,[]).filter(pl=>pl.owner===me.user||(pl.members||[]).includes(me.user));
    if(pls.length)items.push(...pls.map(pl=>({t:'в плейлист: '+pl.name,f:()=>{
      if(!pl.trackIds)pl.trackIds=[];
      if(pl.trackIds.includes(t.id)){toast('уже в этом плейлисте');return;}
      pl.trackIds.push(t.id);save(LS.playlists,load(LS.playlists,[]).map(x=>x.id===pl.id?pl:x));
      addLog('music',me.user,'добавил «'+t.name+'» в плейлист «'+pl.name+'»');toast('добавлено: '+pl.name);
    }})));
    items.push({t:'удалить трек',danger:true,f:()=>{
      const all=tracksAll();const cur=player.currentId===t.id;
      const keep=all.filter(x=>x.id!==t.id);
      save(LS.tracks,keep);
      const m=load(LS.media,{});if(t.mid&&!keep.some(x=>x.mid===t.mid))delete m[t.mid];save(LS.media,m);
      addLog('music',me.user,'удалил трек «'+t.name+'»');
      if(cur)pausePlayer();
      toast('трек удалён');renderSound();
    }});
  }else if(t.origin==='local'){
    items.push({t:'добавить себе',f:()=>copyTrackToSelf(t)});
    items.push({t:'💬 комментарии к треку'+(t.cmts&&t.cmts.length?' · '+t.cmts.length:''),f:()=>trackCmts(t)});
    if(t.scUrl)items.push({t:'открыть на SoundCloud',f:()=>window.open(t.scUrl,'_blank')});
    items.push({t:'пожаловаться',danger:true,f:()=>{
      addLog('report',me.user,'жалоба на трек «'+t.name+'»');
      pushNotif(ADMIN,'🚨','@'+me.user+' пожаловался на трек «'+t.name+'»');
      toast('жалоба отправлена главному коту');
    }});
  }else{
    items.push({t:'открыть на звуке',f:()=>{window.open(t.scUrl,'_blank');}});
    items.push({t:'убрать из списка',danger:true,f:()=>{save(LS.tracks,tracksAll().filter(x=>x.id!==t.id));renderSound();}});
  }
  menuPop(e.clientX,e.clientY,items);
}
/* комментарии с таймкодами: «1:24 тут имба» — клик по таймкоду перематывает трек */
function trackCmts(t){
  const bg=document.getElementById('edBg');
  const body=document.getElementById('edBody');
  const draw=()=>{
    const cur=tracksAll().find(x=>x.id===t.id)||t;
    const list=cur.cmts||[];
    body.innerHTML=`
      <div style="display:flex;align-items:center;gap:10px;padding-bottom:8px">
        <div class="tcover" style="width:44px;height:44px;font-size:18px">${esc(cur.cover||'🎵')}</div>
        <div style="flex:1;min-width:0"><div class="pf-name" style="font-size:16px">${esc(cur.name)}</div><div class="pf-sub">${esc(cur.artist||'')} · ▶ ${cur.plays||0}</div></div>
      </div>
      <div id="tcList">${list.length?'':'<div class="empty-note">пока тихо. оставь первый таймкод: где и что происходи</div>'}
        ${list.map((c,ci)=>`<div class="adm-row"><button class="minibtn" data-tc="${ci}" style="min-width:56px">${esc(c.tc)}</button><span style="flex:1">${esc(c.txt)} <span class="from-line">· ${esc(c.user)}</span></span>${me&&(c.user===me.user||isAdmin())?'<button class="x" data-tc-x="'+ci+'">✕</button>':''}</div>`).join('')}
      </div>
      <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
        <input class="pill-input" id="tcTime" style="max-width:90px" placeholder="0:00">
        <input class="pill-input" id="tcText" style="flex:1;min-width:150px" maxlength="140" placeholder="что тут происходит? (таймкод можно оставить пустым — возьмём текущий)">
        <button class="minibtn" id="tcAdd" style="background:var(--acc);border-color:var(--acc);color:#fff">добавить</button>
      </div>
      <div class="adm-note">клик по таймкоду — перемотает трек, если он играет в нижнем плеере</div>`;
    body.querySelectorAll('[data-tc]').forEach(b=>b.onclick=()=>{
      const c=list[Number(b.dataset.tc)];
      const [mm,ss]=(c.tc.split(':').map(Number));
      if(player.currentId===cur.id&&player.dur){player.audio.currentTime=(mm*60+(ss||0));toast('перемотал на '+c.tc);}
      else toast('сначала включи трек ▶');
    });
    body.querySelectorAll('[data-tc-x]').forEach(b=>b.onclick=()=>{
      const all=tracksAll();const x=all.find(x=>x.id===cur.id);if(x){x.cmts.splice(Number(b.dataset.tcX),1);tracksSave(all);draw();}
    });
    body.querySelector('#tcAdd').onclick=()=>{
      const txt=body.querySelector('#tcText').value.trim();
      if(!txt){toast('напиши хоть что-то');return;}
      let tc=body.querySelector('#tcTime').value.trim();
      if(!tc&&player.currentId===cur.id)tc=fmtT(player.audio.currentTime);
      if(!tc)tc='0:00';
      if(!/^\d{1,2}:\d{1,2}$/.test(tc)){toast('таймкод в формате 1:24');return;}
      const all=tracksAll();const x=all.find(x=>x.id===cur.id);
      if(x){x.cmts=x.cmts||[];x.cmts.push({tc,txt,user:me.user});tracksSave(all);addLog('music',me.user,'таймкод '+tc+' к «'+cur.name+'»');draw();}
    };
  };
  document.getElementById('edBg').onclick=e=>{if(e.target===bg)bg.classList.remove('open')};
  bg.classList.add('open');
  draw();
}

/* ============ ПЛЕЕР ============ */
const NP={play:document.getElementById('npPlay'),prev:document.getElementById('npPrev'),next:document.getElementById('npNext'),
  title:document.getElementById('npTitle'),time:document.getElementById('npTime'),seek:document.getElementById('npSeek'),
  cov:document.getElementById('npCover'),mute:document.getElementById('npMute'),vol:document.getElementById('npVol'),
  shuf:document.getElementById('npShuffle'),rep:document.getElementById('npRepeat'),add:document.getElementById('npAdd'),
  panel:document.getElementById('nowPanel'),ext:document.getElementById('npExt'),artist:document.getElementById('npArtist'),ring:document.getElementById('npRing')};
const player={currentId:null,queue:[],playing:false,shuffle:false,repeat:false,muted:false,autoplay:true,audio:new Audio(),dur:0};
player.audio.volume=0.8;
const ICON_PLAY='<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const ICON_MUSIC='<svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor" style="opacity:.75"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>';
const ICON_PAUSE='<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
const ICON_VOL='<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M4 9v6h4l5 5V4L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z"/></svg>';
const ICON_MUTE='<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M4 9v6h4l5 5V4L8 9H4zm14.5 3 2.5 2.5-1.4 1.4-2.5-2.5-2.5 2.5-1.4-1.4 2.5-2.5-2.5-2.5 1.4-1.4 2.5 2.5 2.5-2.5 1.4 1.4z"/></svg>';
function seekFill(){const p=player.dur?Math.min(100,player.audio.currentTime/player.dur*100):0;if(NP.ring)NP.ring.style.background='conic-gradient(var(--acc) 0 '+p+'%, var(--line) '+p+'% 100%)';NP.time.textContent=fmtT(player.audio.currentTime)+' / '+fmtT(player.dur);}
player.audio.addEventListener('timeupdate',()=>{seekFill();});
player.audio.addEventListener('ended',()=>{
  player.playing=false;syncPlayerUI();
  if(player.repeat){player.audio.currentTime=0;player.audio.play().then(()=>{player.playing=true;syncPlayerUI();});return;}
  if(player.autoplay===false){toast('трек закончился — автоплей выключен');return;}
  nextTrack();
});
player.audio.addEventListener('loadedmetadata',()=>{player.dur=player.audio.duration||0;});
function playQueueFrom(trackId){
  const loc=tracksAll().find(x=>x.id===trackId);
  if(loc&&loc.origin==='sc'){scEmbed(loc);bumpListen(loc.id);return;}
  try{const t=tracksAll().find(x=>x.id===trackId);if(t)bumpListen(t.id,t.artist);}catch(e){}
  const local=tracksAll().filter(t=>t.origin==='local'&&(!t.priv||isMyTrack(t)));
  let ids=local.map(t=>t.id);
  const i=ids.indexOf(trackId);
  if(i>0)ids=ids.slice(i).concat(ids.slice(0,i));
  player.queue=ids;
  setCurrent(trackId);
}
function playPlaylist(plId){
  const pl=load(LS.playlists,[]).find(x=>x.id===plId);
  if(!pl)return;
  const ids=(pl.trackIds||[]).filter(id=>{const tt=tracksAll().find(x=>x.id===id);return tt&&tt.origin!=='sc'&&(!tt.priv||isMyTrack(tt));});
  if(!ids.length){toast('в плейлисте нет локальных треков');return;}
  player.queue=ids;setCurrent(ids[0]);
  toast('плейлист «'+pl.name+'» — поехали');
}
async function setCurrent(id){
  player.currentId=id;
  const t=tracksAll().find(x=>x.id===id);
  if(!t){toast('трек убежал');return;}
  let u=mediaURL(t.mid);
  if(!u&&t.ib){
    const blob=await IDB.get(t.ib);
    if(blob){u=URL.createObjectURL(blob)}
  }
  if(!u){toast('исходник трека утерян');return;}
  const all=tracksAll();const x=all.find(x=>x.id===id);if(x){x.plays=(x.plays||0)+1;tracksSave(all);}
  player.audio.src=u;player.audio.play().then(()=>{player.playing=true;syncPlayerUI();}).catch(()=>{player.playing=false;syncPlayerUI();});
  NP.panel.classList.remove('hidden');
  NP.title.textContent=t.name;
  NP.artist.textContent=t.artist||'';
  NP.time.textContent='0:00 / '+fmtT(t.dur);
  if(NP.ring)NP.ring.style.background='conic-gradient(var(--acc) 0 0%, var(--line) 0% 100%)';
  seekFill();
  NP.cov.innerHTML='';
  const cu=t.coverMid?mediaURL(t.coverMid):(t.coverUrl||null);
  if(cu)NP.cov.innerHTML='<img src="'+esc(cu)+'">';
  else NP.cov.innerHTML=ICON_MUSIC;
  addLog('music',me.user,'играет «'+t.name+'»');
  syncPlayerUI();
}
function syncPlayerUI(){
  NP.play.innerHTML=player.playing?ICON_PAUSE:ICON_PLAY;
  document.querySelectorAll('.tplay').forEach(b=>{
    const tr=b.closest('.track');const on=tr&&tr.dataset.t===player.currentId&&player.playing;
    b.innerHTML=on?ICON_PAUSE:'▶';b.classList.toggle('playing',on);
  });
  const cur=tracksAll().find(x=>x.id===player.currentId);
  const pfPlay=document.getElementById('pfTrackPlay');
  if(pfPlay&&cur)pfPlay.innerHTML=player.playing?ICON_PAUSE:ICON_PLAY;
}
function startTrack(id){setCurrent(id);}
function nextTrack(){
  if(!player.queue.length)return;
  if(player.shuffle){const i=Math.floor(Math.random()*player.queue.length);setCurrent(player.queue[i]);return;}
  let i=player.queue.indexOf(player.currentId);
  if(i<player.queue.length-1)setCurrent(player.queue[i+1]);
  else toast('это был последний трек в очереди');
}
function prevTrack(){
  if(player.audio.currentTime>3){player.audio.currentTime=0;return;}
  if(!player.queue.length)return;
  let i=player.queue.indexOf(player.currentId);
  if(i>0)setCurrent(player.queue[i-1]);
}
function togglePlay(){
  if(!player.currentId){
    const loc=tracksAll().filter(t=>t.origin==='local'&&(!t.priv||isMyTrack(t)));
    if(loc.length){player.queue=loc.map(t=>t.id);setCurrent(player.queue[0]);}
    else{toast('загрузи трек в oomy music');}
    return;
  }
  if(player.playing){player.audio.pause();player.playing=false;}
  else{player.audio.play().then(()=>{player.playing=true;}).catch(()=>{});player.playing=true;}
  syncPlayerUI();
}
function pausePlayer(){player.audio.pause();player.playing=false;syncPlayerUI();}
NP.play.onclick=togglePlay;
NP.next.onclick=nextTrack;
NP.prev.onclick=prevTrack;
NP.vol.oninput=()=>{player.audio.volume=NP.vol.value/100;player.muted=false;player.audio.muted=false;NP.mute.innerHTML=ICON_VOL;};
/* круговая перемотка: тяни за обложку-стрелку */
if(NP.ring){
  NP.ring.style.cursor='pointer';NP.ring.title='мотай по кругу — как стрелка часов';
  let ringDrag=false;
  const ringSeek=ev=>{
    if(!player.dur)return;
    const r=NP.ring.getBoundingClientRect();
    const x=ev.clientX-(r.left+r.width/2),y=ev.clientY-(r.top+r.height/2);
    let a=Math.atan2(y,x)+Math.PI/2;if(a<0)a+=Math.PI*2;
    player.audio.currentTime=a/(Math.PI*2)*player.dur;seekFill();
  };
  NP.ring.addEventListener('pointerdown',e=>{if(!player.dur)return;ringDrag=true;try{NP.ring.setPointerCapture(e.pointerId)}catch(_){}ringSeek(e);});
  NP.ring.addEventListener('pointermove',e=>{if(ringDrag)ringSeek(e);});
  NP.ring.addEventListener('pointerup',()=>{ringDrag=false;});
  NP.ring.addEventListener('pointercancel',()=>{ringDrag=false;});
}
NP.mute.onclick=()=>{player.muted=!player.muted;player.audio.muted=player.muted;NP.mute.innerHTML=player.muted?ICON_MUTE:ICON_VOL;};
NP.shuf.onclick=()=>{player.shuffle=!player.shuffle;NP.shuf.classList.toggle('on',player.shuffle);toast(player.shuffle?'перемешивание включено':'перемешивание выключено');};
NP.rep.onclick=()=>{player.repeat=!player.repeat;NP.rep.classList.toggle('on',player.repeat);toast(player.repeat?'повтор трека включён':'повтор выключен');};
NP.ext.onclick=()=>{go('sound');toast('oomy music ждёт тебя');};
NP.add.onclick=e=>{
  const t=tracksAll().find(x=>x.id===player.currentId);
  if(!t){toast('сначала включи трек');return;}
  const pls=load(LS.playlists,[]).filter(pl=>pl.owner===me.user||(pl.members||[]).includes(me.user));
  if(!pls.length){toast('сначала создай плейлист в oomy music');go('sound');return;}
  menuPop(e.clientX,e.clientY,pls.map(pl=>({t:'📼 '+pl.name,f:()=>{
    if(!pl.trackIds)pl.trackIds=[];
    if(pl.trackIds.includes(t.id)){toast('уже в плейлисте');return;}
    pl.trackIds.push(t.id);save(LS.playlists,load(LS.playlists,[]).map(x=>x.id===pl.id?pl:x));toast('добавлено: '+pl.name);
  }})));
};
function workerFuncToast(){toast('браузер не хочет играть — жми ▶ сам');}
/* горячие клавиши плеера: пробел — пауза, ←/→ — 5 секунд, M — звук */
document.addEventListener('keydown',e=>{
  const t=e.target;
  if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT'||t.isContentEditable))return;
  if(!player.currentId)return;
  if(e.code==='Space'){e.preventDefault();togglePlay();}
  else if(e.key==='ArrowRight'){const d=player.dur||player.audio.duration||0;player.audio.currentTime=Math.min(d,player.audio.currentTime+5);}
  else if(e.key==='ArrowLeft'){player.audio.currentTime=Math.max(0,player.audio.currentTime-5);}
  else if(e.key==='m'||e.key==='M'||e.key==='ь'||e.key==='Ь'){NP.mute.click();}
});

/* ============ СООБЩЕНИЯ ============ */
const SELF={n:'избранное (себе)',ava:'⭐'};
function chatsData(){return encLoad(LS.chats,{});}
function chatsSave(c){encSave(LS.chats,c);}
function addMsg(pal,who,text,att,replyTo){
  const c=chatsData();
  (c[pal]=c[pal]||[]).push({id:Date.now()+''+Math.floor(Math.random()*999),who,t:text,time:todayT(),att,replyTo});
  chatsSave(c);
  if(who==='them')pushBrowser('oomy · сообщенька от @'+pal,(text||'вложение').slice(0,80),pal);
}
const todayT=()=>('0'+new Date().getHours()).slice(-2)+':'+('0'+new Date().getMinutes()).slice(-2);
let openChatName=null;
let chatAtt=null;
let chatReply=null;
function renderChats(){
  const box=document.getElementById('pg-msgs');
  if(openChatName)return renderChat(openChatName);
  const others=Object.keys(encLoad(LS.acc,{})).filter(u=>u!==me.user);
  const c=chatsData();
  const read=load(LS.chatRead,[]);
  /* избранное — всегда сверху, писать туда что угодно */
  const selfMsgs=c[SELF.n]||[];
  const selfSub=selfMsgs.length?(selfMsgs[selfMsgs.length-1].t||'').slice(0,34):'заметки для себя — пиши что угодно';
  const selfRow=`<div class="crow" data-chat="${esc(SELF.n)}">
    <div class="ava">${SELF.ava}</div>
    <div class="fmid"><div class="fname">избранное</div><div class="fsub">${esc(selfSub)}</div></div>
    <button class="minibtn">открыть</button>
  </div>`;
  const rows=others.map(u=>({n:u,ava:(encLoad(LS.acc,{})[u]||{}).ava||'🐈'})).filter(p=>c[p.n]&&c[p.n].length);
  box.innerHTML=`<div class="pcard" style="padding:10px 18px 12px">
    <h3 style="padding:10px 2px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.7px">диалоги</h3>
    ${selfRow}
    ${rows.map(p=>`<div class="crow" data-chat="${esc(p.n)}">
      <div class="ava">${p.ava}</div>
      <div class="fmid"><div class="fname">${esc(p.n)}${badgeFor(p.n)}</div><div class="fsub">${esc(c[p.n][c[p.n].length-1].t.slice(0,34)+(c[p.n][c[p.n].length-1].t.length>34?'…':''))}</div></div>
      ${read.includes(p.n)?'<button class="minibtn">открыть</button>':'<span class="badge">1</span>'}
    </div>`).join('')}
    ${rows.length?'':`<div style="color:var(--muted2);font-size:11px;padding:8px 2px 4px">диалогов пока нет — котики напишут, и они появятся тут</div>`}
  </div>`;
  box.querySelectorAll('.crow').forEach(r=>r.onclick=()=>openChat(r.dataset.chat));
}
function openChat(name){
  openChatName=name;
  const read=load(LS.chatRead,[]);
  if(!read.includes(name)){read.push(name);save(LS.chatRead,read);}
  syncBadges();
  renderChat(name);
}
function renderChat(name){
  const box=document.getElementById('pg-msgs');
  const pal=name===SELF.n?SELF:{n:name,ava:(encLoad(LS.acc,{}).hasOwnProperty(name)&&(encLoad(LS.acc,{})[name].ava))||'🐱'};
  const msgs=chatsData()[name]||[];
  box.innerHTML=`
    <div class="pcard chat-box">
      <div class="chat-head">
        <button class="icon-btn" id="chatBack" title="к списку">◂</button>
        <div class="ava" data-gu="${esc(pal.n)}" style="cursor:pointer">${pal.ava}</div>
        <div data-gu="${esc(pal.n)}" style="cursor:pointer"><div class="fname">${esc(pal.n)}${badgeFor(pal.n)}</div><div class="fsub"><span class="online-dot ${isOnline(pal.n)?'':'off'}"></span>${pal.n===SELF.n?'только для тебя':esc(lastSeenText(pal.n))}</div></div>
      </div>
      <div class="chat-msgs" id="chatMsgs">
        ${msgs.map((m,i)=>bubble(m,i)).join('')}
      </div>
      ${chatReply?'<div class="reply-bar">↪ ответ <b>'+esc((chatReply.text||'вложение').slice(0,60))+'</b><button id="rmReply">✕</button></div>':''}
      ${chatAtt?'<div style="padding:0 16px"><span class="att-chip">📎 <span>'+esc(chatAtt.name)+'</span> <b id="rmChatAtt">✕</b></span></div>':''}
      <div class="chat-inp">
        <button class="icon-btn" id="attChatImg" title="фото/gif"><svg class="mi"><use href="#i-img"/></svg></button>
        <button class="icon-btn" id="attChatVid" title="видео"><svg class="mi"><use href="#i-film"/></svg></button>
        <button class="icon-btn" id="attChatFile" title="файл"><svg class="mi"><use href="#i-clip"/></svg></button>
        <button class="icon-btn" id="attChatTrack" title="трек из oomy music"><svg class="mi"><use href="#i-music"/></svg></button>
        <input type="file" id="fileChatImg" accept="image/*" class="hidden">
        <input type="file" id="fileChatVid" accept="video/*" class="hidden">
        <input type="file" id="fileChatFile" class="hidden">
        <input id="chatInput" placeholder="напиши мяу…" maxlength="1000">
        <button class="go" id="chatSend">↪</button>
      </div>
    </div>`;
  const mBox=box.querySelector('#chatMsgs');mBox.scrollTop=mBox.scrollHeight;
  if(chatReply){const rr=box.querySelector('#rmReply');if(rr)rr.onclick=()=>{chatReply=null;renderChat(name);};}
  box.querySelectorAll('[data-gu]').forEach(el=>el.onclick=()=>{if(!me.guest)openUserPage(el.dataset.gu);});
  box.querySelectorAll('.mention-chip').forEach(t=>t.onclick=()=>{if(!me.guest)openUserPage(t.dataset.mn);});
  box.querySelectorAll('.tag-chip').forEach(t=>t.onclick=()=>{go('feed');const s=document.getElementById('search');s.value='#'+t.dataset.tag;buildPosts();});
  box.querySelectorAll('[data-mi]').forEach(btn=>btn.onclick=e=>{
    e.stopPropagation();
    const i=Number(btn.dataset.mi);const m=msgs[i];if(!m)return;
    const items=[
      {t:'копировать',f:()=>{try{navigator.clipboard.writeText(m.t||'');}catch(err){}toast('скопировано');}},
      {t:'ответить',f:()=>{chatReply={who:m.who,text:m.t||'вложение'};renderChat(name);}},
      {t:'переслать…',f:()=>{
        const accs=encLoad(LS.acc,{});const opts=Object.keys(accs).filter(x=>x!==me.user);
        askForm('переслать сообщение',[{ph:'кому? юзернейм: '+(opts.join(', ')||SELF.n)}],to=>{
          to=(to||'').trim().replace(/^@/,'');
          if(!to)return;
          if(to!==SELF.n&&!accs[to]){toast('нет такого котика');return false;}
          addMsg(to,'me',m.t||'вложение',m.att);toast('переслано @'+to);
        });
      }},
      {t:'подарить оонетки',f:()=>giftOonChat(name)},
      {t:'удалить',danger:true,f:()=>{
        msgs.splice(i,1);const c=chatsData();c[name]=msgs;chatsSave(c);renderChat(name);toast('сообщение удалено');
      }}
    ];
    menuPop(e.clientX,e.clientY,items);
  });
  if(chatAtt)box.querySelector('#rmChatAtt').onclick=()=>{chatAtt=null;renderChat(name);};
  box.querySelector('#chatBack').onclick=()=>{openChatName=null;chatAtt=null;renderChats();};
  /* подарить оонетки прямо из чата */
  const giftOonChat=(to)=>{
    askForm('подарить оонетки @'+to,[{type:'number',ph:'сколько оонеток подарить?'}],v=>{
      const n=Math.max(0,Math.floor(Number(v)||0));
      if(!n){toast('надо число больше нуля');return false;}
      if(!takeOon(n))return false;
      const all=load(LS.gifts,{});(all[to]=all[to]||[]).unshift({ic:'🎁',from:me.user+' (+'+n+' оон)',ts:Date.now()});save(LS.gifts,all);
      const w=wallet();w[to]=(w[to]||0)+n;save(LS.wallet,w);
      addMsg(to,'me','🎁 подарил(а) '+n+' оонеток!');
      addLog('gift',me.user,'подарил '+n+' оонеток котику '+to);
      toast('оонетки улетели!');refreshOonChip();
      if(openChatName===to)renderChat(to);
    });
  };
  if(me&&me.guest){const i=box.querySelector('#chatInput');i.disabled=true;i.placeholder='зарегайся, чтобы мяукать';}
  const send=()=>{
    const i=box.querySelector('#chatInput');
    const t=i.value.trim();
    if(!t&&!chatAtt)return;
    const att=chatAtt?(chatAtt.kind==='track'?{kind:'track',tid:chatAtt.tid,name:chatAtt.name}:{src:mediaURL(chatAtt.mid)||chatAtt.src,kind:chatAtt.kind,name:chatAtt.name}):null;
    addMsg(name,'me',t,att,chatReply?{who:chatReply.who,text:chatReply.text}:null);
    addLog('msg',me.user,'→ '+name+': '+t.length+' симв.'+(att?' + '+att.kind:''));
    chatAtt=null;chatReply=null;
    renderChat(name);
    if(name===SELF.n)setTimeout(()=>{if(openChatName===name)toast('сохранено в избранное');},300);
  };
  box.querySelector('#chatSend').onclick=send;
  box.querySelector('#chatInput').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey)send()};
  const pick=(el,kind)=>el.onchange=()=>{const f=el.files[0];if(!f)return;
    if(f.size>10*1024*1024){toast('файл больше 10МБ');el.value='';return;}
    putMedia(f,attId=>{if(attId){chatAtt={mid:attId,name:f.name,kind};renderChat(name);}});el.value='';};
  pick(box.querySelector('#fileChatImg'),'img');
  pick(box.querySelector('#fileChatVid'),'vid');
  pick(box.querySelector('#fileChatFile'),'file');
  box.querySelector('#attChatImg').onclick=()=>box.querySelector('#fileChatImg').click();
  box.querySelector('#attChatVid').onclick=()=>box.querySelector('#fileChatVid').click();
  box.querySelector('#attChatFile').onclick=()=>box.querySelector('#fileChatFile').click();
  /* трек из oomy music */
  box.querySelector('#attChatTrack').onclick=e=>{
    const trs=tracksAll().filter(t=>t.origin==='local'&&(!t.priv||isMyTrack(t)));
    if(!trs.length){toast('сначала загрузи трек в oomy music');return;}
    menuPop(e.clientX,e.clientY,trs.map(t=>({t:'🎵 '+t.name,f:()=>{
      chatAtt={kind:'track',tid:t.id,name:t.name};renderChat(name);
    }})));
  };
  box.querySelectorAll('[data-mt]').forEach(b=>b.onclick=()=>{playQueueFrom(b.dataset.mt);});
  wireHoverCards(box.querySelector('#chatMsgs'));
}
function bubble(m,idx){
  const who=m.who,t=m.t,att=m.att;
  let inner='';
  if(m.replyTo)inner+='<div style="border-left:3px solid var(--acc);padding:2px 8px;margin-bottom:5px;font-size:11.5px;opacity:.75">↪ '+esc((m.replyTo.text||'вложение').slice(0,70))+'</div>';
  if(t&&att)inner+='<div style="margin-bottom:4px">'+linkify(t)+'</div>';
  else if(t)inner+=linkify(t);
  if(att){
    if(att.kind==='img'||att.kind==='image')inner+='<img src="'+att.src+'" onerror="imgFix(this)">';
    else if(att.kind==='vid')inner+='<video src="'+att.src+'" controls preload="metadata"></video>';
    else if(att.kind==='track'){
      const tr=tracksAll().find(x=>x.id===att.tid);
      inner+=tr?`<div class="att" style="margin:6px 0 0"><a style="text-decoration:none;color:var(--text);background:var(--card2);box-shadow:0 0 0 .5px var(--line);border-radius:10px;display:flex;padding:8px 12px;gap:8px;font-size:12px;margin-top:6px;align-items:center;cursor:pointer" data-mt="${esc(att.tid)}"><span style="font-size:17px;display:inline-flex">${tr.coverMid?'<img src="'+mediaURL(tr.coverMid)+'" style="width:26px;height:26px;border-radius:6px;object-fit:cover">':'<svg class="mi" style="width:18px;height:18px"><use href="#i-music"/></svg>'}</span><span><b style="display:block">${esc(tr.name)}</b><span class="from-line">трек · oomy music — нажми, заиграет</span></span></a></div>`
        :'<div class="att" style="margin:6px 0 0"><div class="from-line">🎵 трек утерян</div></div>';
    }
    else inner+='<div class="att" style="margin:6px 0 0"><a href="'+att.src+'" download="'+esc(att.name||'файл')+'" style="text-decoration:none;color:var(--text);background:var(--card2);box-shadow:0 0 0 .5px var(--line);border-radius:10px;display:flex;padding:10px 12px;gap:8px;font-size:12px;margin-top:6px">📎 '+esc(att.name||'файл')+' — скачать</a></div>';
  }
  return '<div class="bub '+who+'">'+inner+'<span class="bt">'+m.time+'</span><button class="bub-more" data-mi="'+idx+'" title="действия">⋯</button></div>';
}
function imgFix(el){
  if(!el.dataset.fb){el.dataset.fb='1';el.src='https://cataas.com/cat?width=400&t='+Date.now();}
  else{el.onerror=null;el.src='https://picsum.photos/seed/'+Math.floor(Math.random()*99)+'/400/300';}
}

/* ============ ДРУЗЬЯ ============ */
function renderFriends(){
  const box=document.getElementById('pg-friends');
  const accs=encLoad(LS.acc,{});
  const others=Object.keys(accs).filter(u=>u!==me.user);
  const friends=friendsOf(me.user);
  const reqs=incomingReqs(me.user);
  const reqSet=reqs.map(r=>r.from);
  const suggestions=others.filter(u=>!friends.includes(u)&&!reqSet.includes(u));
  const row=(u,actions)=>`<div class="frow">
    <div class="ava" data-gu="${esc(u)}" style="cursor:pointer">${avaHTML(u,(accs[u]||{}).ava||'🐈')}</div>
    <div class="fmid" data-gu="${esc(u)}" style="cursor:pointer">
      <div class="fname">${esc(u)}${badgeFor(u)}${isOnline(u)?' <span class="online-dot"></span>':''}</div>
      <div class="fsub">${esc(lastSeenText(u))} · друзей: ${friendsOf(u).length}</div>
    </div>${actions}</div>`;
  const msgBtn=u=>`<button class="minibtn" data-du="${esc(u)}">написать</button>`;
  box.innerHTML=`<div class="pcard" style="padding:8px 18px 14px">
    <h3 style="padding:12px 2px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.7px">моя страница</h3>
    <div class="frow" style="cursor:default">
      <div class="ava" style="cursor:pointer" data-gu="${esc(me.user)}">${avaHTML(me.user,me.ava||'🐈')}</div>
      <div class="fmid" style="cursor:pointer" data-gu="${esc(me.user)}"><div class="fname">${esc(me.user)} <span style="color:var(--muted2);font-weight:400">— это ты</span>${badgeFor(me.user)}</div><div class="fsub">${!me.guest?'в сети · все логи шифруются':'гостевой режим'}</div></div>
      <button class="minibtn" id="mesto">моя страница</button>
    </div>

    <h3 style="padding:16px 2px 6px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.7px">заявки в друзья ${reqs.length?'<span class="badge">'+reqs.length+'</span>':''}</h3>
    ${reqs.length?reqs.map(r=>row(r.from,`<button class="minibtn" data-acc="${esc(r.from)}" style="background:var(--acc);border-color:var(--acc);color:var(--acc-fg)">принять</button><button class="minibtn" data-dec="${esc(r.from)}">✕</button>`)).join(''):'<div class="fsub" style="padding:6px 2px 10px">новых заявок нет</div>'}

    <h3 style="padding:16px 2px 6px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.7px">друзья · ${friends.length}</h3>
    ${friends.length?friends.map(u=>row(u,msgBtn(u)+`<button class="minibtn" data-unfr="${esc(u)}" title="удалить из друзей">✓</button>`)).join(''):'<div class="fsub" style="padding:6px 2px 10px">пока никого. добавь котика ниже!</div>'}

    <h3 style="padding:16px 2px 6px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.7px">возможно, знакомы</h3>
    ${suggestions.length?suggestions.map(u=>row(u,msgBtn(u)+friendBtnHTML(u))).join(''):'<div class="fsub" style="padding:6px 2px 10px">'+(others.length?'все уже в друзьях — ты душа компании!':'другие котики появятся, когда зарегистрируются')+'</div>'}
  </div>`;
  const mesto=box.querySelector('#mesto');if(mesto)mesto.onclick=()=>go('home');
  box.querySelectorAll('[data-gu]').forEach(el=>el.onclick=()=>openUserPage(el.dataset.gu));
  box.querySelectorAll('[data-du]').forEach(b=>b.onclick=e=>{e.stopPropagation();openChat(b.dataset.du);go('msgs');});
  box.querySelectorAll('[data-dec]').forEach(b=>b.onclick=e=>{e.stopPropagation();declineFriendReq(b.dataset.dec);});
  wireFriendBtns(box);
  wireHoverCards(box);
}

/* ============ УВЕДОМЛЕНИЯ ============ */
const NOTIFS=[
  {ic:'🎁',t:'<b>оонетки</b> — валюта oomy. бонус дня ждёт в «подарочках»',time:'каждый день'},
  {ic:'🎵',t:'в <b>oomy music</b> можно грузить треки и собирать плейлисты',time:'всегда'},
  {ic:'🎨',t:'<b>редактор профиля</b> ждёт: аватарки, фоны, gif-баннеры, цвета',time:'тут'},
  {ic:'📝',t:'записи можно <b>репостить, закреплять</b>, شوند хештеги #мяу',time:'в ленте'},
  {ic:'🔐',t:'все сообщения и логи <b>шифруются</b> — просто так не подсмотреть',time:'навсегда'},
  {ic:'♻',t:'кинь другу-коту ссылку на <b>oomy.html</b> — пусть регается',time:'совет'}
];
function renderNotifs(){
  const box=document.getElementById('pg-notifs');
  const read=load(LS.notifsRead,false);
  box.innerHTML=`<div class="pcard" style="padding:8px 18px 14px">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 2px">
      <h3 style="color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.7px">уведомления</h3>
      <div style="display:flex;gap:6px"><button class="minibtn" id="readAll">прочитать всё</button><button class="minibtn" id="clearNotifs">очистить</button></div>
    </div>
    ${dynNotifsRows(read)||'<div class="from-line" style="padding:8px 2px">новых уведомлений нет — котик спокоен 🐾</div>'}
  </div>`;
  box.querySelector('#readAll').onclick=()=>{save(LS.notifsRead,true);const s=load(LS.notifSeen,{});s[me.user]=Date.now();save(LS.notifSeen,s);syncBadges();renderNotifs();toast('всё прочитано, котик спокоен');};
  box.querySelector('#clearNotifs').onclick=()=>{
    if(!me||me.guest){toast('нечего очищать');return;}
    const all=load(LS.notifsD,{});all[me.user]=[];save(LS.notifsD,all);
    save(LS.notifsRead,true);syncBadges();renderNotifs();toast('уведомления очищены');
  };
}
function renderBm(){
  const box=document.getElementById('pg-bm');
  const ids=bookmarksOf(me.user);
  const all=load(LS.posts,[]);
  box.innerHTML=`<div class="pcard" style="padding:8px 18px 16px">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 2px">
      <h3 style="color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.7px">закладки · ${ids.length}</h3>
      <span class="from-line">сохраняй записи звёздочкой ★</span>
    </div>
    <div id="bmList"></div>
  </div>`;
  const w=box.querySelector('#bmList');
  if(!ids.length){w.innerHTML='<div class="fsub" style="padding:8px 2px">пока пусто — жми звёздочку на записи</div>';return;}
  ids.slice().reverse().forEach(pid=>{
    const p=all.find(x=>x.id===pid);if(!p)return;
    const d=document.createElement('div');d.className='post';d.innerHTML=postHTML(p);wirePost(d,p);w.appendChild(d);
  });
}
function dynNotifsFor(u){const n=load(LS.notifsD,{});return (n&&n[u])?n[u].slice():[];}
function dynNotifsRows(read){
  if(!me||me.guest)return'';
  const list=dynNotifsFor(me.user);
  if(!list.length)return'';
  const fm=ts=>{const d=new Date(ts);return ('0'+d.getDate()).slice(-2)+'.'+('0'+(d.getMonth()+1)).slice(-2)+' '+('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2)};
  return list.map(n=>`<div class="nrow ${read?'read':''}" style="background:var(--card2)"><span class="ndot"></span><span style="font-size:17px">${n.ic}</span><span style="flex:1">${esc(n.t)}</span><span class="fsub">${fm(n.ts)}</span></div>`).join('');
}

/* ============ НАСТРОЙКИ ============ */
function renderSettings(){
  const box=document.getElementById('pg-settings');
  const pr=prof();
  const priv=pr.privacy||{profile:'все',messages:'все',comments:'все'};
  const barStyle=pr.barStyle||'default';
  const nprefs=pr.notif||{likes:true,msgs:true,music:true,sound:true};
  const accs=encLoad(LS.acc,{});
  const th=document.documentElement.dataset.theme;
  box.innerHTML=`<div class="pcard" style="padding:6px 18px 18px">
    <h3 id="st-prof" style="padding:12px 2px 6px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.7px">профиль</h3>
    <div class="frow" style="cursor:default"><div class="ava">✏</div><div class="fmid"><div class="fname">имя и статус</div><div class="fsub">${esc(pr.dn||me.user)} — ${esc(pr.status||'без статуса')}</div></div><button class="minibtn" id="sEd">изменить</button></div>
    <div class="frow" style="cursor:default"><div class="ava">🎨</div><div class="fmid"><div class="fname">аватарка и оформление</div><div class="fsub">смайлик, фото, gif, живой фон</div></div><button class="minibtn" id="sEd2">настроить</button></div>

    <h3 id="st-acc" style="padding:16px 2px 6px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.7px">аккаунт</h3>
    <div class="frow" style="cursor:default"><div class="ava">🔑</div><div class="fmid"><div class="fname">сменить пароль</div><div class="fsub">${Object.keys(accs).includes(me.user)?'аккаунт «'+esc(me.user)+'» · '+esc(accs[me.user].createdAt||''):'гость — сначала зарегистрируйся'}</div></div><button class="minibtn" id="sPass">сменить</button></div>
    <div style="display:none;background:var(--card2);border-radius:10px;padding:12px;margin-top:6px" id="passBox">
      <input class="pill-input" id="passOld" type="password" placeholder="текущий пароль" style="margin-bottom:8px">
      <input class="pill-input" id="passNew" type="password" placeholder="новый пароль (6+)" style="margin-bottom:8px">
      <button class="minibtn" id="passSave" style="background:var(--acc);border-color:var(--acc);color:#fff">сохранить пароль</button>
    </div>

    <h3 id="st-priv" style="padding:16px 2px 6px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.7px">приватность</h3>
    ${['profile','messages','comments'].map(k=>`<div class="frow" style="cursor:default">
      <div class="ava">${k==='profile'?'👤':k==='messages'?'💬':'📝'}</div>
      <div class="fmid"><div class="fname">${k==='profile'?'мою страницу видят':k==='messages'?'мне пишут':'комментируют'}</div><div class="fsub">кто имеет доступ</div></div>
      <button class="minibtn priv" data-k="${k}">${priv[k]}</button>
    </div>`).join('')}
    <div class="frow" style="cursor:default"><div class="ava">🙈</div><div class="fmid"><div class="fname">скрытый аккаунт</div><div class="fsub">никто не видит твою страницу — только ты и админ</div></div><div class="sw ${pr.hiddenAcc?'on':''}" id="sHid"><i></i></div></div>

    <h3 id="st-sects" style="padding:16px 2px 6px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.7px">моя страница — что показывать</h3>
    ${Object.entries(SECT_LABELS).map(([k,n])=>`<div class="frow" style="cursor:default">
      <div class="ava">📄</div><div class="fmid"><div class="fname">${n}</div><div class="fsub">раздел страницы</div></div>
      <div class="sw ${sectOn(pr,k)?'on':''}" data-sk="${k}"><i></i></div>
    </div>`).join('')}

    <h3 id="st-notif" style="padding:16px 2px 6px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.7px">уведомления</h3>
    ${[['likes','лайки на записях','❤'],['msgs','сообщения и бот','💬'],['music','новые треки и релизы','🎵'],['sound','звуки интерфейса','🔊'],['push','push-уведомления браузера','🔔']].map(([k,n,ic])=>`<div class="frow" style="cursor:default">
      <div class="ava">${ic}</div><div class="fmid"><div class="fname">${n}</div><div class="fsub">${k==='push'?'прилетят, когда сайт свёрнут':'что доставлять'}</div></div>
      <div class="sw ${nprefs[k]?'on':''}" data-nk="${k}"><i></i></div>
    </div>`).join('')}

    <h3 id="st-view" style="padding:16px 2px 6px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.7px">внешний вид</h3>
    <div class="frow" style="cursor:default"><div class="ava">${th==='dark'?'🌙':'🌞'}</div><div class="fmid"><div class="fname">тема</div><div class="fsub">${th==='dark'?'тёмная — вечерняя':'светлая — дневная'}</div></div><button class="minibtn" id="sTheme">${th==='dark'?'в светлую':'в тёмную'}</button></div>
    <div class="frow" style="cursor:default"><div class="ava">✨</div><div class="fmid"><div class="fname">акцентный цвет сайта</div></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${ACCENTS.map(c=>`<div class="swatch ${load(LS.accent,'#8b7cff')===c?'on':''}" style="background:${c}" data-c="${c}" title="${c}"></div>`).join('')}</div>
    </div>
    <div class="frow" style="cursor:default"><div class="ava">🖼</div><div class="fmid"><div class="fname">фон сайта и шапка профиля</div><div class="fsub">фото, gif или видео до 10МБ</div></div><button class="minibtn" id="sBg">настроить</button></div>
    <div class="frow" style="cursor:default"><div class="ava">🫧</div><div class="fmid"><div class="fname">прозрачность баров</div><div class="fsub">верхняя панель и меню сайта</div></div>
      <select class="pill-input" id="sBar" style="width:180px">
        <option value="default"${barStyle==='default'?' selected':''}>обычный</option>
        <option value="translucent"${barStyle==='translucent'?' selected':''}>полупрозрачный</option>
        <option value="transparent"${barStyle==='transparent'?' selected':''}>прозрачный</option>
      </select></div>
    <div class="frow" style="cursor:default"><div class="ava">❄</div><div class="fmid"><div class="fname">снежинки</div><div class="fsub">зимнее настроение на всём сайте</div></div><div class="sw ${snowOn?'on':''}" id="sSnow"><i></i></div></div>

    <h3 id="st-audio" style="padding:16px 2px 6px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.7px">аудио</h3>
    <div class="frow" style="cursor:default"><div class="ava">🔊</div><div class="fmid"><div class="fname">громкость по умолчанию</div><div class="fsub">${Math.round(player.audio.volume*100)}%</div></div><input type="range" min="0" max="100" value="${Math.round(player.audio.volume*100)}" id="sVol" style="width:130px"></div>
    <div class="frow" style="cursor:default"><div class="ava">🎯</div><div class="fmid"><div class="fname">автовоспроизведение следующего</div></div><div class="sw on" id="sAuto"><i></i></div></div>

    <h3 id="st-ux" style="padding:16px 2px 6px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.7px">удобство</h3>
    <div class="frow" style="cursor:default"><div class="ava">🖱</div><div class="fmid"><div class="fname">двойной клик = лайк</div><div class="fsub">как в привычных соцсетях</div></div><div class="sw ${pr.dblLike!==false?'on':''}" data-ux="dblLike"><i></i></div></div>
    <div class="frow" style="cursor:default"><div class="ava">⌨</div><div class="fmid"><div class="fname">горячие клавиши плеера</div><div class="fsub">пробел — плей/пауза, ←/→ — ±5 сек</div></div><div class="sw ${pr.hotkeys!==false?'on':''}" data-ux="hotkeys"><i></i></div></div>
    <div class="frow" style="cursor:default"><div class="ava">⬆</div><div class="fmid"><div class="fname">кнопка «наверх»</div><div class="fsub">появляется при прокрутке</div></div><div class="sw ${pr.toTop!==false?'on':''}" data-ux="toTop"><i></i></div></div>

    <h3 id="st-about" style="padding:16px 2px 6px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.7px">о сайте</h3>
    <div class="frow" style="cursor:default"><div class="ava">🐱</div><div class="fmid"><div class="fname">oomy</div><div class="fsub">соцсеть толстых котиков · логи ведутся всегда и зашифрованы · oomy © 2026</div></div></div>
  </div>`;
  document.getElementById('sEd').onclick=openEditor;
  document.getElementById('sEd2').onclick=()=>{go('home');openEditor();};
  document.getElementById('sBg').onclick=()=>openEditor();
  document.getElementById('sPass').onclick=()=>{
    if(me.guest){toast('гостю нечего менять');return;}
    const b=document.getElementById('passBox');
    b.style.display=b.style.display==='none'?'block':'none';
  };
  document.getElementById('passSave').onclick=()=>{
    const o=document.getElementById('passOld').value;
    const n=document.getElementById('passNew').value;
    const accs=encLoad(LS.acc,{});
    const rec=accs[me.user];
    if(!rec)return;
    if(rec.pass!==btoa(unescape(encodeURIComponent(o)))){toast('текущий пароль не тот');return;}
    if(n.length<6){toast('новый пароль от 6 символов');return;}
    rec.pass=btoa(unescape(encodeURIComponent(n)));encSave(LS.acc,accs);
    addLog('pass',me.user,'сменил пароль');
    document.getElementById('passBox').style.display='none';
    toast('пароль изменён');
  };
  box.querySelectorAll('.priv').forEach(b=>b.onclick=()=>{
    const order=['все','друзья','только я'];
    const k=b.dataset.k;
    const p=prof();p.privacy=p.privacy||{profile:'все',messages:'все',comments:'все'};
    p.privacy[k]=order[(order.indexOf(p.privacy[k])+1)%3];
    saveProf(p);addLog('settings',me.user,'приватность '+k+': '+p.privacy[k]);
    b.textContent=p.privacy[k];toast('приватность: '+p.privacy[k]);
  });
  const sHid=document.getElementById('sHid');
  if(sHid)sHid.onclick=()=>{
    const p=prof();p.hiddenAcc=!p.hiddenAcc;saveProf(p);
    sHid.classList.toggle('on',p.hiddenAcc);
    addLog('settings',me.user,'скрытый аккаунт: '+(p.hiddenAcc?'вкл':'выкл'));
    toast(p.hiddenAcc?'аккаунт скрыт — страницу видишь только ты 🙈':'аккаунт снова виден всем');
  };
  box.querySelectorAll('[data-sk]').forEach(s=>s.onclick=()=>{
    const k=s.dataset.sk;const p=prof();p.sects=p.sects||{};
    p.sects[k]=p.sects[k]===false;
    saveProf(p);
    s.classList.toggle('on',sectOn(p,k));
    addLog('settings',me.user,'раздел «'+SECT_LABELS[k]+'»: '+(sectOn(p,k)?'показ':'скрыт'));
    toast(sectOn(p,k)?'«'+SECT_LABELS[k]+'» на странице':'«'+SECT_LABELS[k]+'» скрыт');
  });
  box.querySelectorAll('[data-nk]').forEach(s=>s.onclick=()=>{
    const k=s.dataset.nk;const p=prof();p.notif=p.notif||{likes:true,msgs:true,music:true,sound:true};
    const on=!p.notif[k];
    const done=()=>{p.notif[k]=on;saveProf(p);addLog('settings',me.user,'уведомления '+k+': '+(on?'вкл':'выкл'));s.classList.toggle('on',on);};
    if(k==='push'&&on){
      if(!('Notification' in window)){toast('этот браузер не умеет push-уведомления');return;}
      if(Notification.permission==='granted'){p.push=true;saveProf(p);done();toast('push включены — уведомления будут прилетать, когда сайт свёрнут');return;}
      if(Notification.permission==='denied'){toast('браузер запретил уведомления — разреши их в настройках сайта (замочек в адресной строке)');return;}
      Notification.requestPermission().then(perm=>{
        if(perm==='granted'){p.push=true;saveProf(p);done();new Notification('oomy',{body:'push включены! теперь уведомления долетают и когда сайт свёрнут 🐈'});toast('push включены 🐈');}
        else{toast('не разрешил — push остаются выключенными');}
      });
      return;
    }
    if(k==='push'){p.push=false;saveProf(p);}
    done();
  });
  document.getElementById('sTheme').onclick=()=>{themeBtn.click();setTimeout(renderSettings,60);};
  box.querySelectorAll('[data-c]').forEach(s=>s.onclick=()=>{
    applyAccent(s.dataset.c);
    box.querySelectorAll('[data-c]').forEach(x=>x.classList.remove('on'));s.classList.add('on');
    addLog('settings',me.user,'акцент '+s.dataset.c);toast('цвет изменён ✨');
  });
  const sb=document.getElementById('sBar');
  if(sb)sb.onchange=()=>{const p=prof();p.barStyle=sb.value;saveProf(p);applyBarStyle();addLog('settings',me.user,'стиль баров: '+sb.value);toast('бары: '+({default:'обычный',translucent:'полупрозрачный',transparent:'прозрачный'})[sb.value]);};
  const sSnow=document.getElementById('sSnow');
  if(sSnow)sSnow.onclick=()=>{setSnow(!snowOn);sSnow.classList.toggle('on',snowOn);toast(snowOn?'снежинки включены ❄':'снежинки выключены');};
  box.querySelectorAll('[data-ux]').forEach(s=>s.onclick=()=>{
    const k=s.dataset.ux;const p=prof();
    p[k]=p[k]===false;saveProf(p);
    s.classList.toggle('on',p[k]!==false);
    addLog('settings',me.user,k+': '+(p[k]!==false?'вкл':'выкл'));
    toast(p[k]!==false?'включено':'выключено');
  });
  document.getElementById('sVol').oninput=e=>{    player.audio.volume=e.target.value/100;NP.vol.value=e.target.value;
    const p=prof();p.vol=Math.round(e.target.value);saveProf(p);
  };
  const sAuto=document.getElementById('sAuto');
  sAuto.classList.toggle('on',player.autoplay!==false);
  sAuto.onclick=()=>{
    player.autoplay=!player.autoplay;sAuto.classList.toggle('on',player.autoplay);
    const p=prof();p.autoplay=player.autoplay;saveProf(p);
    toast(player.autoplay?'автоплей включён':'автоплей выключен');
  };
}

/* ============ АДМИН-ПАНЕЛЬ (отдельная вкладка, только @oomy) ============ */
function renderAdmin(){
  const box=document.getElementById('pg-admin');
  if(!isAdmin()){box.innerHTML='<div class="pcard" style="padding:26px;text-align:center;color:var(--muted)">эта вкладка только для главного администратора</div>';return;}
  const accs=encLoad(LS.acc,{});
  const posts=load(LS.posts,[]);
  const trs=tracksAll();
  const chats=chatsData();
  const msgs=Object.keys(chats).reduce((a,k)=>a+(chats[k]||[]).length,0);
  const props=propsAll().filter(p=>p.status==='new').length;
  const keys=load(LS.keys,{});
  const clicks=clickStats();
  const totalClicks=Object.keys(clicks).reduce((a,u)=>a+(clicks[u].total||0),0);
  box.innerHTML=`<div class="pcard">
    <div style="padding:18px 18px 4px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <div class="ava" style="width:46px;height:46px;font-size:22px;background:var(--acc);color:var(--acc-fg)">🛡</div>
      <div style="flex:1;min-width:0">
        <div class="pf-name" style="font-size:20px">Админ-панель <span class="adm-tag">только @${ADMIN}</span></div>
        <div class="pf-sub">управление сайтом, котиками, контентом и экономикой — всё сохраняется навсегда</div>
      </div>
      <button class="minibtn" id="aRefresh">обновить</button>
    </div>
    <div class="adm-grid">
      <div class="adm-stat"><b>${Object.keys(accs).length}</b><span>аккаунтов</span></div>
      <div class="adm-stat"><b>${posts.length}</b><span>записей</span></div>
      <div class="adm-stat"><b>${trs.length}</b><span>треков</span></div>
      <div class="adm-stat"><b>${msgs}</b><span>сообщений</span></div>
      <div class="adm-stat"><b>${Object.keys(keys).length}</b><span>ключей</span></div>
      <div class="adm-stat"><b>${props}</b><span>в предложке</span></div>
      <div class="adm-stat"><b>${totalClicks}</b><span>кликов в копилках</span></div>
      <div class="adm-stat"><b>${Object.keys(load(LS.catalog,[])).length}</b><span>подарков в магазине</span></div>
    </div>
    <div class="adm-tools">
      <button class="minibtn" id="aAnn">📢 объявление в ленту</button>
      <button class="minibtn" id="aBcast">📨 уведомление всем</button>
      <button class="minibtn" id="aGiveAll">оонетки всем</button>
      <button class="minibtn" id="aGiveOne">оонетки одному</button>
      <button class="minibtn" id="aKeys">🔑 ключи</button>
      <button class="minibtn" id="aProps">📦 предложка${props?' · '+props:''}</button>
      <button class="minibtn" id="aStory">✨ сторис от сайта</button>
      <button class="minibtn" id="aAccs">🐾 аккаунты</button>
      <button class="minibtn" id="aPosts">📝 записи</button>
      <button class="minibtn" id="aTracks">🎵 треки</button>
      <button class="minibtn" id="aStories">📸 сторис</button>
      <button class="minibtn" id="aCatalog">🎁 магазин</button>
      <button class="minibtn" id="aExport">📥 скачать сайт с данными</button>
      <button class="minibtn" id="aCloud">☁ общий мир</button>
      <button class="minibtn" id="aClicks">копилки</button>
      <button class="minibtn" id="aLogs">🗂 логи</button>
    </div>
    <div class="adm-box" id="admBody"><div class="adm-note">выбери инструмент выше. все действия пишутся в зашифрованный лог.</div></div>
  </div>`;
  const body=box.querySelector('#admBody');
  const set=h=>{body.innerHTML=h;};
  const refresh=()=>renderAdmin();
  /* форма вместо prompt(): работает в любом браузере */
  box.querySelector('#aRefresh').onclick=refresh;
  box.querySelector('#aAnn').onclick=()=>{
    askForm('📢 объявление в ленту',[{ph:'текст объявления от @'+ADMIN}],t=>{
      t=(t||'').trim();if(!t){toast('напиши текст объявления');return false;}
      posts.unshift({id:Date.now(),author:ADMIN,ava:'👑',nameCls:'blue',time:'только что',text:t+' #объявление',likes:0,liked:false,views:0,at:'',comments:[],pinned:true});
      save(LS.posts,posts);addLog('admin',me.user,'объявление в ленту');buildPosts();toast('объявление закреплено в ленте');refresh();
    });
  };
  box.querySelector('#aBcast').onclick=()=>{
    askForm('📨 уведомление всем',[{ph:'текст, который прилетит всем котикам в уведомления'}],t=>{
      t=(t||'').trim();if(!t){toast('напиши текст уведомления');return false;}
      Object.keys(accs).forEach(u=>pushNotif(u,'📢',t));addLog('admin',me.user,'рассылка всем');toast('уведомление доставлено всем');refresh();
    });
  };
  box.querySelector('#aGiveAll').onclick=()=>{
    askForm('💰 оонетки всем',[{type:'number',ph:'сколько оонеток выдать каждому аккаунту'}],v=>{
      const n=Math.floor(Number(v)||0);if(!n){toast('введи количество оонеток');return false;}
      const w=wallet();Object.keys(accs).forEach(u=>{w[u]=(w[u]||0)+n;});save(LS.wallet,w);
      Object.keys(accs).forEach(u=>pushNotif(u,'🎁','администратор выдал тебе '+n+' оонеток'));
      addLog('admin',me.user,'выдал всем по '+n+' оонеток');refreshOonChip();toast('всем +'+n+' оонеток');refresh();
    });
  };
  box.querySelector('#aGiveOne').onclick=()=>{
    askForm('💰 оонетки одному',[{ph:'кому (юзернейм)'},{type:'number',ph:'сколько оонеток выдать'}],(u,v)=>{
      u=(u||'').trim().replace(/^@/,'');const n=Math.floor(Number(v)||0);
      if(!u||!accs[u]){toast('такого котика нет');return false;}
      if(!n){toast('введи количество оонеток');return false;}
      const w=wallet();w[u]=(w[u]||0)+n;save(LS.wallet,w);pushNotif(u,'🎁','администратор выдал тебе '+n+' оонеток');
      addLog('admin',me.user,'выдал '+n+' оонеток '+u);refreshOonChip();toast('@'+u+' +'+n);refresh();
    });
  };
  box.querySelector('#aKeys').onclick=()=>{
    const ks=load(LS.keys,{});
    set(`<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:10px 0">
      <input class="pill-input" id="aKeyAmt" type="number" min="1" max="100000" placeholder="сумма оонеток" style="max-width:180px">
      <input class="pill-input" id="aKeyPass" placeholder="пароль (необязательно)" style="max-width:220px">
      <button class="dan-btn" id="aKeyMake">＋ создать ключ</button>
      <span class="from-line">ключи активируются в «подарочки → ключ»</span>
    </div>`+Object.keys(ks).map(k=>`<div class="adm-row"><b style="letter-spacing:1px">${esc(k)}</b><span class="from-line">${ks[k].a} оонеток${ks[k].p?' · с паролем':''}${ks[k].used?' · использован: '+esc(ks[k].used):' · свободен'}</span><button class="minibtn" data-copyk="${esc(k)}">копировать</button><button class="x" data-delk="${esc(k)}">✕</button></div>`).join('')||'<div class="adm-note">ключей пока нет</div>');
    body.querySelector('#aKeyMake').onclick=()=>{
      const n=Math.floor(Number(body.querySelector('#aKeyAmt').value)||0);
      if(n<=0){toast('введи сумму');return;}
      const p=body.querySelector('#aKeyPass').value;
      const k=genKey(),all=load(LS.keys,{});all[k]={a:n,p:p||'',used:null,ts:Date.now()};save(LS.keys,all);
      addLog('admin',me.user,'создал ключ на '+n+' оонеток');toast('ключ создан: '+k);box.querySelector('#aKeys').click();
    };
    body.querySelectorAll('[data-copyk]').forEach(b=>b.onclick=()=>{navigator.clipboard&&navigator.clipboard.writeText(b.dataset.copyk);toast('ключ скопирован');});
    body.querySelectorAll('[data-delk]').forEach(b=>b.onclick=()=>{const all=load(LS.keys,{});delete all[b.dataset.delk];save(LS.keys,all);addLog('admin',me.user,'удалил ключ');box.querySelector('#aKeys').click();});
  };
  box.querySelector('#aProps').onclick=()=>{go('gifts');giftTab='props';renderGifts();};
  box.querySelector('#aStory').onclick=()=>{
    const p=document.createElement('input');p.type='file';p.accept='image/*';
    p.onchange=()=>{const f=p.files[0];if(!f)return;
      if(f.size>10*1024*1024){toast('файл больше 10МБ');return;}
      putMedia(f,mid=>{if(!mid)return;const all=storiesAll();all.unshift({id:'s'+Date.now().toString(36),user:ADMIN,ava:'👑',mid,cap:'объявление от создателя oomy',ts:Date.now()});saveStories(all);addLog('admin',me.user,'сторис от лица сайта');toast('сторис в ленте!');renderStories();});
    };p.click();
  };
  box.querySelector('#aAccs').onclick=()=>{
    set('<div class="adm-note">аккаунты — @'+ADMIN+' удалить нельзя</div>'+Object.keys(accs).map(u=>`<div class="adm-row"><span style="font-size:16px">${esc(accs[u].ava||'🐈')}</span><b>${userLink(u)}${accs[u].banned?' <span style="color:var(--bad)">· В БАНЕ</span>':''}</b><span class="from-line">${wallet()[u]||0} оонеток</span>${!userIsAdmin(u)?`<button class="minibtn" data-ao="${esc(u)}">+1000</button><button class="minibtn" data-ab="${esc(u)}">${accs[u].banned?'разбан':'бан'}</button><button class="x" data-ad="${esc(u)}">✕</button>`:''}</div>`).join(''));
    body.querySelectorAll('[data-ao]').forEach(b=>b.onclick=()=>{const u=b.dataset.ao,w=wallet();w[u]=(w[u]||0)+1000;save(LS.wallet,w);pushNotif(u,'🎁','Администратор выдал тебе 1000 оонеток');toast('@'+u+' +1000');box.querySelector('#aAccs').click();});
    body.querySelectorAll('[data-ab]').forEach(b=>b.onclick=()=>{const u=b.dataset.ab,all=encLoad(LS.acc,{});all[u].banned=!all[u].banned;encSave(LS.acc,all);addLog('admin',me.user,(all[u].banned?'забанил ':'разбанил ')+u);toast('@'+u+(all[u].banned?' в бане':' разбанен'));box.querySelector('#aAccs').click();});
    body.querySelectorAll('[data-ad]').forEach(b=>b.onclick=()=>{const u=b.dataset.ad;if(!confirm('удалить аккаунт @'+u+' навсегда?'))return;const all=encLoad(LS.acc,{});delete all[u];encSave(LS.acc,all);addLog('admin',me.user,'удалил аккаунт '+u);toast('аккаунт удалён');box.querySelector('#aAccs').click();});
  };
  box.querySelector('#aPosts').onclick=()=>{
    set('<div class="adm-note">все записи — закреп/удаление</div>'+posts.slice(0,100).map(p=>`<div class="adm-row"><span style="font-size:15px">${esc(p.ava||'🐱')}</span><b>${esc(p.author)}: ${esc((p.text||'').slice(0,70))}</b><button class="minibtn" data-ap="${p.id}">${p.pinned?'открепить':'закрепить'}</button><button class="x" data-apd="${p.id}">✕</button></div>`).join(''));
    body.querySelectorAll('[data-ap]').forEach(b=>b.onclick=()=>{const id=Number(b.dataset.ap),all=load(LS.posts,[]),p=all.find(x=>x.id===id);if(p){p.pinned=!p.pinned;save(LS.posts,all);buildPosts();addLog('admin',me.user,(p.pinned?'закрепил':'открепил')+' запись');}box.querySelector('#aPosts').click();});
    body.querySelectorAll('[data-apd]').forEach(b=>b.onclick=()=>{if(!confirm('удалить запись?'))return;tombAdd(LS.posts,Number(b.dataset.apd));save(LS.posts,load(LS.posts,[]).filter(p=>p.id!==Number(b.dataset.apd)));addLog('admin',me.user,'удалил запись');buildPosts();box.querySelector('#aPosts').click();});
  };
  box.querySelector('#aTracks').onclick=()=>{
    set('<div class="adm-note">все треки — приватность/удаление</div>'+trs.map(t=>`<div class="adm-row"><span style="font-size:17px">${esc(t.cover||'🎵')}</span><b>${esc(t.name)} · ${esc(t.artist||'—')} · ▶${t.plays||0}</b><button class="minibtn" data-atp="${t.id}">${t.priv?'сделать публичным':'в приватные'}</button><button class="x" data-atd="${t.id}">✕</button></div>`).join(''));
    body.querySelectorAll('[data-atp]').forEach(b=>b.onclick=()=>{const all=tracksAll(),t=all.find(x=>x.id===b.dataset.atp);if(t){t.priv=!t.priv;tracksSave(all);addLog('admin',me.user,(t.priv?'скрыл':'открыл')+' трек «'+t.name+'»');}box.querySelector('#aTracks').click();});
    body.querySelectorAll('[data-atd]').forEach(b=>b.onclick=()=>{if(!confirm('удалить трек навсегда?'))return;save(LS.tracks,tracksAll().filter(t=>t.id!==b.dataset.atd));addLog('admin',me.user,'удалил трек');if(player.currentId===b.dataset.atd)pausePlayer();box.querySelector('#aTracks').click();});
  };
  box.querySelector('#aStories').onclick=()=>{
    const all=storiesAll();
    set('<div class="adm-note">сторис ('+all.length+')</div>'+all.map(s=>`<div class="adm-row"><span>${esc(s.ava||'🐈')}</span><b>@${esc(s.user)} · ${esc(s.cap||'')}</b><span class="from-line">${new Date(s.ts).toLocaleString('ru-RU')}</span><button class="x" data-asd="${s.id}">✕</button></div>`).join('')||'<div class="adm-note">сторис нет</div>');
    body.querySelectorAll('[data-asd]').forEach(b=>b.onclick=()=>{saveStories(storiesAll().filter(s=>s.id!==b.dataset.asd));addLog('admin',me.user,'удалил сторис');box.querySelector('#aStories').click();});
  };
  box.querySelector('#aCatalog').onclick=()=>{
    const cat=giftCatalog();
    set('<div class="adm-note">магазин подарков ('+cat.length+')</div>'+cat.map(g=>`<div class="adm-row">${giftImgHTML(g,30)}<b>${esc(g.name)} · ${g.price} оонеток · тираж ${g.tiraj}</b><button class="x" data-agd="${g.id}">✕</button></div>`).join('')||'<div class="adm-note">магазин пуст — добавь подарок в «подарочки → магазин»</div>');
    body.querySelectorAll('[data-agd]').forEach(b=>b.onclick=()=>{saveCatalog(giftCatalog().filter(g=>g.id!==b.dataset.agd));const gone=cleanBag();addLog('admin',me.user,'удалил подарок'+(gone?', из сумок убрано: '+gone:''));box.querySelector('#aCatalog').click();});
  };
  /* скачать html со всеми накопленными данными: открываешь файл где угодно — данные на месте */
  box.querySelector('#aExport').onclick=()=>{
    const dump={};
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(!k||k.indexOf('oomy')!==0)continue;
      if(k===LS.sess)continue; /* сессию не пакуем: чужой файл не должен пускать в чужой аккаунт */
      dump[k]=localStorage.getItem(k);
    }
    const b64=btoa(unescape(encodeURIComponent(JSON.stringify(dump))));
    fetch(location.href).then(r=>r.text()).then(html=>{
      const tag='<script id="oomyDump">window.__OOMY_DUMP=JSON.parse(decodeURIComponent(escape(atob("'+b64+'"))));<'+'/script>';
      const out=html.indexOf('</body>')>-1?html.replace('</body>',tag+'</body>'):html+tag;
      const blob=new Blob([out],{type:'text/html;charset=utf-8'});
      const a=document.createElement('a');
      a.href=URL.createObjectURL(blob);
      a.download='oomy-'+new Date().toISOString().slice(0,10)+'.html';
      document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(a.href),5000);
      addLog('admin',me.user,'скачал сайт с данными ('+Math.round(blob.size/1024)+' кб)');
      toast('сайт с данными скачан 📥');
    }).catch(()=>toast('не вышло: сайт должен быть открыт по адресу (http), а не с диска'));
  };
  /* облако: общий мир. адрес базы firebase, пригласительная ссылка, статус */
  box.querySelector('#aCloud').onclick=()=>{
    const st=cloudStatus();
    set(`<div class="adm-note">общий мир: у всех одна лента, общие аккаунты и чаты. работает через бесплатный сервер firebase. без облака у каждого свой мир.</div>
    <div class="adm-row"><b>${st.on?'☁ подключено':'☁ не подключено'}</b><span class="from-line">${st.on?esc(st.url):'адрес базы не задан'}</span></div>
    <div class="adm-row"><b>состояние</b><span class="from-line">${st.on?(st.ok?('связь есть · обновлено '+now()):('ошибка: '+esc(st.err))):'—'}</span></div>
    <div class="adm-row" style="flex-wrap:wrap;gap:8px"><input class="pill-input" id="clUrl" style="flex:1;min-width:250px" placeholder="адрес базы: https://твоя-база-default-rtdb...firebasedatabase.app" value="${esc(st.url)}"><button class="minibtn" id="clOk">подключить</button></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">
      <button class="minibtn" id="clTest">проверить сейчас</button>
      <button class="minibtn" id="clInvite">🔗 ссылка для друга</button>
      <button class="minibtn" id="clOff">отключить</button>
    </div>
    <div class="adm-note">как получить адрес (бесплатно, без карты):<br>1) console.firebase.google.com → вход через гугл-аккаунт → «создать проект» (аналитику можно выключить)<br>2) слева: build → realtime database → «создать базу данных» → регион любой (например united states) → режим «в тестовом режиме» → включить<br>3) скопируй адрес из шапки базы (вида https://имя-....firebasedatabase.app) и вставь сюда → «подключить»<br>4) друзья: жми «ссылка для друга» и отправь им — откроют и сразу в общем мире. либо скачай сайт с данными — адрес уже внутри файла.</div>`);
    box.querySelector('#clOk').onclick=()=>{
      const u=box.querySelector('#clUrl').value.trim().replace(/\.json(\?.*)?$/,'');
      if(!/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(u)){toast('адрес должен начинаться с https:// и быть настоящим адресом базы');return;}
      save(LS.cloud,u);cloudRestart();toast('облако подключено ☁');box.querySelector('#aCloud').click();
    };
    box.querySelector('#clTest').onclick=async()=>{
      const n=await cloudPullAll();
      toast(cloudEnabled()?('связь есть, с сервера пришло данных: '+n):'облако не подключено');
      box.querySelector('#aCloud').click();
    };
    box.querySelector('#clOff').onclick=()=>{
      localStorage.removeItem(LS.cloud);cloudRestart();toast('облако отключено — снова свой мир');box.querySelector('#aCloud').click();
    };
    box.querySelector('#clInvite').onclick=()=>{
      const u=cloudRoot();
      if(!u){toast('сначала подключи облако');return;}
      copyText(location.href.split('#')[0]+'#cloud='+btoa(u));
      toast('ссылка скопирована — отправь другу');
    };
  };
  box.querySelector('#aClicks').onclick=()=>{
    const c=clickStats();
    set('<div class="adm-note">копилки — можно обнулить дневной лимит конкретному коту</div>'+Object.keys(c).map(u=>`<div class="adm-row"><b>@${esc(u)}</b><span class="from-line">сегодня ${c[u].todayN||0} · всего ${c[u].total||0} · заработано ${c[u].earned||0}</span><button class="minibtn" data-acr="${esc(u)}">сбросить день</button></div>`).join('')||'<div class="adm-note">пока никто не кликал</div>');
    body.querySelectorAll('[data-acr]').forEach(b=>b.onclick=()=>{const all=clickStats(),u=b.dataset.acr;if(all[u]){all[u].todayN=0;all[u].today=dayKey();save(LS.clicks,all);}addLog('admin',me.user,'сбросил дневной лимит копилки '+u);toast('лимит @'+u+' обнулён');box.querySelector('#aClicks').click();});
  };
  box.querySelector('#aLogs').onclick=()=>{
    const logs=encLoad(LS.logs,[]);
    set('<div class="adm-note">последние 120 событий</div>'+logs.slice(0,120).map(l=>`<div class="adm-row"><b>${esc(l.shown||'')} · ${esc(l.type||'')}</b><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis">@${esc(l.user||'—')} — ${esc(l.detail||'')}</span></div>`).join('')||'<div class="adm-note">лог пуст</div>');
  };
}

/* правая колонка */
document.querySelectorAll('.r-tab').forEach(t=>t.onclick=()=>{
  document.querySelectorAll('.r-tab').forEach(x=>x.classList.remove('active'));
  t.classList.add('active');railMode=t.dataset.r;buildRail();
});
let railMode='all';
/* правый бар убран: правые панельки теперь живут только внутри своих разделов
   (например, в подарочках) — поэтому buildRail стал заглушкой */
function buildRail(){}
function syncGiftBadge(){
  const gb=document.getElementById('giftBadge');if(!gb)return;
  const n=isAdmin()?propsAll().filter(p=>p.status==='new').length:0;
  gb.textContent=n;gb.classList.toggle('hidden',!n);
}
function syncBadges(){
  const read=load(LS.chatRead,[]);
  const c=chatsData();
  const unread=[SELF.n].concat(Object.keys(encLoad(LS.acc,{})).filter(u=>u!==me.user)).filter(n=>c[n]&&c[n].some(m=>m.who==='them')&&!read.includes(n));
  document.getElementById('msgBadge').classList.toggle('hidden',unread.length===0);
  const frN=incomingReqs(me.user).length;
  const frEl=document.getElementById('frBadge');
  if(frEl){frEl.textContent=String(frN);frEl.classList.toggle('hidden',frN===0);}
  /* уведомления: считаем непрочитанные (ts позже отметки) */
  const nb=document.getElementById('notifBadge');
  if(nb){
    const seen=load(LS.notifSeen,{})[me.user]||0;
    const legacyRead=load(LS.notifsRead,false);
    const nN=legacyRead&&seen===0?0:dynNotifsFor(me.user).filter(x=>x.ts>seen).length;
    nb.textContent=nN>99?'+99':String(nN);nb.classList.toggle('hidden',nN===0);
  }
  /* лента: новые записи с прошлого визита */
  const fb=document.getElementById('feedBadge');
  if(fb){
    const seen=load(LS.feedSeen,{})[me.user]||0;
    const nF=load(LS.posts,[]).filter(p=>!p.hidden&&p.ts>seen&&p.author!==me.user).length;
    fb.textContent=nF>99?'+99':String(nF);fb.classList.toggle('hidden',nF===0);
  }
  /* предложка: плашка видна только администратору */
  const gb=document.getElementById('giftBadge');
  if(gb){const n=isAdmin()?propsAll().filter(p=>p.status==='new').length:0;gb.textContent=n;gb.classList.toggle('hidden',!n);}
}

function applyBarStyle(mode){
  const m=mode||((me&&!me.guest&&(prof().barStyle||'default'))||'default');
  document.documentElement.dataset.bar=(['default','translucent','transparent'].includes(m))?m:'default';
}
/* ============ СНЕЖИНКИ ❄ ============ */
const snowCv=document.getElementById('snowCv');
const snowCtx=snowCv?snowCv.getContext('2d'):null;
let snowFlakes=[],snowRaf=0,snowT=0,snowOn=load('oomy.snow',true);
function snowResize(){if(!snowCv)return;snowCv.width=innerWidth;snowCv.height=innerHeight;}
function snowInit(){snowFlakes=Array.from({length:Math.max(40,Math.round(innerWidth/13))},()=>({x:Math.random()*innerWidth,y:Math.random()*innerHeight,r:1+Math.random()*2.6,s:.12+Math.random()*.28,d:Math.random()*.5-.25,w:Math.random()*Math.PI*2}));}
function snowLoop(){
  if(!snowOn||!snowCtx)return;
  snowRaf=requestAnimationFrame(snowLoop);
  snowT+=.01;
  snowCtx.clearRect(0,0,snowCv.width,snowCv.height);
  snowCtx.fillStyle='#fff';
  snowFlakes.forEach(f=>{
    f.y+=f.s;f.x+=f.d+Math.sin(snowT+f.w)*.4;
    if(f.y>snowCv.height+8){f.y=-8;f.x=Math.random()*snowCv.width;}
    if(f.x>snowCv.width+8)f.x=-8;if(f.x<-8)f.x=snowCv.width+8;
    snowCtx.globalAlpha=Math.min(.95,.35+f.r*.2);
    snowCtx.beginPath();snowCtx.arc(f.x,f.y,f.r,0,7);snowCtx.fill();
  });
  snowCtx.globalAlpha=1;
}
function setSnow(on){
  snowOn=!!on;save('oomy.snow',snowOn);
  const b=document.getElementById('snowBtn');
  if(b)b.classList.toggle('off',!snowOn);
  if(snowCv)snowCv.style.display=snowOn?'':'none';
  cancelAnimationFrame(snowRaf);
  if(snowOn){snowResize();snowInit();snowRaf=requestAnimationFrame(snowLoop);}
}
window.addEventListener('resize',()=>{if(snowOn){snowResize();snowInit();}});
const snowBtnEl=document.getElementById('snowBtn');
if(snowBtnEl)snowBtnEl.onclick=()=>{setSnow(!snowOn);toast(snowOn?'снежинки включены ❄':'снежинки выключены');};
setSnow(snowOn);

/* ============ УДОБСТВО: наверх, горячие клавиши ============ */
const toTopBtn=document.createElement('button');toTopBtn.id='toTop';toTopBtn.textContent='↑';toTopBtn.title='наверх';document.body.appendChild(toTopBtn);
toTopBtn.onclick=()=>window.scrollTo({top:0,behavior:'smooth'});
window.addEventListener('scroll',()=>{
  const on=window.scrollY>600&&!(me&&!me.guest&&prof().toTop===false);
  toTopBtn.classList.toggle('show',on);
},{passive:true});
document.addEventListener('keydown',e=>{
  if(!me||me.guest||prof().hotkeys===false)return;
  const t=e.target,tag=t&&t.tagName;
  if(tag==='INPUT'||tag==='TEXTAREA'||(t&&t.isContentEditable))return;
  if(e.code==='Space'){e.preventDefault();togglePlay();}
  else if(e.code==='ArrowRight'&&player.dur){player.audio.currentTime=Math.min(player.dur,player.audio.currentTime+5);seekFill();}
  else if(e.code==='ArrowLeft'&&player.dur){player.audio.currentTime=Math.max(0,player.audio.currentTime-5);seekFill();}
});

/* ============ СТАРТ ============ */
function enterFeed(){
  me=load(LS.sess,null);if(!me)return;
  const accs=encLoad(LS.acc,{});if(accs[me.user])me.admin=!!accs[me.user].admin;
  showScreen(scrFeed);
  /* у каждого своё оформление: новый аккаунт получает чистые дефолты */
  if(!me.guest){
    const up=prof();
    applyTheme(up.theme||'dark',false);
    applyAccent(up.siteAccent||'#e11d48',false);
  }
  touchSeen();
  refreshChips();refreshOonChip();refreshAdminNav();applyPageBg();applyBarStyle();
  const pr0=prof();
  if(pr0.vol!=null){player.audio.volume=Math.max(0,Math.min(1,pr0.vol/100));NP.vol.value=pr0.vol;}
  player.autoplay=pr0.autoplay!==false;
  document.getElementById('composerBox').classList.toggle('hidden',!!me.guest);
  seedPosts();wireComposer();
  go('feed');syncBadges();
  if(me.guest)setTimeout(()=>toast('ты тут как читатель. заведи аккаунт — всё так же бесплатно, как лапки!'),900);
}
/* ============ СТАРТ ============ */
/* держим статус «в сети» живым, пока вкладка открыта */
setInterval(()=>{try{if(me&&!me.guest)touchSeen();}catch(e){}},60000);
(async function boot(){
  /* открываешь скачанный html с данными — и всё на месте (только если здесь ещё нет своего аккаунта: чужие данные не затираются) */
  if(window.__OOMY_DUMP&&!load(LS.acc,null)){
    try{
      let n=0;
      Object.keys(window.__OOMY_DUMP).forEach(k=>{
        if(String(k).indexOf('oomy')===0){localStorage.setItem(k,window.__OOMY_DUMP[k]);n++;}
      });
      if(n)console.log('oomy: из файла загружено ключей: '+n);
    }catch(e){}
  }
  /* рабочий ключ по умолчанию: 1 ключ = 500 оонеток */
  if(!Object.keys(load(LS.keys,{})).length)save(LS.keys,{'OOMY-NEKO-0500-2026':{a:500,used:false}});
  try{cleanBag()}catch(e){}
  /* ссылка-приглашение в общий мир: site…#cloud=адрес базы */
  try{
    const cm=(location.hash||'').match(/#cloud=([A-Za-z0-9+/=]+)/);
    if(cm){const u=atob(cm[1]);if(/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(u))localStorage.setItem(LS.cloud,u);}
  }catch(e){}
  /* сессия восстанавливается мгновенно, без экрана входа; зеркало догружаем фоном */
  if(load(LS.sess,null)){
    enterFeed();
    restoreFromMirror().then(got=>{if(got)console.log('oomy: восстановлено '+got+' ключей из зеркала');});
  }else{
    const got=await restoreFromMirror();
    if(got)console.log('oomy: восстановлено '+got+' ключей из зеркала');
    /* общий мир: подтягиваем всё с сервера до входа, чтобы видны были все котики */
    if(cloudEnabled())await cloudPullAll();
    liUser.focus();
  }
  cloudStart();
})();

/* ============ ШПИЛКИ: игры на двоих (hot-seat) ============ */
const GAMES_ST={game:'ttt',seats:{1:null,2:null},ttt:{b:Array(9).fill(''),turn:'x',score:{x:0,o:0},done:null},cf4:{b:[],turn:'r',score:{r:0,y:0},done:null},rps:{p1:null,score:{a:0,b:0},msg:'место 1, выбирай',last:null}};
const GAMES_NAMES={ttt:'крестики-нолики',cf4:'четыре в ряд',rps:'камень-ножницы-бумага'};
function gT(){return GAMES_ST[GAMES_ST.game];}
function accOf(u){return (encLoad(LS.acc,{})[u])||{ava:'🐈'}}
function seatName(n){const u=GAMES_ST.seats[n];return u||('место '+n)}
function seatAva(n){const u=GAMES_ST.seats[n];return u?avaHTML(u,accOf(u).ava||'🐈'):'<span style="font-size:20px">🪑</span>'}
function renderGames(){
  const box=document.getElementById('pg-games');
  box.innerHTML=`<div class="pcard" style="padding:16px 18px">
    <div class="pf-name" style="font-size:18px">шпилки · игры на двоих</div>
    <div class="pf-sub">играете по очереди на одном устройстве — кто умнее и удачливее, тот и кот</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">
      ${Object.keys(GAMES_NAMES).map(g=>`<button class="stab ${GAMES_ST.game===g?'active':''}" data-g="${g}">${GAMES_NAMES[g]}</button>`).join('')}
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      <div class="panel" style="flex:1;min-width:200px;padding:12px 14px;cursor:pointer" id="seat1box">${seatBox(1)}</div>
      <div class="panel" style="flex:1;min-width:200px;padding:12px 14px;cursor:pointer" id="seat2box">${seatBox(2)}</div>
    </div>
    <div class="panel" style="padding:16px" id="gameArea"></div>
  </div>`;
  box.querySelectorAll('[data-g]').forEach(b=>b.onclick=()=>{GAMES_ST.game=b.dataset.g;renderGames();});
  const s1=box.querySelector('#seat1box'),s2=box.querySelector('#seat2box');
  s1.onclick=()=>toggleSeat(1);s2.onclick=()=>toggleSeat(2);
  drawGame();
}
function seatBox(n){
  const u=GAMES_ST.seats[n];
  if(u)return `<div style="display:flex;align-items:center;gap:10px"><div class="ava" style="width:40px;height:40px;font-size:20px">${seatAva(n)}</div><div style="flex:1;min-width:0"><b style="font-size:14px">${esc(u)}${badgeFor(u)}</b><div class="from-line">место ${n} занято · нажми, чтобы освободить</div></div></div>`;
  return `<div style="display:flex;align-items:center;gap:10px;color:var(--muted)"><div class="ava" style="width:40px;height:40px;font-size:18px;background:var(--card2)">🪑</div><div style="flex:1"><b style="font-size:14px">место ${n}</b><div class="from-line">свободно · нажми, чтобы занять</div></div></div>`;
}
function toggleSeat(n){
  const u=GAMES_ST.seats[n];
  const other=1+2-n;
  if(u){GAMES_ST.seats[n]=null;toast('место '+n+' освободилось');}
  else{
    if(GAMES_ST.seats[other]===me.user){toast('ты уже на другом месте, жулик');return;}
    GAMES_ST.seats[n]=me.user;toast('место '+n+' за тобой, @'+me.user);
  }
  renderGames();
}
function gScoreHTML(a,b){return `<div style="display:flex;gap:14px;align-items:center;margin-bottom:10px;font-size:14px"><span style="display:inline-flex;align-items:center;gap:7px"><span class="ava" style="width:30px;height:30px;font-size:15px">${seatAva('1')}</span><b>${esc(seatName(1))}</b></span><span style="font-size:17px">${gT().score[a]} : ${gT().score[b]}</span><span style="display:inline-flex;align-items:center;gap:7px"><b>${esc(seatName(2))}</b><span class="ava" style="width:30px;height:30px;font-size:15px">${seatAva(2)}</span></span></div>`;}
function gTurn(n,extra){return `<span style="display:inline-flex;align-items:center;gap:7px"><span class="ava" style="width:26px;height:26px;font-size:13px">${seatAva(n)}</span>${esc(seatName(n))}${extra?' '+extra:''}</span>`;}
function drawGame(){
  const area=document.getElementById('gameArea');if(!area)return;
  if(GAMES_ST.game==='ttt')drawTTT(area);
  else if(GAMES_ST.game==='cf4')drawCF4(area);
  else drawRPS(area);
}
function drawTTT(area){
  const s=gT();
  const W=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  area.innerHTML=`${gScoreHTML('x','o')}
    <div class="ttt-grid" style="display:grid;grid-template-columns:repeat(3,64px);gap:6px;width:max-content">${s.b.map((c,i)=>`<button class="ttt-c" data-i="${i}" style="width:64px;height:64px;font-size:30px;border-radius:12px;border:1px solid var(--line);background:var(--card2);cursor:pointer;color:${c==='x'?'var(--acc)':'#ff7ab8'}">${c==='x'?'✕':c==='o'?'◯':''}</button>`).join('')}</div>
    <div style="margin-top:12px;font-size:13.5px">${s.done?(s.done==='n'?'ничья!':'победа: '+gTurn(s.done==='x'?'1':'2')+' 🎉'):'ходит '+gTurn(s.turn==='x'?'1':'2','('+(s.turn==='x'?'✕':'◯')+')')}</div>
    <div style="display:flex;gap:8px;margin-top:10px"><button class="minibtn" id="gReset">новый раунд</button><button class="minibtn" id="gZero">сбросить счёт</button></div>`;
  area.querySelectorAll('.ttt-c').forEach(c=>c.onclick=()=>{
    const i=+c.dataset.i;
    if(s.b[i]||s.done)return;
    s.b[i]=s.turn;
    const win=W.find(w=>w.every(j=>s.b[j]===s.turn));
    if(win){s.done=s.turn;s.score[s.turn]++;toast('победа! 🎉');}
    else if(s.b.every(x=>x)){s.done='n';}
    else s.turn=s.turn==='x'?'o':'x';
    drawGame();
  });
  area.querySelector('#gReset').onclick=()=>{s.b=Array(9).fill('');s.turn='x';s.done=null;drawGame();};
  area.querySelector('#gZero').onclick=()=>{s.score={x:0,o:0};s.b=Array(9).fill('');s.turn='x';s.done=null;drawGame();};
}
function drawCF4(area){
  const s=gT();
  if(!s.b.length)s.b=Array.from({length:6},()=>Array(7).fill(''));
  const win4=(b,t)=>{for(let r=0;r<6;r++)for(let c=0;c<7;c++){
    if(c+3<7&&[0,1,2,3].every(k=>b[r][c+k]===t))return true;
    if(r+3<6&&[0,1,2,3].every(k=>b[r+k][c]===t))return true;
    if(c+3<7&&r+3<6&&[0,1,2,3].every(k=>b[r+k][c+k]===t))return true;
    if(c-3>=0&&r+3<6&&[0,1,2,3].every(k=>b[r+k][c-k]===t))return true;
  }return false;};
  const full=s.b[0].every(x=>x);
  area.innerHTML=`${gScoreHTML('r','y')}
    <div style="display:grid;grid-template-columns:repeat(7,46px);gap:4px;background:var(--card2);padding:8px;border-radius:14px;border:1px solid var(--line);width:max-content">${s.b.map((row,r)=>row.map((c,ci)=>`<button data-cf="${ci}" data-r="${r}" style="width:46px;height:46px;border-radius:50%;border:1px solid var(--line);background:${c==='r'?'#ff4d6d':c==='y'?'#ffc23d':'var(--card)'};cursor:pointer"></button>`).join('')).join('')}</div>
    <div style="margin-top:12px;font-size:13.5px">${s.done?(s.done==='n'?'ничья!':'победа: '+gTurn(s.done==='r'?'1':'2')+' 🎉'):full?'ничья — поле полное!':'ходит '+gTurn(s.turn==='r'?'1':'2','('+(s.turn==='r'?'🔴':'🟡')+')')}</div>
    <div style="display:flex;gap:8px;margin-top:10px"><button class="minibtn" id="gReset">новый раунд</button><button class="minibtn" id="gZero">сбросить счёт</button></div>`;
  area.querySelectorAll('[data-cf]').forEach(c=>c.onclick=()=>{
    if(s.done)return;
    const ci=+c.dataset.cf;
    if(s.b[0][ci])return;
    let r=5;while(r>=0&&s.b[r][ci])r--;
    if(r<0)return;
    s.b[r][ci]=s.turn;
    if(win4(s.b,s.turn)){s.done=s.turn;s.score[s.turn]++;toast('четыре в ряд! 🎉');}
    else if(s.b[0].every(x=>x))s.done='n';
    else s.turn=s.turn==='r'?'y':'r';
    drawGame();
  });
  area.querySelector('#gReset').onclick=()=>{s.b=[];s.turn='r';s.done=null;drawGame();};
  area.querySelector('#gZero').onclick=()=>{s.score={r:0,y:0};s.b=[];s.turn='r';s.done=null;drawGame();};
}
function drawRPS(area){
  const s=gT();
  area.innerHTML=`${gScoreHTML('a','b')}
    <div style="font-size:13.5px;margin-bottom:10px">${esc(s.msg)}</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">${['🪨','✂','🧻'].map((ic,i)=>`<button class="rps-c" data-i="${i}" style="width:76px;height:76px;font-size:34px;border-radius:16px;border:1px solid var(--line);background:var(--card2);cursor:pointer">${ic}</button>`).join('')}</div>
    ${s.last?`<div style="margin-top:12px;font-size:14px">раунд: ${esc(seatName(1))} ${['🪨','✂','🧻'][s.last.a]} против ${esc(seatName(2))} ${['🪨','✂','🧻'][s.last.b]} — ${esc(s.last.r)}</div>`:''}
    <div style="display:flex;gap:8px;margin-top:10px"><button class="minibtn" id="gReset">заново</button></div>`;
  const RES=['ничья','выиграл место 1','выиграл место 2'];
  area.querySelectorAll('.rps-c').forEach(c=>c.onclick=()=>{
    const i=+c.dataset.i;
    if(s.p1===null){
      s.p1=i;s.msg='ход места 1 скрыт. место 2, выбирай!';
      drawGame();
      return;
    }
    const a=s.p1,b=i;
    let r;
    if(a===b)r=0;
    else if((a-b+3)%3===1)r=1;
    else r=2;
    if(r===1)s.score.a++;else if(r===2)s.score.b++;
    s.last={a,b,r:RES[r]};
    s.p1=null;
    if(s.score.a>=3||s.score.b>=3){
      s.msg=(s.score.a>=3?seatName(1):seatName(2))+' выиграл со счётом 3:'+Math.min(s.score.a,s.score.b)+'! 🎉';
      s.score={a:0,b:0};s.last=null;
      toast('матч выигран! 🎉');
    }else{
      s.msg=(r===0?'ничья — ':RES[r]+' — ')+'место 1, выбирай снова';
    }
    drawGame();
  });
  area.querySelector('#gReset').onclick=()=>{s.p1=null;s.score={a:0,b:0};s.msg='место 1, выбирай';s.last=null;drawGame();};
}
/* ============ КАЗИНАК: слоты, рулетка, монетка ============ */
const CASINO_ST={rhist:[]};
function winsAll(){return load(LS.wins,[])}
function casWin(amt,game){
  const w=winsAll();
  w.unshift({u:me.user,amt,game,ts:Date.now()});
  save(LS.wins,w.slice(0,40));
  const el=document.getElementById('casWins');
  if(el)el.innerHTML=winsRows();
}
function winsRows(){
  const w=winsAll();
  const fm=ts=>{const d=new Date(ts);return ('0'+d.getDate()).slice(-2)+'.'+('0'+(d.getMonth()+1)).slice(-2)+' '+('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2)};
  return w.slice(0,12).map(x=>`<div style="padding:5px 0;border-bottom:1px solid var(--line);font-size:12.5px;display:flex;gap:8px;align-items:center"><b style="color:var(--text)">@${esc(x.u)}</b><span style="color:#f5b301;font-weight:800">+${x.amt}</span><span style="color:var(--muted2)">· ${esc(x.game)}</span><span style="margin-left:auto;color:var(--muted2)">${fm(x.ts)}</span></div>`).join('')||'<div class="from-line">пока никто не выигрывал — будь первым</div>';
}
function casBet(){
  const v=Math.floor(Number((document.getElementById('casBet').value||'').replace(/\D/g,'')));
  if(!v||v<1){toast('ставка — целое число оонеток');return 0;}
  if(v>myOon()){toast('не хватает оонеток 😿');return 0;}
  return v;
}
function casPayout(bet,mult,game){
  if(mult>0){
    const amt=Math.round(bet*mult);
    addOon(amt);
    casWin(amt,game);
  }
  refreshOonChip();
  const bal=document.getElementById('casBal');if(bal)bal.textContent=myOon()+' оонеток';
}
function renderCasino(){
  const box=document.getElementById('pg-casino');
  const t=CASINO_ST.tab||'slots';
  box.innerHTML=`<div class="pcard" style="padding:16px 18px">
    <div class="pf-name" style="font-size:18px">казинак 🎲</div>
    <div class="pf-sub">честный рандом: можно выиграть, можно проиграть. играй на оонетки умеренно, котик</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">
      <button class="stab ${t==='slots'?'active':''}" data-c="slots">🎰 слоты</button>
      <button class="stab ${t==='roul'?'active':''}" data-c="roul">🎡 рулетка</button>
      <button class="stab ${t==='coin'?'active':''}" data-c="coin">🪙 монетка</button>
    </div>
    <div class="panel" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 14px">
      <label style="font-size:13px">ставка:</label>
      <input class="pill-input" id="casBet" type="number" min="1" value="50" style="width:120px">
      <span style="font-size:13px">баланс: <b id="casBal">${myOon()} оонеток</b></span>
    </div>
    <div class="panel" style="padding:16px;margin-top:12px" id="casArea"></div>
    <div class="panel" style="margin-top:14px;padding:12px 16px">
      <b style="font-size:12.5px">выигрыши</b>
      <div id="casWins" style="margin-top:6px">${winsRows()}</div>
    </div>
  </div>`;
  box.querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>{CASINO_ST.tab=b.dataset.c;drawCasino();});
  drawCasino();
}
function drawCasino(){
  const area=document.getElementById('casArea');if(!area)return;
  ({slots:casSlots,roul:casRoul,coin:casCoin})[CASINO_ST.tab||'slots'](area);
}
/* --- слоты --- */
const SLOTS_S=[{i:'🍒',m:5},{i:'🍋',m:3},{i:'🍇',m:3},{i:'🐱',m:8},{i:'⭐',m:10},{i:'7️⃣',m:20}];
function casSlots(body){
  body.innerHTML=`<div style="text-align:center">
    <div class="panel" style="display:flex;gap:10px;justify-content:center;margin-bottom:14px;padding:14px;width:max-content;margin-left:auto;margin-right:auto" id="slReels">
      ${[0,1,2].map(i=>`<div class="sl-reel" data-r="${i}" style="width:84px;height:84px;font-size:46px;display:flex;align-items:center;justify-content:center;background:var(--card2);border:1px solid var(--line);border-radius:16px">${SLOTS_S[i].i}</div>`).join('')}
    </div>
    <button class="dan-btn" id="slSpin" style="padding:11px 30px">крутить 🎰</button>
    <div class="from-line" style="margin-top:10px">3 одинаковых: 🍒×5 🍋×3 🍇×3 🐱×8 ⭐×10 7️⃣×20 · 2 одинаковых ×1.5</div>
  </div>`;
  body.querySelector('#slSpin').onclick=()=>{
    const bet=casBet();if(!bet)return;
    addOon(-bet);refreshOonChip();
    const reels=body.querySelectorAll('.sl-reel');
    const btn=body.querySelector('#slSpin');btn.disabled=true;
    let ticks=0;
    const iv=setInterval(()=>{
      reels.forEach(r=>{r.textContent=SLOTS_S[Math.floor(Math.random()*SLOTS_S.length)].i;});
      if(++ticks>=10){
        clearInterval(iv);btn.disabled=false;
        const fin=[0,1,2].map(()=>Math.floor(Math.random()*SLOTS_S.length));
        reels.forEach((r,i)=>{r.textContent=SLOTS_S[fin[i]].i;});
        const [a,b,c]=fin;
        let mult=0,txt='';
        if(a===b&&b===c){mult=SLOTS_S[a].m;txt='джекпот '+SLOTS_S[a].i+' ×'+mult;}
        else if(a===b||b===c||a===c){mult=1.5;txt='пара ×1.5';}
        casPayout(bet,mult,'слоты');
        if(mult)toast('+'+Math.round(bet*mult)+' оонеток! '+txt);else toast('мимо 🙀');
      }
    },55);
  };
}
/* --- рулетка: классика — числа, красное ×2, чёрное ×2, зелёное ×14 --- */
function casRoul(body){
  body.innerHTML=`<div style="text-align:center">
    <div id="roNum" style="width:96px;height:96px;margin:0 auto 12px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:38px;font-weight:800;border:1px solid var(--line);background:var(--card2)">?</div>
    <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:12px">
      <button class="dan-btn" data-ro="red" style="background:#ff4d6d">🔴 красное ×2</button>
      <button class="dan-btn" data-ro="black" style="background:#333">⚫ чёрное ×2</button>
      <button class="dan-btn" data-ro="green" style="background:#14b85a">🟢 зелёное ×14</button>
    </div>
    <div class="from-line">15 секторов: 7 красных, 7 чёрных, 1 зелёный. зелёный платит ×14</div>
  </div>`;
  body.querySelectorAll('[data-ro]').forEach(b=>b.onclick=()=>{
    const bet=casBet();if(!bet)return;
    addOon(-bet);refreshOonChip();
    const num=Math.floor(Math.random()*15);
    const col=num===0?'green':(num<=7?'red':'black');
    const mult=col==='green'?14:(num<=7?(b.dataset.ro==='red'?2:0):(b.dataset.ro==='black'?2:0));
    casPayout(bet,mult,'рулетка');
    const el=body.querySelector('#roNum');
    el.textContent=num;el.style.background=col==='red'?'#ff4d6d':col==='black'?'#333':'#14b85a';el.style.color='#fff';
    toast(mult?'+'+Math.round(bet*mult)+' оонеток!':'мимо, выпало '+num);
  });
}
/* --- монетка: орёл и решка с картинкой выпавшего --- */
function casCoin(body){
  body.innerHTML=`<div style="text-align:center">
    <div style="width:118px;height:118px;margin:0 auto 8px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:56px;font-weight:800;color:#7a4a02;background:radial-gradient(circle at 32% 26%,#ffe08a 0%,#ffc23d 26%,#ef9d13 62%,#b96606 100%);border:6px solid #ffe9ad;box-shadow:0 12px 26px rgba(0,0,0,.28),inset 0 0 0 5px rgba(120,60,0,.25);transition:transform .25s ease" id="cnCoin">?</div>
    <div id="cnLab" class="from-line" style="margin-bottom:12px">монетка ждёт ставки</div>
    <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
      <button class="dan-btn" data-cn="0">орёл · ×1.95</button>
      <button class="dan-btn" data-cn="1">решка · ×1.95</button>
    </div>
    <div class="from-line" style="margin-top:10px">50 на 50, честный рандом. множитель ×1.95</div>
  </div>`;
  body.querySelectorAll('[data-cn]').forEach(b=>b.onclick=()=>{
    const bet=casBet();if(!bet)return;
    addOon(-bet);refreshOonChip();
    const n=Math.random()<0.5?0:1;
    const mult=String(n)===b.dataset.cn?1.95:0;
    casPayout(bet,mult,'монетка');
    const el=body.querySelector('#cnCoin');
    el.style.transform='scale(.9)';setTimeout(()=>{el.style.transform='scale(1)';},250);
    el.innerHTML=n?'<span style="font-size:44px">1</span>':'🦅';
    const lab=body.querySelector('#cnLab');
    lab.innerHTML=(mult?'<b style="color:#f5b301">+'+Math.round(bet*mult)+' оонеток!</b> ':'')+'выпало: <b>'+(n?'решка':'орёл')+'</b>'+(mult?' 🎉':' — мимо 🙀');
    toast(mult?'+'+Math.round(bet*mult)+' оонеток!':'мимо 🙀');
  });
}
