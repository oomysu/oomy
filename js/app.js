/* ============ ХРАНИЛИЩЕ + ШИФРОВАНИЕ ============ */
const LS={acc:'oomy.avault',logs:'oomy.lvault',posts:'oomy.posts',sess:'oomy.session',theme:'oomy.theme',
          profile:'oomy.profileX',chats:'oomy.chatsX',chatRead:'oomy.chatRead',notifsRead:'oomy.notifsRead',nread:'oomy.notifsReadIds',
          media:'oomy.media',tracks:'oomy.tracks',playlists:'oomy.playlists',accent:'oomy.accent',groups:'oomy.groups',
          stories:'oomy.storiesX',storySeen:'oomy.storySeen',wallet:'oomy.wallet',gifts:'oomy.gifts',
          clicks:'oomy.clicks',quests:'oomy.quests',keys:'oomy.keys',props:'oomy.giftProps',
          catalog:'oomy.giftCat',refs:'oomy.refs',wcount:'oomy.wcount',notifsD:'oomy.notifsD',
          notifSeen:'oomy.notifSeen',feedSeen:'oomy.feedSeen',buyHist:'oomy.buyHist',giftChain:'oomy.giftChain',mkt:'oomy.mkt',wins:'oomy.wins',
          friends:'oomy.friends',freq:'oomy.friendReq',bookmarks:'oomy.bookmarks',seen:'oomy.seen',
          visitors:'oomy.visitors',daily:'oomy.daily',blocks:'oomy.blocks',cloud:'oomy.cloud',tomb:'oomy.tomb',
          badges:'oomy.badges',badgeOwn:'oomy.badgeOwn',colls:'oomy.colls',now:'oomy.now',
          msgTomb:'oomy.msgTomb',chatTomb:'oomy.chatTomb'};
const ADMIN='oomy'; /* аккаунт главного администратора */
const XKEY='пушистый-ключ-neko-2026-厚い猫';
const load=(k,d)=>{try{const r=localStorage.getItem(k);return r===null?d:JSON.parse(r)}catch(e){return d}};
const save=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){saveWarn(v)}try{mirrorPut(k,v)}catch(e){}if(k!==LS.posts&&k!==LS.media)saveWarn(v);try{cloudPush(k)}catch(e){}};
let saveWarned=false;
function saveWarn(v){try{const s=JSON.stringify(v);if(s.length>3.5e6&&!saveWarned){saveWarned=true;toast('хранилище под завязку удали тяжёлые треки/файлы');}}catch(e){}}
/* ============ ОБЛАКО: общий мир через бесплатный firebase ============ */
/* у всех одна лента, общие аккаунты и чаты; без облака — у каждого свой мир */
var cloudReady=false;
function cloudURL(){
  let v='';
  try{v=(localStorage.getItem(LS.cloud)||'').trim()}catch(e){return ''}
  /* save() хранит значения в json: снимаем кавычки, если они есть (иначе «подключить» в админке не заводил облако) */
  try{const p=JSON.parse(v);if(typeof p==='string'&&/^https:\/\//i.test(p))return p.trim()}catch(e){}
  return v;
}
function cloudRoot(){
  /* ВАЖНО: база всегда с косой чертой перед .json. Все запросы к узлам строятся как
     cloudRoot().slice(0,-5)+'узел.json' — без косой черты адрес склеивался в битый хост
     (…firebaseio.comoomy__x), и синхронизация молча не работала. */
  let u=cloudURL().replace(/\.json(\?.*)?$/,'').replace(/\/+$/,'');
  return /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(u)?u+'/.json':'';
}
function cloudEnabled(){return !!cloudRoot()}
const rtN=k=>k.replace(/\./g,'__'); /* firebase не любит точки в ключах */
/* личные чаты каждого аккаунта живут в СВОЁМ узле: аккаунты никак не связаны между
   собой, и один общий узел затирал бы чужие переписки при каждом сохранении */
const uEnc=u=>String(u).replace(/[^A-Za-z0-9]/g,c=>'_'+c.charCodeAt(0)+'_');
const CHNODE=u=>'oomy__chatsx_'+uEnc(u);
/* журнал событий — тоже личный: у каждого аккаунта свой ключ и свой облачный узел */
const LVNODE=u=>'oomy__lv_'+uEnc(u);
const logKeyFor=u=>LS.logs+'__'+String(u||'—');
const isLogKey=k=>typeof k==='string'&&k.indexOf(LS.logs+'__')===0;
const CVKEY='oomy.vers'; /* карта версий: кто что менял */
const CMMVER='oomy__mmvers'; /* штампы медиа-файлов в отдельном лёгком узле:
  раньше каждый файл писал штамп в общую карту версий, и каждый опрос
  качал её целиком — на сотнях фото это были мегабайты каждые 5 секунд,
  бесплатный лимит трафика кончался, и «общий мир отлетал» */
const CHOW='oomy.chatsOwner'; /* кто владелец чатов в этом ключе: без него чужие сообщения не понять */
let cloudOK=false,cloudErr='',cloudLast=0,cloudTimer=null,cloudPushT={},cloudKnown=null,cloudVisHook=false;
/* сколько опросов подряд не удалось: для плавной паузы между попытками,
   чтобы при сбое не долбить сервер каждую секунду и не усугублять проблему */
function cloudKnownGet(){if(!cloudKnown){try{cloudKnown=JSON.parse(localStorage.getItem('oomy.versKnown')||'{}')||{}}catch(e){cloudKnown={}}}return cloudKnown}
function cloudKnownSet(k,v){cloudKnownGet()[k]=v;try{localStorage.setItem('oomy.versKnown',JSON.stringify(cloudKnown))}catch(e){}}
function cloudStatus(){return {on:cloudEnabled(),url:cloudURL(),ok:cloudOK,err:cloudErr,last:cloudLast}}
/* плашка в меню: «☁ общий мир · связь есть» — всегда видно, работает ли облако */
function cloudChip(){
  let c=document.getElementById('cloudChip');
  if(!c){
    const foot=document.querySelector('.side-foot');
    if(!foot)return;
    c=document.createElement('div');c.id='cloudChip';
    c.style.cssText='font-size:11.5px;letter-spacing:.3px';
    foot.insertBefore(c,foot.firstChild);
  }
  const st=cloudStatus();
  if(!st.on){c.textContent='';c.style.display='none';return;}
  c.style.display='';
  if(st.ok){c.textContent='☁ общий мир · связь есть';c.style.color='var(--good)';}
  else if(cloudFails>0){c.textContent='☁ общий мир · переподключаюсь…';c.style.color='var(--muted2,var(--muted))';}
  else{c.textContent='☁ общий мир · нет связи'+(st.err?' ('+String(st.err).slice(0,40)+')':'');c.style.color='var(--bad)';}
}
function cloudFetch(url,opt){
  const ac=new AbortController();const t=setTimeout(()=>ac.abort(),9000);
  return fetch(url,Object.assign({cache:'no-store',signal:ac.signal},opt||{})).finally(()=>clearTimeout(t));
}
/* --- объединение данных: своё + чужое, без потери записей --- */
function unionById(a,b,tk){
  const m=new Map();
  a.concat(b).forEach(it=>{
    if(!it||typeof it!=='object')return;
    /* без id (старые записи логов) — стабильный ключ из содержимого, чтобы не потерялись при слиянии */
    const id=(it.id!==undefined)?it.id:'h|'+(it.t||'')+'|'+(it.type||'')+'|'+(it.user||'')+'|'+(it.detail||'');
    m.set(''+id,it);
  });
  let out=Array.from(m.values());
  if(tk){ /* надгробия: удалённое не воскресает */
    const tb=load(LS.tomb,{});
    out=out.filter(it=>{const ts=tb[tombKey(tk,it.id)];return !(ts&&((it.ts||0)<ts));});
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
function mergeCloud(k,remoteRaw){
  if(remoteRaw===null||remoteRaw===undefined||remoteRaw==='')return false;
  if(cloudNoMergeKey(k))return false;
  let cur;try{cur=localStorage.getItem(k)}catch(e){return false}
  /* значение с сервера может быть строкой или уже готовым объектом (firebase .json()) */
  let R,remoteStr=remoteRaw;
  if(typeof remoteRaw==='string'){try{R=JSON.parse(remoteRaw)}catch(e){return false}}
  else{try{remoteStr=JSON.stringify(remoteRaw)}catch(e){return false}R=remoteRaw}
  /* лента всегда обычный массив, даже если в облаке лежит старый шифрованный конверт */
  if(k===LS.posts&&R&&R.v===2&&typeof R.d==='string'){
    const arr=decEnv(R);
    if(Array.isArray(arr)){R=arr;remoteStr=JSON.stringify(arr);}
  }
  if(k===LS.posts&&Array.isArray(R)){
    /* в облаке могли остаться старые сеад-посты от ботов — на входе и на выходе
       пропускаем только живые записи, чтобы они не воскресали после каждого опроса */
    R=cleanPosts(R);try{remoteStr=JSON.stringify(R)}catch(e){return false}
  }
  if(cur===remoteStr)return false;
  if(cur===null){try{localStorage.setItem(k,remoteStr)}catch(e){return false}return true;}
  let L;try{L=JSON.parse(cur)}catch(e){try{localStorage.setItem(k,remoteStr)}catch(e){}return true;}
  if(k===LS.posts&&Array.isArray(L))L=cleanPosts(L);
  if(R===null)return false;
  let m;try{m=mergeVal(L,R,k)}catch(e){return false}
  if(m===null||m===undefined)return false;
  let out;try{out=JSON.stringify(m)}catch(e){return false}
  if(out===cur)return false;
  try{localStorage.setItem(k,out)}catch(e){return false}
  /* пришли новые надгробия — сразу вычищаем удалённое из каталога, сумок, барахолки и музыки */
  if(k===LS.tomb)setTimeout(()=>{try{sweepTombstones()}catch(e){}},50);
  return true;
}
/* «печатает…»: свой статус уезжает в личный узел облака, чужие — в память;
   друг видит «✍ печатает…» у ника, а я у себя — нет */
const TYPING={};
const TYPING_NODE=u=>'oomy__typing_'+uEnc(u);
let typingTs=0;
function setTyping(pal){
  if(!cloudEnabled()||!me||me.guest||!pal)return;
  const now=Date.now();
  if(now-typingTs<1800)return;
  typingTs=now;
  const body={};body[pal]=now;
  try{fetch(cloudRoot().slice(0,-5)+TYPING_NODE(me.user)+'.json',{method:'PATCH',body:JSON.stringify(body)}).catch(()=>{});}catch(e){}
}
function clearTyping(pal){
  if(!cloudEnabled()||!me||me.guest||!pal)return;
  typingTs=0;
  try{fetch(cloudRoot().slice(0,-5)+TYPING_NODE(me.user)+'.json',{method:'PATCH',body:JSON.stringify(JSON.parse('{"'+pal+'":null}'))}).catch(()=>{});}catch(e){}
}
function updateTypingUI(name){
  const el=document.getElementById('typingTxt');
  if(!el)return;
  const st=TYPING[name];
  const ts=st&&me&&st[me.user];
  el.textContent=(ts&&Date.now()-ts<4000)?'✍ печатает…':'';
}
/* лёгкое обновление открытого чата: добавляем только недостающие пузыри и «печатает» —
   весь чат не перерисовывается, поэтому он больше не «пропадает на секунду» */
function chatLightSync(name){
  const box=document.getElementById('pg-msgs');
  const mBox=box&&box.querySelector('#chatMsgs');
  if(!mBox)return;
  const nearBottom=(mBox.scrollHeight-mBox.scrollTop-mBox.clientHeight)<90||!mBox.querySelector('.msg-row');
  const msgs=chatMsgs(name);
  while(mBox.querySelectorAll('.msg-row').length<msgs.length){
    const i=mBox.querySelectorAll('.msg-row').length;
    const m=msgs[i];
    if(!m)break;
    const div=document.createElement('div');
    div.innerHTML=bubble(m,i,name);
    const el=div.firstElementChild;
    if(!el)break;
    mBox.appendChild(el);
    wireChatEl(el,name);
  }
  if(nearBottom)mBox.scrollTop=mBox.scrollHeight;
  refreshChatTicks(name);
  updateTypingUI(name);
}
/* логи тоже в шифрованном конверте: их нельзя слить по полям — расшифровываем,
   объединяем по id (сообщения с обоих устройств остаются в журнале) и шифруем обратно */
function mergeLogs(remoteRaw){
  if(!me||me.guest||!me.user)return false;
  /* конверт может быть строкой или готовым объектом — decEnv понимает оба вида */
  const R=decEnv(remoteRaw);
  if(!Array.isArray(R)||!R.length)return false;
  /* в облаке у каждого аккаунта свой узел, но на всякий случай берём только свои записи */
  const mine=R.filter(l=>l&&l.user===me.user);
  if(!mine.length)return false;
  const key=logKeyFor(me.user);
  const cur=encLoad(key,[]);
  const m=unionById(cur,mine);
  m.sort((x,y)=>String((y&&y.t)||'').localeCompare(String((x&&x.t)||'')));
  const out=m.slice(0,800);
  if(!out.length||JSON.stringify(out)===JSON.stringify(cur))return false;
  encSave(key,out);
  return true;
}
/* ключи, которые в облако не едут вообще */
/* мгновенная доставка: пока чат открыт, слушаем живой поток firebase (EventSource).
   сеть не дала поток — остаётся обычный опрос каждые 1.5 сек */
let chatStreams=[];
function chatStreamStop(){chatStreams.forEach(e=>{try{e.close()}catch(err){}});chatStreams=[];}
function chatStreamStart(name){
  chatStreamStop();
  if(!cloudEnabled()||!me||me.guest||!name||name===SELF.n||typeof EventSource==='undefined')return;
  const root=cloudRoot().slice(0,-5);
  const watch=(node,onData)=>{
    let es;
    try{es=new EventSource(root+node+'.json');}catch(e){return;}
    const onMsg=ev=>{try{const m=JSON.parse(ev.data);if(m&&m.data!==undefined)onData(m.data);else if(m&&m.data===null)onData(null);}catch(e){}};
    /* firebase присылает именованные события: put (полный узел), patch (лист), keep-alive (пульс) */
    es.addEventListener('put',onMsg);
    es.addEventListener('patch',onMsg);
    es.onmessage=onMsg;
    es.onerror=()=>{
      try{es.close()}catch(e){}
      const i=chatStreams.indexOf(es);if(i>-1)chatStreams.splice(i,1);
      setTimeout(()=>{if(openChatName===name)chatStreamStart(name);},8000);
    };
    chatStreams.push(es);
  };
  [name,me.user].forEach(u=>{
    watch(CHNODE(u),data=>{
      try{
        if(!data)return;
        if(u===me.user){if(mergeChats(data,u)&&openChatName===name)chatLightSync(name);}
        else{const R=data&&data.d?decEnv(data):data;if(R&&R[me.user]!==undefined){const one={};one[me.user]=R[me.user];if(mergeChats(one,u)&&openChatName===name)chatLightSync(name);}}
      }catch(e){}
    });
  });
  /* «печатает» друга приходит мгновенно; свой узел не слушаем — себе не показываем */
  watch(TYPING_NODE(name),data=>{
    try{
      if(data&&data[me.user])TYPING[name]=data;else delete TYPING[name];
      if(openChatName===name)updateTypingUI(name);
    }catch(e){}
  });
}

/* ключи, которые в облако не едут вообще */
function cloudExclKey(k){
  /* служебные метки публичного мира живут только в браузере: в облако их не шлём */
  if(typeof k==='string'&&k.indexOf('oomy.hide__')===0)return true;
  return [LS.sess,LS.theme,LS.accent,LS.cloud,'oomy.versKnown','oomy.lastPage','oomy.games',
    'oomy.worldVer','oomy.worldAuthor','oomy.worldAccs'].includes(k)
}
/* чаты сливает специальный mergeChats (там перспектива «моё/чужое»), а не общий mergeCloud */
function cloudNoMergeKey(k){return cloudExclKey(k)||isChatKey(k)||k===CHOW||/^oomy\.mm/.test(k)}
/* --- забрать всё с сервера (первое подключение, проверка) --- */
async function cloudPullAll(){
  const root=cloudRoot();if(!root)return 0;
  /* база выросла — корневой запрос отдаёт 413 (Request Entity Too Large):
     запоминаем и больше не тратим трафик/время на гигантский запрос */
  if(window.__rootTooBig){try{return await cloudPoll()}catch(e2){return 0}}
  try{
    const r=await cloudFetch(root);
    if(!r.ok){
      cloudOK=false;cloudErr='сервер ответил '+r.status;
      if(r.status===413)window.__rootTooBig=true;
      /* забираем мир по ключам, как в опросе */
      try{return await cloudPoll()}catch(e2){return 0}
    }
    const data=await r.json();
    cloudOK=true;cloudErr='';cloudLast=Date.now();
    if(!data||typeof data!=='object')return 0;
    window.__cloudRootData=data;
    let n=0;
    const vers=data[rtN(CVKEY)]||{};
    /* порядок важен: сначала аккаунты — по ним строится список личных узлов чатов */
    if(data[rtN(LS.acc)]!==undefined)mergeCloud(LS.acc,data[rtN(LS.acc)]);
    /* журнал: только свой личный узел, чужие журналы не читаем вовсе */
    if(me&&me.user&&!me.guest&&data[LVNODE(me.user)]!==undefined&&mergeLogs(data[LVNODE(me.user)]))n++;
    /* чаты: у каждого аккаунта свой узел; свой — прямое слияние, чужие — перевод перспективы */
    if(me&&me.user&&!me.guest){
      const accs=encLoad(LS.acc,{});
      const names=[me.user].concat(Object.keys(accs).filter(u=>u!==me.user));
      const vals=await Promise.all(names.map(u=>cloudFetch(root.slice(0,-5)+CHNODE(u)+'.json').then(r=>r.ok?r.json():null).catch(()=>null)));
      vals.forEach((v,i)=>{
        if(!v)return;
        if(names[i]===me.user){if(mergeChats(v,names[i]))n++;}
        else{const R=decEnv(v);if(R&&R[me.user]!==undefined){const one={};one[me.user]=R[me.user];if(mergeChats(one,names[i]))n++;}}
      });
    }
    Object.keys(data).forEach(rk=>{
      if(rk===rtN(CVKEY)||rk===CMMVER||/^oomy__mm/.test(rk)||/^oomy__chatsx_/.test(rk)||/^oomy__lv_/.test(rk)||rk.indexOf(rtN(LS.chats))===0||rk.indexOf(rtN(LS.logs))===0||/^oomy__(typing|online)_/.test(rk)||/^oomy__(games|roul|bin)(_|$)/.test(rk)||rk===rtN(LS.chats)||rk===rtN(CHOW)||rk===rtN(LS.logs))return;
      if(mergeCloud('oomy.'+rk.slice(6),data[rk]))n++;
    });
    /* большие медиа (видео): качаем файлы в indexeddb */
    await cloudBigPull(Object.keys(data).filter(rk=>/^oomy__mm/.test(rk)&&rk!==CMMVER).map(rk=>'oomy.'+rk.slice(6)));
    Object.keys(vers).forEach(rk=>{cloudKnownSet('oomy.'+rk.slice(6),vers[rk]||0);});
    return n;
  }catch(e){
    cloudOK=false;cloudErr=(e&&e.name==='AbortError')?'сервер не отвечает':String(e&&e.message||e);
    /* то же самое при сетевом сбое корневого запроса */
    try{return await cloudPoll()}catch(e2){return 0}
  }
}
/* первый запуск на этом устройстве: чего ещё нет в облаке — заливаем из локалки,
   чтобы подарки, музыка, посты и баланс сразу видели все аккаунты */
let cloudSeedDone=false;
function cloudSeedMissing(){
  if(cloudSeedDone)return;
  cloudSeedDone=true;
  try{
    const data=window.__cloudRootData;if(!data)return;
    const keys=[];
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(!k||k.indexOf('oomy.')!==0)continue;
      if(k===LS.sess||cloudExclKey(k)||cloudNoMergeKey(k))continue;
      keys.push(k);
    }
    keys.forEach(k=>{
      if(data[rtN(k)]===undefined){try{cloudPush(k)}catch(e){}}
    });
    /* медиа: локальные фото могли появиться раньше облака — докидываем недостающие */
    try{
      const mv=data[rtN(LS.media)];
      let remote={};
      if(mv){const p=typeof mv==='string'?JSON.parse(mv):mv;const d=decEnv(p);remote=(d&&typeof d==='object')?d:(p&&typeof p==='object'?p:{});}
      const local=load(LS.media,{});
      if(Object.keys(local).some(id=>remote[id]===undefined))cloudPush(LS.media);
    }catch(e){}
  }catch(e){}
}
/* --- лёгкая проверка «что изменилось» по карте версий --- */
async function cloudPoll(){
  const root=cloudRoot();if(!root)return 0;
  const vurl=root.slice(0,-5)+rtN(CVKEY)+'.json';
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
      if(/^oomy__chatsx_/.test(rk))return; /* личные узлы чатов разбираются отдельно */
      if(/^oomy__lv_/.test(rk))return; /* личные журналы тоже разбираются отдельно */
      if(/^oomy__mm/.test(rk))return; /* старые штампы медиа переехали в отдельный лёгкий узел */
      if(/^oomy__(typing|online)_/.test(rk))return; /* «печатает»/«онлайн» живут в памяти */
      if(/^oomy__(games|roul)(_|$)/.test(rk))return; /* шпилки и рулетка синхронизируются сами */
      if((vers[rk]||0)>(kn[k]||0))changed.push(k);
    });
    /* медиа: штампы в лёгком узле — качаем только изменившиеся файлы */
    let mmKeys=[];
    try{
      const rv=await cloudFetch(root.slice(0,-5)+CMMVER+'.json');
      if(rv.ok){
        const mv=await rv.json();
        if(mv&&typeof mv==='object'){
          Object.keys(mv).forEach(rk=>{
            const ck='oomy.'+rk.slice(6);
            if((mv[rk]||0)>(kn[ck]||0))mmKeys.push(ck);
            cloudKnownSet(ck,mv[rk]||0);
          });
        }
      }
    }catch(e){}
    if(changed.includes(LS.tomb)&&!changed.includes(LS.posts))changed.push(LS.posts);
    /* чаты и логи проверяем всегда, даже если штамп «не изменился»: у друга могли быть
       сдвинуты часы — его сообщение со старым штампом больше никогда не заметили бы.
       mergeChats/mergeLogs объединяют по id, петли синхронизации нет */
    if(me&&me.user&&!me.guest&&!changed.includes(LS.chats))changed.push(LS.chats);
    if(me&&me.user&&!me.guest&&!changed.includes(LS.logs))changed.push(LS.logs);
    if(!changed.length&&!mmKeys.length)return 0;
    /* логи, чаты (личные узлы аккаунтов) и большие медиа — по своей дороге, остальное — общий путь */
    const logsIdx=changed.indexOf(LS.logs);
    changed.splice(0,changed.length, ...changed.filter(k=>k!==LS.chats&&k!==LS.logs&&!/^oomy\.mm/.test(k)&&k!==CHOW));
    let n=0;
    if(me&&me.user&&!me.guest){
      try{
        /* свой узел — всегда (гарантия доставки), чужие — только открытый чат
           и те, у кого реально сменился штамп. раньше опрашивались ВСЕ котики
           каждый тик — на аккаунтах это были десятки запросов каждые 1.5 секунды */
        const accs=encLoad(LS.acc,{});
        const picks=[me.user].concat(Object.keys(accs).filter(u=>{
          if(u===me.user)return false;
          const rk=CHNODE(u);
          return openChatName===u||(vers[rk]||0)>(kn[rk]||0);
        }));
        const vals=await Promise.all(picks.map(u=>cloudFetch(root.slice(0,-5)+CHNODE(u)+'.json').then(r=>r.ok?r.json():null).catch(()=>null)));
        /* из чужого узла берём только переписку со мной — чужие диалоги не наше дело */
        vals.forEach((v,i)=>{
          const u=picks[i];
          if(u!==me.user)cloudKnownSet(CHNODE(u),vers[CHNODE(u)]||Date.now());
          if(!v)return;
          if(u===me.user){if(mergeChats(v,u))n++;}
          else{
            const R=decEnv(v);if(!R||typeof R!=='object')return;
            if(R[me.user]!==undefined){const one={};one[me.user]=R[me.user];if(mergeChats(one,u))n++;}
          }
        });
      }catch(e){}
      /* «печатает»: узел только открытого чата (живой поток чата и так слушает его сам) */
      try{
        if(openChatName&&openChatName!==me.user){
          const u=openChatName;
          cloudFetch(root.slice(0,-5)+TYPING_NODE(u)+'.json').then(r=>r.ok?r.json():null).then(v=>{
            if(v&&v[me.user])TYPING[u]=v;else delete TYPING[u];
            try{updateTypingUI(u);}catch(e){}
          }).catch(()=>{});
        }
      }catch(e){}
    }
    if(me&&me.user&&!me.guest){
      try{
        /* свой журнал тянем всегда: у друга могли сбиться часы */
        const ln=LVNODE(me.user);
        const r=await cloudFetch(root.slice(0,-5)+ln+'.json');
        if(r.ok){if(mergeLogs(await r.json()))n++;cloudKnownSet('oomy.'+ln.slice(6),vers[ln]||0);}
      }catch(e){}
    }
    await cloudBigPull(mmKeys);
    await Promise.all(changed.map(async k=>{
      try{
        const r2=await cloudFetch(root.slice(0,-5)+rtN(k)+'.json');
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
  if(k===LS.media){cloudBigPush();scheduleMediaCompact();}
  clearTimeout(cloudPushT[k]);
  cloudPushT[k]=setTimeout(()=>{
    const root=cloudRoot();if(!root)return;
    let v;try{v=localStorage.getItem(k)}catch(e){return}
    if(v===null)return;
    if(v.length>13e6){cloudErr='ключ '+k+' слишком большой для облака';return;}
    const stamp=Date.now();
    cloudKnownSet(k,stamp);
    /* ВАЖНО: PATCH в firebase заменяет указанный узел целиком, поэтому штамп едет
       отдельным точечным PATCH по листу vers — иначе каждый push затирал карту версий
       и чужие изменения переставали замечаться.
       И ещё: у части сетей корневой PATCH целиком блокируется — поэтому данные едут
       точечными запросами к каждому листу (тот же результат, но проходит везде) */
    const jobs=[];
    const put=(name,val)=>jobs.push(cloudFetch(root.slice(0,-5)+name+'.json',{method:'PUT',body:val}));
    /* чаты — в личный узел аккаунта: переписки разных аккаунтов больше не затирают друг друга */
    let versBody;
    if(k===LS.chats||isChatKey(k)){
      if(!me||!me.user){clearTimeout(cloudPushT[k]);return;}
      put(CHNODE(me.user),v);
      versBody={};versBody[CHNODE(me.user)]=stamp;
    }else if(isLogKey(k)){
      /* у каждого ника свой узел журнала — логи не пересекаются */
      const owner=k.slice(LS.logs.length+2);
      if(!owner||owner==='—'){clearTimeout(cloudPushT[k]);return;}
      const node=LVNODE(owner);
      put(node,v);
      versBody={};versBody[node]=stamp;
    }else{
      put(rtN(k),v);
      versBody={};versBody[rtN(k)]=stamp;
    }
    jobs.push(cloudFetch(root.slice(0,-5)+rtN(CVKEY)+'.json',{method:'PATCH',body:JSON.stringify(versBody)}));
    Promise.all(jobs).then(rs=>{
      if(rs.every(r=>r.ok)){cloudOK=true;cloudErr='';cloudLast=Date.now();}else{cloudOK=false;cloudErr='сервер ответил '+rs.map(r=>r.status).join('/');}
      try{cloudChip()}catch(e){}
    }).catch(e=>{cloudOK=false;cloudErr=(e&&e.name==='AbortError')?'сервер не отвечает':String(e&&e.message||e);try{cloudChip()}catch(e2){}});
  },700);
}
/* --- надгробие для удалённых записей --- */
function tombKind(kind){return String(kind||'').replace(/[.#$\[\]\/]/g,'_');}
function tombKey(kind,id){return tombKind(kind)+'~'+id;}
function tombAdd(kind,id){const t=load(LS.tomb,{});t[tombKey(kind,id)]=Date.now();save(LS.tomb,t);}
/* надгробия сильнее всего: удалённое (админом или вручную) не возвращается ни из облака,
   ни из снимка мира. с подарком уходит и всё связанное: копии из сумок, лоты барахолки,
   история передач; с музыкой — сам трек. */
function sweepTombstones(){
  try{
    const tb=load(LS.tomb,{})||{};
    const dead=(kind,id)=>id!==undefined&&tb[tombKey(kind,id)]!==undefined;
    const cat=load(LS.catalog,null);
    if(Array.isArray(cat)){
      const n=cat.filter(g=>!(g&&dead(LS.catalog,g.id)));
      if(n.length!==cat.length)save(LS.catalog,n);
    }
    const g=load(LS.gifts,null);
    if(g&&typeof g==='object'&&!Array.isArray(g)){
      let ch=false;
      Object.keys(g).forEach(u=>{
        if(!Array.isArray(g[u]))return;
        const keep=g[u].filter(it=>!(it&&it.gid&&dead(LS.catalog,it.gid)));
        if(keep.length!==g[u].length){g[u]=keep;ch=true;}
      });
      if(ch)save(LS.gifts,g);
    }
    const mkt=load(LS.mkt,null);
    if(Array.isArray(mkt)){
      const n=mkt.filter(x=>!(x&&x.gid&&dead(LS.catalog,x.gid)));
      if(n.length!==mkt.length)save(LS.mkt,n);
    }
    const chn=load(LS.giftChain,null);
    if(chn&&typeof chn==='object'&&!Array.isArray(chn)){
      let ch=false;
      Object.keys(chn).forEach(gid=>{if(dead(LS.catalog,gid)){delete chn[gid];ch=true;}});
      if(ch)save(LS.giftChain,chn);
    }
    const tr=load(LS.tracks,null);
    if(Array.isArray(tr)){
      const n=tr.filter(t=>!(t&&dead(LS.tracks,t.id)));
      if(n.length!==tr.length)save(LS.tracks,n);
    }
  }catch(e){}
}
/* старые надгробия хранили ключ со слешем или точкой — firebase такие не принимает */
function tombFix(){try{const t=load(LS.tomb,{});let ch=false;Object.keys(t).forEach(k=>{const nk=k.replace(/[.#$\[\]\/]/g,'_');if(nk!==k){t[nk]=t[nk]||t[k];delete t[k];ch=true;}});if(ch)save(LS.tomb,t);}catch(e){}}
/* карта медиа должна оставаться лёгкой: иначе облако её не примет и фото «пропадут» у других.
   когда base64-мусора набирается много, самые тяжёлые файлы уезжают в indexeddb + облачные копии */
let mediaCompactT=null;
function scheduleMediaCompact(){
  clearTimeout(mediaCompactT);
  mediaCompactT=setTimeout(()=>{try{compactMedia()}catch(e){}},900);
}
async function compactMedia(){
  try{
    const m=load(LS.media,{});
    let size=0;try{size=JSON.stringify(m).length}catch(e){return}
    if(size<8e6)return;
    const ids=Object.keys(m).filter(id=>typeof m[id]==='string'&&m[id].indexOf('data:')===0&&m[id].length>2e5);
    ids.sort((a,b)=>m[b].length-m[a].length);
    let moved=0;
    for(const id of ids){
      if(JSON.stringify(m).length<6e6)break;
      try{
        const blob=await (await fetch(m[id])).blob();
        const key='media:'+id;
        await IDB.put(key,blob);
        const kind=m[id].indexOf('data:video')===0?'vid':(m[id].indexOf('data:audio')===0?'aud':'img');
        m[id]={idb:key,kind};
        moved++;
        try{binPut(id,blob)}catch(e){}
      }catch(e){}
    }
    if(moved){
      try{localStorage.setItem(LS.media,JSON.stringify(m))}catch(e){}
      try{cloudPush(LS.media)}catch(e){}
      try{cloudBigPush()}catch(e){}
      try{preloadIdbMedia()}catch(e){}
    }
  }catch(e){}
}
/* старые тяжёлые медиа (больше 2.7МБ в base64) переезжают в indexeddb: localStorage не резиновый,
   и облачная карта медиа должна быть лёгкой */
async function migrateMedia(){
  try{
    const m=load(LS.media,{});
    const ids=Object.keys(m).filter(id=>typeof m[id]==='string'&&m[id].length>27e5&&!m[id].startsWith('blob:'));
    if(!ids.length)return;
    for(const id of ids){
      try{
        const blob=await (await fetch(m[id])).blob();
        const key='media:'+Date.now().toString(36)+Math.floor(Math.random()*999);
        await IDB.put(key,blob);
        m[id]={idb:key,kind:m[id].indexOf('data:video')===0?'vid':'img'};
      }catch(e){}
    }
    try{localStorage.setItem(LS.media,JSON.stringify(m))}catch(e){return}
    try{cloudPush(LS.media)}catch(e){}
  }catch(e){}
}
/* --- личные сообщения: чаты хранятся «от лица» устройства (who: me/them, ключ = собеседник) и в шифрованном конверте.
       чужой ключ chatsX с сервера — это ЧУЖАЯ перспектива: переводим её в свою, иначе
       сообщения друга падают в невидимый ключ и «не доходят» --- */
function decEnv(raw){
  try{
    const e=(typeof raw==='string')?JSON.parse(raw):raw;
    if(e&&e.v===2&&typeof e.d==='string'){
      const bin=atob(e.d);
      const bytes=new Uint8Array(bin.length);
      for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i)^(XKEY.charCodeAt(i%XKEY.length)%256);
      return JSON.parse(new TextDecoder().decode(bytes));
    }
    /* уже расшифрованный объект (например, собранный из чужого узла чата)
       тоже принимаем: иначе перевод перспективы молча не срабатывал */
    if(e&&typeof e==='object')return e;
  }catch(e){}
  return null;
}
function mergeChats(remoteRaw,owner){
  if(!owner||typeof owner!=='string')return false;
  const R=decEnv(remoteRaw);
  if(!R||typeof R!=='object')return false;
  const my=me&&me.user?me.user:null;
  if(!my)return false;
  const cur=chatsData();
  let changed=false;
  const freshThem=[]; /* новые входящие — для всплывающих уведомлений */
  const put=(pal,list)=>{
    /* удалённое (у себя или у обоих) не возвращаем даже из облака */
    const vis=chatVisibleList(pal,list);
    const a=chatVisibleList(pal,cur[pal]||[]);
    if(me&&!me.guest&&pal!==SELF.n){
      vis.forEach(m=>{
        if(m&&m.who==='them'&&m.id&&!a.some(x=>String(x.id)===String(m.id)))freshThem.push({pal,m});
      });
    }
    const m=unionById(a,vis);
    if(JSON.stringify(m)!==JSON.stringify(a)){cur[pal]=m;changed=true;}
  };
  if(owner===my){
    /* тот же аккаунт: перспектива совпадает, сливаем как есть */
    Object.keys(R).forEach(pal=>put(pal,R[pal]||[]));
  }else{
    /* чужой аккаунт: его чат со мной лежит у него под моим ником.
       переводим: ключ → его ник, «его моё» → them, «его чужое» → me */
    Object.keys(R).forEach(pal=>{
      if(pal!==my)return;
      const flipped=(R[pal]||[]).map(msg=>Object.assign({},msg,{who:msg.who==='me'?'them':'me'}));
      put(owner,flipped);
    });
  }
  if(!changed)return false;
  chatsSave(cur);
  /* входящие мяу: всплывающая плашка + галочки прочтения */
  freshThem.forEach(x=>notifyIncoming(x.pal,x.m));
  return true;
}
/* --- прочитано/не прочитано: отметки живут в моём профиле (msgRead),
   поэтому друг видит ✓✓ на своих сообщениях, когда я открыл диалог --- */
function msgTs(m){
  const n=parseInt(String((m&&m.id)||'').slice(0,13),10);
  return n>=1e12?n:0;
}
function dialogReadTs(pal){
  if(me&&!me.guest){const mr=prof().msgRead||{};if(mr[pal])return mr[pal];}
  return load(LS.chatRead,[]).includes(pal)?Infinity:0;
}
function unreadCount(pal){
  const c=chatMsgs(pal);
  const rt=dialogReadTs(pal);
  return c.filter(m=>m.who==='them'&&msgTs(m)>rt).length;
}
function markDialogRead(pal){
  if(!me||!pal)return;
  const now=Date.now();
  if(me.guest){
    /* гостю профиль не пишем — старая отметка прочитанного */
    const rg=load(LS.chatRead,[]);
    if(!rg.includes(pal)){rg.push(pal);save(LS.chatRead,rg);}
    syncBadges();
    return;
  }
  const p=prof();const mr=p.msgRead||{};
  if(mr[pal]!==now){mr[pal]=now;p.msgRead=mr;saveProf(p);}
  const read=load(LS.chatRead,[]); /* совместимость со старой отметкой */
  if(!read.includes(pal)){read.push(pal);save(LS.chatRead,read);}
  syncBadges();
}
/* кто прочитал МОИ сообщения: отметка из профиля собеседника */
function peerReadMyTs(pal){
  if(pal===SELF.n)return Infinity;
  if(!me||me.guest)return 0;
  const p=profOf(pal)||{};
  return (p.msgRead||{})[me.user]||0;
}
/* превью сообщения для списка диалогов и плашек */
function msgPreview(m,len){
  len=len||40;
  let t='';
  if(m.att){
    const k=m.att.kind;
    if(k==='gift')t=(m.t?' ':'')+'🎁 подарочек';
    else if(k==='oon')t=(m.t?' ':'')+'🪙 оонетки';
    else t+=(m.t?' ':'')+(k==='img'||k==='image'?'📷 фото':k==='vid'?'🎬 видео':k==='track'?'🎵 трек':'📎 файл');
  }
  if(m.t)t=(t?t+' ':'')+m.t;
  return (t||'вложение').slice(0,len);
}
/* всплывающая плашка нового сообщения — как уведомление */
let msgPopSeen={};
function notifyIncoming(pal,m){
  try{
    if(!me||me.guest||!pal||pal===SELF.n)return;
    if(!m||m.who!=='them'||!m.id)return;
    if(msgPopSeen[m.id])return;
    msgPopSeen[m.id]=1;
    if(openChatName===pal){
      /* диалог открыт — считаем прочитанным сразу */
      markDialogRead(pal);
      if(window.__PG==='msgs')refreshChatTicks(pal);
      return;
    }
    const ts=msgTs(m);
    if(ts&&Date.now()-ts>120000)return; /* старьё при первой синке не всплывает */
    syncBadges();
    showMsgPop(pal,m);
    pushNotif(me.user,'💬','сообщение от @'+pal+': '+msgPreview(m,60),{av:pal});
  }catch(e){}
}
function showMsgPop(pal,m){
  let host=document.getElementById('msgPops');
  if(!host){host=document.createElement('div');host.id='msgPops';document.body.appendChild(host);}
  while(host.children.length>3)host.firstChild.remove();
  const acc=encLoad(LS.acc,{})[pal]||{};
  const card=document.createElement('div');
  card.className='msg-pop';
  card.innerHTML=`<div class="ava" style="width:40px;height:40px;font-size:20px;flex:none">${avaHTML(pal,acc.ava||'🐈')}</div>
    <div style="min-width:0;flex:1"><div class="msg-pop-name">${esc(pal)}${badgeFor(pal)}<span class="msg-pop-lab">личны сообще</span></div>
    <div class="msg-pop-txt">${esc(msgPreview(m,80))}</div></div>
    <button class="msg-pop-x" title="закрыть">✕</button>`;
  card.querySelector('.msg-pop-x').onclick=e=>{e.stopPropagation();card.remove();};
  card.onclick=()=>{card.remove();go('msgs');openChat(pal);};
  host.appendChild(card);
  setTimeout(()=>{card.classList.add('out');setTimeout(()=>card.remove(),380);},7000);
}
/* обновить галочки «прочитано» в открытом чате, не перерисовывая его */
function refreshChatTicks(name){
  const mBox=document.querySelector('#pg-msgs #chatMsgs');if(!mBox)return;
  const msgs=chatsData()[name]||[];
  const seen=peerReadMyTs(name);
  mBox.querySelectorAll('.msg-row').forEach((el,i)=>{
    const m=msgs[i];
    if(!m||m.who!=='me')return;
    const ck=el.querySelector('.bt-ck');
    if(ck)ck.textContent=msgTs(m)<=seen?'✓✓':'✓';
  });
}
/* --- большие медиа (видео до 10МБ): байты живут в indexeddb, в облако уезжает dataURL отдельным ключом oomy.mm<id> --- */
function cloudBigPush(){
  const root=cloudRoot();if(!root)return;
  const m=load(LS.media,{});
  Object.keys(m).forEach(id=>{
    const e=m[id];
    if(!e||typeof e!=='object'||!e.idb)return;
    const ck='oomy.mm'+id;
    clearTimeout(cloudPushT[ck]);
    cloudPushT[ck]=setTimeout(async()=>{
      const root2=cloudRoot();if(!root2)return;
      try{
        const blob=await IDB.get(e.idb);
        if(!blob)return;
        const data=await new Promise(res=>{const r=new FileReader();r.onload=()=>res(r.result);r.readAsDataURL(blob)});
        if(!data||data.length>15.5e6){cloudErr='файл '+id+' слишком большой даже для облака';return;}
        const stamp=Date.now();
        const versBody={};versBody[rtN(ck)]=stamp;
        cloudKnownSet(ck,stamp);
        /* точечный PUT к листу: корневой PATCH у части сетей блокируется.
           штампы медиа пишем в отдельный лёгкий узел — общую карту версий не раздуваем */
        const rs=await Promise.all([
          cloudFetch(root2.slice(0,-5)+rtN(ck)+'.json',{method:'PUT',body:JSON.stringify(data)}),
          cloudFetch(root2.slice(0,-5)+CMMVER+'.json',{method:'PATCH',body:JSON.stringify(versBody)})
        ]);
        if(rs.every(r=>r.ok)){cloudOK=true;cloudErr='';cloudLast=Date.now();try{cloudChip()}catch(e2){}}
      }catch(e){}
    },1500);
  });
}
async function cloudBigPull(keys){
  if(!keys||!keys.length)return;
  const root=cloudRoot();if(!root)return;
  let did=false;
  await Promise.all(keys.map(async ck=>{
    try{
      const r=await cloudFetch(root.slice(0,-5)+rtN(ck)+'.json');
      if(!r.ok)return;
      const data=await r.json();
      if(!data||typeof data!=='string')return;
      const id=ck.slice('oomy.mm'.length);
      const e=load(LS.media,{})[id];
      if(!e||typeof e!=='object'||!e.idb)return;
      const blob=await (await fetch(data)).blob();
      await IDB.put(e.idb,blob);
      did=true;
    }catch(e){}
  }));
  if(did){try{cloudRefresh()}catch(e){}}
}
/* --- обновить экран, когда с сервера что-то пришло или медиа догрузились из indexeddb --- */
function cloudRefresh(){
  try{cloudChip()}catch(e){}
  try{healWorld()}catch(e){}
  try{
    if(!me||!window.__PG)return;
    if(document.hidden)return; /* свёрнутая вкладка не дёргает страницу */
    const ae=document.activeElement;
    if(ae&&/INPUT|TEXTAREA/.test(ae.tagName)){
      /* набор не прерываем, но открытый чат всё равно досыпаем — сообщения приходят при наборе */
      if(window.__PG==='msgs'&&openChatName){chatLightSync(openChatName);syncBadges();}
      return;
    }
    /* запоминаем прокрутку и позицию открытого окна — перерисовка не должна «прыгать» */
    const sy=window.scrollY||document.documentElement.scrollTop||0;
    const feedScroll=(()=>{const p=document.getElementById('posts');return p?p.scrollTop:0;})();
    if(['feed','home','notifs','bm','friends','groups','sound','gifts'].includes(window.__PG)){buildPage(window.__PG);syncBadges();}
    else if(window.__PG==='user'){
      /* чужая/своя страница тоже обновляется сама: новые посты, аватарка, подарки */
      renderUserPage();
      wireBannerDrag(document.getElementById('pg-user'),window.__viewUser||me.user);
      syncBadges();
    }
    else if(window.__PG==='msgs'){
      if(openChatName){/* открытый чат обновляется лёгкой досыпкой пузырей — без перерисовки и мигания */
        chatLightSync(openChatName);
      }else renderChats();
      syncBadges();
    }
    /* возвращаем прокрутку туда, где человек читал */
    try{
      const p2=document.getElementById('posts');
      if(p2&&feedScroll)p2.scrollTop=feedScroll;
      if(sy)window.scrollTo(0,sy);
    }catch(e){}
    /* фон страницы мог догрузиться из indexeddb — ставим заново */
    if(window.__PG==='user')applyPageBg(window.__viewUser||me.user);
    else if(me&&me.user)applyPageBg(me.user);
  }catch(e){}
}
function pollDelay(){
  /* в открытом чате опрашиваем почти мгновенно — сообщения приходят сразу */
  if(window.__PG==='msgs'&&openChatName)return 1500;
  if(window.__PG==='feed')return 5000;
  return 8000;
}
function cloudStart(){
  if(!cloudEnabled()){if(cloudTimer){clearTimeout(cloudTimer);cloudTimer=null;}return;}
  if(cloudTimer)clearTimeout(cloudTimer);
  cloudFails=0;
  cloudPullAll().then(n=>{try{cloudChip()}catch(e){}try{cloudSeedMissing()}catch(e){}if(n)cloudRefresh();try{checkAllCollections()}catch(e){}try{refreshChips()}catch(e){}});
  const tick=async()=>{
    cloudTimer=null;
    if(document.hidden){cloudTimer=setTimeout(tick,3000);return;}
    try{
      const n=await cloudPoll();
      if(n)cloudRefresh();
      /* связь вернулась — отступ сбрасываем, опрашиваем как обычно */
      if(cloudOK)cloudFails=0;
      else cloudFails++;
    }catch(e){cloudFails++;}
    try{cloudChip()}catch(e){}
    /* при сбоях не долбим сервер: пауза растёт до минуты, потом повтор */
    let d=pollDelay();
    if(!cloudOK&&cloudFails>0)d=Math.min(60000,d*Math.min(8,Math.pow(2,cloudFails)));
    cloudTimer=setTimeout(tick,d);
  };
  cloudTimer=setTimeout(tick,pollDelay());
  if(!cloudVisHook){
    cloudVisHook=true;
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden||cloudTimer===null&&!cloudPolling)return;
      if(document.hidden)return;
      cloudPoll().then(n=>{try{cloudChip()}catch(e){}if(n)cloudRefresh();});
    });
    /* интернет пропал и вернулся — сразу тянем мир, не ждём ближайшего тика */
    window.addEventListener('online',()=>{
      cloudFails=0;
      cloudPullAll().then(n=>{try{cloudChip()}catch(e){}if(n)cloudRefresh();}).catch(()=>{});
      if(cloudTimer){clearTimeout(cloudTimer);cloudTimer=null;}
      cloudTimer=setTimeout(tick,pollDelay());
    });
  }
}
function cloudRestart(){
  if(cloudTimer){clearTimeout(cloudTimer);cloudTimer=null;}
  cloudKnown=null;
  try{localStorage.removeItem('oomy.versKnown')}catch(e){}
  /* плашка гаснет сразу, даже когда облако только что выключили */
  try{cloudChip()}catch(e){}
  cloudStart();
}
function copyText(t){
  const fb=()=>{const ta=document.createElement('textarea');ta.value=t;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy')}catch(e){}ta.remove();};
  try{if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t).catch(fb);else fb();}catch(e){fb();}
}
cloudReady=true;
/* --- браузер не должен подсовывать логины/пароли в поиск и прочие поля --- */
/* ---- защита от автозаполнения: браузер не должен подставлять чужие логины и пароли ---- */
const AF_SKIP=/^(checkbox|radio|file|range|color|hidden|submit|button|image|reset)$/i;
function afRand(){return 'nf'+Math.random().toString(36).slice(2,9)}
function afMarkTouched(el){try{el.dataset.afTouched='1';}catch(e){}}
function afLock(el){
  if(!el||el.dataset.afLocked)return;
  try{el.dataset.afLocked='1';}catch(e){return}
  /* если поле уже в фокусе — не блокируем ввод посреди набора */
  if(el===document.activeElement)return;
  el.readOnly=true;
  /* слушатели вешаем всегда: поле могло быть readonly ещё до вызова */
  const unlock=()=>{try{el.readOnly=false;}catch(e){}};
  el.addEventListener('focus',unlock,{once:true});
  el.addEventListener('pointerdown',unlock,{once:true});
  el.addEventListener('keydown',unlock,{once:true});
}
function killAutofillOne(el){
  if(!el||el.tagName!=='INPUT')return;
  const t=String(el.type||'text').toLowerCase();
  if(AF_SKIP.test(t))return;
  el.setAttribute('autocomplete',t==='password'?'new-password':'off');
  el.setAttribute('autocapitalize','off');
  el.setAttribute('autocorrect','off');
  el.setAttribute('spellcheck','false');
  el.setAttribute('data-lpignore','true');
  el.setAttribute('data-1p-ignore','');
  el.setAttribute('data-bwignore','true');
  el.setAttribute('data-form-type','other');
  el.setAttribute('aria-autocomplete','none');
  /* бессмысленное имя: по нему браузер не узнаёт поле логина/пароля */
  const nm=String(el.getAttribute('name')||'');
  if(!/^nf/.test(nm))el.setAttribute('name',afRand());
  /* readonly до первого касания: Chrome/Edge не подставляют сохранённое */
  if((t==='password'||/^(li|r)-(user|pass|pass2|secret)$/.test(el.id||''))&&!el.dataset.afTouched)afLock(el);
  if(!el.dataset.afHooked){
    try{el.dataset.afHooked='1';}catch(e){}
    el.addEventListener('input',()=>afMarkTouched(el),true);
    el.addEventListener('change',()=>afMarkTouched(el),true);
    el.addEventListener('keydown',()=>afMarkTouched(el),true);
  }
}
function killAutofill(){
  try{
    document.querySelectorAll('input').forEach(killAutofillOne);
    document.querySelectorAll('form').forEach(f=>{
      f.setAttribute('autocomplete','off');
      f.setAttribute('data-form-type','other');
      f.setAttribute('data-lpignore','true');
      f.setAttribute('data-1p-ignore','');
    });
  }catch(e){}
}
/* Chrome иногда вставляет логин/пароль уже после загрузки — подчищаем, пока человек не начал печатать */
function scrubAutofilled(){
  try{
    document.querySelectorAll('input[type=password],#li-user,#r-user,#r-secret').forEach(el=>{
      if(!el.dataset.afTouched&&el.value)el.value='';
    });
  }catch(e){}
}
/* после выхода снова закрываем поля от автозаполнения */
function afReset(){
  ['li-user','li-pass','r-user','r-pass','r-pass2','r-secret'].forEach(id=>{
    const el=document.getElementById(id);
    if(!el)return;
    try{delete el.dataset.afTouched;delete el.dataset.afLocked;el.readOnly=false;}catch(e){}
    afLock(el);
  });
}
document.addEventListener('focusin',e=>{try{killAutofillOne(e.target);}catch(err){}},true);
try{new MutationObserver(muts=>{muts.forEach(m=>m.addedNodes&&m.addedNodes.forEach(n=>{if(n.nodeType===1){if(n.tagName==='INPUT')killAutofillOne(n);else if(n.querySelectorAll)n.querySelectorAll('input').forEach(killAutofillOne);}}));}).observe(document.documentElement,{childList:true,subtree:true});}catch(e){}
try{
  setTimeout(killAutofill,30);setTimeout(killAutofill,300);setTimeout(killAutofill,1200);
  setTimeout(scrubAutofilled,150);setTimeout(scrubAutofilled,700);setTimeout(scrubAutofilled,1800);
}catch(e){}
function toast(msg){
  const box=document.getElementById('toast');
  if(!box)return;
  const t=document.createElement('div');t.className='toast-item';t.textContent=msg;
  box.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';t.style.transition='opacity .3s';setTimeout(()=>t.remove(),320);},10000);
  while(box.children.length>6)box.firstChild.remove();
}
function encDecode(raw){
  if(raw&&raw.v===2&&typeof raw.d==='string'){
    try{
      const bin=atob(raw.d);
      const bytes=new Uint8Array(bin.length);
      for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i)^(XKEY.charCodeAt(i%XKEY.length)%256);
      return JSON.parse(new TextDecoder().decode(bytes));
    }catch(e){return null}
  }
  return raw;
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
  const v=encDecode(raw);
  return (v===null||v===undefined)?dflt:v;
}
const now=()=>new Date().toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
function timeAgo(ts){const s=Math.floor((Date.now()-ts)/1000);if(s<60)return 'только что';if(s<3600)return Math.floor(s/60)+' мин назад';if(s<86400)return Math.floor(s/3600)+' ч назад';return new Date(ts).toLocaleDateString('ru-RU',{day:'numeric',month:'short'})}
/* реальное время публикации: берём ts, а у старых записей — числовой id (это Date.now) */
function postTs(p){
  if(!p)return 0;
  let t=Number(p.ts)||0;
  if(!t){const id=Number(p.id);if(id>1e12)t=id;}
  if(!t&&p.time&&/^\d{4}-\d{2}-\d{2}T/.test(p.time)){const t2=Date.parse(p.time);if(t2)t=t2;}
  return t||0;
}
const _MON_SHORT=['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
function fmtPostTime(ts){
  if(!ts)return '';
  const d=new Date(ts),n=new Date();
  if(d.getFullYear()!==n.getFullYear()&&isNaN(d.getFullYear()))return '';
  const pad=x=>String(x).padStart(2,'0'),hm=pad(d.getHours())+':'+pad(d.getMinutes());
  const same=(a,b)=>a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();
  const y=new Date(n);y.setDate(n.getDate()-1);
  const diff=Date.now()-ts;
  if(diff>=0&&diff<60000)return 'только что';
  if(same(d,n))return 'сегодня в '+hm;
  if(same(d,y))return 'вчера в '+hm;
  if(d.getFullYear()===n.getFullYear())return d.getDate()+' '+_MON_SHORT[d.getMonth()]+' в '+hm;
  return d.getDate()+' '+_MON_SHORT[d.getMonth()]+' '+d.getFullYear()+' в '+hm;
}
function postTimeHTML(p,cls){
  const ts=postTs(p);
  if(!ts)return '<div class="'+cls+'">'+(p&&p.time?esc(p.time):'')+'</div>';
  const full=new Date(ts).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  return '<div class="'+cls+'" title="'+esc(full)+'">'+fmtPostTime(ts)+'</div>';
}
function addLog(type,user,detail){
  /* у каждого аккаунта свой журнал: записи одного ника не попадают в чужой */
  const owner=user||(me&&me.user)||'—';
  const key=logKeyFor(owner);
  const logs=encLoad(key,[]);
  /* id обязателен: без него чужие логи с сервера затирали бы свои (свежее побеждает);
     с id логи с разных устройств объединяются в общий журнал */
  logs.unshift({id:Date.now()+''+Math.floor(Math.random()*999),t:new Date().toISOString(),shown:now(),type,user:owner,detail});
  logs.sort((x,y)=>String(y.t).localeCompare(String(x.t)));
  encSave(key,logs.slice(0,800));
}
/* разовая чистка: у @ymoo и @wwoo не должно остаться старой переписки и логов */
function cleanupYmooWwoo(){
  const mark='oomy.cleaned.ymoo2';
  try{if(localStorage.getItem(mark))return;}catch(e){return;}
  const off=['ymoo','wwoo'];
  const isOff=u=>{u=String(u||'');return off.some(x=>u.indexOf(x)===0);};
  try{
    const keys=[];
    for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k)keys.push(k);}
    keys.forEach(k=>{
      if(k===LS.chats||k.indexOf(LS.chats+'__')===0){
        const R=encLoad(k,null);
        if(!R||typeof R!=='object')return;
        let ch=false;Object.keys(R).forEach(u=>{if(isOff(u)){delete R[u];ch=true;}});
        if(ch)encSave(k,R);
      }
      if(k===LS.logs||k.indexOf(LS.logs+'__')===0){
        const R=encLoad(k,null);
        if(!Array.isArray(R))return;
        const f=R.filter(l=>!isOff(l&&l.user));
        if(f.length!==R.length)encSave(k,f);
      }
    });
    off.forEach(u=>{
      try{localStorage.removeItem(LS.chats+'__'+u);}catch(e){}
      try{localStorage.removeItem(logKeyFor(u));}catch(e){}
    });
  }catch(e){}
  try{localStorage.setItem(mark,'1')}catch(e){}
}
/* старый общий журнал разбираем по аккаунтам: каждый забирает только свои записи */
function logMigrate(){
  try{
    if(!me||me.guest||!me.user)return;
    if(localStorage.getItem(LS.logs)===null)return;
    const R=encLoad(LS.logs,[]);
    const by={};
    (Array.isArray(R)?R:[]).forEach(l=>{if(!l||!l.user)return;(by[l.user]=by[l.user]||[]).push(l);});
    /* каждый ник забирает из старого общего журнала только свои записи */
    Object.keys(by).forEach(u=>{
      const key=logKeyFor(u);
      const cur=encLoad(key,[]);
      const m=unionById(cur,by[u]);
      m.sort((x,y)=>String((y&&y.t)||'').localeCompare(String((x&&x.t)||'')));
      encSave(key,m.slice(0,800));
    });
    localStorage.removeItem(LS.logs);
  }catch(e){}
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

/* ============ НИК: ЦВЕТ, СИЯНИЕ, ЗНАЧКИ ============ */
/* 5 разных сияний + «без сияния». Цвет ника по умолчанию — белый, у всех одинаково */
const NICK_GLOWS=[
  {n:'без сияния',s:''},
  {n:'мягкое',s:'0 0 6px currentColor,0 0 14px currentColor'},
  {n:'неон',s:'0 0 4px currentColor,0 0 10px currentColor,0 0 22px currentColor'},
  {n:'пышное',s:'0 0 8px currentColor,0 0 18px currentColor,0 0 34px currentColor'},
  {n:'огонёк',s:'0 0 6px currentColor,0 0 14px #ff9a3d,0 0 26px #ff4d6d'},
  {n:'лёд',s:'0 0 6px currentColor,0 0 16px #6ee7ff,0 0 30px #7a6cff'}
];
function nickColorOf(u){const p=profOf(u)||{};const c=p.nickColor;return (c&&/^#[0-9a-f]{6}$/i.test(c))?c:'#ffffff'}
function nickGlowOf(u){const p=profOf(u)||{};const g=Math.max(0,Math.min(5,Number(p.nickGlow)||0));return NICK_GLOWS[g].s}
function nickStyle(u){
  const c=nickColorOf(u),g=nickGlowOf(u);
  return 'color:'+c+(g?';text-shadow:'+g.replace(/currentColor/g,c):'');
}
function nickHTML(u,label,extra){
  return '<span class="nk" data-gu="'+esc(u)+'" style="'+nickStyle(u)+(extra||'')+'">'+esc(label||u)+'</span>';
}
/* ---- значки: каталог у админа, выдача котикам, показ в нике и профиле ---- */
function badgesAll(){return load(LS.badges,[])}
function saveBadges(l){save(LS.badges,l)}
function badgeOwnAll(){return load(LS.badgeOwn,{})}
function badgeOwn(u){const o=badgeOwnAll();return Array.isArray(o[u])?o[u]:[]}
function badgeById(id){return badgesAll().find(b=>b.id===id)}
function badgeImgHTML(b,big){
  if(!b)return '';
  const cls='badge-chip'+(big?' big':'');
  const title=esc((b.name||'значок')+(b.hint?' — '+b.hint:''));
  const mu=b.mid?mediaURL(b.mid):null;
  const inner=mu
    ?(b.kind==='vid'?'<video src="'+mu+'" autoplay muted loop playsinline></video>':'<img src="'+mu+'" alt="">')
    :'<span class="badge-ico">🏅</span>';
  return '<span class="'+cls+'" title="'+title+'">'+inner+'</span>';
}
/* значки, которые человек решил показывать (по умолчанию — все выданные) */
function shownBadges(u){
  const p=profOf(u)||{};
  const own=badgeOwn(u);
  const list=Array.isArray(p.badges)?p.badges:own;
  return list.filter(id=>own.indexOf(id)>-1).map(badgeById).filter(Boolean);
}
function badgesNickHTML(u,limit){
  const list=shownBadges(u).slice(0,limit||5);
  if(!list.length)return '';
  return '<span class="nick-badges">'+list.map(b=>badgeImgHTML(b)).join('')+'</span>';
}
function badgesSectHTML(u){
  const all=badgeOwn(u).map(badgeById).filter(Boolean);
  if(!all.length)return '<div class="from-line" style="padding:4px 0">значков пока нет — их выдаёт администратор или дают за коллекцию подарков</div>';
  const shown=shownBadges(u).map(b=>b.id);
  return '<div class="badges-sect">'+all.map(b=>
    '<span class="badge-card" title="'+esc(b.hint||b.name||'')+'"'+(shown.indexOf(b.id)>-1?' style="border-color:color-mix(in srgb,var(--acc) 45%,var(--line))"':'')+'>'+
    badgeImgHTML(b,true)+'<b>'+esc(b.name||'значок')+'</b></span>').join('')+'</div>';
}
function grantBadge(u,bid,silent){
  if(!u||!bid)return false;
  const own=badgeOwnAll();own[u]=Array.isArray(own[u])?own[u]:[];
  if(own[u].indexOf(bid)>-1)return false;
  own[u].push(bid);save(LS.badgeOwn,own);
  const p=profOf(u)||{};p.badges=Array.isArray(p.badges)?p.badges:[];
  if(p.badges.indexOf(bid)<0)p.badges.push(bid);
  saveProfOf(u,p);
  try{refreshChips()}catch(e){}
  const b=badgeById(bid);
  if(!silent)toast('значок «'+((b&&b.name)||'')+'» выдан @'+u);
  try{if(!silent)pushNotif(u,'🏅','тебе выдан значок «'+((b&&b.name)||'')+'» — покажи его в профиле',{bid:bid});}catch(e){}
  return true;
}
function revokeBadge(u,bid){
  const own=badgeOwnAll();own[u]=(own[u]||[]).filter(x=>x!==bid);save(LS.badgeOwn,own);
  const p=profOf(u)||{};
  if(Array.isArray(p.badges))p.badges=p.badges.filter(x=>x!==bid);
  saveProfOf(u,p);
  try{refreshChips()}catch(e){}
  toast('значок снят у @'+u);
}
/* ---- коллекции: собрал нужные подарки — получил значок ---- */
function collsAll(){return load(LS.colls,[])||[]}
function saveColls(l){save(LS.colls,l)}
function hasAllGifts(u,gids){
  if(!Array.isArray(gids)||!gids.length)return false;
  const bag=bagOf(u);
  return gids.every(gid=>bag.some(x=>x.gid===gid));
}
function checkCollections(u){
  let got=0;
  (load(LS.colls,[])||[]).forEach(c=>{
    if(!c||!c.badgeId)return;
    if(hasAllGifts(u,c.gids)&&grantBadge(u,c.badgeId,true))got++;
  });
  return got;
}
function checkAllCollections(){
  let got=0;
  try{Object.keys(encLoad(LS.acc,{})).forEach(u=>{got+=checkCollections(u)});}catch(e){}
  return got;
}
/* ---- что играет у котика: видно у него в профиле возле ника ---- */
function nowPlayingOf(u){
  try{const m=load(LS.now,{})||{};const v=m[u];
    if(!v||!v.id)return null;
    if(Date.now()-(v.ts||0)>10*60*1000)return null;
    return v;
  }catch(e){return null}
}
function syncNowPlaying(on){
  if(!me||!me.user||me.guest)return;
  try{
    const map=load(LS.now,{})||{};
    if(on&&player&&player.currentId&&player.playing){
      const t=(tracksAll()||[]).find(x=>x.id===player.currentId);
      if(!t){delete map[me.user];save(LS.now,map);return;}
      map[me.user]={id:t.id,name:t.name,artist:t.artist||'',ts:Date.now()};
    }else delete map[me.user];
    save(LS.now,map);
  }catch(e){}
}


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
  const fin=id=>{addLog('media','—','файл сохранён ('+String(id).slice(0,10)+')');cb&&cb(id)};
  if(typeof fileOrData==='string'){const id=putMediaData(fileOrData);fin(id);return}
  /* файл больше 1.5МБ: живёт в indexeddb — localStorage не резиновый (лимит поднят до 5МБ) */
  if(fileOrData.size>1.5*1024*1024){
    (async()=>{
      const key='media:'+Date.now().toString(36)+Math.floor(Math.random()*999);
      try{
        await IDB.put(key,fileOrData);
      }catch(e){
        const r=new FileReader();r.onload=()=>{const id=putMediaData(r.result);if(id)fin(id)};r.readAsDataURL(fileOrData);return;
      }
      const m=load(LS.media,{});
      const id='m'+Date.now().toString(36)+Math.floor(Math.random()*999);
      const ft=String(fileOrData.type||'');
      m[id]={idb:key,kind:ft.indexOf('video')===0?'vid':(ft.indexOf('audio')===0?'aud':'img')};
      try{localStorage.setItem(LS.media,JSON.stringify(m))}catch(e){toast('не хватает места в браузере');return}
      try{loadIdbMedia(id,key)}catch(e){} /* сразу готовим адрес, чтобы фото не мигало */
      try{binPut(id,fileOrData)}catch(e){}
      try{cloudPush(LS.media)}catch(e){}
      fin(id);
    })();
    return;
  }
  const r=new FileReader();
  r.onload=()=>{const id=putMediaData(r.result);fin(id)};
  r.readAsDataURL(fileOrData);
}
function putMediaData(dataURL){
  const m=load(LS.media,{});
  const id='m'+Date.now().toString(36)+Math.floor(Math.random()*999);
  const kind=dataURL.indexOf('data:video')===0?'vid':(dataURL.indexOf('data:audio')===0?'aud':'img');
  try{
    m[id]=dataURL;
    localStorage.setItem(LS.media,JSON.stringify(m));
  }catch(e){
    /* localStorage переполнен: большие файлы уезжают в indexeddb, в карте остаётся ссылка.
       так фото/гиф до 5МБ больше не ругаются «файл слишком толстый» */
    delete m[id];
    (async()=>{
      try{
        const blob=await (await fetch(dataURL)).blob();
        const key='media:'+id;
        await IDB.put(key,blob);
        const m2=load(LS.media,{});
        m2[id]={idb:key,kind};
        localStorage.setItem(LS.media,JSON.stringify(m2));
        try{loadIdbMedia(id,key)}catch(e2){}
        try{binPut(id,blob)}catch(e2){}
        try{cloudPush(LS.media)}catch(e2){}
        try{cloudBigPush()}catch(e2){}
      }catch(e2){toast('файл не влез в браузер — попробуй файл поменьше (до 5МБ)');}
    })();
    return id;
  }
  try{cloudPush(LS.media)}catch(e){}
  return id;
}
/* адрес медиа: маленькие лежат в localStorage (мгновенно), большие качаются из indexeddb и открываются асинхронно */
const MEMURL={},MEMLOAD={},MEDIA_WAIT={},MEMFAIL={};
function mediaURL(id){
  if(!id)return null;
  if(MEMURL[id])return MEMURL[id];
  let e=null;
  try{const m=load(LS.media,{});e=m?m[id]:null}catch(e2){return null}
  if(!e){
    /* записи нет — возможно, она потерялась локально, но файл лежит в облаке: пробуем вернуть */
    const now=Date.now();
    if(!MEMFAIL[id]||now-MEMFAIL[id]>60000){
      MEMFAIL[id]=now;
      try{loadIdbMedia(id,'media:'+id)}catch(e2){}
    }
    return null;
  }
  if(typeof e==='object'&&e.idb){loadIdbMedia(id,e.idb);return null}
  return e;
}
function loadIdbMedia(id,key,cb){
  if(MEMURL[id]){try{cb&&cb(MEMURL[id])}catch(e){}return;}
  if(cb){(MEDIA_WAIT[id]=MEDIA_WAIT[id]||[]).push(cb);}
  if(MEMLOAD[id])return;
  MEMLOAD[id]=1;
  const flush=url=>{try{(MEDIA_WAIT[id]||[]).forEach(f=>{try{f(url)}catch(e){}});delete MEDIA_WAIT[id];}catch(e){}};
  const done=blob=>{
    if(!blob){MEMLOAD[id]=0;flush(null);return;}
    try{
      delete MEMFAIL[id];
      MEMURL[id]=URL.createObjectURL(blob);flush(MEMURL[id]);
      /* карта медиа могла потерять запись (обновление кода/чистка) — возвращаем её на место */
      try{
        const m=load(LS.media,{})||{};
        if(m[id]===undefined){
          const bt=String(blob.type||'');
          m[id]={idb:key||('media:'+id),kind:bt.indexOf('video')===0?'vid':(bt.indexOf('audio')===0?'aud':'img')};
          localStorage.setItem(LS.media,JSON.stringify(m));
          try{cloudPush(LS.media)}catch(e){}
        }
      }catch(e){}
      /* чат: пересобираем, чтобы видео/фото получили настоящий адрес; музыка — тоже */
      if(window.__PG==='msgs'&&openChatName)renderChat(openChatName);
      if(window.__PG==='feed'){try{renderStories();}catch(e){}}
      cloudRefresh();
    }catch(e){MEMLOAD[id]=0;}
  };
  IDB.get(key).then(b=>{
    if(b){done(b);return;}
    /* blob потерялся или загружен с другого устройства — берём копию из облака */
    binGet(id).then(b2=>{if(b2){try{IDB.put(key,b2)}catch(e){}done(b2);}else done(null);}).catch(()=>done(null));
  }).catch(()=>{binGet(id).then(b2=>{if(b2){try{IDB.put(key,b2)}catch(e){}done(b2);}else done(null);}).catch(()=>done(null));});
}
function blobToB64(b){return new Promise(res=>{try{const r=new FileReader();r.onload=()=>res(String(r.result).split(',')[1]||'');r.onerror=()=>res('');r.readAsDataURL(b)}catch(e){res('')}})}
function b64ToBlob(b64,type){try{const bin=atob(b64);const a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return new Blob([a],{type:type||'application/octet-stream'})}catch(e){return null}}
function cloudBinURL(id){try{const root=cloudRoot();if(!root)return '';return root.slice(0,-5)+'oomy__bin/'+id+'.json'}catch(e){return ''}}
/* большие файлы (треки/видео/фото) дублируем в облако кусками — иначе они видны только
   на одном устройстве. кусок ~2.4МБ base64, чтобы точно пролез в firebase */
const BIN_CHUNK=24e5;
async function binPut(id,blob){
  try{
    if(!id||!blob||!blob.size)return;
    const u=cloudBinURL(id);if(!u)return;
    const d=await blobToB64(blob);if(!d)return;
    const type=blob.type||'application/octet-stream';
    if(d.length<=BIN_CHUNK){
      await fetch(u,{method:'PUT',body:JSON.stringify({t:type,d})});
      return;
    }
    const parts=[];
    for(let i=0;i<d.length;i+=BIN_CHUNK)parts.push(d.slice(i,i+BIN_CHUNK));
    await fetch(u,{method:'PUT',body:JSON.stringify({t:type,n:parts.length,parts})});
  }catch(e){}
}
async function binGet(id){
  try{
    const u=cloudBinURL(id);if(!u)return null;
    const r=await fetch(u);if(!r.ok)return null;
    const o=await r.json();if(!o)return null;
    let d=o.d;
    if(!d&&Array.isArray(o.parts))d=o.parts.join('');
    if(!d)return null;
    return b64ToBlob(d,o.t);
  }catch(e){return null}
}
/* фото перед загрузкой ужимаем, чтобы оно влезло в localStorage и уехало в облако */
function shrinkImage(file,maxW,cb){
  try{
    const url=URL.createObjectURL(file);const img=new Image();
    img.onload=()=>{
      try{
        const iw=img.naturalWidth||maxW,ih=img.naturalHeight||maxW;
        const sc=Math.min(1,maxW/iw),w=Math.max(1,Math.round(iw*sc)),h=Math.max(1,Math.round(ih*sc));
        const c=document.createElement('canvas');c.width=w;c.height=h;
        const g=c.getContext('2d');g.fillStyle='#000';g.fillRect(0,0,w,h);g.drawImage(img,0,0,w,h);
        URL.revokeObjectURL(url);cb(c.toDataURL('image/jpeg',0.82));
      }catch(e){try{URL.revokeObjectURL(url)}catch(e2){}cb(null)}
    };
    img.onerror=()=>{try{URL.revokeObjectURL(url)}catch(e){}cb(null)};
    img.src=url;
  }catch(e){cb(null)}
}
function preloadIdbMedia(){try{const m=load(LS.media,{});Object.keys(m).forEach(id=>{const e=m[id];if(e&&typeof e==='object'&&e.idb)loadIdbMedia(id,e.idb);});}catch(e){}}
function readFile(f,cb){const r=new FileReader();r.onload=()=>cb(r.result);r.readAsDataURL(f);}

/* большое аудио (mp3 с SoundCloud) живёт в IndexedDB — там места много */
const IDB={p:null,open(){return this.p||(this.p=new Promise((res,rej)=>{const q=indexedDB.open('oomy-media',1);q.onupgradeneeded=()=>{try{q.result.createObjectStore('files')}catch(e){}};q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)}))},
  async put(k,blob){const db=await this.open();return new Promise((res,rej)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').put(blob,k);tx.oncomplete=()=>res(k);tx.onerror=()=>rej(tx.error)})},
  async get(k){const db=await this.open();return new Promise((res,rej)=>{const q=db.transaction('files').objectStore('files').get(k);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})}
};
/* ЗЕРКАЛО ХРАНИЛИЩА: каждый ключ дублируется в IndexedDB.
   Если браузер/обновление кода сбросило localStorage — всё восстанавливается автоматически. */
/* адрес облака — сознательная настройка: отключил → зеркало не должно его возвращать */
async function mirrorPut(k,v){
  if(k===LS.cloud)return;
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
    if(k===LS.cloud)continue;
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
      const fs=fitStyle(profOf(user),'ava');
      if(av.kind==='video'){return '<video src="'+u+'" autoplay muted loop playsinline style="width:100%;height:100%;'+fs+'" onloadedmetadata="clipVideo(this)"></video>'}
      return '<img src="'+u+'" style="'+fs+'">';
    }
  }else if(av&&av.type==='emoji')fallbackEmoji=av.val;
  return (fallbackEmoji||'🐈');
}

/* подгонка шапки/авы: чем заполнить рамку, насколько приблизить и куда сдвинуть */
function fitStyle(p,pre){
  if(!p)return '';
  const fit=p[pre+'Fit']||'fill', x=Number.isFinite(+p[pre+'X'])?+p[pre+'X']:50, y=Number.isFinite(+p[pre+'Y'])?+p[pre+'Y']:50;
  return 'object-fit:'+(fit==='fit'?'contain':'cover')+';object-position:'+x+'% '+y+'%;';
}
/* мини-карандаш на шапке: включает режим перетаскивания фото внутри рамки (только двигать) */
/* большое фото шапки лежит в indexeddb: подставляем адрес, когда он готов */
function fillBannerMedia(root,rec){
  try{
    if(!root||!rec||!rec.mid||mediaURL(rec.mid))return;
    const el=root.querySelector('.banner [data-mid="'+rec.mid+'"]');
    if(!el)return;
    const m=load(LS.media,{})[rec.mid]||{};
    if(!m.idb)return;
    loadIdbMedia(rec.mid,m.idb,url=>{
      if(!url||!el)return;
      el.src=url;
      if(el.tagName==='VIDEO'){try{el.load();el.play().catch(()=>{});}catch(e){}}
    });
  }catch(e){}
}
function wireBannerDrag(root,owner){
  const ban=root&&root.querySelector?root.querySelector('.banner'):null;
  if(!ban||!me)return;
  const old=ban.querySelector('.ban-edit-mini');
  if(owner!==me.user){if(old)old.remove();ban.classList.remove('ban-drag');return;}
  let btn=old;
  if(!btn){btn=document.createElement('button');btn.className='ban-edit-mini';btn.type='button';btn.title='подогнать шапку';btn.textContent='✎';ban.appendChild(btn);}
  const media=()=>ban.querySelector('img,video');
  btn.onclick=e=>{
    e.stopPropagation();
    ban.classList.toggle('ban-drag');
    btn.classList.toggle('on',ban.classList.contains('ban-drag'));
    if(ban.classList.contains('ban-drag'))toast('двигай фото мышкой или пальцем, потом нажми карандаш ещё раз');
  };
  ban.style.touchAction='none';
  ban.onpointerdown=e=>{
    if(!ban.classList.contains('ban-drag'))return;
    const im=media();if(!im)return;
    const p=prof();
    let ox=Number.isFinite(+p.banX)?+p.banX:50, oy=Number.isFinite(+p.banY)?+p.banY:50;
    const sx=e.clientX,sy=e.clientY,r=ban.getBoundingClientRect();
    im.style.cursor='grabbing';
    try{ban.setPointerCapture(e.pointerId);}catch(err){}
    const move=ev=>{
      const nx=Math.max(0,Math.min(100,ox+(ev.clientX-sx)/r.width*100));
      const ny=Math.max(0,Math.min(100,oy+(ev.clientY-sy)/r.height*100));
      im.style.objectPosition=nx+'% '+ny+'%';
      im.dataset.nx=nx.toFixed(1);im.dataset.ny=ny.toFixed(1);
    };
    const up=()=>{
      ban.removeEventListener('pointermove',move);
      ban.removeEventListener('pointerup',up);
      im.style.cursor='';
      const q=prof();q.banFit='fill';q.banZoom=1;
      q.banX=Number(im.dataset.nx)||50;q.banY=Number(im.dataset.ny)||50;
      saveProf(q);
      toast('шапка подогнана');
    };
    ban.addEventListener('pointermove',move);
    ban.addEventListener('pointerup',up);
  };
}

/* оонетки: без картинки-монеты, только текст */
function oonReady(cb){try{cb(null)}catch(e){}}
function oonImg(){return ''}
function flushOon(){try{refreshOonChip()}catch(e){}}
/* ============ ООНЕТКИ (валюта oomy) ============ */


/* ============ УВЕДОМЛЕНИЯ ДИНАМИЧНЫЕ: ключи, переводы, подарки ============ */
function pushNotif(u,ic,t,extra){
  if(!u||u==='котик-гость'||u==='гость-читатель')return;
  const n=load(LS.notifsD,{});
  const item={id:'n'+Date.now().toString(36)+Math.floor(Math.random()*46656).toString(36),ic,t,ts:Date.now()};
  /* картинка уведомления: аватарка человека, подарок, значок или готовый url */
  if(extra&&typeof extra==='object'){
    if(extra.av)item.av=String(extra.av);
    if(extra.gid)item.gid=String(extra.gid);
    if(extra.bid)item.bid=String(extra.bid);
    if(extra.img)item.img=String(extra.img);
  }
  (n[u]=n[u]||[]).unshift(item);
  n[u]=n[u].slice(0,50);
  save(LS.notifsD,n);
  pushBrowser('oomy',ic+' '+t,u);
}
/* ключ уведомления: старые записи без id получают стабильный хеш (firebase не любит точки и слэши в ключах) */
function notifHash(s){
  let h=5381;
  for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;
  return (h>>>0).toString(36);
}
function notifKey(n){
  if(!n)return '';
  if(n.id)return String(n.id).replace(/[^A-Za-z0-9_-]/g,'');
  return 't'+(n.ts||0)+'_'+notifHash((n.ic||'')+'|'+(n.t||''));
}
function notifReadIds(u){
  const all=load(LS.nread,{});
  const m=all&&all[u];
  return (m&&typeof m==='object'&&!Array.isArray(m))?m:{};
}
function notifSaveReadIds(u,map){
  const all=load(LS.nread,{});
  const safe={};
  Object.keys(map||{}).forEach(k=>{if(/^[A-Za-z0-9_-]+$/.test(k))safe[k]=1;});
  all[u]=safe;save(LS.nread,all);
}
/* перенос старого «прочитано всё» в попиксельные отметки (делается один раз) */
function notifEnsureReadMap(){
  if(!me||me.guest)return {};
  const all=load(LS.nread,{});
  const cur=all[me.user];
  if(cur&&typeof cur==='object'&&!Array.isArray(cur)&&!Object.keys(cur).some(k=>!/^[A-Za-z0-9_-]+$/.test(k)))return cur;
  /* старые ключи могли содержать точки/слэши — firebase такие не принимает; аккуратно переносим отметки */
  const map={};
  const legacy=load(LS.notifsRead,false);
  const seen=load(LS.notifSeen,{})[me.user]||0;
  dynNotifsFor(me.user).forEach(n=>{
    if(legacy||(n.ts||0)<=seen)map[notifKey(n)]=1;
  });
  notifSaveReadIds(me.user,map);
  return map;
}
function notifMarkRead(n){
  if(!me||me.guest||!n)return;
  const map=notifReadIds(me.user);
  map[notifKey(n)]=1;
  /* чистим отметки для уведомлений, которых уже нет */
  const live={};
  dynNotifsFor(me.user).forEach(x=>{const k=notifKey(x);if(map[k])live[k]=1;});
  notifSaveReadIds(me.user,live);
}
function notifMarkAllRead(){
  if(!me||me.guest)return;
  const map={};
  dynNotifsFor(me.user).forEach(n=>{map[notifKey(n)]=1;});
  notifSaveReadIds(me.user,map);
  const s=load(LS.notifSeen,{});s[me.user]=Date.now();save(LS.notifSeen,s);
  save(LS.notifsRead,true);
}
function notifUnreadCount(u){
  if(!u)return 0;
  const map=notifReadIds(u);
  return dynNotifsFor(u).filter(n=>!map[notifKey(n)]).length;
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
/* стартовые смайлики-подарки удалены навсегда: каталог стартует пустым,
   а если они остались в старых данных — вычищаем при первом же чтении */
const SEED_GIFT_IDS=['g1','g2','g3','g4','g5'];
const DEFAULT_GIFTS=[];
function giftCatalog(){
  const raw=load(LS.catalog,null);
  /* seed только если каталога ещё нет: пустой массив = админ реально всё удалил */
  let list=(raw===null)?[]:raw.slice();
  let changed=(raw===null);
  /* каждому подарку — постоянный номер #N, заодно выкидываем старые смайлики */
  list=list.filter(g=>{if(SEED_GIFT_IDS.includes(g.id)&&!g.mid){changed=true;return false}return true});
  /* надгробия: удалённый админом подарок не показывается никому и никогда */
  try{
    const tb=load(LS.tomb,{})||{};
    const before=list.length;
    list=list.filter(g=>!(g&&g.id&&tb[tombKey(LS.catalog,g.id)]!==undefined));
    if(list.length!==before)changed=true;
  }catch(e){}
  list.forEach((g,i)=>{if(!g.n){g.n=i+1;changed=true;}});
  if(changed)save(LS.catalog,list);
  /* сумки чистим при каждом чтении — облако могло вернуть старый сид обратно */
  try{
    const g=load(LS.gifts,{});
    let bn=0;
    Object.keys(g).forEach(u=>{const keep=(g[u]||[]).filter(it=>!SEED_GIFT_IDS.includes(it.gid));if(keep.length!==(g[u]||[]).length){bn++;g[u]=keep;}});
    if(bn)save(LS.gifts,g);
  }catch(e){}
  return list;
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
  body.innerHTML=`<div class="pf-name" style="font-size:16px">все подарки ${userLink(owner)} · ${bag.length}</div>
    <div class="gift-grid" style="grid-template-columns:repeat(auto-fill,minmax(96px,1fr));margin-top:12px">${bag.map((it,gi)=>{
      const gg=it.gid?giftCatalog().find(z=>z.id===it.gid):null;
      return `<div class="gift-card" data-ag="${gi}" style="cursor:pointer">
        ${bagItemHTML(it,58)}
        <div class="gn" style="font-size:11px">${it.cn?'#'+it.cn:''} ${esc(bagItemName(it))}</div>
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
    <div class="pf-name" style="font-size:19px;text-align:left;padding:12px 0 0">подарок ${esc(name)}${it&&it.cn?' #'+it.cn+' из '+(gg?gg.tiraj:'—'):''}</div>
    <div style="display:grid;grid-template-columns:auto minmax(0,1fr);gap:18px;margin-top:14px;align-items:start">
      <div style="display:flex;flex-direction:column;align-items:center;gap:8px">
        ${giftImgHTML(gg||{ic:(it&&it.ic)||'🎁'},118)}
        ${gg?`<span class="rar-badge rar-${gg.r||'common'}" style="text-align:center">${RARITY[gg.r||'common']}${it&&it.cn?' · #'+it.cn+' из '+gg.tiraj:''}</span>`:''}
      </div>
      <div style="min-width:0">
        ${gg?`<div class="stat-line"><span>автор дизайна</span><b>${userLink(gg.a1)}${gg.a2?' · '+userLink(gg.a2):''}</b></div>`:''}
        ${gg&&gg.cmt?`<div class="stat-line"><span>описание</span><b>${esc(gg.cmt)}</b></div>`:''}
        ${owner?`<div class="stat-line"><span>владелец</span><b>${userLink(owner)}</b></div>`:''}
        ${it?`<div class="stat-line"><span>копия / получен</span><b>${it.cn?'#'+it.cn+' из '+(gg?gg.tiraj:'')+' · ':''}${from&&from!=='магазин'?userLink(from)+' · ':''}${dateStr||'давно'}</b></div>`:''}
        ${gg?`<div class="stat-line"><span>цена / тираж</span><b>${gg.price} оонеток / ${gg.tiraj} шт</b></div>`:''}
      </div>
    </div>
    ${!owner&&gg&&me&&!me.guest?`<button class="dan-btn" id="giBuy" style="width:100%;margin-top:16px">купить за ${gg.price} оонеток</button>`:''}
    ${mine&&gg?`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px">
      <button class="minibtn" id="giShelf">${it.shelf?'убрать с витрины':'на витрину'}</button>
      <button class="minibtn" id="giGive">передать</button>
      <button class="minibtn" id="giMkt">выставить на маркет</button>
      <button class="minibtn" id="giMore">⋯</button>
    </div>`:''}
    <div class="panel" style="margin-top:16px;padding:12px 16px">
      <b style="font-size:12.5px">история подарка · кто, когда, кому</b>
      <div style="margin-top:8px;font-size:12.5px;color:var(--muted)" id="giHist"></div>
    </div>`;
  body.querySelector('#giBack').onclick=closeGiftInfo;
  const buy=body.querySelector('#giBuy');
  if(buy)buy.onclick=()=>{closeGiftInfo();buyGift(gg,me.user,'');};
  /* полная история каждой копии: покупка, передачи, продажа на маркете */
  const hist=body.querySelector('#giHist');
  if(hist){
    const fmh=ts=>ts?new Date(ts).toLocaleString('ru-RU',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';
    const row=html=>`<div style="padding:5px 0;border-bottom:1px solid var(--line)">${html}</div>`;
    const when=e=>e.ts?' · <span style="color:var(--muted2)">'+fmh(e.ts)+'</span>':'';
    /* самая старая запись сверху — так видно весь путь подарка */
    const list=(it&&Array.isArray(it.hist)?it.hist.slice():[]).sort((a,b)=>(a.ts||0)-(b.ts||0));
    let rows='';
    list.forEach(e=>{
      const who=e.a?userLink(e.a):'<b>магазин</b>';
      const to=e.b?userLink(e.b):'—';
      const price=e.price?' за <b>'+e.price+'</b> оонеток':'';
      const msg=e.msg?' — «'+esc(e.msg)+'»':'';
      if(e.t==='buy')rows+=row('🛍 куплен: '+who+' → '+to+price+when(e)+msg);
      else if(e.t==='mkt')rows+=row('💱 маркет: '+who+' продал(а) → '+to+price+when(e));
      else rows+=row('🎁 '+who+' передал(а) → '+to+when(e)+msg);
    });
    if(!list.length){
      if(it)rows+=row((from&&from!=='магазин'?'🎁 '+userLink(from)+' → ':'<b>магазин</b> → ')+userLink(owner||'—')+(ts?' · <span style="color:var(--muted2)">'+fmh(ts)+'</span>':'')+(it.msg?' — «'+esc(it.msg)+'»':''));
      /* у старых копий своей истории нет — показываем общую историю подарка,
         без повторов и без строки, которая уже есть выше */
      const chain=gg?(load(LS.giftChain,{})[gg.id]||[]):[];
      const seen={};
      const extra=[];
      chain.slice().sort((a,b)=>(a.ts||0)-(b.ts||0)).forEach(c=>{
        const key=[c.a,c.b,c.msg||'',c.ts||0].join('|');
        if(seen[key])return;seen[key]=1;
        if(it&&c.a===(from||'')&&c.b===owner&&(c.msg||'')===(it.msg||''))return;
        extra.push(c);
      });
      if(extra.length)rows+=row('<span style="color:var(--muted2);font-size:11.5px">общая история подарка</span>');
      extra.forEach(c=>{rows+=row('🎁 '+userLink(c.a)+' → '+userLink(c.b)+(c.ts?' · <span style="color:var(--muted2)">'+fmh(c.ts)+'</span>':'')+(c.msg?' — «'+esc(c.msg)+'»':''));});
    }
    hist.innerHTML=rows||'пока без истории';
  }
  /* после сборки истории навешиваем клики на все юзы — включая только что добавленные */
  body.querySelectorAll('[data-gu]').forEach(el=>el.onclick=e=>{e.stopPropagation();closeGiftInfo();openUserPage(el.dataset.gu);});
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
      const l2=bagOf(to);l2.unshift({gid:y.gid,ic:y.ic,cn:y.cn,from:me.user,ts:Date.now(),msg,hist:(Array.isArray(y.hist)?y.hist:[]).concat([{t:'give',a:me.user,b:to,ts:Date.now(),msg}])});saveBag(to,l2);
      if(g){const ch=load(LS.giftChain,{});(ch[g.id]=ch[g.id]||[]).unshift({a:me.user,b:to,ts:Date.now(),msg});save(LS.giftChain,ch);}
      if(g)pushNotif(to,'🎁','@'+me.user+' подарил вам «'+g.name+'»'+(msg?' — '+msg:''),{gid:g.id,av:me.user});
      /* подарочек прилетает в личку карточкой */
      addMsg(to,'me',msg||'',{kind:'gift',gid:y.gid,cn:y.cn,tiraj:g?g.tiraj:null,name:g?g.name:(y.ic||'🎁')});
      addLog('gift',me.user,'передал подарок котику '+to+(msg?' с подписью':''));
      closeGiftInfo();toast('подарок улетел '+to+' 🚀');
      if(!document.getElementById('pg-gifts').classList.contains('hidden'))renderGifts();
      if(!document.getElementById('pg-home').classList.contains('hidden'))renderHome();
    };
  };
  /* продать обратно сайту нельзя: подарок можно только выставить на маркет,
     чтобы его купил другой котик */
  const mktBtn=body.querySelector('#giMkt');
  if(mktBtn)mktBtn.onclick=()=>{
    window.__mktPreselect=bi;
    closeGiftInfo();
    giftTab='mkt';renderGifts();
    toast('выбери цену и нажми «выставить» — лот увидят все котики');
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
const RARITY={common:'обычный',rare:'редкий',pizdets:'пиздец',ebat:'ебать',ahuy:'ахуй'};
/* когда медиа подарка ещё грузится из indexeddb/облака — сразу подставляем картинку в готовую плашку */
function whenMediaURL(id,cb){
  if(!id)return;
  try{
    if(MEMURL[id]){try{cb(MEMURL[id])}catch(e){}return;}
    const rec=(load(LS.media,{})||{})[id];
    if(!rec)return;
    loadIdbMedia(id, (typeof rec==='object'&&rec.idb)||('kv:'+id), cb);
  }catch(e){}
}
let __giftPh=0;
function giftImgHTML(g,sz){
  const rar=(g&&g.r)||'common';
  /* размер у всех подарков ровный: старый ползунок убрали, сохранённый зум не применяем */
  const z=1;
  sz=Math.max(8,Math.round(sz*z));
  let inner;
  const mid=g&&g.mid;
  const mu=mid?mediaURL(mid):null;
  if(mu)inner='<img src="'+mu+'" alt="'+esc(g.name||'подарок')+'" style="width:'+sz+'px;height:'+sz+'px;border-radius:9px">';
  else{
    const ph='ngift'+(++__giftPh);
    inner='<span id="'+ph+'" style="width:'+sz+'px;height:'+sz+'px;display:inline-flex;align-items:center;justify-content:center;font-size:'+Math.round(sz*.7)+'px">'+esc(g&&g.ic||'🎁')+'</span>';
    if(mid)whenMediaURL(mid,url=>{
      if(!url)return;
      const el=document.getElementById(ph);
      if(!el||!el.isConnected)return;
      const img=document.createElement('img');
      img.src=url;img.alt=(g&&g.name)||'подарок';
      img.style.cssText='width:'+sz+'px;height:'+sz+'px;border-radius:9px';
      el.replaceWith(img);
    });
  }
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
function userLink(u,label){return '<span class="g-auth" data-gu="'+esc(u)+'" style="'+nickStyle(u)+'">'+(label?esc(label):'@'+esc(u))+'</span>'}
/* один обработчик на весь сайт: любой @юзер, аватарка или ник с data-gu ведёт на аккаунт.
   так кликабельны юзы абсолютно везде — в ленте, чате, подарках, уведомлениях и админке */
document.addEventListener('click',e=>{
  const t=e.target;
  if(!t||!t.closest)return;
  if(t.closest('a,option,select,input,textarea,datalist'))return;
  const m=t.closest('.mention-chip[data-mn]');
  if(m&&m.dataset.mn){e.preventDefault();e.stopPropagation();openUserPage(m.dataset.mn);return;}
  const g=t.closest('[data-gu]');
  if(g&&g.dataset.gu){e.preventDefault();e.stopPropagation();openUserPage(g.dataset.gu);return;}
  const a=t.closest('[data-author]');
  if(a&&a.dataset.author){e.preventDefault();e.stopPropagation();openUserPage(a.dataset.author);}
});
function openUserPage(u){
  if(!u)return;
  /* двойные обработчики (свой + общий) не должны открывать страницу дважды */
  const now=Date.now();
  if(window.__lastOpenU===u&&now-(window.__lastOpenT||0)<400)return;
  window.__lastOpenU=u;window.__lastOpenT=now;
  const accs=encLoad(LS.acc,{});const a=accs[u];
  const pd=profOf(u);
  if(!a){
    const known=load(LS.posts,[]).some(p=>p.author===u||(p.comments||[]).some(c=>c.user===u));
    if(!known&&(!pd||!Object.keys(pd).length)){toast('такого котика нет');return;}
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
  const cov=ownTrack?((ownTrack.coverMid&&mediaURL(ownTrack.coverMid))?'<img src="'+mediaURL(ownTrack.coverMid)+'">':(ownTrack.coverUrl?'<img src="'+esc(ownTrack.coverUrl)+'" referrerpolicy="no-referrer" onerror="this.replaceWith(document.createTextNode(\'🎵\'))">':esc((ownTrack.cover||'').slice(0,3)||'🎵'))):'🎵';
  /* если есть фото — фон рисует только <img>, иначе картинка дублируется квадратиком */
  const bannerStyle=(pd.grad&&!(pd.banner&&pd.banner.mid))?'background:'+((GRADS.find(g=>g.n===pd.grad)||{}).g||''):'';
  const np=nowPlayingOf(u);
  box.innerHTML=`<div class="pcard profile-card"${pd.accent?' style="--acc:'+esc(pd.accent)+'"':''}>
    <div class="banner" style="${bannerStyle}">
      ${(pd.banner&&pd.banner.mid&&pd.banner.kind==='vid')?'<video data-mid="'+pd.banner.mid+'" src="'+(mediaURL(pd.banner.mid)||'')+'" autoplay muted loop playsinline style="'+fitStyle(pd,'ban')+'"></video>':((pd.banner&&pd.banner.mid)?'<img data-mid="'+pd.banner.mid+'" src="'+(mediaURL(pd.banner.mid)||'')+'" style="'+fitStyle(pd,'ban')+'" alt="">':'')}
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
        <div class="pf-name nick-line"><span class="nk" data-gu="${esc(u)}" style="cursor:pointer;${nickStyle(u)}">${esc(dn)}</span>${badgeFor(u)}${badgesNickHTML(u)}${nickGiftHTML(u)}${a.banned?' <span class="from-line" style="color:var(--bad)">· заблокирован</span>':''}</div>
        <div class="pf-sub">${userLink(u)}<span class="online-dot ${online?'':'off'}"></span> ${online?'в сети':esc(lastSeenText(u))}</div>
        ${np?`<div class="pf-now" data-nowtrack="${esc(np.id)}" title="открыть в oomy music">♫ ${esc(np.name)}${np.artist?' — '+esc(np.artist):''}</div>`:''}
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
        return `<span style="display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer" data-gift="${x.gi}" data-gowner="${esc(u)}" title="${esc(bagItemName(x.g))}${x.g.from?' · от '+esc(x.g.from):''}">${bagItemHTML(x.g,44)}<span style="font-size:10px;font-weight:700">${x.g.cn?'#'+x.g.cn+' · ':''}${esc(bagItemName(x.g))}</span>${gg?`<span class="rar-badge rar-${gg.r||'common'}" style="font-size:9px">${RARITY[gg.r||'common']}</span>`:''}</span>`}).join('')||'<span class="empty-shelf">полка пустая</span>'}</div>
      <div class="link" style="padding-top:6px" id="upAllGifts">все подарки · ${bag.filter(g=>!g.hidden).length}</div>
    </div>`:''}
    ${sectOn(pd,'track')?`<div class="sect">
      <h3>профильный трек</h3>
      ${isMe?'<div id="pfTrackBox"></div>':(ownTrack?`<div style="display:flex;align-items:center;gap:10px">
        <div class="tcover" style="width:44px;height:44px;font-size:18px">${cov}</div>
        <div style="flex:1;min-width:0"><div style="font-weight:700;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(ownTrack.name)}</div><div style="color:var(--muted2);font-size:11.5px">${ownTrack.artist?esc(ownTrack.artist)+' · ':''}трек страницы ${userLink(u)}</div></div>
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
      <h3>значки${shownBadges(u).length?' · '+shownBadges(u).length:''}</h3>
      ${badgesSectHTML(u)}
    </div>`:''}
    ${isMe?`<div class="sect">
      <h3>гости моей страницы</h3>
      <div class="visitors">${visitorsOf(me.user).slice(0,10).map(v=>`<span class="v" data-gu="${esc(v.from)}"><span class="ava" style="width:24px;height:24px;font-size:12px">${avaHTML(v.from,'🐈')}</span>${esc(v.from)}</span>`).join('')||'<span class="fsub">пока никто не заглянул</span>'}</div>
    </div>
    <div class="sect">
      <h3>закладки · ${bookmarksOf(me.user).length}</h3>
      <div id="upBookmarks"></div>
    </div>`:''}
    ${a.createdAt?`<div class="pf-since">на oomy с ${esc(a.createdAt)}</div>`:''}
  </div>`;
  /* ---- проводка ---- */
  if(isMe){
    document.getElementById('pfEdit').onclick=openEditor;
    document.getElementById('pfShare').onclick=()=>toast('скопировано в миску: oomy/'+me.user+' ✅');
    const si=box.querySelector('#statusInput');
    const bioIn=box.querySelector('#bioInput');
    const stEl=box.querySelector('.pf-status');
    if(bioIn)bioIn.addEventListener('input',e=>{const p=prof();p.bio=e.target.value.trim();saveProf(p);});
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
      posts.unshift({id:Date.now(),ts:Date.now(),author:me.user,ava:(me.ava)||'🐈',nameCls:'pink',time:'только что',text:t,likes:0,liked:false,views:0,at:'',comments:[],att});
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
        {t:'пожаловаться',f:()=>{addLog('report',me.user,'жалоба на '+u);pushNotif(ADMIN,'🚨','@'+me.user+' пожаловался на @'+u,{av:me.user});toast('жалоба отправлена главному коту');}},
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
  box.querySelectorAll('[data-nowtrack]').forEach(el=>el.onclick=()=>{try{playQueueFrom(el.dataset.nowtrack)}catch(e){} go('sound');});
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
  /* карандашик шапки живёт после каждого перерендера, а не только при переходе */
  try{wireBannerDrag(box,u);}catch(e){}
  try{fillBannerMedia(box,pd.banner);}catch(e){}
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
const RAR_LIMIT={common:5,rare:3,pizdets:2,ebat:1,ahuy:1};
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
      <div class="gn" data-ginfo="${g.id}" style="cursor:pointer">${esc(g.name)}</div>
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
    ${(isAdmin()&&!pfDirectOpen)?'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px"><button class="dan-btn" id="shopAdd">＋ добавить подарок</button><button class="dan-btn" id="shopColl">＋ добавить коллекцию</button></div>':''}
    <input class="pill-input" id="giftQ" placeholder="поиск подарков…" value="${esc(window.__giftQ||'')}" style="margin-bottom:12px">
    ${cat.length?`<div class="gift-grid" style="grid-template-columns:repeat(auto-fill,minmax(128px,1fr))">${avail.map(g=>card(g,false)).join('')}</div>`
    :'<div class="empty-note">в магазине пока пусто — подарки добавляет администратор.<br>свой дизайн можно предложить во вкладке «предложить подарок»</div>'}
    ${ended.length?`<div style="margin-top:22px"><b style="font-size:13.5px;display:block;padding-bottom:8px">раскупленные подарочки</b>
      <div class="gift-grid" style="grid-template-columns:repeat(auto-fill,minmax(128px,1fr))">${ended.map(g=>card(g,true)).join('')}</div></div>`:''}
    ${(collsAll().length)?`<div style="margin-top:22px"><b style="font-size:13.5px;display:block;padding-bottom:8px">коллекции · собери подарки и получи значок</b>
      ${collsAll().map(c=>{
        const gids=c.gids||[];const got=gids.filter(gid=>bagOf(me.user).some(x=>x.gid===gid)).length;
        const pct=gids.length?Math.round(got/gids.length*100):0;
        const b=badgeById(c.badgeId);
        return `<div class="coll-row">
          ${b?badgeImgHTML(b,true):'<span class="badge-chip big">🏅</span>'}
          <div style="flex:1;min-width:0">
            <b style="font-size:13px">${esc(c.name||'коллекция')}</b>
            <div class="from-line">${got}/${gids.length} подарков · ${pct}%${c.hint?' · '+esc(c.hint):''}</div>
            <div style="height:5px;border-radius:5px;background:var(--line);margin-top:5px;overflow:hidden"><div style="height:100%;width:${pct}%;background:var(--acc)"></div></div>
          </div>
          <span class="from-line" style="flex:none">${pct>=100?'значок получен ✓':''}</span>
        </div>`;
      }).join('')}</div>`:''}
  </div>`;
  const add=body.querySelector('#shopAdd');
  if(add)add.onclick=()=>{pfDirectOpen=true;giftTab='prop';renderGifts();};
  const collBtn=body.querySelector('#shopColl');
  if(collBtn)collBtn.onclick=()=>collCreateModal(()=>renderGifts());
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
    buyGift(g,me.user,'');
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
  const nowTs=Date.now();
  const list=bagOf(to);
  list.unshift({gid:g.id,cn,from:from||'магазин',ts:nowTs,msg:msg||'',hist:[{t:'buy',a:me.user,b:to,ts:nowTs,price:g.price,msg:msg||''}]});
  saveBag(to,list);
  try{checkCollections(to);}catch(e){}
  /* история передач: кто кому */
  const ch=load(LS.giftChain,{});(ch[g.id]=ch[g.id]||[]).unshift({a:me.user,b:to,ts:Date.now(),msg:msg||''});save(LS.giftChain,ch);
  if(from)pushNotif(to,'🎁','@'+from+' подарил вам «'+g.name+'»'+(msg?' — '+msg:''),{gid:g.id,av:from});
  else pushNotif(to,'🛍','вы купили «'+g.name+'» · копия #'+cn+'/'+(g.tiraj||100),{gid:g.id});
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
      ${mine.map(m=>`<div class="mn-bag">${bagItemHTML({gid:m.gid,ic:m.ic},44)}<div style="flex:1"><b style="font-size:13px">${m.cn?'#'+m.cn+' · ':''}${esc(m.name)}</b><div class="g-foot">${m.price} оонеток</div></div><button class="minibtn" data-unlot="${m.id}">снять лот</button></div>`).join('')}</div>`:''}
    ${list.filter(x=>x.owner!==me.user).length?`<b style="font-size:13px;display:block;padding-bottom:8px">лоты котиков · ${list.filter(x=>x.owner!==me.user).length}</b>
      ${list.filter(x=>x.owner!==me.user).map(m=>`<div class="mn-bag">
        ${bagItemHTML({gid:m.gid,ic:m.ic},44)}
        <div style="flex:1;min-width:0"><b style="font-size:13px">${m.cn?'#'+m.cn+' · ':''}${esc(m.name)}</b><div class="g-foot">продает ${userLink(m.owner)}</div></div>
        <button class="minibtn" data-buylot="${m.id}">купить · ${m.price}</button>
      </div>`).join('')}`:'<div class="empty-note">чужих лотов пока нет — стань первым торговцем</div>'}
  </div>`;
  /* «выставить на маркет» из карточки подарка сразу подставляет эту копию */
  const pick0=body.querySelector('#mktPick');
  if(pick0&&window.__mktPreselect!=null&&pick0.options[Number(window.__mktPreselect)+1])pick0.value=String(window.__mktPreselect);
  window.__mktPreselect=null;
  body.querySelector('#mktSell').onclick=()=>{
    const sel=body.querySelector('#mktPick'),pi=body.querySelector('#mktPrice');
    const bi=Number(sel.value),price=Math.floor(Number(pi.value));
    if(sel.value===''){toast('выбери подарок из сумки');return;}
    if(!price||price<1){toast('укажи цену — целое число');return;}
    const bag=bagOf(me.user);const it=bag[bi];if(!it)return;
    const name=bagItemName(it);
    const l=mktAll();
    l.unshift({id:'m'+Date.now().toString(36),owner:me.user,gid:it.gid||'',ic:it.ic||'🎁',name,price,ts:Date.now(),cn:it.cn||null,hist:Array.isArray(it.hist)?it.hist.slice():[]});
    bag.splice(bi,1);saveBag(me.user,bag);saveMkt(l);
    addLog('mkt',me.user,'выставил лот «'+name+'» за '+price);
    toast('лот на барахолке!');
    renderGifts();
  };
  body.querySelectorAll('[data-unlot]').forEach(b=>b.onclick=()=>{
    const l=mktAll();const m=l.find(x=>x.id===b.dataset.unlot);if(!m)return;
    const bag=bagOf(me.user);bag.unshift({gid:m.gid||undefined,ic:m.gid?undefined:m.ic,cn:m.cn||undefined,hist:Array.isArray(m.hist)?m.hist:[],from:'снят с маркета',ts:Date.now()});saveBag(me.user,bag);
    saveMkt(l.filter(x=>x.id!==m.id));toast('лот снят, подарок вернулся в сумку');renderGifts();
  });
  body.querySelectorAll('[data-buylot]').forEach(b=>b.onclick=()=>{
    const l=mktAll();const m=l.find(x=>x.id===b.dataset.buylot);if(!m)return;
    if(myOon()<m.price){toast('оонеток не хватает');return;}
    addOon(-m.price);
    const w=wallet();w[m.owner]=(w[m.owner]||0)+m.price;save(LS.wallet,w);
    const bag=bagOf(me.user);bag.unshift({gid:m.gid||undefined,ic:m.gid?undefined:m.ic,cn:m.cn||undefined,from:m.owner,ts:Date.now(),hist:(Array.isArray(m.hist)?m.hist:[]).concat([{t:'mkt',a:m.owner,b:me.user,ts:Date.now(),price:m.price}])});saveBag(me.user,bag);
    try{checkCollections(me.user);}catch(e){}
    if(m.gid){const ch=load(LS.giftChain,{});(ch[m.gid]=ch[m.gid]||[]).unshift({a:m.owner,b:me.user,ts:Date.now(),msg:'продажа на маркете · '+m.price+' оонеток'});save(LS.giftChain,ch);}
    saveMkt(l.filter(x=>x.id!==m.id));
    pushNotif(m.owner,'💱','@'+me.user+' купил твой лот «'+m.name+'» за '+m.price+' оонеток',{gid:m.gid||undefined,av:me.user});
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
        try{checkCollections(u);}catch(e){}
        if(g){const ch=load(LS.giftChain,{});(ch[g.id]=ch[g.id]||[]).unshift({a:me.user,b:u,ts:Date.now(),msg:''});save(LS.giftChain,ch);}
        if(g)pushNotif(u,'🎁','@'+me.user+' подарил вам «'+g.name+'»',{gid:g.id,av:me.user});
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
    pushNotif(rc,'💸','@'+me.user+' перевёл тебе '+n+' оонеток'+(cmt.value.trim()?': «'+cmt.value.trim()+'»':''),{av:me.user});
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
    <div class="label">подарок · фото или gif (до 10МБ)</div>
    <div class="cat-item" style="align-items:center;cursor:pointer" id="pfPickRow">
      <span class="prop-prev" id="pfPrev"><span style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--muted2);font-size:12px">${pfFile?'':'нет картинки'}</span></span>
      <div style="flex:1;min-width:0">
        <button class="dan-btn" id="pfPick" style="padding:9px 16px;font-size:12.5px">Выберите файл</button>
        <span class="from-line" id="pfFileName" style="margin-left:10px">${pfFile?esc(pfFile.name):'картинка или gif не выбран'}</span>
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
      ${['common','rare','pizdets','ebat','ahuy'].map(r=>`<button type="button" class="minibtn rarbtn rar-${r}${((window.__pfR||'common')===r)?' on':''}" data-r="${r}">${RARITY[r]}</button>`).join('')}
    </div>
    <div class="from-line">размер у всех подарков ровный — рамка подстроится сама</div>
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
    if(f.size>10*1024*1024){toast('картинка до 10МБ');fi.value='';return;}
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
  /* размер у всех подарков одинаковый — ползунка больше нет */
  body.querySelector('#pfGo').onclick=()=>{
    const name=body.querySelector('#pfName').value.trim();
    const price=Math.floor(Number(body.querySelector('#pfPrice').value)||0);
    const tiraj=Math.max(1,Math.floor(Number(body.querySelector('#pfTiraj').value)||100));
    const a1=body.querySelector('#pfA1').value.trim().replace(/^@/,'');
    const a2=body.querySelector('#pfA2').value.trim().replace(/^@/,'');
    const cmt=body.querySelector('#pfCmt').value.trim();
    const zoom=1;
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
        cat.unshift({id:'g'+Date.now().toString(36),n:cat.reduce((m,g)=>Math.max(m,g.n||0),0)+1,mid,name,price,tiraj,a1,a2,cmt,r,zoom,by:me.user,ts:Date.now()});
        saveCatalog(cat);
        addLog('admin',me.user,'добавил подарок «'+name+'» в магазин');
        toast('подарок «'+name+'» в общем магазине!');
      }else{
        const ps=propsAll();
        ps.unshift({id:'pr'+Date.now().toString(36)+Math.floor(Math.random()*99),by:me.user,mid,name,price,tiraj,a1,a2,cmt,r,zoom,ts:Date.now(),status:'new'});
        saveProps(ps);
        pushNotif(ADMIN,'📦','@'+me.user+' предложил подарок «'+name+'» — посмотри предложку',{av:me.user});
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
  return rows.map((r,i)=>`<div class="stat-line"><span>${i+1}. ${userLink(r.u)}${badgeFor(r.u)}</span><b>${r.t} ▹</b></div>`).join('');
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
    cat.unshift({id:'g'+Date.now().toString(36),n:cat.reduce((m,g)=>Math.max(m,g.n||0),0)+1,mid:p.mid,name:p.name,price:p.price,tiraj:p.tiraj,a1:p.a1,a2:p.a2,cmt:p.cmt,r:p.r||'common',zoom:p.zoom||1,by:p.by,ts:Date.now()});
    saveCatalog(cat);
    p.status='pub';saveProps(ps2);
    pushNotif(p.by,'✅','Твой подарок «'+p.name+'» приняли в магазин!',{av:ADMIN});
    addLog('admin',me.user,'принял в магазин «'+p.name+'» от '+p.by);
    toast('«'+p.name+'» теперь у всех в магазине');
    syncGiftBadge();renderGifts();
  });
  body.querySelectorAll('[data-pno]').forEach(b=>b.onclick=()=>{
    const ps2=propsAll();
    const p=ps2.find(x=>x.id===b.dataset.pno);
    if(!p)return;
    p.status='no';saveProps(ps2);
    pushNotif(p.by,'❌','@'+ADMIN+' отклонил подарок «'+p.name+'»',{av:ADMIN});
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
    +(fresh.length?fresh.map(s=>`<div style="text-align:center" data-vv="${s.id}"><div class="story-ring ${seen.includes(s.id)?'seen':''}"><div class="ava2">${avaHTML(s.user,s.ava||'🐈')}</div></div><div class="story-cap">${esc(s.user)}</div></div>`).join(''):(me&&me.guest?'<div class="empty-note" style="padding:6px">сторис пока нет</div>':''));
  const add=document.getElementById('storyNew');
  if(add)add.onclick=()=>{const p=document.createElement('input');p.type='file';p.accept='image/*,video/*';
    p.onchange=()=>{const f=p.files[0];if(!f)return;
      if(f.size>10*1024*1024){toast('файл до 10МБ');return;}
      const addStory=mid=>{if(!mid)return;
        askForm('подпись к сторис (можно пусто)',[{ph:'подпись…'}],cap=>{
          const all=storiesAll();all.unshift({id:'s'+Date.now().toString(36),user:me.user,ava:me.ava||'🐈',mid,cap:(cap||'').trim(),kind:f.type.startsWith('video')?'vid':'img',ts:Date.now()});
          saveStories(all);addLog('story',me.user,'выложил сторис');toast('история живёт 24 часа!');renderStories();
        });
      };
      const isImg=(f.type||'').indexOf('image/')===0;
      if(isImg&&f.size>700*1024){
        /* фото ужимаем до 1280px: влезает в localStorage и синхронится на все устройства */
        shrinkImage(f,1280,d=>{if(d)putMedia(d,addStory);else putMedia(f,addStory);});
      }else{
        if(!isImg&&f.size>4.2*1024*1024)toast('видео больше 4МБ будет видно только на этом устройстве');
        putMedia(f,addStory);
      }};
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
  let timer=null,missT=null;
  const dur=s=>s.kind==='vid'?7000:5500;
  const markSeen=s=>{const seen=load(LS.storySeen,[]);if(!seen.includes(s.id)){seen.push(s.id);save(LS.storySeen,seen);}};
  function show(){
    clearTimeout(timer);clearTimeout(missT);
    const s=fresh[idx];if(!s){close();return;}
    markSeen(s);
    const bars=fresh.map((x,i)=>`<i class="${i<idx?'done':i===idx?'live':''}" style="--dur:${dur(x)}ms"></i>`).join('');
    const mu=s.mid?mediaURL(s.mid):null;
    const media=s.mid
      ?(s.kind==='vid'?`<video data-mid="${s.mid}" src="${mu||''}" autoplay loop playsinline></video>`:`<img data-mid="${s.mid}" src="${mu||''}" alt="">`)
      :`<div style="height:70vh;display:flex;align-items:center;justify-content:center;font-size:90px;background:#000;border-radius:14px">${esc(s.ava||'🐈')}</div>`;
    v.innerHTML=`<div class="sb">
      <div class="sbbar">${bars}</div>
      <div class="st-head">
        <div class="st-av">${esc(s.ava||'🐈')}</div>
        <div style="flex:1"><div class="st-name">${userLink(s.user)}</div><div class="st-time">${timeAgo(s.ts)}</div></div>
        ${(isAdmin()||s.user===(me&&me.user))?'<button class="icon-btn" id="stDel" title="удалить">🗑</button>':''}
        <button class="icon-btn" id="stClose" title="закрыть">✕</button>
      </div>
      ${media}
      ${s.cap?`<div class="st-cap">${esc(s.cap)}</div>`:''}
      <div class="st-zone"><b data-z="prev"></b><b data-z="next"></b></div>
    </div>`;
    v.querySelector('#stClose').onclick=close;
    /* видео/фото из indexeddb или облака: адрес появляется чуть позже — подставляем, когда готов */
    const miss=()=>{
      const el=v.querySelector('[data-mid="'+s.mid+'"]');
      if(el&&!el.getAttribute('src')){
        el.outerHTML='<div style="height:70vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:#000;border-radius:14px;color:#fff;text-align:center;padding:22px"><div style="font-size:74px">'+esc(s.ava||'🐈')+'</div><div style="font-size:13px;opacity:.82;line-height:1.5">файл не сохранился в памяти браузера<br>перезалей сторис — теперь фото и видео синхронятся</div></div>';
      }
    };
    if(s.mid&&!mu){
      const rec=load(LS.media,{})[s.mid];
      if(rec&&rec.idb)loadIdbMedia(s.mid,rec.idb,url=>{
        const el=v.querySelector('[data-mid="'+s.mid+'"]');
        if(!url||!el){miss();return;}
        try{el.src=url;if(el.tagName==='VIDEO'){el.load();el.play().catch(()=>{});}}catch(e){}
      });
      missT=setTimeout(miss,2800);
    }
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
  function close(){clearTimeout(timer);clearTimeout(missT);v.remove();renderStories();}
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
    <div><div class="hn">${esc(pd.dn||user)}${badgeFor(user)}</div><div class="hsub">${userLink(user)}${userIsAdmin(user)?' · главный кот':''}${isOnline(user)?' · <span style="color:var(--good)">в сети</span>':''}</div></div></div>
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
    liUser.value=key;try{liUser.dataset.afTouched='1';}catch(e){}addLog('recovery',key,'пароль восстановлен по секретному слову');  });
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
  try{localStorage.removeItem('oomy.lastPage')}catch(e){}
  me=null;openChatName=null;
  showScreen(scrLogin);document.title='oomy — вход';
  liPass.value='';liErr.textContent='';liUser.value='';
  try{afReset();}catch(e){}
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
      pushNotif(rm[1],'🐾','По твоей ссылке пришёл котик @'+u+': +200 оонеток',{av:u});
    }
  }catch(e){}
  addLog('register',u,'аккаунт создан навсегда');
  form.querySelector('.err-line')?.remove();
  /* регистрация сразу логинит: ничего вводить второй раз не нужно */
  accs[u].lastLogin=now();encSave(LS.acc,accs);
  setSession({user:u,ava:accs[u].ava,temporary:false});
  addLog('login',u,'вход (запомнён) — сразу после регистрации');
  rUser.value='';rPass.value='';rPass2.value='';rSecret.value='';rScore.textContent='';buildCaptcha();
  enterFeed();
  toast('аккаунт готов, ты уже на сайте! добро пожаловать 🐾');
};
document.getElementById('goReg').onclick=()=>{
  document.getElementById('regForm').querySelector('.err-line')?.remove();
  showScreen(scrReg);document.title='oomy — регистрация';buildCaptcha();
};
document.getElementById('goLogin').onclick=()=>{showScreen(scrLogin);document.title='oomy — вход';};

/* ============ ЛЕНТА ============ */
/* старые версии могли случайно зашифровать ленту целиком: возвращаем её в обычный массив */
function postsFix(){
  try{
    const raw=load(LS.posts,null);
    if(raw&&raw.v===2&&typeof raw.d==='string'){
      const arr=decEnv(raw);
      if(Array.isArray(arr))save(LS.posts,arr);
    }
  }catch(e){}
}
/* ботов больше нет: старые сеад-посты (ксиуша, романаwashy, принц, кисюша)
   имели маленькие числовые id (1…9999). настоящие записи всегда Date.now() */
function cleanPosts(a){
  return (Array.isArray(a)?a:[]).filter(p=>p&&typeof p==='object'&&p.author!=='__system__'&&!(typeof p.id==='number'&&p.id>0&&p.id<10000));
}
function seedPosts(){
  /* вычищаем ботов на всех устройствах; фильтр стоит и при слиянии с облаком,
     и при отрисовке ленты, поэтому боты не вернутся даже из общего мира */
  const posts=load(LS.posts,null);
  if(Array.isArray(posts)){
    const real=cleanPosts(posts);
    if(real.length!==posts.length)save(LS.posts,real);
  }
}
function persistPost(p){
  const posts=load(LS.posts,[]);const i=posts.findIndex(x=>x.id===p.id);
  if(i>-1)posts[i]=p;else posts.unshift(p);save(LS.posts,posts);
}
function attHTML(p){
  if(!p.att)return'';
  /* медиа может ещё лежать в indexeddb — тогда адреса нет, и src="null" бил бы 404 */
  const src=mediaURL(p.att.mid)||p.att.src||'';
  if(!src)return '<div class="att" style="padding:14px;color:var(--muted2);font-size:12.5px">🖼 медиа догружается…</div>';
  if(p.att.kind==='img'){return '<div class="att"><img class="zoomable" src="'+esc(src)+'" alt="фото" title="нажми, чтобы рассмотреть" onerror="imgFix(this)"></div>';}
  if(p.att.kind==='vid'){return '<div class="att"><video src="'+esc(src)+'" controls muted preload="metadata"></video></div>';}
  if(p.att.kind==='aud'){return '<div class="att"><audio src="'+esc(src)+'" controls></audio></div>';}
  return '<div class="att"><a class="file chat-file" href="'+esc(src)+'" download="'+esc(p.att.name)+'">📎 <span>'+esc(p.att.name)+'</span><span class="dl">скачать</span></a></div>';
}
/* превращает #хештеги и @упоминания в кликабельные чипы, экранируя остальное */
function linkify(t){
  let s=esc(t||'');
  s=s.replace(/(^|[\s(>])#([A-Za-zА-Яа-яёЁ0-9_]{2,24})/g,'$1<span class="tag-chip" data-tag="$2">#$2</span>');
  s=s.replace(/(^|[\s(>])@([A-Za-z0-9_.#-]{2,32})/g,'$1<span class="mention-chip" data-mn="$2">@$2</span>');
  return s;
}
function postHTML(p){
  if(!Array.isArray(p.comments))p.comments=[];
  if(typeof p.likes!=='number')p.likes=Number(p.likes)||0;
  return `
    <div class="post-head">
      <div class="ava p-ava" data-author="${esc(p.author)}" style="cursor:pointer">${avaHTML(p.author,p.ava)}</div>
      <div>
        <div class="p-name" data-author="${esc(p.author)}" style="cursor:pointer;${nickStyle(p.author)}">${esc(p.author)}${badgeFor(p.author)}${badgesNickHTML(p.author,3)}${nickGiftHTML(p.author)}</div>
        ${postTimeHTML(p,'p-time')}
      </div>
      ${p.pinned?'<div class="pinflag">закреп</div>':''}
      <button class="p-more">⋯</button>
    </div>
    ${p.repostFrom?`<div class="repost-tag">репост записи от <b>${userLink(p.repostFrom.author,p.repostFrom.author)}</b>${avaHTML(p.repostFrom.author,p.repostFrom.ava)}</div>${p.repostFrom.text?`<div class="repost-quote" style="margin:8px 0;padding:10px 14px;background:var(--card2);border-left:3px solid var(--acc);border-radius:10px;color:var(--text);font-size:13.5px">${linkify(p.repostFrom.text)}</div>`:''}`:''}
    ${p.text?`<div class="p-text">${linkify(p.text)}</div>`:''}
    ${attHTML(p)}
    <div class="p-actions">
      <button class="act like ${p.liked?'on':''}"><svg class="mi"><use href="#i-heart"/></svg><span class="cnt">${p.likes||''}</span></button>
      <button class="act cmz"><svg class="mi"><use href="#i-cmt"/></svg><span class="cnt">${(p.comments||[]).length||''}</span></button>
      <button class="act rp" title="репост в свой профиль"><svg class="mi"><use href="#i-rp"/></svg></button>
      <button class="act bm ${isBookmarked(p.id)?'on':''}" title="в закладки">★</button>
      <button class="act sh" title="поделиться"><svg class="mi"><use href="#i-sh"/></svg></button>
      <span class="views"><svg class="mi"><use href="#i-eye"/></svg> ${p.views??0}</span>
    </div>
    <div class="cmts">
      ${(p.comments||[]).map((c,ci)=>`
        <div class="cmt">
          <div class="ava cmt-ava" data-author="${esc(c.user)}" style="width:28px;height:28px;font-size:14px;cursor:pointer">${c.ava}</div>
          <div style="flex:1;min-width:0">
            <div class="cmt-name" data-author="${esc(c.user)}" style="cursor:pointer;${nickStyle(c.user)}">${esc(c.user)}${badgeFor(c.user)}${badgesNickHTML(c.user,2)}${nickGiftHTML(c.user)}</div>
            <div style="margin-top:2px">${linkify(c.text)}</div>
            ${postTimeHTML(c,'cmt-time')}
          </div>
          ${me&&c.user===me.user?'<button class="cmt-x" data-ci="'+ci+'" title="удалить">✕</button>':''}
        </div>`).join('')}
      <div class="cmt-bar">
        <input placeholder="комментарий…"><button class="cmt-up">↑</button>
      </div>
    </div>`;
}
function wirePost(d,p){
  if(!Array.isArray(p.comments))p.comments=[];
  /* для гостя лента ровно та же: страницы котиков, лайки, репосты, комменты */
  const goUser=u=>{if(!u)return;openUserPage(u);};
  const np=d.querySelector('.p-name');if(np)np.onclick=()=>goUser(p.author);
  const pa=d.querySelector('.p-ava');if(pa)pa.onclick=()=>goUser(p.author);
  d.querySelector('.like').onclick=e=>{
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
    if(!me||prof().dblLike===false)return;
    if(e.target.closest('button,a,input,textarea,.cmts'))return;
    const lk=d.querySelector('.like');
    if(lk&&!lk.classList.contains('on'))lk.click();
  });
  d.querySelector('.cmz').onclick=()=>{const c=d.querySelector('.cmts');c.style.maxHeight=c.style.maxHeight?'':(c.scrollHeight+'px');c.scrollIntoView({behavior:'smooth',block:'nearest'});};
  d.querySelector('.rp').onclick=()=>{
    const repostSc=(p.att&&(mediaURL(p.att.mid)||p.att.src))||'';
    const np2={id:Date.now(),ts:Date.now(),author:me.user,ava:(me.ava)||'🐈',nameCls:rnd(['blue','green','pink']),time:'только что',text:'',repostFrom:{author:p.author,ava:p.ava,text:p.text,src:repostSc},likes:0,liked:false,views:0,at:'',comments:[]};
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
      p.comments.push({user:me.user,ava:(me.ava)||'🐈',text:t,time:'только что',ts:Date.now(),likes:0,liked:false});
      /* уведомления упомянутым и автору поста */
      const accs=encLoad(LS.acc,{});
      const mentioned=(t.match(/@([A-Za-z0-9_.#-]{2,32})/g)||[]).map(x=>x.slice(1));
      mentioned.forEach(m=>{if(accs[m]&&m!==me.user)pushNotif(m,'💬','@'+me.user+' упомянул(а) тебя в комментарии',{av:me.user});});
      if(p.author!==me.user&&!mentioned.includes(p.author))pushNotif(p.author,'💬','@'+me.user+' оставил(а) комментарий к твоей записи',{av:me.user});
      bumpCmt(p.author);
      inp.value='';persistPost(p);addLog('cmt',me.user,'комментарий '+p.author+' ('+t.length+' симв.)');buildPosts();toast('комментарий замурчал');
    };
    up.onclick=send;inp.onkeydown=e=>{if(e.key==='Enter')send()};
  }
}
function buildPosts(){
  const q=(document.getElementById('search').value||'').toLowerCase();
  const wrap=document.getElementById('posts');
  let posts=cleanPosts(load(LS.posts,[])).filter(p=>!p.hidden);
  /* если в ленте ничего не поменялось — не перерисовываем: иначе при каждом опросе
     облака лента мигала и «затухала» */
  const sig=q+'|'+JSON.stringify(posts.map(p=>[p.id,p.likes,p.liked,p.text,p.pinned,(p.comments||[]).length,(p.comments||[]).map(c=>c.text).join('\u0001')]));
  if(sig===window.__lastPostsSig&&wrap.children.length)return;
  window.__lastPostsSig=sig;
  wrap.innerHTML='';
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
    posts.unshift({id:Date.now(),ts:Date.now(),author:me.user,ava:(me.ava)||'🐈',nameCls:rnd(['blue','green','pink']),time:'только что',text:t,likes:0,liked:false,views:Math.floor(Math.random()*9)+1,at:'',comments:[],att});
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
  /* ушли со страницы сообщений — живой поток чата больше не нужен */
  if(p!=='msgs'){try{chatStreamStop();}catch(e){}}
  if(p==='games'){try{gamesSyncStart();}catch(e){}}else{try{gamesSyncStop();}catch(e){}}
  document.querySelectorAll('#sideMenu li[data-go]').forEach(li=>li.classList.toggle('active',li.dataset.go===p));
  buildPage(p);
  try{
    if(p==='home')wireBannerDrag(document.getElementById('pg-home'),me&&me.user);
    else if(p==='user')wireBannerDrag(document.getElementById('pg-user'),window.__viewUser||(me&&me.user));
  }catch(e){}
  /* фон страницы: свой — на «омя страничк», чужой — на его странице; ушёл с страницы — фон пропал */
  /* фон сайта держится на всех страницах: свой — везде, чужой — на странице котика */
  applyPageBg(p==='user'?(window.__viewUser||me.user):(me&&me.user?me.user:null));
  if(p==='user')applyBarStyle((profOf(window.__viewUser||me.user)||{}).barStyle);else applyBarStyle();
  /* отметки «прочитано» для плашек */
  const mark={};mark[me.user]=Date.now();
  if(p==='feed'){const s=load(LS.feedSeen,{});s[me.user]=Date.now();save(LS.feedSeen,s);}
  if(p==='notifs'){const s=load(LS.notifSeen,{});s[me.user]=Date.now();save(LS.notifSeen,s);}
  /* запоминаем страницу для возврата после перезагрузки */
  try{localStorage.setItem('oomy.lastPage',JSON.stringify({p:p,u:(p==='user'?(window.__viewUser||me.user):null)}))}catch(e){}
  syncBadges();
  document.title='oomy — '+({feed:'лента',home:'омя страничк',groups:'группы',sound:'oomy music',msgs:'личны сообще',gifts:'подарочки',games:'шпилки',casino:'казинак',friends:'друзя',notifs:'уведомлялк',bm:'закладки',settings:'настройки',admin:'админ-панель',user:'страница котика'})[p];
  if(!noHist){hist=hist.slice(0,hIdx+1);hist.push(p);hIdx++;}
  window.scrollTo({top:0,behavior:'instant'});
}
function refreshAdminNav(){const n=document.getElementById('adminNav');if(n)n.classList.toggle('hidden',!isAdmin());}
document.querySelectorAll('#sideMenu li[data-go]').forEach(li=>li.onclick=()=>go(li.dataset.go));
document.getElementById('topLogo').onclick=()=>go('feed');
/* живой поиск: только типочки — по юзернейму или нику */
const sInput=document.getElementById('search'),sDrop=document.getElementById('searchDrop');
sInput.addEventListener('input',()=>{
  const q=sInput.value.trim().toLowerCase();
  if(q.length<2){sDrop.classList.add('hidden');return;}
  const accs=encLoad(LS.acc,{}),profs=profileAll(),seen={},users=[];
  Object.keys(accs).concat(Object.keys(profs)).forEach(u=>{
    if(!u||seen[u]||u==='котик-гость')return;seen[u]=1;
    const pd=profs[u]||{},a=accs[u]||{};
    const dn=pd.dn||a.dn||u;
    if(u.toLowerCase().includes(q)||String(dn).toLowerCase().includes(q)){
      users.push({u,dn,ava:avaHTML(u,a.ava||'🐈')});
    }
  });
  const rank=x=>x.u.toLowerCase()===q?0:x.u.toLowerCase().startsWith(q)?1:String(x.dn).toLowerCase().startsWith(q)?2:3;
  users.sort((a,b)=>rank(a)-rank(b)||a.u.localeCompare(b.u));
  const list=users.slice(0,10);
  if(!list.length){sDrop.innerHTML='<div class="srow" style="cursor:default;color:var(--muted2)">типочков не нашлось 🐾</div>';sDrop.classList.remove('hidden');return;}
  sDrop.innerHTML=list.map(x=>`<div class="srow" data-su="${esc(x.u)}"><span class="ava" style="width:28px;height:28px;font-size:14px">${x.ava}</span><div style="flex:1;min-width:0"><div style="font-weight:700">${esc(x.dn)}</div><div class="st">${userLink(x.u)}</div></div><span class="st">аккаунт</span></div>`).join('');
  sDrop.classList.remove('hidden');
  sDrop.querySelectorAll('[data-su]').forEach(r=>r.onclick=()=>{
    sDrop.classList.add('hidden');sInput.value='';
    openUserPage(r.dataset.su);
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
  try{killAutofill();}catch(e){}
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
/* создание значка: название + подсказка + картинка/gif */
function badgeCreateModal(onDone){
  const old=document.querySelector('.ask-ov');if(old)old.remove();
  const ov=document.createElement('div');ov.className='ask-ov';
  ov.innerHTML=`<div class="ask-box" style="padding:16px 18px;max-width:400px;width:94%">
    <b style="font-size:14px">🎖 новый значок</b>
    <input class="pill-input" id="bmName" placeholder="название значка" style="margin-top:9px;width:100%">
    <input class="pill-input" id="bmHint" placeholder="подсказка при наведении" style="margin-top:8px;width:100%">
    <div style="display:flex;gap:8px;align-items:center;margin-top:9px;flex-wrap:wrap">
      <button class="minibtn" id="bmFile">🖼 картинка / gif</button>
      <span class="from-line" id="bmFileLab">файл не выбран</span>
    </div>
    <div id="bmPrev" style="margin-top:8px"></div>
    <div style="display:flex;gap:8px;margin-top:13px;justify-content:flex-end">
      <button class="minibtn" id="bmCancel">отмена</button>
      <button class="dan-btn" id="bmOk" style="padding:7px 18px">создать</button>
    </div></div>`;
  document.body.appendChild(ov);
  let media=null;
  ov.querySelector('#bmCancel').onclick=()=>ov.remove();
  ov.querySelector('#bmFile').onclick=()=>{
    const inp=document.createElement('input');inp.type='file';inp.accept='image/*,video/*';
    inp.onchange=()=>{const f=inp.files[0];if(!f)return;
      if(f.size>10*1024*1024){toast('файл больше 10МБ');return;}
      putMedia(f,mid=>{if(!mid){toast('не удалось сохранить файл');return;}
        media={mid,kind:/^video\//.test(f.type)?'vid':'img'};
        ov.querySelector('#bmFileLab').textContent=f.name;
        const tmp={name:ov.querySelector('#bmName').value||'значок',hint:ov.querySelector('#bmHint').value,mid,kind:media.kind};
        ov.querySelector('#bmPrev').innerHTML=badgeImgHTML(tmp,true);
      });};
    inp.click();
  };
  ov.querySelector('#bmOk').onclick=()=>{
    const name=ov.querySelector('#bmName').value.trim();
    if(!name){toast('придумай название значку');return;}
    const hint=ov.querySelector('#bmHint').value.trim();
    const b={id:'b'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),name,hint,mid:media?media.mid:'',kind:media?media.kind:'img',ts:Date.now()};
    const all=badgesAll();all.unshift(b);saveBadges(all);
    try{addLog('admin',me.user,'создал значок «'+name+'»');}catch(e){}
    toast('значок «'+name+'» создан');
    ov.remove();if(onDone)onDone();
  };
  const n0=ov.querySelector('#bmName');if(n0)n0.focus();
}
/* создание коллекции: название + подсказка + картинка/gif + какие подарки собрать */
function collCreateModal(onDone){
  const old=document.querySelector('.ask-ov');if(old)old.remove();
  const cat=giftCatalog();
  const ov=document.createElement('div');ov.className='ask-ov';
  ov.innerHTML=`<div class="ask-box" style="padding:16px 18px;max-width:520px;width:96%">
    <b style="font-size:14px">🏆 новая коллекция</b>
    <input class="pill-input" id="cmName" placeholder="название коллекции" style="margin-top:9px;width:100%">
    <input class="pill-input" id="cmHint" placeholder="подсказка к значку при наведении" style="margin-top:8px;width:100%">
    <div style="display:flex;gap:8px;align-items:center;margin-top:9px;flex-wrap:wrap">
      <button class="minibtn" id="cmFile">🖼 картинка / gif значка</button>
      <span class="from-line" id="cmFileLab">файл не выбран</span>
    </div>
    <div id="cmPrev" style="margin-top:8px"></div>
    <div class="label" style="margin-top:12px">какие подарки нужно собрать</div>
    <div class="coll-pick" id="cmPick">${cat.map(g=>`<label><input type="checkbox" value="${esc(g.id)}">${esc(g.name)}</label>`).join('')||'<div class="from-line">в магазине пока нет подарков</div>'}</div>
    <div style="display:flex;gap:8px;margin-top:13px;justify-content:flex-end">
      <button class="minibtn" id="cmCancel">отмена</button>
      <button class="dan-btn" id="cmOk" style="padding:7px 18px">создать</button>
    </div></div>`;
  document.body.appendChild(ov);
  let media=null;
  ov.querySelector('#cmCancel').onclick=()=>ov.remove();
  ov.querySelector('#cmFile').onclick=()=>{
    const inp=document.createElement('input');inp.type='file';inp.accept='image/*,video/*';
    inp.onchange=()=>{const f=inp.files[0];if(!f)return;
      if(f.size>10*1024*1024){toast('файл больше 10МБ');return;}
      putMedia(f,mid=>{if(!mid){toast('не удалось сохранить файл');return;}
        media={mid,kind:/^video\//.test(f.type)?'vid':'img'};
        ov.querySelector('#cmFileLab').textContent=f.name;
        const tmp={name:ov.querySelector('#cmName').value||'коллекция',hint:ov.querySelector('#cmHint').value,mid,kind:media.kind};
        ov.querySelector('#cmPrev').innerHTML=badgeImgHTML(tmp,true);
      });};
    inp.click();
  };
  ov.querySelector('#cmOk').onclick=()=>{
    const name=ov.querySelector('#cmName').value.trim();
    if(!name){toast('придумай название коллекции');return;}
    const gids=[...ov.querySelectorAll('#cmPick input:checked')].map(i=>i.value);
    if(!gids.length){toast('выбери хотя бы один подарок');return;}
    const hint=ov.querySelector('#cmHint').value.trim();
    const bid='b'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
    const badge={id:bid,name,hint,mid:media?media.mid:'',kind:media?media.kind:'img',ts:Date.now()};
    const allBadges=badgesAll();allBadges.unshift(badge);saveBadges(allBadges);
    const colls=collsAll();colls.unshift({id:'c'+Date.now().toString(36),name,hint,mid:badge.mid,kind:badge.kind,gids,badgeId:bid,ts:Date.now()});saveColls(colls);
    try{addLog('admin',me.user,'создал коллекцию «'+name+'»');}catch(e){}
    const got=checkAllCollections();
    if(got)toast('коллекция «'+name+'» создана — значки уже выданы '+got+' котикам 🏅');
    else toast('коллекция «'+name+'» создана');
    ov.remove();if(onDone)onDone();
  };
  const n0=ov.querySelector('#cmName');if(n0)n0.focus();
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
const SECT_LABELS={stats:'статистика',shelf:'полка подарочков',status:'статус',bio:'биография',track:'профильный трек',wall:'стена',friends:'друзья',ach:'значки',guests:'гости страницы',bm:'закладки на странице'};
const sectOn=(pd,k)=>!(pd.sects)||pd.sects[k]!==false;
/* подарочек рядом с ником: наведи — увидишь тираж и название */
function nickGiftHTML(u){
  const pd=profOf(u);const bi=pd.nickGift;
  if(bi===undefined||bi===null)return '';
  const it=bagOf(u)[bi];if(!it)return '';
  const gg=it.gid?giftCatalog().find(z=>z.id===it.gid):null;
  const tip=(it.cn?'#'+it.cn+' · ':'')+bagItemName(it)+(gg?' · тираж '+gg.tiraj+' шт':'');
  return `<span class="nick-gift" title="${esc(tip)}">${bagItemHTML(it,26)}</span>`;
}
/* старый плоский профиль → карта по юзернеймам (у каждого котика теперь своё) */
(function migrateProfiles(){
  const raw=load(LS.profile,null);
  if(!raw||typeof raw!=='object')return;
  const flatKeys=['avatar','dn','status','bio','banner','grad','pageBg','accent','privacy','notif','vol','autoplay','siteAccent','theme','pinned','banFit','banZoom','banX','banY','avaFit','avaZoom','avaX','avaY'];
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
  pushNotif(to,'🐾','@'+me.user+' хочет добавить тебя в друзья',{av:me.user});
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
  pushNotif(from,'✅','@'+me.user+' принял(а) твою заявку в друзья',{av:me.user});
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
/* честное время по мск: сегодня / вчера / дата */
function mskParts(ts){
  const d=new Date(ts),n=new Date();
  const f=(x)=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'}).formatToParts(x).reduce((a,p)=>(a[p.type]=p.value,a),{});
  const dp=f(d),np=f(n);
  return {d:dp,n:np,sameDay:dp.day===np.day&&dp.month===np.month&&dp.year===np.year};
}
function lastSeenText(u){
  if(isOnline(u))return 'в сети';
  const s=load(LS.seen,{});
  if(!s[u])return 'давно не заходил(а)';
  const p=mskParts(s[u]);
  const tm=p.d.hour+':'+p.d.minute+' мск';
  if(p.sameDay)return 'был(а) сегодня в '+tm;
  const y=new Date();y.setDate(y.getDate()-1);
  const yp=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'numeric',year:'numeric'}).formatToParts(y).reduce((a,x)=>(a[x.type]=x.value,a),{});
  if(yp.day===p.d.day&&yp.month===p.d.month&&yp.year===p.d.year)return 'был(а) вчера в '+tm;
  return 'был(а) '+(p.d.day+'.'+p.d.month+'.'+p.d.year)+' в '+tm;
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
/* какие обои показать: на страничке котика — фон этой странички (его видят все),
   на остальных экранах — личный фон сайта (он только у себя) */
function currentBgSpec(){
  try{
    if(!me||!me.user)return null;
    const pg=window.__PG;
    if(pg==='user'){const u=window.__viewUser||me.user;return (profOf(u)||{}).pageBg||null;}
    if(pg==='home')return (prof()||{}).pageBg||null;
    return (prof()||{}).siteBg||null;
  }catch(e){return null}
}
function applyPageBg(){
  const box=document.getElementById('pageBg');if(!box)return;
  const bg=currentBgSpec();
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
function clearPageBg(){const p=prof();delete p.pageBg;saveProf(p);applyPageBg();toast('фон странички убран');}
function clearSiteBg(){const p=prof();delete p.siteBg;saveProf(p);applyPageBg();toast('фон сайта убран');}
/* профильный трек — 1 трек из oomy music на страницу */
function renderPfTrack(){
  const box=document.getElementById('pfTrackBox');if(!box)return;
  const pr=prof();
  const t=tracksAll().find(x=>x.id===pr.profileTrackId);
  const trs=tracksAll().filter(x=>x.origin==='local');
  const cov=t?((t.coverMid&&mediaURL(t.coverMid))?'<img src="'+mediaURL(t.coverMid)+'">':(t.coverUrl?'<img src="'+esc(t.coverUrl)+'" referrerpolicy="no-referrer" onerror="this.replaceWith(document.createTextNode(\'🎵\'))">':esc((t.cover||'').slice(0,3)||'🎵'))):'🎵';
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
  const np=nowPlayingOf(me.user);
  const myAcc=(encLoad(LS.acc,{})||{})[me.user]||{};
  box.innerHTML=`
    <div class="pcard profile-card"${pr.accent?' style="--acc:'+esc(pr.accent)+'"':''}>
      <div class="banner" id="pfBanner" style="${(pr.grad&&!(pr.banner&&pr.banner.mid))?'background:'+((GRADS.find(g=>g.n===pr.grad)||{}).g||''):''}">
        ${(pr.banner&&pr.banner.mid&&pr.banner.kind==='vid')?'<video data-mid="'+pr.banner.mid+'" src="'+(mediaURL(pr.banner.mid)||'')+'" autoplay muted loop playsinline style="'+fitStyle(pr,'ban')+'"></video>':((pr.banner&&pr.banner.mid)?'<img data-mid="'+pr.banner.mid+'" src="'+(mediaURL(pr.banner.mid)||'')+'" style="'+fitStyle(pr,'ban')+'" alt="">':'')}
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
          <div class="pf-name nick-line"><span class="nk" data-gu="${esc(me.user)}" style="cursor:pointer;${nickStyle(me.user)}">${esc(dn)}</span>${badgeFor(me.user)}${badgesNickHTML(me.user)}${nickGiftHTML(me.user)}</div>
          <div class="pf-sub">${userLink(me.user)}<span class="online-dot"></span>${isAdmin()?' главный кот сайта':''}</div>
          ${np?`<div class="pf-now" data-nowtrack="${esc(np.id)}" title="открыть в oomy music">♫ ${esc(np.name)}${np.artist?' — '+esc(np.artist):''}</div>`:''}
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
          return `<span style="display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer" data-pfgift="${x.gi}" title="${esc(bagItemName(x.g))}${x.g.from?' · от '+esc(x.g.from):''}">${bagItemHTML(x.g,44)}<span style="font-size:10px;font-weight:700">${x.g.cn?'#'+x.g.cn+' · ':''}${esc(bagItemName(x.g))}</span>${gg?`<span class="rar-badge rar-${gg.r||'common'}" style="font-size:9px">${RARITY[gg.r||'common']}</span>`:''}</span>`}).join('')||'<span class="empty-shelf">полка пустая — загляни в подарочки 🎁</span>'}</div>
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
        <h3>значки${shownBadges(me.user).length?' · '+shownBadges(me.user).length:''}</h3>
        ${badgesSectHTML(me.user)}
      </div>`:''}
      ${sectOn(pr,'guests')?`<div class="sect">
        <h3>гости моей страницы</h3>
        <div class="visitors">${visitorsOf(me.user).slice(0,10).map(v=>`<span class="v" data-gu="${esc(v.from)}"><span class="ava" style="width:24px;height:24px;font-size:12px">${avaHTML(v.from,'🐈')}</span>${esc(v.from)}</span>`).join('')||'<span class="fsub">пока никто не заглянул</span>'}</div>
      </div>`:''}
      ${sectOn(pr,'bm')?`<div class="sect">
        <h3>закладки · ${bookmarksOf(me.user).length}</h3>
        <div id="homeBookmarks"></div>
      </div>`:''}
      ${myAcc.createdAt?`<div class="pf-since">на oomy с ${esc(myAcc.createdAt)}</div>`:''}
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
    const el=document.getElementById('pfBio');if(el)el.textContent=pr.bio;
  });
  document.getElementById('pfEdit').onclick=openEditor;
  document.getElementById('pfShare').onclick=()=>toast('скопировано в миску: oomy/'+me.user+' ✅');
  box.querySelectorAll('[data-gu]').forEach(el=>el.onclick=()=>openUserPage(el.dataset.gu));
  box.querySelectorAll('[data-pfgift]').forEach(el=>el.onclick=()=>openGiftInfo(null,me.user,Number(el.dataset.pfgift)));
  box.querySelectorAll('[data-nowtrack]').forEach(el=>el.onclick=()=>{try{playQueueFrom(el.dataset.nowtrack)}catch(e){} go('sound');});
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
      posts.unshift({id:Date.now(),ts:Date.now(),author:me.user,ava:(me.ava)||'🐈',nameCls:'pink',time:'только что',text:t,likes:0,liked:false,views:0,at:'',comments:[],att});
      save(LS.posts,posts);addLog('post',me.user,'запись на стене'+(att?' + '+att.kind:''));
      wallAtt=null;updSlot();el.value='';renderWall();toast('на стене! проверяй');
    };
    }
  }
  try{wireBannerDrag(box,me&&me.user);}catch(e){}
  try{fillBannerMedia(box,pr.banner);}catch(e){}
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

    <div class="label" style="margin-top:18px">фон странички · его видят все на твоём профиле</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
      <button class="minibtn" id="edBgImg">🖼 фото/gif</button>
      <button class="minibtn" id="edBgVid">🎞 видео</button>
      <button class="minibtn" id="edBgNone">сбросить</button>
    </div>
    <div class="hint" style="color:var(--muted2)">этот фон стоит только на твоей страничке и виден каждому, кто её открыл</div>

    <div class="label" style="margin-top:16px">фон всего сайта · только у тебя</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
      <button class="minibtn" id="edSiteBgImg">🖼 фото/gif</button>
      <button class="minibtn" id="edSiteBgVid">🎞 видео</button>
      <button class="minibtn" id="edSiteBgNone">сбросить</button>
    </div>
    <div class="hint" style="color:var(--muted2)">этот фон ты ставишь только себе — он будет у тебя везде, кроме твоего профиля (там фон странички важнее)</div>

    <div class="label" style="margin-top:16px">цвет ника</div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <input type="color" id="edNickColor" value="${esc(pr.nickColor||'#ffffff')}" style="width:46px;height:34px;border:1px solid var(--line);border-radius:10px;background:none;cursor:pointer">
      <button class="minibtn" id="edNickWhite">белый по умолчанию</button>
      <span id="edNickPrev" class="nk" style="${nickStyle(me.user)};font-size:17px">${esc(pr.dn||me.user)}</span>
    </div>
    <div class="label" style="margin-top:12px">сияние ника · 5 разных</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap" id="edNickGlow"></div>
    <div class="hint" style="color:var(--muted2)">цвет и сияние ника видят все — в постах, комментариях, личках и на странице</div>

    <div class="label" style="margin-top:16px">акцентный цвет профиля</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center" id="edAccs"></div>
    <div style="display:flex;gap:10px;align-items:center;margin-top:10px">
      <input type="color" id="edAccColor" value="${esc(pr.accent||'#7a6cff')}" style="width:46px;height:34px;border:1px solid var(--line);border-radius:10px;background:none;cursor:pointer">
      <span class="from-line">свой цвет акцента</span>
    </div>
    <div class="hint" style="color:var(--muted2)">меняет цвет именно этого профиля — у других котов он виден, но общий акцент сайта не трогает</div>

    <div class="label" style="margin-top:16px">значки в нике</div>
    <div id="edBadges"><div class="from-line">значков пока нет — их выдаёт администратор или дают за коллекцию подарков</div></div>
    <div class="hint" style="color:var(--muted2)">галочка — показывать значок в нике и в профиле. снятая — значок спрятан</div>

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
  document.getElementById('edBgImg').onclick=()=>upl('image/*',a=>{const p=prof();p.pageBg={mid:a.mid,kind:a.kind};saveProf(p);applyPageBg();addLog('profile',me.user,'фон странички');if(window.__PG==='home'||window.__PG==='user')applyPageBg();toast('фон странички поставлен');});
  document.getElementById('edBgVid').onclick=()=>upl('video/*',a=>{const p=prof();p.pageBg={mid:a.mid,kind:'vid'};saveProf(p);applyPageBg();addLog('profile',me.user,'живой фон странички');toast('живой фон странички!');});
  document.getElementById('edBgNone').onclick=()=>{clearPageBg();};
  document.getElementById('edSiteBgImg').onclick=()=>upl('image/*',a=>{const p=prof();p.siteBg={mid:a.mid,kind:a.kind};saveProf(p);applyPageBg();addLog('profile',me.user,'фон сайта');toast('фон сайта поставлен');});
  document.getElementById('edSiteBgVid').onclick=()=>upl('video/*',a=>{const p=prof();p.siteBg={mid:a.mid,kind:'vid'};saveProf(p);applyPageBg();addLog('profile',me.user,'живой фон сайта');toast('живой фон сайта!');});
  document.getElementById('edSiteBgNone').onclick=()=>{clearSiteBg();};

  /* ник: цвет + сияние с живым предпросмотром */
  const drawNickPrev=()=>{
    const pv=document.getElementById('edNickPrev');if(!pv)return;
    const p=prof();
    pv.style.cssText=nickStyle(me.user);
    pv.textContent=p.dn||me.user;
  };
  const nc=document.getElementById('edNickColor');
  if(nc)nc.oninput=()=>{const p=prof();p.nickColor=nc.value;saveProf(p);drawNickPrev();refreshChips();toast('цвет ника: '+nc.value);};
  const nw=document.getElementById('edNickWhite');
  if(nw)nw.onclick=()=>{const p=prof();delete p.nickColor;saveProf(p);if(nc)nc.value='#ffffff';drawNickPrev();refreshChips();toast('ник снова белый');};
  const glowBox=document.getElementById('edNickGlow');
  if(glowBox){
    const cur=Math.max(0,Math.min(5,Number(prof().nickGlow)||0));
    NICK_GLOWS.forEach((g,i)=>{
      const b=document.createElement('button');
      b.className='glow-opt'+(i===cur?' on':'');b.textContent=g.n;b.dataset.g=i;
      b.onclick=()=>{const p=prof();p.nickGlow=i;saveProf(p);glowBox.querySelectorAll('.glow-opt').forEach(x=>x.classList.remove('on'));b.classList.add('on');drawNickPrev();refreshChips();toast('сияние ника: '+g.n);};
      glowBox.appendChild(b);
    });
  }
  /* значки: какие показывать */
  const bBox=document.getElementById('edBadges');
  if(bBox){
    const own=badgeOwn(me.user).map(badgeById).filter(Boolean);
    if(own.length){
      const shown=(Array.isArray(prof().badges)?prof().badges:badgeOwn(me.user));
      bBox.innerHTML=own.map(b=>`<label class="badge-pick"><input type="checkbox" data-bid="${esc(b.id)}" ${shown.indexOf(b.id)>-1?'checked':''}>${badgeImgHTML(b,true)}<span>${esc(b.name||'значок')}${b.hint?' · '+esc(b.hint):''}</span></label>`).join('');
      bBox.querySelectorAll('input[data-bid]').forEach(inp=>{
        inp.onchange=()=>{const p=prof();
          p.badges=(p.badges||badgeOwn(me.user).slice());
          const id=inp.dataset.bid;
          if(inp.checked){if(p.badges.indexOf(id)<0)p.badges.push(id);}
          else p.badges=p.badges.filter(x=>x!==id);
          saveProf(p);refreshChips();toast(inp.checked?'значок показан':'значок спрятан');};
      });
    }
  }

  const ac=document.getElementById('edAccs');
  ACCENTS.forEach(c=>{const s=document.createElement('div');s.className='swatch'+(pr.accent===c?' on':'');s.style.background=c;s.title=c;
    s.onclick=()=>{const p=prof();p.accent=c;saveProf(p);addLog('profile',me.user,'акцент профиля: '+c);ac.querySelectorAll('.swatch').forEach(x=>x.classList.remove('on'));s.classList.add('on');const cInp=document.getElementById('edAccColor');if(cInp)cInp.value=c;if(window.__PG==='home')renderHome();toast('акцент профиля изменён');};
    ac.appendChild(s);});
  const accInp=document.getElementById('edAccColor');
  if(accInp)accInp.oninput=()=>{const p=prof();p.accent=accInp.value;saveProf(p);ac.querySelectorAll('.swatch').forEach(x=>x.classList.remove('on'));if(window.__PG==='home')renderHome();toast('акцент профиля: '+accInp.value);};
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
  const nameEl=document.getElementById('chipName');
  if(nameEl){nameEl.style.cssText='font-size:13px;min-width:0;'+nickStyle(me.user);nameEl.innerHTML='<span class="chip-uname">'+esc(pr.dn||me.user)+'</span>'+badgeFor(me.user)+badgesNickHTML(me.user,3)+nickGiftHTML(me.user);}
  const giftEl=document.getElementById('chipGift');
  if(giftEl)giftEl.innerHTML='';
  document.getElementById('chipAva').innerHTML=avaHTML(me.user,me.ava||'🐈');
  /* аватарка в форме новой записи: без этого она оставалась пустой до захода в редактор */
  const meA=document.getElementById('meAva');
  if(meA)meA.innerHTML=avaHTML(me.user,me.ava||'🐈');
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
      g.posts=g.posts||[];g.posts.push({id:Date.now(),ts:Date.now(),author:me.user,ava:me.ava||'🐈',text:t,time:'только что',likes:0,liked:false,comments:[]});
      const all=load(LS.groups,[]);const ix=all.findIndex(x=>x.id===g.id);if(ix>-1)all[ix]=g;save(LS.groups,all);
      addLog('group',me.user,'запись в группе '+g.name);
      el.value='';renderGrpPosts();toast('опубликовано в группе');
    };
    document.getElementById('grpInput').onkeydown=e=>{if(e.key==='Enter')document.getElementById('grpSend').click();};
  }
}

/* ============ oomy music ============ */
/* ============ МОДАЛКА ЗАГРУЗКИ ТРЕКА ============ */
let upCoverMid=null,upCoverTouched=false,upCoverTask=null,upCoverSeq=0;
/* вытаскиваем обложку прямо из аудиофайла: mp3 (ID3 APIC/PIC), m4a/mp4 (covr), flac (picture) */
function aL1(u8,s,e){let x='';for(let i=s;i<e;i++)x+=String.fromCharCode(u8[i]);return x}
function aFind(u8,str,from){
  const n=str.length;
  outer:for(let i=from||0;i<=u8.length-n;i++){
    for(let j=0;j<n;j++)if(u8[i+j]!==str.charCodeAt(j))continue outer;
    return i;
  }
  return -1;
}
function aBlob(u8,s,e,type){if(e<=s)return null;return new Blob([u8.slice(s,e)],{type:type||'image/jpeg'})}
function id3Cover(u8){
  const ver=u8[3];
  const sync=(a,b,c,d)=>((u8[a]&0x7f)<<21)|((u8[b]&0x7f)<<14)|((u8[c]&0x7f)<<7)|(u8[d]&0x7f);
  const sz=sync(6,7,8,9);
  let pos=10;
  const end=Math.min(u8.length,10+sz);
  if(u8[5]&0x40){
    if(ver===3)pos+=4+((u8[10]<<24)|(u8[11]<<16)|(u8[12]<<8)|u8[13]);
    else pos+=sync(10,11,12,13);
  }
  while(pos+6<=end){
    let id,fsize,hs;
    if(ver===2){
      id=aL1(u8,pos,pos+3);fsize=(u8[pos+3]<<16)|(u8[pos+4]<<8)|u8[pos+5];hs=6;
    }else{
      id=aL1(u8,pos,pos+4);
      fsize=ver===4?sync(pos+4,pos+5,pos+6,pos+7):((u8[pos+4]<<24)|(u8[pos+5]<<16)|(u8[pos+6]<<8)|u8[pos+7])>>>0;
      hs=10;
    }
    if(!fsize||pos+hs+fsize>u8.length)break;
    if(id==='APIC'||id==='PIC'){
      let p=pos+hs;const enc=u8[p++];let mime='image/jpeg';
      if(id==='PIC'){const t=aL1(u8,p,p+3).toLowerCase();mime='image/'+(t==='png'?'png':'jpeg');p+=3;}
      else{const s=p;while(p<u8.length&&u8[p])p++;mime=(aL1(u8,s,p).toLowerCase()||'image/jpeg');if(p<u8.length)p++;}
      p++; /* тип картинки */
      if(enc===1||enc===2){while(p+1<u8.length&&!(u8[p]===0&&u8[p+1]===0))p+=2;p+=2;}
      else{while(p<u8.length&&u8[p])p++;p++;}
      const len=fsize-(p-(pos+hs));
      const b=aBlob(u8,p,p+len,mime);if(b)return b;
    }
    pos+=hs+fsize;
  }
  return null;
}
function mp4Cover(u8){
  const at=aFind(u8,'covr',0);if(at<0)return null;
  const d=aFind(u8,'data',at);if(d<12)return null;
  const sz=((u8[d-4]<<24)|(u8[d-3]<<16)|(u8[d-2]<<8)|u8[d-1])>>>0;
  if(sz<16||d+12+(sz-16)>u8.length)return null;
  const code=((u8[d+4]<<24)|(u8[d+5]<<16)|(u8[d+6]<<8)|u8[d+7])>>>0;
  const mime=code===14?'image/png':code===27?'image/bmp':code===12?'image/gif':'image/jpeg';
  return aBlob(u8,d+12,d+12+(sz-16),mime);
}
function flacCover(u8){
  if(aL1(u8,0,4)!=='fLaC')return null;
  let p=4;
  while(p+4<=u8.length){
    const type=u8[p]&0x7f,last=u8[p]&0x80;
    const len=(u8[p+1]<<16)|(u8[p+2]<<8)|u8[p+3],body=p+4;
    if(type===6){
      let q=body+4;
      const mlen=((u8[q]<<24)|(u8[q+1]<<16)|(u8[q+2]<<8)|u8[q+3])>>>0;q+=4;
      const mime=aL1(u8,q,q+mlen);q+=mlen;
      const dlen=((u8[q]<<24)|(u8[q+1]<<16)|(u8[q+2]<<8)|u8[q+3])>>>0;q+=4+dlen+16;
      const plen=((u8[q]<<24)|(u8[q+1]<<16)|(u8[q+2]<<8)|u8[q+3])>>>0;q+=4;
      if(plen&&q+plen<=u8.length)return aBlob(u8,q,q+plen,mime||'image/jpeg');
    }
    p=body+len;if(last)break;
  }
  return null;
}
async function extractAudioCover(file){
  try{
    if(!file)return null;
    const buf=await file.slice(0,Math.min(file.size,4*1024*1024)).arrayBuffer();
    const u8=new Uint8Array(buf);
    if(u8.length>10&&aL1(u8,0,3)==='ID3'){const b=id3Cover(u8);if(b)return b;}
    const b=mp4Cover(u8)||flacCover(u8);
    return b||null;
  }catch(e){return null;}
}
function upCoverLabel(t){const cn=document.getElementById('upCoverName');if(cn)cn.textContent=t;}
function applyUpCover(blob){
  return new Promise(res=>{
    if(!blob){res(null);return;}
    try{
      putMedia(blob,mid=>{
        if(mid&&!upCoverTouched){upCoverMid=mid;upCoverLabel('обложка из файла');}
        res(mid||null);
      });
    }catch(e){res(null);}
  });
}
function openUpload(){
  const bg=document.getElementById('upBg');
  bg.classList.add('open');
  const f=document.getElementById('upFile'),p=document.getElementById('upPick');
  p.textContent='нажми, чтобы выбрать mp3 / wav / ogg';
  p.onclick=()=>f.click();
  f.onchange=()=>{
    const file=f.files&&f.files[0];
    if(!file)return;
    p.textContent='🎵 '+file.name;
    if(!upCoverTouched&&!upCoverMid){
      const seq=++upCoverSeq;
      upCoverLabel('ищу обложку в файле…');
      upCoverTask=extractAudioCover(file).then(blob=>{
        if(seq!==upCoverSeq||upCoverTouched)return null;
        return applyUpCover(blob);
      }).then(mid=>{
        if(seq!==upCoverSeq||upCoverTouched)return null;
        if(!mid)upCoverLabel('без обложки');
        return mid;
      }).catch(()=>{if(seq===upCoverSeq&&!upCoverTouched)upCoverLabel('без обложки');return null;});
    }
  };
  upCoverMid=null;upCoverTouched=false;upCoverTask=null;upCoverSeq++;
  upCoverLabel('без обложки');
  const cb=document.getElementById('upCover');
  if(cb)cb.onclick=()=>{
    const inp=document.createElement('input');inp.type='file';inp.accept='image/*';
    inp.onchange=()=>{
      const file=inp.files[0];if(!file)return;
      if(file.size>1024*1024){toast('обложка до 1МБ');return;}
      upCoverTouched=true;upCoverTask=null;upCoverSeq++;
      putMedia(file,mid=>{
        if(!mid){toast('обложка слишком большая для хранилища');return;}
        upCoverMid=mid;
        upCoverLabel('своя обложка выбрана');
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
  if(!upCoverTouched&&!upCoverMid&&upCoverTask){try{await upCoverTask;}catch(e){}}
  toast('сохраняю трек навсегда…');
  let mid=null,ib=null;
  try{
    /* любой размер — через общее медиахранилище: копия в indexeddb + облако */
    mid=await new Promise((res)=>putMedia(f,id=>res(id||null)));
  }catch(e){}
  if(mid){
    try{
      const rec=(load(LS.media,{})||{})[mid];
      if(rec&&typeof rec==='object'&&rec.idb)ib=rec.idb;
    }catch(e){}
  }
  if(!mid&&!ib){
    try{ib=await IDB.put('mp3:'+Date.now().toString(36),f);}catch(e){}
  }
  if(!mid&&!ib){toast('не получилось сохранить файл, попробуй ещё раз');return;}
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
  try{
    const u=mid?mediaURL(mid):null;
    if(u)probe.src=u;
    else if(ib){const bl=await IDB.get(ib);if(bl)probe.src=URL.createObjectURL(bl);}
  }catch(e){}
  probe.onloadedmetadata=()=>{const tt=tracksAll();const x=tt.find(x=>x.id===trk.id);if(x){x.dur=probe.duration;tracksSave(tt);}};
  document.getElementById('upName').value='';document.getElementById('upArtist').value='';
  document.getElementById('upFile').value='';document.getElementById('upPrivate').checked=false;
  upCoverMid=null;upCoverTouched=false;upCoverTask=null;upCoverSeq++;
  const ucn=document.getElementById('upCoverName');if(ucn)ucn.textContent='без обложки';
  closeUpload();
  toast(priv?'трек сохранён — приватный, только в «моих треках»':'трек в oomy music, чарте и витрине!');
  if(!document.getElementById('pg-sound').classList.contains('hidden'))renderSound();
  playQueueFrom(trk.id);
}

/* ============ ООMY SOUND (страница музыки) ============ */
function tracksAll(){
  /* надгробия: удалённый (админом или вручную) трек не воскресает из облака или снимка мира */
  const arr=load(LS.tracks,[]);
  try{
    const tb=load(LS.tomb,{})||{};
    const keep=arr.filter(t=>!(t&&t.id!==undefined&&tb[tombKey(LS.tracks,t.id)]!==undefined));
    if(keep.length!==arr.length){save(LS.tracks,keep);return keep;}
  }catch(e){}
  return arr;
}
function tracksSave(t){save(LS.tracks,t);}
function trackOwner(t){return t&&(t.owner||t.artist)||''}
function isMyTrack(t){return t.origin==='local'&&(t.owner?t.owner===me.user:(t.artist||'')===me.user)}
let soundTab='my',soundQuery='',soundSort='new',viewPlId=null;
/* поиск SoundCloud прямо в oomy music */
/* живые вкладки платформ: результаты не кешируем — каждый запрос идёт в сеть */
const PLAT_INFO={
  sc:{name:'SoundCloud',icon:'☁️',ph:'название трека или исполнитель…',hint:'нажми на трек — oomy скачает полную версию и добавит в мои треки, витрину и чарт'},
  sp:{name:'Spotify',icon:'🟢',ph:'что ищем в Spotify…',hint:'нажми на трек — oomy найдёт полную версию или 30-секундное превью и добавит его на сайт'},
  ym:{name:'Яндекс Музыка',icon:'🟡',ph:'что ищем в Яндексе…',hint:'нажми на трек — oomy найдёт полную версию или 30-секундное превью и добавит его на сайт'}
};
const PLAT={
  sc:{found:[],q:'',busy:false,err:''},
  sp:{found:[],q:'',busy:false,err:''},
  ym:{found:[],q:'',busy:false,err:''}
};
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
        <button class="stab ${soundTab==='sp'?'active':''}" data-st="sp">Spotify</button>
        <button class="stab ${soundTab==='ym'?'active':''}" data-st="ym">Яндекс Музыка</button>
      </div>
      ${['sc','sp','ym','plview'].includes(soundTab)?'':`<div class="snd-search">
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
  }else if(['sc','sp','ym'].includes(soundTab)){
    bodyEl.innerHTML=platformTabHTML(soundTab);
    bindPlatformTab(bodyEl,soundTab);
  }else{
    bodyEl.innerHTML=pl.length?pl.map(p=>{
      const own=p.owner===me.user;
      return `<div class="plcard" data-pl="${p.id}">
        <div class="tcover" style="width:54px;height:54px">${plCoverHTML(p,54)}</div>
        <div class="tmid"><div class="tn">${esc(p.name)}</div><div class="td">${(p.trackIds||[]).length} треков · ${own?'мой плейлист':userLink(p.owner||'—')}${(p.members||[]).length?' · соавторы: '+p.members.map(m=>userLink(m)).join(', '):''}${p.savedFrom?' · сохранён от '+userLink(p.savedFrom):''}</div></div>
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
        <div class="pf-sub">плейлист · ${list.length} треков · создал ${userLink(owner)}${(p.members||[]).length?' · соавторы: '+p.members.map(m=>userLink(m)).join(', '):''}${p.savedFrom?' · сохранён от '+userLink(p.savedFrom):''}</div>
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
    <div class="tmid"><div class="tn">${esc(t.name)}${t.priv?' <span class="tag-private">приватный</span>':''}${t.scSource?' <span class="tag-private">с SoundCloud</span>':''}${t.spSource?' <span class="tag-private">со Spotify</span>':''}${t.ymSource?' <span class="tag-private">из Яндекса</span>':''}${t.preview?' <span class="tag-private">превью</span>':''}</div><div class="td">${t.artist?esc(t.artist)+' · ':''}${esc(fmtT(t.dur))} · ▶${t.plays||0}</div></div>
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
    <div class="tmid"><div class="tn">${esc(t.name)}${t.spSource?' <span class="tag-private">со Spotify</span>':''}${t.ymSource?' <span class="tag-private">из Яндекса</span>':''}${t.preview?' <span class="tag-private">превью</span>':''}</div><div class="td">${t.artist?esc(t.artist)+' · ':''}${esc(fmtT(t.dur))} · ▶${t.plays||0}</div></div>
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
/* рабочие CORS-прокси: несколько сразу, кто ответит первым — того и ответ */
const SC_PROXIES=[
  u=>u,
  u=>'https://cors-get-proxy.sirjosh.workers.dev/?url='+encodeURIComponent(u),
  u=>'https://proxy.corsfix.com/?'+u,
  u=>'https://cors.redoc.ly/'+u,
  u=>'https://api.cors.lol/?url='+encodeURIComponent(u)
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
/* --- поиск в SoundCloud: находим client_id и дергаем публичный api-v2 --- */
const SC_CID_KEY='oomy.scClientId';
async function fetchTextDirect(url,ms){
  const ac=new AbortController();const t=setTimeout(()=>ac.abort(),ms||8000);
  try{
    const r=await fetch(url,{signal:ac.signal,cache:'no-store'});
    if(!r.ok)throw new Error('http '+r.status);
    return await r.text();
  }finally{clearTimeout(t);}
}
/* гоняем все прокси разом: первый ответивший побеждает, а не ждём медленные по очереди */
async function scFetch(url,as,ms){
  const tasks=SC_PROXIES.map(async p=>{
    const ac=new AbortController();const t=setTimeout(()=>ac.abort(),ms||9000);
    try{
      const r=await fetch(p(url),{signal:ac.signal,cache:'no-store'});
      if(!r.ok)throw new Error('http '+r.status);
      if(as==='json'){const txt=await r.text();try{return JSON.parse(txt)}catch(e){throw new Error('not json')}}
      if(as==='text')return await r.text();
      return r;
    }finally{clearTimeout(t);}
  });
  return await Promise.any(tasks);
}
async function scClientId(force){
  try{
    if(!force){
      const c=JSON.parse(localStorage.getItem(SC_CID_KEY)||'null');
      if(c&&c.id&&Date.now()-(c.ts||0)<6*3600e3)return c.id;
    }
  }catch(e){}
  let html='';
  try{html=await fetchTextDirect('https://soundcloud.com/',7000);}catch(e){}
  if(!html){try{html=await scFetch('https://soundcloud.com/','text',9000);}catch(e){}}
  if(!html)return null;
  let id=(String(html).match(/client_id["'\s:=]+([a-zA-Z0-9]{20,40})/)||[])[1]||null;
  /* новый soundcloud прячет client_id в js-ассетах: берём их прямо с cdn (там CORS *) */
  if(!id){
    const srcs=[...new Set(Array.from(String(html).matchAll(/src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)).map(m=>m[1]))];
    if(srcs.length){
      const texts=await Promise.allSettled(srcs.map(u=>fetchTextDirect(u,9000)));
      for(const t of texts){
        if(t.status!=='fulfilled')continue;
        const m=String(t.value).match(/client_id["'\s:=]+([a-zA-Z0-9]{20,40})/);
        if(m){id=m[1];break;}
      }
    }
  }
  if(id){try{localStorage.setItem(SC_CID_KEY,JSON.stringify({id,ts:Date.now()}))}catch(e){}}
  return id;
}
async function scSearch(q){
  q=(q||'').trim();if(!q)return [];
  let cid=await scClientId(false),j=null;
  for(let attempt=0;attempt<2;attempt++){
    if(!cid)break;
    const url='https://api-v2.soundcloud.com/search/tracks?q='+encodeURIComponent(q)+
      '&client_id='+encodeURIComponent(cid)+'&limit=24&app_locale=ru&linked_partitioning=0';
    try{j=await scFetch(url,'json',10000)}catch(e){j=null}
    if(j&&Array.isArray(j.collection))break;
    cid=await scClientId(true);
  }
  if(!j||!Array.isArray(j.collection))throw new Error('soundcloud search failed');
  return j.collection.filter(x=>x&&x.title).map(x=>({
    id:x.id,title:x.title,
    user:(x.user&&x.user.username)||'',
    artwork:x.artwork_url||(x.user&&x.user.avatar_url)||'',
    dur:Math.round((x.duration||0)/1000),
    url:x.permalink_url,
    streamable:x.streamable!==false
  }));
}
function scResultRowHTML(r,i){
  const art=r.artwork?'<img src="'+esc(r.artwork)+'" alt="" loading="lazy">':'🎵';
  return `<div class="sc-row" data-si="${i}">
    <span class="sc-art">${art}</span>
    <span class="sc-mid"><b>${esc(r.title)}</b><span>${esc(r.user||'soundcloud')}${r.dur?' · '+fmtT(r.dur):''}</span></span>
    <span class="sc-add">＋ на сайт</span>
  </div>`;
}
function scResultsHTML(list){
  if(!list||!list.length)return '';
  return '<div class="sc-list">'+list.map(scResultRowHTML).join('')+'</div>';
}
/* ---------- Spotify / Яндекс Музыка: живой поиск и добавление треков ---------- */
function ymCover(uri){
  if(!uri)return '';
  let u=String(uri).replace('%%','400x400');
  if(!/^https?:/i.test(u))u='https://'+u;
  return u;
}
async function spSearch(q){
  const url='https://spotify-api-lime-xi.vercel.app/api/search?query='+encodeURIComponent(q);
  let j=null;
  try{
    const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout?AbortSignal.timeout(15000):undefined});
    if(!r.ok)throw new Error('http '+r.status);
    j=await r.json();
  }catch(e){
    j=await scFetch(url,'json',15000);
  }
  const list=(j&&Array.isArray(j.tracks))?j.tracks:[];
  return list.map(t=>({
    id:t.identifier||t.id,
    title:t.title||'',
    user:t.author||'',
    artwork:t.artworkUrl||'',
    dur:Math.round((t.duration||0)/1000),
    url:t.uri||('https://open.spotify.com/track/'+encodeURIComponent(t.identifier||''))
  })).filter(r=>r.title&&r.id);
}
async function ymSearch(q){
  const url='https://api.music.yandex.net/search?text='+encodeURIComponent(q)+'&type=track&page=0&nocorrect=false';
  const j=await scFetch(url,'json',15000);
  const list=(j&&j.result&&j.result.tracks&&Array.isArray(j.result.tracks.results))?j.result.tracks.results:[];
  return list.map(t=>{
    const alb=t.albums&&t.albums[0];
    return {
      id:String(t.id||t.realId||''),
      title:t.title||'',
      user:(t.artists||[]).map(a=>a.name).filter(Boolean).join(', '),
      artwork:ymCover(t.coverUri||(alb&&alb.coverUri)),
      dur:Math.round((t.durationMs||0)/1000),
      url:'https://music.yandex.ru/track/'+encodeURIComponent(t.id||t.realId||'')
    };
  }).filter(r=>r.title&&r.id);
}
async function platSearch(kind,q){
  if(kind==='sc')return await scSearch(q);
  if(kind==='sp')return await spSearch(q);
  return await ymSearch(q);
}
function platRowHTML(kind,r,i){
  const key=kind+':'+r.id;
  const added=tracksAll().some(t=>t.platId===key||(r.url&&(t.extUrl===r.url||t.scUrl===r.url)));
  const art=r.artwork?'<img src="'+esc(r.artwork)+'" alt="" loading="lazy">':'🎵';
  return `<div class="sc-row${added?' added':''}" data-pi="${i}">
    <span class="sc-art">${art}</span>
    <span class="sc-mid"><b>${esc(r.title)}</b><span>${esc(r.user||PLAT_INFO[kind].name)}${r.dur?' · '+fmtT(r.dur):''}</span></span>
    <span class="sc-add">${added?'✓ уже есть':'＋ на сайт'}</span>
  </div>`;
}
function platResultsHTML(kind){
  const st=PLAT[kind],info=PLAT_INFO[kind];
  if(st.busy)return '<div class="snd-empty">ищу в '+esc(info.name)+'…</div>';
  if(!st.found.length)return st.err?'<div class="snd-empty">'+esc(st.err)+'</div>':'';
  return '<div class="sc-list">'+st.found.map((r,i)=>platRowHTML(kind,r,i)).join('')+'</div>';
}
function platformTabHTML(kind){
  const st=PLAT[kind],info=PLAT_INFO[kind];
  return `<div class="snd-sec"><h3>${info.icon} поиск в ${esc(info.name)}</h3><span class="fsub" style="font-size:12px">${esc(info.hint)}</span></div>
    <div style="padding:2px 16px 8px;display:flex;gap:8px;flex-wrap:wrap">
      <input class="pill-input" id="platQ" style="flex:1;min-width:200px" placeholder="${esc(info.ph)}" value="${esc(st.q)}" autocomplete="off">
      <button class="send-btn on" id="platGo" style="padding:0 20px;border:none;border-radius:12px;background:var(--acc);color:var(--acc-fg);font-weight:700;cursor:pointer;pointer-events:auto">🔍 искать</button>
    </div>
    <div id="platResults" style="padding:0 16px 8px">${platResultsHTML(kind)}</div>
    <div class="snd-tip">результаты всегда свежие — oomy не кеширует выдачу. если трек не находится, проверь название или загрузи mp3 вручную.
      <div style="margin-top:8px"><button class="minibtn" id="platManual">⬆ mp3 вручную</button></div>
      <input type="file" id="platManualFile" accept="audio/*" class="hidden">
    </div>`;
}
function bindPlatformTab(box,kind){
  const st=PLAT[kind],info=PLAT_INFO[kind];
  const inp=box.querySelector('#platQ'),btn=box.querySelector('#platGo'),res=box.querySelector('#platResults');
  const wire=()=>{
    if(!res)return;
    res.querySelectorAll('[data-pi]').forEach(el=>{
      el.onclick=()=>{
        const r=st.found[Number(el.dataset.pi)];
        if(!r||el.classList.contains('busy'))return;
        if(el.classList.contains('added')){toast('этот трек уже есть на сайте');return;}
        el.classList.add('busy');
        const ad=el.querySelector('.sc-add');if(ad)ad.textContent='добавляю…';
        if(kind==='sc'){
          addFromSoundCloud(r.url,{keepTab:true,title:r.title,artist:r.user,cover:r.artwork,dur:r.dur});
        }else{
          addFromPlatform(kind,r,el);
        }
      };
    });
  };
  const doSearch=async()=>{
    const q=(inp&&inp.value||'').trim();
    if(!q){toast('напиши, что искать в '+info.name);return;}
    if(st.busy)return;
    st.busy=true;st.q=q;st.err='';
    if(btn){btn.disabled=true;btn.textContent='ищу…';}
    if(res)res.innerHTML='<div class="snd-empty">ищу в '+esc(info.name)+'…</div>';
    try{
      const list=await platSearch(kind,q);
      st.found=Array.isArray(list)?list:[];
      if(!st.found.length)st.err='ничего не нашлось — попробуй другой запрос';
    }catch(e){
      st.found=[];
      st.err='не получилось получить ответ от '+info.name+'. проверь сеть и попробуй ещё раз.';
    }
    st.busy=false;
    if(res&&res.isConnected){
      res.innerHTML=platResultsHTML(kind);
      wire();
    }
    if(btn){btn.disabled=false;btn.textContent='🔍 искать';}
  };
  if(inp)inp.onkeydown=e=>{if(e.key==='Enter')doSearch();};
  if(btn)btn.onclick=doSearch;
  const mf=box.querySelector('#platManualFile');
  const mb=box.querySelector('#platManual');
  if(mb&&mf)mb.onclick=()=>mf.click();
  if(mf)mf.onchange=()=>{const f=mf.files[0];if(!f)return;document.getElementById('upFile').files=mf.files;openUpload();toast('файл выбран — проверь название и жми «опубликовать»');};
  wire();
}
function platNorm(s){
  return String(s||'').toLowerCase().replace(/\([^)]*\)|\[[^\]]*\]/g,' ').replace(/[^a-z0-9а-яё]+/gi,' ').trim();
}
function bestScMatch(list,title,artist,targetDur){
  const nt=platNorm(title),na=platNorm(artist);
  let best=null,bs=0;
  for(const x of (list||[])){
    if(!x||!x.url||x.streamable===false)continue;
    const ct=platNorm(x.title),cu=platNorm(x.user);
    let s=0;
    if(ct===nt)s+=4;
    else if(nt&&(ct.includes(nt)||nt.includes(ct)))s+=2.5;
    else{
      const toks=nt.split(' ').filter(w=>w.length>2);
      const hit=toks.filter(w=>ct.includes(w)).length;
      if(hit)s+=Math.min(2.4,hit*0.8);
    }
    if(na&&cu&&(cu.includes(na)||na.includes(cu)||cu.split(' ').some(w=>w.length>2&&na.includes(w))))s+=2;
    const dd=Math.abs((x.dur||0)-(targetDur||0));
    if(targetDur){if(dd<=6)s+=2;else if(dd<=15)s+=1;else if(dd>35)s-=4;}
    if(s>bs){bs=s;best=x;}
  }
  if(!best||bs<4)return null;
  if(targetDur&&Math.abs((best.dur||0)-targetDur)>25)return null;
  return best;
}
async function itunesPreview(title,artist){
  const term=(title+' '+artist).trim();
  const url='https://itunes.apple.com/search?term='+encodeURIComponent(term)+'&media=music&limit=5&country=RU';
  let j=null;
  try{const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout?AbortSignal.timeout(12000):undefined});if(r.ok)j=await r.json();}
  catch(e){}
  if(!j){try{j=await scFetch(url,'json',12000);}catch(e){}}
  const list=(j&&Array.isArray(j.results))?j.results:[];
  if(!list.length)return null;
  const nt=platNorm(title),na=platNorm(artist);
  list.sort((a,b)=>{
    const score=x=>{
      let s=0;const ct=platNorm(x.trackName),ca=platNorm(x.artistName);
      if(ct===nt)s+=3;else if(ct&&(ct.includes(nt)||nt.includes(ct)))s+=1.5;
      if(na&&ca&&(ca.includes(na)||na.includes(ca)))s+=2;
      return s;
    };
    return score(b)-score(a);
  });
  const pick=list.find(x=>x&&x.previewUrl);
  if(!pick)return null;
  let blob=null;
  try{const r=await fetch(pick.previewUrl,{cache:'no-store',signal:AbortSignal.timeout?AbortSignal.timeout(15000):undefined});if(r.ok)blob=await r.blob();}catch(e){}
  if(!blob||!blob.size){try{const r=await scFetch(pick.previewUrl,undefined,15000);if(r&&r.ok)blob=await r.blob();}catch(e){}}
  if(!blob||!blob.size)return null;
  if(/mp4|m4a|m4p|aac/i.test(blob.type||''))blob=new Blob([blob],{type:'audio/mp4'});
  else blob=new Blob([blob],{type:'audio/mpeg'});
  return {blob,dur:30,name:pick.trackName||title,artist:pick.artistName||artist,cover:pick.artworkUrl100||''};
}
async function audioCheck(blob){
  return await new Promise(res=>{
    let done=false;
    const a=document.createElement('audio');
    const u=URL.createObjectURL(blob);
    let dur=0;
    const finish=ok=>{if(done)return;done=true;try{URL.revokeObjectURL(u)}catch(e){};try{a.removeAttribute('src')}catch(e){};res({ok,dur:Math.round((dur||a.duration||0)*10)/10})};
    a.preload='auto';
    a.onloadedmetadata=()=>{dur=a.duration||0};
    a.oncanplay=()=>finish(true);
    a.onerror=()=>finish(false);
    setTimeout(()=>finish(!a.error&&a.readyState>=2),6000);
    a.src=u;
  });
}
async function storeAudioBlob(blob,title){
  let ib=null,mid=null;
  try{
    const ext=/mp4|m4a|aac/i.test(blob.type||'')?'m4a':'mp3';
    const file=new File([blob],((title||'track')+'.'+ext).slice(0,80),{type:blob.type||'audio/mpeg'});
    mid=await new Promise(res=>putMedia(file,id=>res(id||null)));
    if(mid){const rec=(load(LS.media,{})||{})[mid];if(rec&&typeof rec==='object'&&rec.idb)ib=rec.idb;}
  }catch(e){}
  if(!mid){
    try{ib=await IDB.put('mp3:'+Date.now().toString(36),blob);}catch(e){}
    if(!ib){
      const fr=new FileReader();
      const data=await new Promise(res=>{fr.onload=()=>res(fr.result);fr.readAsDataURL(blob);});
      const m=load(LS.media,{});mid='a'+Date.now().toString(36)+Math.floor(Math.random()*999);m[mid]=data;
      try{localStorage.setItem(LS.media,JSON.stringify(m))}catch(ex){throw new Error('storage full');}
    }
  }
  return {ib,mid};
}
async function platGrab(kind,r){
  let blob=null,cover=r.artwork||'',source='preview',dur=0,metaName=r.title||'',metaArtist=r.user||'';
  /* сначала пробуем найти полную версию на SoundCloud (по названию и длительности) */
  if(r.dur&&r.dur>45){
    try{
      const list=await scSearch((r.title+' '+(r.user||'')).trim());
      const pick=bestScMatch(list,r.title,r.user,r.dur);
      if(pick){
        const g=await scGrab(pick.url);
        if(g&&g.blob&&g.blob.size>150000){
          blob=g.blob;dur=pick.dur||r.dur;source='full';
          if(!cover&&g.meta&&g.meta.thumbnail_url)cover=g.meta.thumbnail_url;
        }
      }
    }catch(e){}
  }
  /* если полной версии нет или файл не декодируется — 30-секундное превью из iTunes */
  let chk=blob?await audioCheck(blob):null;
  if(blob&&chk&&!chk.ok){blob=null;chk=null;}
  if(!blob){
    const p=await itunesPreview(r.title,r.user);
    if(!p)throw new Error('no audio');
    blob=p.blob;dur=p.dur||30;source='preview';
    if(p.cover&&!cover)cover=p.cover;
    chk=await audioCheck(blob);
    if(!chk.ok)throw new Error('bad audio');
  }
  /* проверяем реальную длину: SoundCloud иногда отдаёт 30-секундный превью вместо полной версии */
  if(chk&&chk.dur>0){
    dur=chk.dur;
    if(source==='full'&&r.dur&&chk.dur<Math.min(90,r.dur*0.6))source='preview';
  }
  return {blob,cover,dur,source,name:metaName,artist:metaArtist};
}
async function addFromPlatform(kind,r,el){
  const key=kind+':'+r.id;
  const all0=tracksAll();
  if(all0.some(t=>t.platId===key||(r.url&&(t.extUrl===r.url||t.scUrl===r.url)))){
    toast('этот трек уже есть на сайте');
    return;
  }
  toast(kind==='sp'?'ищу трек в Spotify и готовлю аудио…':'ищу трек в Яндексе и готовлю аудио…');
  let g;
  try{g=await platGrab(kind,r);}
  catch(e){
    toast(kind==='sp'?'Spotify не отдал аудио этого трека — попробуй другой':'Яндекс не отдал аудио этого трека — попробуй другой');
    if(el&&el.isConnected){el.classList.remove('busy');const ad=el.querySelector('.sc-add');if(ad)ad.textContent='＋ на сайт';}
    return;
  }
  let stored=null;
  try{stored=await storeAudioBlob(g.blob,g.name||r.title);}
  catch(e){
    toast('не хватило места для файла — попробуй другой трек');
    return;
  }
  if(!stored||(!stored.mid&&!stored.ib)){toast('не смог сохранить аудио');return;}
  const trk={id:'t'+Date.now().toString(36)+Math.floor(Math.random()*999),
    name:(g.name||r.title).slice(0,80),
    artist:(g.artist||r.user||'').slice(0,60),
    owner:me.user,
    cover:rnd(['🎧','🎹','🔥','🌙','⚡','🟢','🟡']),
    coverUrl:g.cover||r.artwork||'',
    origin:'local',platId:key,extUrl:r.url,sourceKind:kind,
    preview:g.source!=='full',
    liked:false,plays:0,dur:Math.round(g.dur||r.dur||0),priv:false,
    ib:stored.ib,mid:stored.mid};
  if(kind==='sc'){trk.scSource=true;trk.scUrl=r.url;}
  if(kind==='sp')trk.spSource=true;
  if(kind==='ym')trk.ymSource=true;
  const all=tracksAll();all.unshift(trk);tracksSave(all);
  addLog('music',me.user,'добавил трек «'+trk.name+'» из '+PLAT_INFO[kind].name);
  addOon(25);bumpUpload();
  if(g.source==='full'){
    toast('«'+trk.name+'» добавлен в мои треки, витрину и чарт');
  }else{
    toast('«'+trk.name+'» добавлен как 30-секундное превью — полной версии не нашлось');
  }
  if(window.__PG==='sound')renderSound();
}

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
/* HLS-аудио SoundCloud: качаем init-кусок и все сегменты, склеиваем в один m4a */
async function scHlsBlob(streamUrl,ms){
  const getText=async u=>{
    try{return await fetchTextDirect(u,ms||15000);}
    catch(e){return await scFetch(u,'text',ms||15000);}
  };
  let plUrl=streamUrl,pl=await getText(plUrl);
  const encRe=/#EXT-X-(?:SESSION-)?KEY:[^\n]*METHOD=(?!NONE)/i;
  if(encRe.test(pl))throw new Error('hls encrypted');
  if(/#EXT-X-STREAM-INF/.test(pl)){
    const lines=pl.split(/\r?\n/);
    let v='';
    for(let i=0;i<lines.length;i++)if(lines[i].startsWith('#EXT-X-STREAM-INF')){v=(lines[i+1]||'').trim();break;}
    if(!v)throw new Error('hls variant');
    plUrl=new URL(v,plUrl).href;pl=await getText(plUrl);
    if(encRe.test(pl))throw new Error('hls encrypted');
  }
  let total=0;
  pl.split(/\r?\n/).forEach(l=>{const m=l.match(/^#EXTINF:([\d.]+)/);if(m)total+=parseFloat(m[1])||0;});
  if(total>1800)throw new Error('track too long');
  const mapHref=(pl.match(/#EXT-X-MAP:URI="([^"]+)"/)||[])[1];
  const segs=pl.split(/\r?\n/).map(l=>l.trim()).filter(l=>l&&!l.startsWith('#'));
  if(!segs.length)throw new Error('hls empty');
  const urls=(mapHref?[mapHref]:[]).concat(segs).map(h=>new URL(h,plUrl).href);
  const parts=new Array(urls.length);
  let idx=0;
  const worker=async()=>{
    while(idx<urls.length){
      const i=idx++,u=urls[i];
      let r=null;
      try{r=await fetch(u);}catch(e){r=null;}
      if(!r||!r.ok){
        try{r=await scFetch(u);}catch(e){throw new Error('hls part');}
      }
      if(!r||!r.ok)throw new Error('hls part');
      parts[i]=new Uint8Array(await r.arrayBuffer());
    }
  };
  await Promise.all(Array.from({length:Math.min(6,urls.length)},()=>worker()));
  return new Blob(parts,{type:'audio/mp4'});
}
async function scGrab(u){
  const oembed='https://soundcloud.com/oembed?format=json&url='+encodeURIComponent(u);
  let meta=null;
  try{meta=await tryAll(oembed,'json')}catch(e){}
  /* путь №2: забираем страницу, ищем client_id и транскодинги */
  let cid=null,prog=null,trs=null;
  try{
    const html=await tryAll(u,'text');
    cid=(html.match(/client_id["'\s:=]+([a-zA-Z0-9]{20,40})/)||[])[1];
    const tj=html.match(/"transcodings":(\[.*?\])/);
    if(tj){
      trs=JSON.parse(tj[1]);
      prog=trs.find(x=>x.format&&x.format.protocol==='progressive'&&/mpeg|mp3/i.test(x.format.mime_type||''))||trs.find(x=>x.format&&x.format.protocol==='progressive');
    }
  }catch(e){}
  /* в новых страницах client_id нет — берём его тем же способом, что и для поиска */
  if(!cid)try{cid=await scClientId(false)}catch(e){}
  if(cid&&prog){
    const stream=await tryAll(prog.url+(prog.url.includes('?')?'&':'?')+'client_id='+cid,'json');
    if(stream.url){
      const r=await tryAll(stream.url);
      const blob=await r.blob();
      if(blob&&blob.size)return {meta,blob};
    }
  }
  /* путь №2б: у новых треков только HLS (aac) — качаем сегменты и склеиваем в m4a */
  if(cid&&trs&&trs.length){
    let h=trs.find(x=>x.preset==='aac_96k')||trs.find(x=>x.preset==='aac_160k')||trs.find(x=>x.format&&x.format.protocol==='hls');
    if(h){
      try{
        const stream=await scFetch(h.url+(h.url.includes('?')?'&':'?')+'client_id='+cid,'json',12000);
        if(stream&&stream.url){
          const blob=await scHlsBlob(stream.url);
          if(blob&&blob.size)return {meta,blob};
        }
      }catch(e){if(String(e&&e.message)==='track too long')throw e;}
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
async function addFromSoundCloud(u,opts){
  opts=opts||{};
  const existing=tracksAll().find(t=>t.scUrl===u);
  if(existing){
    toast('этот трек уже есть на сайте');
    if(opts.keepTab){soundTab='sc';renderSound();}
    else playQueueFrom(existing.id);
    return;
  }
  toast(opts.keepTab?'мур, качаю трек и добавляю на сайт…':'мур-мур, качаю mp3 с SoundCloud… это до минуты');
  let g;
  try{g=await scGrab(u);}
  catch(e){
    if(String(e&&e.message)==='track too long'){
      toast('трек длиннее 30 минут — не потяну, выбери покороче');
    }else{
      toast('саундклауд не отдал файл (линк правообладателя или капризы сети). попробуй другой трек');
    }
    if(opts.keepTab){soundTab='sc';renderSound();}
    return;
  }
  const meta=g.meta||{},blob=g.blob;
  let title=opts.title||meta.title||'',artist=opts.artist||meta.author_name||'';
  if(title&&artist&&title.endsWith(' by '+artist))title=title.slice(0,-(artist.length+4));
  if(!title)title=(u.split('/').slice(3,5).join(' · ')||'SoundCloud трек').slice(0,60);
  let ib=null,mid=null;
  try{
    const ext=/mp4|m4a|aac/i.test(blob.type||'')?'m4a':'mp3';
    const file=new File([blob],((title||'track')+'.'+ext).slice(0,80),{type:blob.type||'audio/mpeg'});
    mid=await new Promise(res=>putMedia(file,id=>res(id||null)));
    if(mid){
      const rec=(load(LS.media,{})||{})[mid];
      if(rec&&typeof rec==='object'&&rec.idb)ib=rec.idb;
    }
  }catch(e){}
  if(!mid){
    try{ib=await IDB.put('mp3:'+Date.now().toString(36),blob);}catch(e){}
    if(!ib){
      const fr=new FileReader();
      const url=await new Promise(res=>{fr.onload=()=>res(fr.result);fr.readAsDataURL(blob);});
      const m=load(LS.media,{});mid='a'+Date.now().toString(36)+Math.floor(Math.random()*999);m[mid]=url;
      try{localStorage.setItem(LS.media,JSON.stringify(m))}catch(ex){toast('файл слишком толстый для хранилища');return}
    }
  }
  const trk={id:'t'+Date.now().toString(36)+Math.floor(Math.random()*999),
    name:title.slice(0,80),artist:(artist||'').slice(0,60),
    owner:me.user,
    cover:rnd(['🎧','🎹','🔥','🌙','⚡']),coverUrl:opts.cover||meta.thumbnail_url||'',
    origin:'local',scSource:true,scUrl:u,liked:false,plays:0,dur:Number(opts.dur)||0,priv:false,
    ib:ib,mid:mid};
  const all=tracksAll();all.unshift(trk);tracksSave(all);
  addLog('music',me.user,'загрузил mp3 «'+trk.name+'» с SoundCloud');
  addOon(25);bumpUpload();
  if(opts.keepTab){
    toast('«'+trk.name+'» добавлен в мои треки, витрину и чарт');
    soundTab='sc';renderSound();
    return;
  }
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
    items.push({t:'🎧 прикрепить / заменить аудио',f:()=>{
      const inp=document.createElement('input');inp.type='file';inp.accept='audio/*';
      inp.onchange=()=>{
        const f=inp.files&&inp.files[0];if(!f)return;
        if(!/^audio\//.test(f.type||'')&&!/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(f.name)){toast('нужен аудиофайл');return;}
        if(f.size>40*1024*1024){toast('файл больше 40МБ');return;}
        toast('сохраняю аудио навсегда…');
        putMedia(f,mid=>{
          if(!mid){toast('не получилось сохранить файл');return;}
          const rec=(load(LS.media,{})||{})[mid];
          const all=tracksAll();const x=all.find(x=>x.id===t.id);
          if(!x){toast('трек уже удалён');return;}
          x.mid=mid;
          if(rec&&rec.idb)x.ib=rec.idb;
          tracksSave(all);
          delete TRACKSRC[x.id];delete MEMFAIL[x.id];
          addLog('music',me.user,'вернул аудио к треку «'+x.name+'»');
          renderSound();toast('аудио прикреплено — трек снова играет');
        });
      };
      inp.click();
    }});
    items.push({t:'удалить трек',danger:true,f:()=>{
      const all=tracksAll();const cur=player.currentId===t.id;
      tombAdd(LS.tracks,t.id);
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
    if(t.spSource)items.push({t:'открыть в Spotify',f:()=>window.open(t.extUrl||'https://open.spotify.com','_blank')});
    if(t.ymSource)items.push({t:'открыть в Яндекс Музыке',f:()=>window.open(t.extUrl||'https://music.yandex.ru','_blank')});
    items.push({t:'пожаловаться',danger:true,f:()=>{
      addLog('report',me.user,'жалоба на трек «'+t.name+'»');
      pushNotif(ADMIN,'🚨','@'+me.user+' пожаловался на трек «'+t.name+'»',{av:me.user});
      toast('жалоба отправлена главному коту');
    }});
  }else{
    items.push({t:'открыть на звуке',f:()=>{window.open(t.scUrl,'_blank');}});
    items.push({t:'убрать из списка',danger:true,f:()=>{tombAdd(LS.tracks,t.id);save(LS.tracks,tracksAll().filter(x=>x.id!==t.id));renderSound();}});
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
  player.playing=false;syncPlayerUI();try{syncNowPlaying(false)}catch(e){}
  if(player.repeat){player.audio.currentTime=0;player.audio.play().then(()=>{player.playing=true;syncPlayerUI();try{syncNowPlaying(true)}catch(e){};});return;}
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
/* ============ ИСТОЧНИК ТРЕКА ============
   файл может лежать в трёх местах: base64 в карте медиа (mid), blob в indexeddb (mid/ib)
   или копия в облаке. ищем везде, найденное возвращаем на место и дублируем в облако. */
const TRACKSRC={};
/* треки, чьи исходники удалось спасти: лежат прямо в сайте, поэтому играют у всех и всегда */
const BUNDLED_AUDIO={
  tmwcmiyn388:'assets/audio/bmecte.mp3',
  tmwe01sm7175:'assets/audio/vse-ne-tak-cvetochno.mp3',
  tmwcdeyco323:'assets/audio/minuty-malo.mp3',
  tmwcdmmjq367:'assets/audio/this-love.mp3',
  tmwcdkphb659:'assets/audio/segodnya.mp3',
  tmwcdgpei182:'assets/audio/ne-tvoy-prazdnik.mp3'
};
const BUNDLED_BY_NAME={
  'bmecte':'assets/audio/bmecte.mp3',
  'все не так цветочно':'assets/audio/vse-ne-tak-cvetochno.mp3',
  'минуты':'assets/audio/minuty-malo.mp3',
  'this love':'assets/audio/this-love.mp3',
  'сегодня':'assets/audio/segodnya.mp3',
  'не твой праздник':'assets/audio/ne-tvoy-prazdnik.mp3'
};
function bundledTrackURL(t){
  if(!t)return '';
  if(BUNDLED_AUDIO[t.id])return BUNDLED_AUDIO[t.id];
  const n=String(t.name||'').toLowerCase().replace(/ё/g,'е')
    .replace(/[^a-zа-я0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
  return BUNDLED_BY_NAME[n]||'';
}
function applyBundledTracks(){
  try{
    const all=tracksAll();let ch=false;
    all.forEach(t=>{
      const u=bundledTrackURL(t);
      if(u&&t.url!==u){t.url=u;ch=true;}
    });
    /* только локально: облако не трогаем, иначе можно затереть чужие треки */
    if(ch){
      const raw=JSON.stringify(all);
      localStorage.setItem(LS.tracks,raw);
      try{mirrorPut(LS.tracks,all)}catch(e){}
    }
  }catch(e){}
}
function trackURL(id,blob){
  if(MEMURL[id])return MEMURL[id];
  try{const u=URL.createObjectURL(blob);MEMURL[id]=u;return u;}catch(e){return null}
}
function registerMedia(id,key,blob){
  try{
    const m=load(LS.media,{})||{};
    const bt=String(blob.type||'');
    m[id]={idb:key,kind:bt.indexOf('video')===0?'vid':(bt.indexOf('audio')===0?'aud':'img')};
    localStorage.setItem(LS.media,JSON.stringify(m));
    try{cloudPush(LS.media)}catch(e){}
  }catch(e){}
}
async function findTrackBlob(t){
  if(t.mid){
    let rec=null;try{rec=(load(LS.media,{})||{})[t.mid]}catch(e){}
    if(typeof rec==='string'&&rec)return {url:rec};
    const key=(rec&&rec.idb)||('media:'+t.mid);
    let b=null;
    try{b=await IDB.get(key)}catch(e){}
    if(!b){try{b=await binGet(t.mid)}catch(e){}}
    if(b)return {url:trackURL(t.mid,b),blob:b,key,healed:(!rec||typeof rec!=='object')};
  }
  if(t.ib){
    let b=null;
    try{b=await IDB.get(t.ib)}catch(e){}
    if(b)return {url:trackURL(t.id,b),blob:b,key:t.ib,healed:!t.mid};
  }
  return null;
}
async function resolveTrackSrc(t){
  if(!t)return null;
  if(TRACKSRC[t.id])return TRACKSRC[t.id];
  const got=await findTrackBlob(t);
  if(got&&got.url){
    if(got.blob&&got.healed){
      /* файл нашёлся у владельца: закрепляем за треком mid и сразу дублируем в облако */
      const mid=t.mid||('a'+Date.now().toString(36)+Math.floor(Math.random()*999));
      registerMedia(mid,got.key,got.blob);
      if(!t.mid){
        const all=tracksAll();const x=all.find(x=>x.id===t.id);
        if(x){x.mid=mid;x.ib=got.key;tracksSave(all);}
      }
      binPut(mid,got.blob);
    }
    TRACKSRC[t.id]=got.url;
    return got.url;
  }
  const bundled=bundledTrackURL(t);
  if(bundled){TRACKSRC[t.id]=bundled;return bundled;}
  const legacy=t.url||t.src||t.srcUrl||t.fileUrl||'';
  if(legacy){TRACKSRC[t.id]=legacy;return legacy;}
  return null;
}
/* при входе владельца чиним старые треки: у них был только ib — теперь появится облачная копия */
async function healTracksAll(){
  try{
    const all=tracksAll();
    for(const t of all){
      if(!t.mid&&t.ib){try{await resolveTrackSrc(t)}catch(e){}}
    }
  }catch(e){}
}
async function setCurrent(id){
  player.currentId=id;
  const t=tracksAll().find(x=>x.id===id);
  if(!t){toast('трек убежал');return;}
  let u=await resolveTrackSrc(t);
  if(!u){
    toast('догружаю трек из облака…');
    await new Promise(r=>setTimeout(r,900));
    u=await resolveTrackSrc(t);
    if(!u){
      toast(isMyTrack(t)
        ?'файл этого трека не сохранился на этом устройстве — в oomy music открой его (⋯) и прикрепи аудио заново'
        :'файл ещё не доехал до этого устройства — включи трек там, где он загружен, и он сам сохранится в облако');
      return;
    }
  }
  const all=tracksAll();const x=all.find(x=>x.id===id);if(x){x.plays=(x.plays||0)+1;tracksSave(all);}
  player.audio.src=u;player.audio.play().then(()=>{player.playing=true;syncPlayerUI();try{syncNowPlaying(true)}catch(e){};}).catch(()=>{player.playing=false;syncPlayerUI();try{syncNowPlaying(false)}catch(e){}});
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
  try{syncNowPlaying(player.playing)}catch(e){}
}
function pausePlayer(){player.audio.pause();player.playing=false;syncPlayerUI();try{syncNowPlaying(false)}catch(e){}}
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
function chatsKey(){return LS.chats+(me&&me.user?('__'+me.user):'')}
function isChatKey(k){return k===LS.chats||(typeof k==='string'&&k.indexOf(LS.chats+'__')===0)}
function chatsData(){return encLoad(chatsKey(),{});}
function chatsSave(c){encSave(chatsKey(),c);}
/* ===== удаление как в телеграме =====
   «у себя» — только этот браузер и этот аккаунт: отметки лежат в oomy.hide__…
   «у обоих» — общие надгробия oomy.msgTomb / oomy.chatTomb, их видят все,
   поэтому сообщение/диалог исчезает у собеседника при следующей синхронизации. */
function pairKey(pal){const a=[String((me&&me.user)||''),String(pal)].sort();return a[0]+'~'+a[1];}
function localHideKey(kind){return 'oomy.hide__'+((me&&me.user)||'guest')+'.'+kind;}
function localHideGet(kind){return load(localHideKey(kind),{})||{};}
function localHideSet(kind,map){save(localHideKey(kind),map);}
function msgHideIds(pal){const m=localHideGet('msg');return Array.isArray(m[pal])?m[pal]:[];}
function chatHideTs(pal){return Number((localHideGet('chat')||{})[pairKey(pal)]||0);}
function msgTombAll(){return load(LS.msgTomb,{})||{};}
function chatTombAll(){return load(LS.chatTomb,{})||{};}
function msgTombTs(pal,id){return Number(msgTombAll()[pairKey(pal)+'~'+String(id)]||0);}
function chatBothTs(pal){return Number(chatTombAll()[pairKey(pal)]||0);}
function chatCutTs(pal){return Math.max(chatHideTs(pal),chatBothTs(pal));}
/* одно место правды: какие сообщения диалога вообще существуют для меня */
function chatVisibleList(pal,list){
  const all=Array.isArray(list)?list:[];
  const cut=chatCutTs(pal);
  const hid=msgHideIds(pal);
  const tm=msgTombAll();
  const pk=pairKey(pal);
  return all.filter(m=>{
    if(!m)return false;
    const id=String(m.id||'');
    if(hid.indexOf(id)>-1)return false;
    if(tm[pk+'~'+id])return false;
    const ts=msgTs(m);
    if(cut&&ts&&ts<=cut)return false;
    return true;
  });
}
function chatMsgs(pal){return chatVisibleList(pal,(chatsData()||{})[pal]||[]);}
/* конверт для перезаписи чужого узла чата */
function envPack(obj){
  const bytes=new TextEncoder().encode(JSON.stringify(obj));
  for(let i=0;i<bytes.length;i++)bytes[i]^=XKEY.charCodeAt(i%XKEY.length)%256;
  let bin='';for(const b of bytes)bin+=String.fromCharCode(b);
  return {v:2,d:btoa(bin)};
}
function msgDelMe(pal,id){
  const m=localHideGet('msg');
  const list=Array.isArray(m[pal])?m[pal]:[];
  if(list.indexOf(String(id))<0)list.push(String(id));
  m[pal]=list;localHideSet('msg',m);
  const c=chatsData();const arr=c[pal]||[];
  const i=arr.findIndex(x=>String(x&&x.id)===String(id));
  if(i>-1){arr.splice(i,1);c[pal]=arr;chatsSave(c);}
}
async function msgDelBoth(pal,id){
  const tm=msgTombAll();tm[pairKey(pal)+'~'+String(id)]=Date.now();save(LS.msgTomb,tm);
  const c=chatsData();const arr=c[pal]||[];
  const i=arr.findIndex(x=>String(x&&x.id)===String(id));
  if(i>-1){arr.splice(i,1);c[pal]=arr;chatsSave(c);}
  await chatNodeDropMsg(pal,String(id));
}
/* переписываю узел собеседника: у него эта переписка лежит под моим ником */
async function chatNodeDropMsg(pal,id){
  const root=cloudRoot();if(!root)return;
  if(!me||!me.user||me.guest)return;
  try{
    const url=root.slice(0,-5)+CHNODE(pal)+'.json';
    const r=await cloudFetch(url);if(!r.ok)return;
    const R=decEnv(await r.json());
    if(!R||typeof R!=='object'||!Array.isArray(R[me.user]))return;
    const before=R[me.user].length;
    R[me.user]=R[me.user].filter(x=>String(x&&x.id)!==String(id));
    if(R[me.user].length===before)return;
    await cloudFetch(url,{method:'PUT',body:JSON.stringify(envPack(R))});
  }catch(e){}
}
async function chatNodeDropChat(name){
  const root=cloudRoot();if(!root)return;
  if(!me||!me.user||me.guest)return;
  try{
    const url=root.slice(0,-5)+CHNODE(name)+'.json';
    const r=await cloudFetch(url);if(!r.ok)return;
    const R=decEnv(await r.json());
    if(!R||typeof R!=='object'||!(me.user in R))return;
    delete R[me.user];
    await cloudFetch(url,{method:'PUT',body:JSON.stringify(envPack(R))});
  }catch(e){}
}
async function chatDel(name,forBoth){
  if(!me||me.guest)return;
  const c=chatsData();
  if(c[name]!==undefined){delete c[name];chatsSave(c);}
  const cut=Date.now();
  const h=localHideGet('chat');h[pairKey(name)]=cut;localHideSet('chat',h);
  if(forBoth){
    const tm=chatTombAll();tm[pairKey(name)]=cut;save(LS.chatTomb,tm);
    await chatNodeDropChat(name);
  }
  openChatName=null;chatAtt=null;chatReply=null;
  renderChats();
  try{syncBadges()}catch(e){}
  toast(forBoth?'диалог удалён у обоих 🧹':'диалог удалён у тебя 🧹');
}
/* меню диалога: открыть, удалить у себя, удалить у обоих */
function chatMenu(pal,e){
  const items=[];
  if(openChatName!==pal)items.push({t:'открыть диалог',f:()=>openChat(pal)});
  if(pal!==SELF.n)items.push({t:'👤 профиль',f:()=>{if(!me.guest)openUserPage(pal);}});
  items.push({t:'🗑 удалить у себя',danger:true,f:()=>chatDel(pal,false)});
  if(pal!==SELF.n)items.push({t:'🗑 удалить у обоих',danger:true,f:()=>chatDel(pal,true)});
  menuPop(e.clientX,e.clientY,items);
}
/* старый общий ключ чатов переезжает в личный ключ текущего аккаунта */
function chatMigrate(){
  try{
    if(!me||me.guest)return;
    const base=localStorage.getItem(LS.chats);if(!base)return;
    const k=chatsKey();
    if(localStorage.getItem(k)===null)localStorage.setItem(k,base);
    localStorage.removeItem(LS.chats);
  }catch(e){}
}
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
/* время сообщения для списка диалогов: сегодня — ЧЧ:ММ, раньше — ДД.ММ.ГГ */
function msgTimeStr(m){
  const ts=msgTs(m);
  if(!ts)return (m&&m.time)||'';
  const d=new Date(ts),n=new Date();
  const hm=('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);
  if(d.toDateString()===n.toDateString())return hm;
  return ('0'+d.getDate()).slice(-2)+'.'+('0'+(d.getMonth()+1)).slice(-2)+'.'+String(d.getFullYear()).slice(-2);
}
function renderChats(){
  const box=document.getElementById('pg-msgs');
  if(openChatName)return renderChat(openChatName);
  const others=Object.keys(encLoad(LS.acc,{})).filter(u=>u!==me.user);
  /* избранное — всегда сверху, писать туда что угодно */
  const selfMsgs=chatMsgs(SELF.n);
  const selfSub=selfMsgs.length?msgPreview(selfMsgs[selfMsgs.length-1],34):'заметки для себя — пиши что угодно';
  const selfRow=`<div class="dlg" data-chat="${esc(SELF.n)}">
    <div class="ava dlg-ava">${SELF.ava}</div>
    <div class="dlg-mid">
      <div class="dlg-top"><span class="dlg-name">избранное</span><span class="dlg-time">${selfMsgs.length?msgTimeStr(selfMsgs[selfMsgs.length-1]):''}</span></div>
      <div class="dlg-bot"><span class="dlg-preview">⭐ ${esc(selfSub)}</span></div>
    </div>
    <button class="dlg-more" data-dlgm="${esc(SELF.n)}" title="действия">⋯</button>
  </div>`;
  /* диалоги: последние сверху, непрочитанные — с красной плашкой */
  const rows=others.map(u=>{
    const msgs=chatMsgs(u);
    const last=msgs[msgs.length-1];
    const un=unreadCount(u);
    return {n:u,ava:(encLoad(LS.acc,{})[u]||{}).ava||'🐈',msgs,last,un};
  }).filter(p=>p.msgs.length).sort((a,b)=>msgTs(b.last)-msgTs(a.last));
  box.innerHTML=`<div class="pcard" style="padding:12px 18px 14px">
    <div class="dlg-head">
      <h3>диалоги${rows.length?` <span class="dlg-count">${rows.length}</span>`:''}</h3>
      <span class="from-line">нажми на диалог — откроется чат · ник или ава — профиль</span>
    </div>
    ${selfRow}
    ${rows.map(p=>{
      const last=p.last;
      const pre=last.who==='me'?'<b style="color:var(--text);opacity:.85">Вы: </b>':'';
      const on=isOnline(p.n)?'<span class="online-dot"></span>':'';
      return `<div class="dlg ${p.un?'unread':''}" data-chat="${esc(p.n)}">
        <div class="ava dlg-ava" data-gu="${esc(p.n)}" title="открыть профиль">${avaHTML(p.n,p.ava)}</div>
        <div class="dlg-mid">
          <div class="dlg-top"><span class="dlg-name" data-gu="${esc(p.n)}" title="открыть профиль">${esc(p.n)}${badgeFor(p.n)}${on}</span><span class="dlg-time">${msgTimeStr(last)}</span></div>
          <div class="dlg-bot"><span class="dlg-preview">${pre}${esc(msgPreview(last,36))}</span>${p.un?`<span class="dlg-badge">${p.un>99?'99+':p.un}</span>`:''}</div>
        </div>
        <button class="dlg-more" data-dlgm="${esc(p.n)}" title="действия">⋯</button>
      </div>`;
    }).join('')}
    ${rows.length?'':`<div style="color:var(--muted2);font-size:11px;padding:10px 2px 4px">диалогов пока нет — котики напишут, и они появятся тут. уведомление всплывёт сразу 💌</div>`}
  </div>`;
  /* вся строка открывает чат; ник и ава — профиль; ⋯ — меню удаления */
  box.querySelectorAll('.dlg').forEach(r=>r.onclick=e=>{
    if(e.target.closest('.dlg-more'))return;
    openChat(r.dataset.chat);
  });
  box.querySelectorAll('[data-dlgm]').forEach(b=>b.onclick=e=>{e.stopPropagation();chatMenu(b.dataset.dlgm,e);});
  box.querySelectorAll('[data-gu]').forEach(el=>el.onclick=e=>{e.stopPropagation();if(!me.guest)openUserPage(el.dataset.gu);});
}
function openChat(name){
  openChatName=name;
  markDialogRead(name);
  refreshChatTicks(name);
  renderChat(name);
  chatStreamStart(name);
}
function renderChat(name){
  const box=document.getElementById('pg-msgs');
  const pal=name===SELF.n?SELF:{n:name,ava:(encLoad(LS.acc,{}).hasOwnProperty(name)&&(encLoad(LS.acc,{})[name].ava))||'🐱'};
  const msgs=chatMsgs(name);
  box.innerHTML=`
    <div class="pcard chat-box">
      <div class="chat-head">
        <button class="icon-btn" id="chatBack" title="к списку">◂</button>
        <div class="ava chat-head-ava" data-gu="${esc(pal.n)}" style="cursor:pointer">${pal.n===SELF.n?SELF.ava:avaHTML(pal.n,pal.ava)}</div>
        <div data-gu="${esc(pal.n)}" style="cursor:pointer;min-width:0"><div class="fname" style="${pal.n!==SELF.n?nickStyle(pal.n):''}">${esc(pal.n)}${pal.n!==SELF.n?badgeFor(pal.n)+badgesNickHTML(pal.n,3)+nickGiftHTML(pal.n):''} <span id="typingTxt"></span></div><div class="fsub"><span class="online-dot ${pal.n!==SELF.n&&isOnline(pal.n)?'':'off'}"></span>${pal.n===SELF.n?'только для тебя':esc(lastSeenText(pal.n))}</div></div>
        <button class="icon-btn chat-more" id="chatMore" title="удалить диалог">⋯</button>
      </div>
      <div class="chat-msgs" id="chatMsgs">
        ${msgs.map((m,i)=>bubble(m,i,name)).join('')}
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
  updateTypingUI(name);
  if(chatReply){const rr=box.querySelector('#rmReply');if(rr)rr.onclick=()=>{chatReply=null;renderChat(name);};}
  wireChatEl(mBox,name);
  /* шапка: аватар и ник открывают страницу котика */
  box.querySelectorAll('.chat-head [data-gu]').forEach(el=>el.onclick=()=>{if(!me.guest)openUserPage(el.dataset.gu);});
  if(chatAtt)box.querySelector('#rmChatAtt').onclick=()=>{chatAtt=null;renderChat(name);};
  box.querySelector('#chatBack').onclick=()=>{clearTyping(name);chatStreamStop();openChatName=null;chatAtt=null;renderChats();};
  const moreBtn=box.querySelector('#chatMore');
  if(moreBtn)moreBtn.onclick=e=>chatMenu(name,e);
  if(me&&me.guest){const i=box.querySelector('#chatInput');i.disabled=true;i.placeholder='зарегайся, чтобы мяукать';}
  const send=()=>{
    const i=box.querySelector('#chatInput');
    const t=i.value.trim();
    if(!t&&!chatAtt)return;
    const att=chatAtt?(chatAtt.kind==='track'?{kind:'track',tid:chatAtt.tid,name:chatAtt.name}:{mid:chatAtt.mid||null,src:chatAtt.mid?null:(chatAtt.src||null),kind:chatAtt.kind,name:chatAtt.name}):null;
    addMsg(name,'me',t,att,chatReply?{who:chatReply.who,text:chatReply.text}:null);
    addLog('msg',me.user,'→ '+name+': '+t.length+' симв.'+(att?' + '+att.kind:''));
    chatAtt=null;chatReply=null;
    /* без перерисовки всего чата (тот дёргался и сбрасывал прокрутку):
       убираем плашки ответа/вложения и просто добавляем новый пузырь */
    const rb=box.querySelector('.reply-bar');if(rb)rb.remove();
    const ac=box.querySelector('.att-chip');if(ac&&ac.parentElement)ac.parentElement.remove();
    i.value='';
    appendChatMsg(name);
    i.focus();
    clearTyping(name);
    if(name===SELF.n)setTimeout(()=>{if(openChatName===name)toast('сохранено в избранное');},300);
  };
  box.querySelector('#chatSend').onclick=send;
  box.querySelector('#chatInput').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey)send()};
  box.querySelector('#chatInput').oninput=()=>{setTyping(name);updateTypingUI(name);};
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
  box.querySelectorAll('[data-mt]').forEach(b=>b.onclick=()=>playChatTrack(b.dataset.mt));
  wireHoverCards(box.querySelector('#chatMsgs'));
}
/* меню «⋯» у сообщения: читает свежие данные, а не замороженный снимок */
function chatMsgMenu(name,i,e){
  const msgs=chatMsgs(name);
  const m=msgs[i];if(!m)return;
  const accs=encLoad(LS.acc,{});
  const after=()=>{
    if(openChatName===name)renderChat(name);else renderChats();
    try{syncBadges()}catch(err){}
    try{refreshChips()}catch(err){}
  };
  const items=[
    {t:'копировать',f:()=>{try{navigator.clipboard.writeText(m.t||'');}catch(err){}toast('скопировано');}},
    {t:'ответить',f:()=>{chatReply={who:m.who,text:m.t||'вложение'};renderChat(name);}},
    {t:'переслать…',f:()=>{
      const opts=Object.keys(accs).filter(x=>x!==me.user);
      askForm('переслать сообщение',[{ph:'кому? юзернейм: '+(opts.join(', ')||SELF.n)}],to=>{
        to=(to||'').trim().replace(/^@/,'');
        if(!to)return;
        if(to!==SELF.n&&!accs[to]){toast('нет такого котика');return false;}
        addMsg(to,'me',m.t||'вложение',m.att);toast('переслано @'+to);
      });
    }},
    {t:'подарить оонетки',f:()=>giftOonChat(name)},
    {t:'🗑 удалить у себя',danger:true,f:()=>{msgDelMe(name,m.id);after();toast('сообщение удалено у тебя');}}
  ];
  if(m.who==='me'&&name!==SELF.n){
    items.push({t:'🗑 удалить у обоих',danger:true,f:()=>{msgDelBoth(name,m.id).then(after);toast('сообщение удалено у обоих');}});
  }
  menuPop(e.clientX,e.clientY,items);
}
/* подарить оонетки прямо из чата */
function giftOonChat(to){
  askForm('подарить оонетки @'+to,[{type:'number',ph:'сколько оонеток подарить?'}],v=>{
    const n=Math.max(0,Math.floor(Number(v)||0));
    if(!n){toast('надо число больше нуля');return false;}
    if(!takeOon(n))return false;
    const all=load(LS.gifts,{});(all[to]=all[to]||[]).unshift({ic:'🎁',from:me.user+' (+'+n+' оон)',ts:Date.now()});save(LS.gifts,all);
    const w=wallet();w[to]=(w[to]||0)+n;save(LS.wallet,w);
    addMsg(to,'me','',{kind:'oon',n});
    addLog('gift',me.user,'подарил '+n+' оонеток котику '+to);
    toast('оонетки улетели!');refreshOonChip();
    if(openChatName===to)renderChat(to);
  });
}
/* новое сообщение просто всплывает: пузырь добавляется в конец, прокрутка едет вниз,
   весь чат не перерисовывается (иначе дёргалось как обновление страницы) */
function appendChatMsg(name){
  const box=document.getElementById('pg-msgs');
  const mBox=box.querySelector('#chatMsgs');
  if(!mBox){renderChat(name);return;}
  const msgs=chatMsgs(name);
  const m=msgs[msgs.length-1];
  if(!m){renderChat(name);return;}
  const div=document.createElement('div');
  div.innerHTML=bubble(m,msgs.length-1,name);
  const el=div.firstElementChild;
  if(!el){renderChat(name);return;}
  mBox.appendChild(el);
  wireChatEl(el,name);
  mBox.scrollTop=mBox.scrollHeight;
}
function bubble(m,idx,pal){
  const who=m.who,t=m.t,att=m.att;
  /* кто автор: свои — я, чужие — собеседник (в избранное пишу себе) */
  const u=who==='me'?(me&&me.user||''):(pal===SELF.n?(me&&me.user||''):pal);
  const pr=u?profOf(u):{};
  const dn=(pr&&pr.dn)||u||'??';
  let inner='';
  if(m.replyTo)inner+='<div style="border-left:3px solid var(--acc);padding:2px 8px;margin-bottom:5px;font-size:11.5px;opacity:.75">↪ '+esc((m.replyTo.text||'вложение').slice(0,70))+'</div>';
  if(t&&att)inner+='<div style="margin-bottom:4px">'+linkify(t)+'</div>';
  else if(t)inner+=linkify(t);
  /* карточки-вложения влияют на фон пузыря */
  let giftBody=false;
  let mediaBody=false;
  if(att){
    const asrc=mediaURL(att.mid)||att.src||'';
    if(att.kind==='img'||att.kind==='image'){
      mediaBody=!t;
      inner+=asrc
        ?'<img class="zoomable" src="'+esc(asrc)+'" alt="фото" title="нажми, чтобы рассмотреть" onerror="imgFix(this)">'
        :'<div class="att" style="padding:14px;color:var(--muted2);font-size:12.5px">🖼 фото догружается…</div>';
    }
    else if(att.kind==='vid'){
      mediaBody=!t;
      inner+=asrc
        ?'<video src="'+esc(asrc)+'" controls preload="metadata"></video>'
        :'<div class="att" style="padding:14px;color:var(--muted2);font-size:12.5px">🎬 видео догружается…</div>';
    }
    else if(att.kind==='track'){
      mediaBody=!t;
      const tr=tracksAll().find(x=>x.id===att.tid)||null;
      const tname=tr?tr.name:(att.name||'трек');
      const tart=tr?(tr.artist||''):(att.artist||'');
      const cov=tr&&tr.coverMid?mediaURL(tr.coverMid):'';
      inner+=`<div class="att chat-track"><a class="chat-track-card" data-mt="${esc(att.tid||'')}">
        <span class="chat-track-cov">${cov?'<img src="'+esc(cov)+'" alt="">':'<svg class="mi" style="width:18px;height:18px"><use href="#i-music"/></svg>'}</span>
        <span class="chat-track-meta"><b>${esc(tname)}</b><span class="from-line">${tart?esc(tart)+' · ':''}oomy music — нажми, заиграет</span></span>
      </a></div>`;
    }
    else if(att.kind==='gift'){
      giftBody=true;
      const gg=giftCatalog().find(x=>x.id===att.gid);
      inner+=`<div class="chat-gift">
        <div class="chat-gift-img">${giftImgHTML(gg||{ic:(att&&att.ic)||'🎁'},64)}</div>
        <div class="chat-gift-mid">
          <div class="chat-gift-lab">${who==='me'?'Вы отправили подарок':'Отправил(а) вам подарок'}</div>
          <b class="chat-gift-name">🎁 ${esc(gg?gg.name:(att.name||'подарочек'))}</b>
          ${att.cn?`<div class="chat-gift-sub">#${esc(att.cn)} из ${esc(att.tiraj||'—')}</div>`:''}
          ${gg?`<div style="margin-top:4px"><span class="rar-badge rar-${gg.r||'common'}">${RARITY[gg.r||'common']}</span></div>`:''}
          <button class="minibtn chat-gift-open" data-gift="${esc(att.gid||'')}" data-cn="${esc(att.cn||'')}" data-from="${esc(u)}" style="margin-top:7px">открыть подарочек</button>
        </div>
      </div>`;
    }
    else if(att.kind==='oon'){
      giftBody=true;
      inner+=`<div class="chat-gift chat-gift-oon">
        <div class="chat-gift-img" style="font-size:40px;line-height:1">🪙</div>
        <div class="chat-gift-mid">
          <div class="chat-gift-lab">${who==='me'?'Вы отправили оонетки':'Подарил(а) вам оонетки'}</div>
          <b class="chat-gift-name">${esc(String(att.n||''))} оонеток</b>
        </div>
      </div>`;
    }
    else{
      mediaBody=true;
      inner+='<div class="att" style="margin:0"><a class="file chat-file" href="'+esc(asrc)+'" download="'+esc(att.name||'файл')+'">📎 <span>'+esc(att.name||'файл')+'</span><span class="dl">скачать</span></a></div>';
    }
  }
  /* прочитано: ✓ — отправлено, ✓✓ — собеседник открыл диалог */
  let ck='';
  if(who==='me'){
    const seen=peerReadMyTs(pal);
    ck='<span class="bt-ck">'+(msgTs(m)<=seen?'✓✓':'✓')+'</span>';
  }
  const row=
    '<div class="msg-row '+who+'">'+
      '<div class="ava msg-ava" data-gu="'+esc(u)+'">'+(u?avaHTML(u,accOf(u).ava||'🐈'):'🐈')+'</div>'+
      '<div class="msg-main">'+
        '<div class="msg-meta"><span class="msg-name" data-gu="'+esc(u)+'" style="'+nickStyle(u)+'">'+esc(dn)+badgeFor(u)+badgesNickHTML(u,3)+nickGiftHTML(u)+'</span><span class="msg-time">'+m.time+ck+'</span></div>'+
        '<div class="msg-body '+who+(giftBody?' gift':'')+((mediaBody&&!giftBody)?' media':'')+'">'+inner+'<button class="bub-more" data-mi="'+idx+'" title="действия">⋯</button></div>'+
      '</div>'+
    '</div>';
  return row;
}
/* цвет ника в чате: стабильный по юзернейму, палитра в стиле сайта */
function chatNameColor(u){
  const P=['#e879f9','#f472b6','#fb923c','#38bdf8','#34d399','#facc15','#a78bfa','#f87171','#2dd4bf'];
  let h=0;const s=String(u||'');
  for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;
  return P[h%P.length];
}
/* открыть подарочек из чата: если эта копия у меня в сумке — с полным описанием */
function openChatGift(gid,cn,from){
  const gg=giftCatalog().find(x=>x.id===gid);
  let bi=null;
  if(me&&!me.guest&&gid&&cn!==''&&cn!==undefined&&cn!==null){
    const bag=bagOf(me.user);
    const i=bag.findIndex(x=>x.gid===gid&&String(x.cn)===String(cn)&&(!from||x.from===from));
    if(i>=0)bi=i;
  }
  if(bi!==null)openGiftInfo(gid,me.user,bi);
  else if(gg)openGiftInfo(gid);
  else toast('подарочек не найден 🙀');
}
/* навесить обработчики на одно сообщение (и на весь блок чата) */
function playChatTrack(id){
  if(!id){toast('трек не прикрепился к сообщению');return;}
  const t=tracksAll().find(x=>x.id===id);
  if(!t){toast('этот трек больше не в oomy music');return;}
  playQueueFrom(id);
}
function wireChatEl(el,name){
  if(!el)return;
  el.querySelectorAll('[data-mi]').forEach(btn=>btn.onclick=e=>{e.stopPropagation();chatMsgMenu(name,Number(btn.dataset.mi),e);});
  el.querySelectorAll('.mention-chip').forEach(t=>t.onclick=()=>{if(!me.guest)openUserPage(t.dataset.mn);});
  el.querySelectorAll('.tag-chip').forEach(t=>t.onclick=()=>{go('feed');const s=document.getElementById('search');s.value='#'+t.dataset.tag;buildPosts();});
  el.querySelectorAll('[data-mt]').forEach(b=>b.onclick=()=>playChatTrack(b.dataset.mt));
  el.querySelectorAll('.chat-gift-open').forEach(b=>b.onclick=e=>{e.stopPropagation();openChatGift(b.dataset.gift,b.dataset.cn,b.dataset.from);});
  el.querySelectorAll('[data-gu]').forEach(g=>g.onclick=e=>{e.stopPropagation();if(!me.guest)openUserPage(g.dataset.gu);});
  try{wireHoverCards(el)}catch(e2){}
}
function imgFix(el){
  if(!el.dataset.fb){el.dataset.fb='1';el.src='https://cataas.com/cat?width=400&t='+Date.now();}
  else{el.onerror=null;el.src='https://picsum.photos/seed/'+Math.floor(Math.random()*99)+'/400/300';}
}

/* ============ ПРОСМОТР ФОТО ПОЧТИ НА ВЕСЬ ЭКРАН ============ */
function openImageView(src){
  if(!src)return;
  let v=document.getElementById('imgView');
  if(!v){
    v=document.createElement('div');
    v.id='imgView';v.className='img-view';
    v.innerHTML='<img alt="фото"><button class="iv-close" type="button" aria-label="закрыть">✕</button>'+
      '<a class="iv-src" target="_blank" rel="noopener">открыть оригинал</a>'+
      '<div class="iv-hint">esc или клик мимо — закрыть</div>';
    document.body.appendChild(v);
    v.addEventListener('click',e=>{
      if(e.target===v||e.target.classList.contains('iv-close')){closeImageView();}
    });
  }
  const im=v.querySelector('img');
  im.src=src;
  im.classList.remove('in');void im.offsetWidth;im.classList.add('in');
  v.querySelector('.iv-src').href=src;
  v.classList.add('open');
  document.body.classList.add('iv-lock');
}
function closeImageView(){
  const v=document.getElementById('imgView');
  if(!v)return;
  v.classList.remove('open');
  document.body.classList.remove('iv-lock');
}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeImageView();});
document.addEventListener('click',e=>{
  const im=e.target.closest&&e.target.closest('img.zoomable');
  if(im&&im.src){e.preventDefault();openImageView(im.src);}
});

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
      <div class="fname" style="${nickStyle(u)}">${esc(u)}${badgeFor(u)}${badgesNickHTML(u,3)}${nickGiftHTML(u)}${isOnline(u)?' <span class="online-dot"></span>':''}</div>
      <div class="fsub">${esc(lastSeenText(u))} · друзей: ${friendsOf(u).length}</div>
    </div>${actions}</div>`;
  const msgBtn=u=>`<button class="minibtn" data-du="${esc(u)}">написать</button>`;
  box.innerHTML=`<div class="pcard" style="padding:8px 18px 14px">
    <h3 style="padding:12px 2px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.7px">моя страница</h3>
    <div class="frow" style="cursor:default">
      <div class="ava" style="cursor:pointer" data-gu="${esc(me.user)}">${avaHTML(me.user,me.ava||'🐈')}</div>
      <div class="fmid" style="cursor:pointer" data-gu="${esc(me.user)}"><div class="fname" style="${nickStyle(me.user)}">${esc(me.user)} <span style="color:var(--muted2);font-weight:400">— это ты</span>${badgeFor(me.user)}${badgesNickHTML(me.user,3)}${nickGiftHTML(me.user)}</div><div class="fsub">${!me.guest?'в сети · все логи шифруются':'гостевой режим'}</div></div>
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
  notifEnsureReadMap();
  const unread=notifUnreadCount(me&&me.user);
  box.innerHTML=`<div class="pcard" style="padding:8px 18px 14px">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 2px">
      <h3 style="color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.7px">уведомления${unread?' · '+unread+' новых':''}</h3>
      <div style="display:flex;gap:6px"><button class="minibtn" id="readAll">прочитать всё</button><button class="minibtn" id="clearNotifs">очистить</button></div>
    </div>
    ${dynNotifsRows()||'<div class="from-line" style="padding:8px 2px">новых уведомлений нет — котик спокоен 🐾</div>'}
  </div>`;
  box.querySelector('#readAll').onclick=()=>{notifMarkAllRead();syncBadges();renderNotifs();toast('всё прочитано, котик спокоен');};
  box.querySelector('#clearNotifs').onclick=()=>{
    if(!me||me.guest){toast('нечего очищать');return;}
    const all=load(LS.notifsD,{});all[me.user]=[];save(LS.notifsD,all);
    notifSaveReadIds(me.user,{});
    save(LS.notifsRead,true);syncBadges();renderNotifs();toast('уведомления очищены');
  };
  /* клик по уведомлению гасит его красный кружок; по @нику — открывает страницу */
  box.querySelectorAll('.nrow').forEach(row=>{
    row.onclick=e=>{
      const mn=e.target.closest&&e.target.closest('.mention-chip');
      if(mn&&mn.dataset.mn){openUserPage(mn.dataset.mn);return;}
      const n=dynNotifsFor(me.user)[Number(row.dataset.ni)];
      if(!n)return;
      notifMarkRead(n);syncBadges();renderNotifs();
    };
  });
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
/* в уведомлении показываем не смайлик, а то, о чём оно: значок, подарок или аватарку котика */
/* старые уведомления не хранили картинку — вытаскиваем её из текста: значок, подарок или @ник */
function notifDerive(n){
  if(!n)return n;
  const t=String(n.t||'');
  if(!n.bid){
    const m=t.match(/выдан значок «([^»]+)»/);
    if(m){const b=badgesAll().find(x=>(x.name||'').toLowerCase()===m[1].toLowerCase());if(b)n.bid=b.id;}
  }
  if(!n.gid){
    const m=t.match(/(?:подарил вам|вы купили|купил твой лот|предложил подарок|отклонил подарок|приняли в магазин|подарок) «([^»]+)»/)||t.match(/«([^»]+)»/);
    if(m){const g=giftCatalog().find(x=>(x.name||'').toLowerCase()===m[1].toLowerCase());if(g)n.gid=g.id;}
  }
  if(!n.av&&!n.bid&&!n.gid){
    const m=t.match(/@([A-Za-z0-9_.#-]{2,32})/);
    if(m)n.av=m[1];
    else if(/^(администратор|админ)\b/i.test(t))n.av=ADMIN;
  }
  return n;
}
function notifIconHTML(n){
  const sz=30,wrap=inner=>'<span class="notif-ico">'+inner+'</span>';
  n=notifDerive(n);
  try{
    if(n.bid){const b=badgeById(n.bid);if(b)return wrap(badgeImgHTML(b,true));}
    if(n.gid){const g=giftCatalog().find(x=>x.id===n.gid);if(g)return wrap(giftImgHTML(g,sz));}
  }catch(e){}
  if(n.av){return '<span class="notif-ico notif-ava">'+avaHTML(n.av,'🐈')+'</span>';}
  if(n.img){return wrap('<img src="'+esc(n.img)+'" alt="" loading="lazy">');}
  return '<span class="notif-ico notif-emoji">'+esc(n.ic||'🔔')+'</span>';
}
/* старые уведомления писали «админ/администратор» — теперь это всегда @oomy.
   названия в «кавычках» не трогаем: там могут быть значки и подарки с таким словом */
function notifText(t){
  return String(t||'').split(/(«[^»]*»)/).map((seg,i)=>{
    if(i%2===1)return seg;
    return seg.replace(/(^|[^\w@])(Администратор|администратор|Админ|админ)(?=$|[^\w])/g,'$1@'+ADMIN);
  }).join('');
}
function dynNotifsRows(){
  if(!me||me.guest)return'';
  const list=dynNotifsFor(me.user);
  if(!list.length)return'';
  const ids=notifEnsureReadMap();
  const fm=ts=>{const d=new Date(ts);return ('0'+d.getDate()).slice(-2)+'.'+('0'+(d.getMonth()+1)).slice(-2)+' '+('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2)};
  return list.map((n,i)=>{
    const unread=!ids[notifKey(n)];
    return `<div class="nrow" data-ni="${i}"><span class="ndot${unread?' on':''}"></span>${notifIconHTML(n)}<span style="flex:1;min-width:0">${linkify(notifText(n.t))}</span><span class="fsub" style="white-space:nowrap">${fm(n.ts)}</span></div>`;
  }).join('');
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
    <div class="frow" style="cursor:default"><div class="ava">🔒</div><div class="fmid"><div class="fname">пароль хранится навсегда</div><div class="fsub">никто не видит чужие пароли — ни админ, ни кто-либо ещё</div></div></div>

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
  const credsBtn=document.getElementById('sCreds');
  if(credsBtn)credsBtn.closest('.frow').remove(); /* логины и пароли больше не показываем никому */
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
    <div class="adm-group">
      <div class="adm-group-h">📣 контент сайта</div>
      <div class="adm-tools">
        <button class="minibtn" id="aAnn">📢 объявление в ленту</button>
        <button class="minibtn" id="aBcast">📨 уведомление всем</button>
        <button class="minibtn" id="aPosts">📝 записи</button>
        <button class="minibtn" id="aStories">📸 сторис</button>
        <button class="minibtn" id="aStory">✨ сторис от сайта</button>
        <button class="minibtn" id="aTracks">🎵 треки</button>
        <button class="minibtn" id="aCatalog">🎁 магазин</button>
        <button class="minibtn" id="aBadges">🎖 значки</button>
      </div>
    </div>
    <div class="adm-group">
      <div class="adm-group-h">🐾 котики и экономика</div>
      <div class="adm-tools">
        <button class="minibtn" id="aAccs">🐾 аккаунты</button>
        <button class="minibtn" id="aGiveAll">💰 оонетки всем</button>
        <button class="minibtn" id="aGiveOne">💰 оонетки одному</button>
        <button class="minibtn" id="aKeys">🔑 ключи</button>
        <button class="minibtn" id="aProps">📦 предложка${props?' · '+props:''}</button>
        <button class="minibtn" id="aClicks">🪙 копилки</button>
      </div>
    </div>
    <div class="adm-group">
      <div class="adm-group-h">🛠 сайт и данные</div>
      <div class="adm-tools">
        <button class="minibtn" id="aCloud">☁ общий мир</button>
        <button class="minibtn" id="aExport">📥 скачать сайт с данными</button>
        <button class="minibtn" id="aLogs">🗂 логи</button>
      </div>
    </div>
    <div class="adm-box" id="admBody"><div class="adm-note">выбери инструмент выше — он откроется здесь. все действия пишутся в зашифрованный лог.</div></div>
  </div>`;
  const body=box.querySelector('#admBody');
  const set=h=>{
    body.innerHTML=h;
    try{body.scrollIntoView({block:'nearest',behavior:'smooth'});}catch(e){body.scrollIntoView();}
  };
  const refresh=()=>renderAdmin();
  /* форма вместо prompt(): работает в любом браузере */
  box.querySelector('#aRefresh').onclick=refresh;
  box.querySelector('#aAnn').onclick=()=>{
    askForm('📢 объявление в ленту',[{ph:'текст объявления от @'+ADMIN}],t=>{
      t=(t||'').trim();if(!t){toast('напиши текст объявления');return false;}
      posts.unshift({id:Date.now(),ts:Date.now(),author:ADMIN,ava:'👑',nameCls:'blue',time:'только что',text:t+' #объявление',likes:0,liked:false,views:0,at:'',comments:[],pinned:true});
      save(LS.posts,posts);addLog('admin',me.user,'объявление в ленту');buildPosts();toast('объявление закреплено в ленте');refresh();
    });
  };
  box.querySelector('#aBcast').onclick=()=>{
    askForm('📨 уведомление всем',[{ph:'текст, который прилетит всем котикам в уведомления'}],t=>{
      t=(t||'').trim();if(!t){toast('напиши текст уведомления');return false;}
      Object.keys(accs).forEach(u=>pushNotif(u,'📢',t,{av:ADMIN}));addLog('admin',me.user,'рассылка всем');toast('уведомление доставлено всем');refresh();
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
      const w=wallet();w[u]=(w[u]||0)+n;save(LS.wallet,w);pushNotif(u,'🎁','@'+ADMIN+' выдал тебе '+n+' оонеток',{av:ADMIN});
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
    /* читаем аккаунты заново: удалённый котик не должен мелькать даже после чистки */
    const accs=encLoad(LS.acc,{});
    set('<div class="adm-note">аккаунты — @'+ADMIN+' удалить нельзя · у каждого виден баланс и его можно списать</div>'+Object.keys(accs).map(u=>`<div class="adm-row"><span style="font-size:16px">${esc(accs[u].ava||'🐈')}</span><b>${userLink(u)}${accs[u].banned?' <span style="color:var(--bad)">· В БАНЕ</span>':''}</b><span class="from-line">${wallet()[u]||0} оонеток</span>${!userIsAdmin(u)?`<button class="minibtn" data-ao="${esc(u)}">+1000</button><button class="minibtn" data-asub="${esc(u)}">− списать</button><button class="minibtn" data-ab="${esc(u)}">${accs[u].banned?'разбан':'бан'}</button><button class="x" data-ad="${esc(u)}">✕</button>`:`<button class="minibtn" data-asub="${esc(u)}">− списать</button>`}</div>`).join('')||'<div class="adm-note">аккаунтов нет</div>');
    body.querySelectorAll('[data-ao]').forEach(b=>b.onclick=()=>{const u=b.dataset.ao,w=wallet();w[u]=(w[u]||0)+1000;save(LS.wallet,w);pushNotif(u,'🎁','@'+ADMIN+' выдал тебе 1000 оонеток',{av:ADMIN});toast('@'+u+' +1000');box.querySelector('#aAccs').click();});
    body.querySelectorAll('[data-asub]').forEach(b=>b.onclick=()=>{const u=b.dataset.asub;const cur=wallet()[u]||0;const raw=prompt('сколько оонеток списать у @'+u+'? (сейчас '+cur+')','100');if(raw===null)return;const n=Math.floor(Number(raw));if(!n||n<=0){toast('введи целое число больше нуля');return;}const w=wallet();w[u]=Math.max(0,cur-n);save(LS.wallet,w);pushNotif(u,'⚠','@'+ADMIN+' списал у тебя '+Math.min(n,cur)+' оонеток',{av:ADMIN});addLog('admin',me.user,'списал '+Math.min(n,cur)+' оонеток у '+u);refreshOonChip();toast('@'+u+' −'+Math.min(n,cur)+' · осталось '+(w[u]||0));box.querySelector('#aAccs').click();});
    body.querySelectorAll('[data-ab]').forEach(b=>b.onclick=()=>{const u=b.dataset.ab,all=encLoad(LS.acc,{});all[u].banned=!all[u].banned;encSave(LS.acc,all);addLog('admin',me.user,(all[u].banned?'забанил ':'разбанил ')+u);toast('@'+u+(all[u].banned?' в бане':' разбанен'));box.querySelector('#aAccs').click();});
    body.querySelectorAll('[data-ad]').forEach(b=>b.onclick=()=>{const u=b.dataset.ad;if(!confirm('удалить аккаунт @'+u+' навсегда? исчезнут профиль, чаты, посты, сторис, треки и все следы'))return;if(!purgeUser(u)){toast('не вышло: аккаунт не найден');return;}addLog('admin',me.user,'удалил аккаунт '+u);toast('@'+u+' и все его следы удалены');box.querySelector('#aAccs').click();});
  };
  box.querySelector('#aPosts').onclick=()=>{
    /* записи удалённых котиков в админке не показываем */
    const live=encLoad(LS.acc,{});
    const list=load(LS.posts,[]).filter(p=>p&&(!p.author||live[p.author]));
    set('<div class="adm-note">все записи — закреп/удаление</div>'+(list.slice(0,100).map(p=>`<div class="adm-row"><span style="font-size:15px">${esc(p.ava||'🐱')}</span><b>${esc(p.author)}: ${esc((p.text||'').slice(0,70))}</b><button class="minibtn" data-ap="${p.id}">${p.pinned?'открепить':'закрепить'}</button><button class="x" data-apd="${p.id}">✕</button></div>`).join('')||'<div class="adm-note">записей нет</div>'));
    body.querySelectorAll('[data-ap]').forEach(b=>b.onclick=()=>{const id=Number(b.dataset.ap),all=load(LS.posts,[]),p=all.find(x=>x.id===id);if(p){p.pinned=!p.pinned;save(LS.posts,all);buildPosts();addLog('admin',me.user,(p.pinned?'закрепил':'открепил')+' запись');}box.querySelector('#aPosts').click();});
    body.querySelectorAll('[data-apd]').forEach(b=>b.onclick=()=>{if(!confirm('удалить запись?'))return;tombAdd(LS.posts,Number(b.dataset.apd));save(LS.posts,load(LS.posts,[]).filter(p=>p.id!==Number(b.dataset.apd)));addLog('admin',me.user,'удалил запись');buildPosts();box.querySelector('#aPosts').click();});
  };
  box.querySelector('#aTracks').onclick=()=>{
    /* треки удалённых владельцев не висят в админке */
    const live=encLoad(LS.acc,{});
    const trs=tracksAll().filter(t=>{
      if(!t)return false;
      if(t.origin!=='local')return true;
      const o=t.owner||t.artist||'';
      return !o||!!live[o];
    });
    set('<div class="adm-note">все треки — приватность/удаление</div>'+(trs.map(t=>`<div class="adm-row"><span style="font-size:17px">${esc(t.cover||'🎵')}</span><b>${esc(t.name)} · ${esc(t.artist||'—')} · ▶${t.plays||0}</b><button class="minibtn" data-atp="${t.id}">${t.priv?'сделать публичным':'в приватные'}</button><button class="x" data-atd="${t.id}">✕</button></div>`).join('')||'<div class="adm-note">треков нет</div>'));
    body.querySelectorAll('[data-atp]').forEach(b=>b.onclick=()=>{const all=tracksAll(),t=all.find(x=>x.id===b.dataset.atp);if(t){t.priv=!t.priv;tracksSave(all);addLog('admin',me.user,(t.priv?'скрыл':'открыл')+' трек «'+t.name+'»');}box.querySelector('#aTracks').click();});
    body.querySelectorAll('[data-atd]').forEach(b=>b.onclick=()=>{if(!confirm('удалить трек навсегда?'))return;tombAdd(LS.tracks,b.dataset.atd);sweepTombstones();addLog('admin',me.user,'удалил трек навсегда');if(player.currentId===b.dataset.atd)pausePlayer();box.querySelector('#aTracks').click();});
  };
  box.querySelector('#aStories').onclick=()=>{
    const live=encLoad(LS.acc,{});
    const all=storiesAll().filter(s=>s&&(!s.user||live[s.user]));
    set('<div class="adm-note">сторис ('+all.length+')</div>'+(all.map(s=>`<div class="adm-row"><span>${esc(s.ava||'🐈')}</span><b>${userLink(s.user)} · ${esc(s.cap||'')}</b><span class="from-line">${new Date(s.ts).toLocaleString('ru-RU')}</span><button class="x" data-asd="${s.id}">✕</button></div>`).join('')||'<div class="adm-note">сторис нет</div>'));
    body.querySelectorAll('[data-asd]').forEach(b=>b.onclick=()=>{saveStories(storiesAll().filter(s=>s.id!==b.dataset.asd));addLog('admin',me.user,'удалил сторис');box.querySelector('#aStories').click();});
  };
  box.querySelector('#aCatalog').onclick=()=>{
    const cat=giftCatalog();
    set('<div class="adm-note">магазин подарков ('+cat.length+')</div>'+cat.map(g=>`<div class="adm-row">${giftImgHTML(g,30)}<b>${esc(g.name)} · ${g.price} оонеток · тираж ${g.tiraj}</b><button class="x" data-agd="${g.id}">✕</button></div>`).join('')||'<div class="adm-note">магазин пуст — добавь подарок в «подарочки → магазин»</div>');
    body.querySelectorAll('[data-agd]').forEach(b=>b.onclick=()=>{if(!confirm('удалить подарок навсегда — из магазина, сумок и барахолки?'))return;tombAdd(LS.catalog,b.dataset.agd);saveCatalog(giftCatalog().filter(g=>g.id!==b.dataset.agd));const gone=cleanBag();sweepTombstones();addLog('admin',me.user,'удалил подарок навсегда'+(gone?', из сумок убрано: '+gone:''));box.querySelector('#aCatalog').click();});
  };
  box.querySelector('#aBadges').onclick=()=>{
    const all=badgesAll();
    set(`<div class="adm-note">значки: загрузи картинку или gif и подпиши подсказку. котик сам решит, показывать ли значок в нике и профиле.</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;padding:6px 0 10px"><button class="dan-btn" id="aBadgeMake">＋ новый значок</button></div>`+
      (all.map(b=>`<div class="adm-row">${badgeImgHTML(b,true)}<b>${esc(b.name||'значок')}</b><span class="from-line" style="flex:1;min-width:0">${esc(b.hint||'')}</span><button class="minibtn" data-grantb="${esc(b.id)}">выдать</button><button class="minibtn" data-revb="${esc(b.id)}">снять</button><button class="x" data-delb="${esc(b.id)}">✕</button></div>`).join('')||'<div class="adm-note">значков пока нет</div>'));
    body.querySelector('#aBadgeMake').onclick=()=>badgeCreateModal(()=>box.querySelector('#aBadges').click());
    body.querySelectorAll('[data-grantb]').forEach(b=>b.onclick=()=>{
      askForm('🎖 выдать значок',[{ph:'кому — юзернейм котика'}],u=>{
        u=(u||'').trim().replace(/^@/,'');
        if(!u||!accs[u]){toast('такого котика нет');return false;}
        grantBadge(u,b.dataset.grantb);
        try{addLog('admin',me.user,'выдал значок '+u);}catch(e){}
        box.querySelector('#aBadges').click();
      });
    });
    body.querySelectorAll('[data-revb]').forEach(b=>b.onclick=()=>{
      askForm('снять значок',[{ph:'у кого — юзернейм котика'}],u=>{
        u=(u||'').trim().replace(/^@/,'');
        if(!u||!accs[u]){toast('такого котика нет');return false;}
        revokeBadge(u,b.dataset.revb);
        try{addLog('admin',me.user,'снял значок у '+u);}catch(e){}
        box.querySelector('#aBadges').click();
      });
    });
    body.querySelectorAll('[data-delb]').forEach(b=>b.onclick=()=>{
      const own=badgeOwnAll();Object.keys(own).forEach(u=>{own[u]=(own[u]||[]).filter(x=>x!==b.dataset.delb);});save(LS.badgeOwn,own);
      saveBadges(badgesAll().filter(x=>x.id!==b.dataset.delb));
      try{addLog('admin',me.user,'удалил значок');}catch(e){}
      try{refreshChips()}catch(e){}
      box.querySelector('#aBadges').click();
    });
  };
  /* скачать html с публичным миром: только состояние сайта, без личных переписок и кошельков */
  box.querySelector('#aExport').onclick=async()=>{
    try{
      set('<div class="adm-note">собираю публичный мир: профили, записи, подарки, музыка… личные переписки и кошельки не попадут в файл.</div>');
      const w=await buildPublicWorld();
      const b64=btoa(unescape(encodeURIComponent(JSON.stringify(w))));
      const src=await fetch(location.href).then(r=>r.text());
      const tag='<script id="oomyWorld">window.__OOMY_WORLD_VER='+Number(w.v||0)+';window.__OOMY_WORLD=JSON.parse(decodeURIComponent(escape(atob("'+b64+'"))));<'+'/script>';
      const out=src.indexOf('</body>')>-1?src.replace('</body>',tag+'</body>'):src+tag;
      const blob=new Blob([out],{type:'text/html;charset=utf-8'});
      const a=document.createElement('a');
      a.href=URL.createObjectURL(blob);
      a.download='oomy-'+new Date().toISOString().slice(0,10)+'.html';
      document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(a.href),5000);
      addLog('admin',me.user,'скачал сайт с публичным миром ('+Math.round(blob.size/1024)+' кб)');
      toast('сайт с текущим миром скачан 📥');
      set('<div class="adm-note">готово: файл содержит только текущее состояние сайта ('+w.stats.posts+' записей, '+w.stats.profiles+' профилей, '+w.stats.media+' медиа). личные данные не попали.</div>');
    }catch(e){toast('не вышло: '+String(e&&e.message||e));}
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
    const c=clickStats(),live=encLoad(LS.acc,{});
    set('<div class="adm-note">копилки — можно обнулить дневной лимит конкретному коту</div>'+(Object.keys(c).filter(u=>live[u]).map(u=>`<div class="adm-row"><b>${userLink(u)}</b><span class="from-line">сегодня ${c[u].todayN||0} · всего ${c[u].total||0} · заработано ${c[u].earned||0}</span><button class="minibtn" data-acr="${esc(u)}">сбросить день</button></div>`).join('')||'<div class="adm-note">пока никто не кликал</div>'));
    body.querySelectorAll('[data-acr]').forEach(b=>b.onclick=()=>{const all=clickStats(),u=b.dataset.acr;if(all[u]){all[u].todayN=0;all[u].today=dayKey();save(LS.clicks,all);}addLog('admin',me.user,'сбросил дневной лимит копилки '+u);toast('лимит @'+u+' обнулён');box.querySelector('#aClicks').click();});
  };
  box.querySelector('#aLogs').onclick=()=>{
    const logs=encLoad(logKeyFor(me.user),[]).filter(l=>l.user===me.user);
    set('<div class="adm-note">последние 120 событий · только этот аккаунт</div>'+logs.slice(0,120).map(l=>`<div class="adm-row"><b>${esc(l.shown||'')} · ${esc(l.type||'')}</b><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis">${userLink(l.user||'—')} — ${esc(l.detail||'')}</span></div>`).join('')||'<div class="adm-note">лог пуст</div>');
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
  const c=chatsData();
  const unread=[SELF.n].concat(Object.keys(encLoad(LS.acc,{})).filter(u=>u!==me.user)).filter(n=>c[n]&&c[n].some(m=>m.who==='them')&&unreadCount(n)>0);
  const msgEl=document.getElementById('msgBadge');
  msgEl.classList.toggle('hidden',unread.length===0);
  const msgN=unread.reduce((s,n)=>s+Math.max(1,unreadCount(n)),0);
  msgEl.textContent=msgN>99?'+99':msgN;
  const frN=incomingReqs(me.user).length;
  const frEl=document.getElementById('frBadge');
  if(frEl){frEl.textContent=String(frN);frEl.classList.toggle('hidden',frN===0);}
  /* уведомления: считаем непрочитанные (ts позже отметки) */
  const nb=document.getElementById('notifBadge');
  if(nb){
    notifEnsureReadMap();
    const nN=notifUnreadCount(me.user);
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
function snowLoop(ts){
  if(!snowOn||!snowCtx)return;
  snowRaf=requestAnimationFrame(snowLoop);
  /* движение по времени, а не по кадрам: если браузер подтормозил (тяжёлая страница,
     скрытая вкладка), снежинки догоняют плавно и не «зависают» */
  const dt=Math.min(.05,(ts-(snowLast||ts))/1000);snowLast=ts;
  snowT+=dt;
  snowCtx.clearRect(0,0,snowCv.width,snowCv.height);
  snowCtx.fillStyle='#fff';
  snowFlakes.forEach(f=>{
    f.y+=f.s*dt*60;f.x+=(f.d+Math.sin(snowT+f.w)*.4)*dt*60;
    if(f.y>snowCv.height+8){f.y=-8;f.x=Math.random()*snowCv.width;}
    if(f.x>snowCv.width+8)f.x=-8;if(f.x<-8)f.x=snowCv.width+8;
    snowCtx.globalAlpha=Math.min(.95,.35+f.r*.2);
    snowCtx.beginPath();snowCtx.arc(f.x,f.y,f.r,0,7);snowCtx.fill();
  });
  snowCtx.globalAlpha=1;
}
let snowLast=0;
function setSnow(on){
  snowOn=!!on;save('oomy.snow',snowOn);
  const b=document.getElementById('snowBtn');
  if(b)b.classList.toggle('off',!snowOn);
  if(snowCv)snowCv.style.display=snowOn?'':'none';
  cancelAnimationFrame(snowRaf);snowLast=0;
  if(snowOn){snowResize();snowInit();snowRaf=requestAnimationFrame(snowLoop);}
}
/* скрытая вкладка — снежинки спят, вернулись — плавно продолжили */
document.addEventListener('visibilitychange',()=>{
  if(!snowCtx)return;
  if(document.hidden){cancelAnimationFrame(snowRaf);snowRaf=0;}
  else if(snowOn&&!snowRaf){snowLast=0;snowRaf=requestAnimationFrame(snowLoop);}
});
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
  /* старые общие чаты/логи переезжают в личные ключи уже после входа */
  try{chatMigrate();}catch(e){}
  try{logMigrate();}catch(e){}
  try{applyBundledTracks();}catch(e){}
  try{healTracksAll();}catch(e){}
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
  try{cloudChip()}catch(e){}
  const pr0=prof();
  if(pr0.vol!=null){player.audio.volume=Math.max(0,Math.min(1,pr0.vol/100));NP.vol.value=pr0.vol;}
  player.autoplay=pr0.autoplay!==false;
  document.getElementById('composerBox').classList.toggle('hidden',!!me.guest);
  seedPosts();wireComposer();
  /* возвращаем на ту же страницу, где был до перезагрузки (своя память браузера, не синхронизируется) */
  const lastP=load('oomy.lastPage',null);
  let target='feed';
  if(lastP&&PAGES.includes(lastP.p)&&lastP.p!=='logout'){
    if(!(lastP.p==='admin'&&!isAdmin())&&!(lastP.p==='user'&&!lastP.u)){
      target=lastP.p;
      if(lastP.p==='user'){window.__viewUser=lastP.u;}
    }
  }
  go(target);syncBadges();
  /* коллекции: если подарки уже собраны — значки выдаются сразу (в т.ч. созданные позже) */
  try{checkAllCollections();}catch(e){}
  try{refreshChips();}catch(e){}
  if(me.guest)setTimeout(()=>toast('ты тут как читатель. заведи аккаунт — всё так же бесплатно, как лапки!'),900);
}
/* ============ ПУБЛИЧНЫЙ МИР ============
   js/oomy-data.js хранит снимок сайта. В нём только то, что видят все:
   профили, записи, подарки, музыка, значки, группы. Переписки, журналы,
   кошельки, уведомления и сессии в файл не попадают никогда.
   У снимка есть версия: новый файл сам обновляет старые браузеры. */
const WORLD_VER='oomy.worldVer';
const WORLD_AUTHOR='oomy.worldAuthor';
const WORLD_ACCS='oomy.worldAccs';
const WORLD_PROFILE_PRIVATE=['msgRead','theme','privacy','hiddenAcc'];
function worldAuthorId(){
  try{
    let a=localStorage.getItem(WORLD_AUTHOR);
    if(!a||a.length<6){a='a'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);localStorage.setItem(WORLD_AUTHOR,a);}
    return a;
  }catch(e){return 'anon'}
}
function worldTombKey(kind,id){return tombKind(kind)+'~'+id}
function worldProfilesClean(all,accs){
  const out={};
  Object.keys(all||{}).forEach(u=>{
    if(!Object.prototype.hasOwnProperty.call(accs,u))return;
    const p=all[u];
    if(!p||typeof p!=='object'){out[u]={};return;}
    const c={};
    Object.keys(p).forEach(k=>{if(WORLD_PROFILE_PRIVATE.indexOf(k)<0)c[k]=p[k];});
    out[u]=c;
  });
  Object.keys(accs).forEach(u=>{if(!out[u])out[u]={};});
  return out;
}
function worldPostsClean(posts,tomb,accs){
  const has=u=>Object.prototype.hasOwnProperty.call(accs,u);
  return cleanPosts(posts)
    .filter(p=>p&&!tomb[worldTombKey(LS.posts,p.id)]&&has(p.author))
    .map(p=>{
      const c=Object.assign({},p,{liked:false});
      if(Array.isArray(p.comments))c.comments=p.comments.map(x=>Object.assign({},x,{liked:false}));
      return c;
    });
}
function worldMediaRefs(o){
  const refs=new Set();
  const walk=v=>{
    if(!v||typeof v!=='object')return;
    if(Array.isArray(v)){v.forEach(walk);return;}
    for(const k in v){
      const x=v[k];
      if(k==='mid'&&typeof x==='string')refs.add(x);
      else if(x&&typeof x==='object')walk(x);
    }
  };
  walk(o);
  return refs;
}
function blobToDataURL(blob){
  return new Promise(res=>{
    try{
      const r=new FileReader();
      r.onload=()=>res(String(r.result||''));
      r.onerror=()=>res('');
      r.readAsDataURL(blob);
    }catch(e){res('')}
  });
}
/* собирает публичный снимок: только состояние сайта, без личных данных */
async function buildPublicWorld(){
  const accRaw=load(LS.acc,{});
  const accs=encDecode(accRaw)||{};
  const accNames=Object.keys(accs);
  const has=u=>Object.prototype.hasOwnProperty.call(accs,u);
  const tomb=load(LS.tomb,{})||{};
  const profiles=worldProfilesClean(profileAll(),accs);
  const posts=worldPostsClean(load(LS.posts,[]),tomb,accs);
  const friends={};
  const srcFriends=load(LS.friends,{})||{};
  accNames.forEach(u=>{if(Array.isArray(srcFriends[u]))friends[u]=srcFriends[u].filter(x=>has(x));});
  const gifts={};
  const srcGifts=load(LS.gifts,{})||{};
  accNames.forEach(u=>{if(Array.isArray(srcGifts[u]))gifts[u]=srcGifts[u];});
  const badgeOwn={};
  const srcOwn=badgeOwnAll()||{};
  accNames.forEach(u=>{if(Array.isArray(srcOwn[u]))badgeOwn[u]=srcOwn[u];});
  const nowMap={};
  const srcNow=load(LS.now,{})||{};
  accNames.forEach(u=>{
    const v=srcNow[u];
    if(v&&v.id&&Date.now()-(v.ts||0)<10*60*1000)nowMap[u]=v;
  });
  const stories=(freshStories()||[]).filter(s=>s&&has(s.user));
  const data={};
  data[LS.profile]=profiles;
  data[LS.posts]=posts;
  data[LS.catalog]=load(LS.catalog,[])||[];
  data[LS.groups]=load(LS.groups,[])||[];
  data[LS.tracks]=load(LS.tracks,[])||[];
  data[LS.playlists]=load(LS.playlists,[])||[];
  data[LS.stories]=stories;
  data[LS.badges]=badgesAll()||[];
  data[LS.badgeOwn]=badgeOwn;
  data[LS.colls]=load(LS.colls,[])||[];
  data[LS.gifts]=gifts;
  data[LS.friends]=friends;
  data[LS.now]=nowMap;
  data[LS.acc]=accRaw;
  data[LS.tomb]=tomb;
  const cl=cloudURL();
  if(cl)data[LS.cloud]=localStorage.getItem(LS.cloud)||'';
  /* медиа: только те, на которые ссылается публичный мир; indexeddb → data url */
  const refs=worldMediaRefs(data);
  const srcMedia=load(LS.media,{})||{};
  const media={};
  const missing=[];
  for(const id of refs){
    const e=srcMedia[id];
    if(!e){missing.push(id);continue;}
    if(typeof e==='string'){
      if(e.length>30)media[id]=e;else missing.push(id);
      continue;
    }
    if(e&&e.idb){
      try{
        const blob=await IDB.get(e.idb);
        if(blob&&blob.size>0){
          const u=await blobToDataURL(blob);
          if(u&&u.length>30)media[id]=u;else missing.push(id);
        }else missing.push(id);
      }catch(err){missing.push(id);}
      continue;
    }
    missing.push(id);
  }
  data[LS.media]=media;
  return {v:Date.now(),a:worldAuthorId(),acc:accNames,data,stats:{posts:posts.length,profiles:Object.keys(profiles).length,media:Object.keys(media).length,missing}};
}
/* есть ли в этом браузере настоящая жизнь (а не пустой новый) */
function worldHasData(){
  const why=[];
  try{
    /* аккаунт @oomy создаётся при каждом запуске, поэтому сам по себе он не признак данных */
    if(Object.keys(encLoad(LS.acc,{})).some(u=>u!==ADMIN))why.push('аккаунты');
    if(Object.keys(load(LS.media,{})||{}).length)why.push('медиа');
    if((load(LS.posts,[])||[]).some(p=>p&&p.id>10000))why.push('записи');
    if(Object.keys(load(LS.catalog,[])||[]).length)why.push('магазин');
    const all=profileAll();
    if(Object.keys(all).some(u=>{
      const p=all[u]||{};
      return ['avatar','banner','pageBg','bio','status','accent','dn','avaFit','banFit'].some(k=>k in p);
    }))why.push('профили');
  }catch(e){}
  if(why.length){try{console.log('oomy world: уже есть — '+why.join(', '));}catch(e){}}
  return why.length>0;
}
/* применяет снимок: новый браузер получает весь мир, старый — обновление без потери своего */
function applyPublicWorld(){
  const W=window.__OOMY_WORLD;
  if(!W||typeof W!=='object')return false;
  const D=W.data||{};
  if(!D||!Object.keys(D).length)return false;
  const ver=Number(window.__OOMY_WORLD_VER||W.v||0)||0;
  if(!ver)return false;
  let stored=0,mine='';
  try{stored=Number(localStorage.getItem(WORLD_VER)||0)||0;mine=localStorage.getItem(WORLD_AUTHOR)||'';}catch(e){}
  const setRaw=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}};
  const setStr=(k,v)=>{try{localStorage.setItem(k,v);}catch(e){}};
  const markVer=()=>{try{localStorage.setItem(WORLD_VER,String(ver));localStorage.setItem(WORLD_ACCS,JSON.stringify(Array.isArray(W.acc)?W.acc:Object.keys(encDecode(D[LS.acc])||{})));}catch(e){}};
  const fresh=!worldHasData();
  try{console.log('oomy world: '+(fresh?'новый браузер — засеваю':'обновление')+' · v='+ver+' · было '+stored);}catch(e){}
  /* новый браузер: сразу весь публичный мир */
  if(fresh){
    Object.keys(D).forEach(k=>{
      if(k===LS.cloud&&!D[k])return;
      const v=D[k];
      setStr(k,typeof v==='string'?v:JSON.stringify(v));
    });
    /* надгробия из снимка главнее данных снимка: удалённое раньше не прорастёт */
    try{sweepTombstones()}catch(e){}
    markVer();
    return true;
  }
  if(stored&&ver<=stored)return false;
  /* этот браузер сам собрал снимок: его живые данные главнее файла */
  if(W.a&&mine&&String(W.a)===mine){markVer();return false;}
  const localTomb=load(LS.tomb,{})||{};
  const tomb=Object.assign({},D[LS.tomb]||{},localTomb);
  setRaw(LS.tomb,tomb);
  /* профили: состояние сайта главнее, личные настройки не трогаем */
  const localProf=load(LS.profile,{})||{};
  const snapProf=D[LS.profile]||{};
  Object.keys(snapProf).forEach(u=>{
    const l=localProf[u]&&typeof localProf[u]==='object'?localProf[u]:{};
    const out=Object.assign({},l,snapProf[u]);
    WORLD_PROFILE_PRIVATE.forEach(k=>{if(k in l)out[k]=l[k];});
    localProf[u]=out;
  });
  setRaw(LS.profile,localProf);
  /* записи: удалённое не возвращаем, своё новое оставляем */
  const byId=new Map();
  (load(LS.posts,[])||[]).forEach(p=>{
    if(!p||p.id===undefined)return;
    if(tomb[worldTombKey(LS.posts,p.id)])return;
    byId.set(String(p.id),p);
  });
  (D[LS.posts]||[]).forEach(p=>{
    if(!p||p.id===undefined)return;
    if(tomb[worldTombKey(LS.posts,p.id)])return;
    const old=byId.get(String(p.id));
    const c=Object.assign({},p,{liked:old?!!old.liked:false});
    if(Array.isArray(p.comments)){
      c.comments=p.comments.map(x=>{
        const oc=old&&Array.isArray(old.comments)?old.comments.find(y=>y&&y.id===x.id):null;
        return Object.assign({},x,{liked:oc?!!oc.liked:false});
      });
    }
    byId.set(String(p.id),c);
  });
  setRaw(LS.posts,[...byId.values()].sort((a,b)=>(b.id||0)-(a.id||0)));
  /* каталоги сайта: группы/плейлисты/сторис/значки/коллекции — целиком из снимка,
     а каталог подарков и музыка СЛИВАЮТСЯ по id: свой новый трек или подарок
     не выкидывается, а удалённое (надгробия) не возвращается из снимка */
  [LS.groups,LS.playlists,LS.stories,LS.badges,LS.colls].forEach(k=>{if(k in D)setRaw(k,D[k]);});
  [LS.catalog,LS.tracks].forEach(k=>{
    if(!(k in D))return;
    const snap=Array.isArray(D[k])?D[k]:[];
    const local=load(k,[]);
    const m=new Map();
    (Array.isArray(local)?local:[]).concat(snap).forEach(x=>{
      if(!x||x.id===undefined)return;
      if(tomb[worldTombKey(k,x.id)])return;
      m.set(String(x.id),x);
    });
    setRaw(k,[...m.values()]);
  });
  /* карты по котикам: объединяем, значение из снимка главнее */
  const unionUsers=(key,itemKey)=>{
    const local=load(key,{})||{};
    const snap=D[key]||{};
    Object.keys(snap).forEach(u=>{
      if(Array.isArray(snap[u])&&Array.isArray(local[u])){
        const m=new Map();
        local[u].forEach(x=>{const id=itemKey&&x?x[itemKey]:x;m.set(String(id),x);});
        snap[u].forEach(x=>{const id=itemKey&&x?x[itemKey]:x;m.set(String(id),x);});
        local[u]=[...m.values()];
      }else local[u]=snap[u];
    });
    save(key,local);
  };
  unionUsers(LS.gifts,'gid');
  unionUsers(LS.friends,null);
  unionUsers(LS.badgeOwn,null);
  /* сейчас играет — только свежее */
  const nowMap=load(LS.now,{})||{};
  Object.keys(D[LS.now]||{}).forEach(u=>{nowMap[u]=D[LS.now][u];});
  Object.keys(nowMap).forEach(u=>{if(!nowMap[u]||!nowMap[u].id||Date.now()-(nowMap[u].ts||0)>10*60*1000)delete nowMap[u];});
  save(LS.now,nowMap);
  /* медиа: снимок дополняет и обновляет */
  const localMedia=load(LS.media,{})||{};
  Object.assign(localMedia,D[LS.media]||{});
  save(LS.media,localMedia);
  /* аккаунты: удалённые с сайта убираем, свои локальные регистрации оставляем */
  const prevAccs=load(WORLD_ACCS,[])||[];
  const localAccs=encLoad(LS.acc,{})||{};
  const snapAccs=encDecode(D[LS.acc])||{};
  const snapNames=Object.keys(snapAccs);
  const merged={};
  Object.keys(localAccs).forEach(u=>{
    const wasSite=prevAccs.indexOf(u)>=0;
    const nowSite=snapNames.indexOf(u)>=0;
    if(wasSite&&!nowSite)return;
    merged[u]=localAccs[u];
  });
  snapNames.forEach(u=>{if(!merged[u])merged[u]=snapAccs[u];});
  encSave(LS.acc,merged);
  /* облако: адрес из снимка подключает всех к общему миру */
  if(D[LS.cloud]){
    let localCloud='';
    try{localCloud=localStorage.getItem(LS.cloud)||'';}catch(e){}
    if(!localCloud.trim()||localCloud==='""')setStr(LS.cloud,typeof D[LS.cloud]==='string'?D[LS.cloud]:JSON.stringify(D[LS.cloud]));
  }
  markVer();
  return true;
}
/* вычищает следы удалённых котиков из публичных данных: облако могло их помнить */
/* пылесос следов удалённых котиков: их не должно быть ни в профилях, ни в
   друзьях/подарках/значках, ни в кошельках/уведомлениях/копилках, ни в админке.
   alive — набор юзернеймов, которые реально существуют на сайте. */
function purgeTraces(alive){
  const has=u=>alive.has(String(u));
  let changed=false;
  const saveIf=(k,v)=>{save(k,v);changed=true;};
  const cleanMap=(k,opts)=>{
    opts=opts||{};
    const m=load(k,null);
    if(!m||typeof m!=='object'||Array.isArray(m))return;
    let ch=false;
    Object.keys(m).forEach(u=>{
      if(u!=='—'&&!has(u)){delete m[u];ch=true;return;}
      if(opts.values&&Array.isArray(m[u])){
        const n=m[u].filter(x=>{
          const name=x&&typeof x==='object'?(x.from||x.user||x.u||''):x;
          return !name||name==='—'||has(name);
        });
        if(n.length!==m[u].length){m[u]=n;ch=true;}
      }
    });
    if(ch)saveIf(k,m);
  };
  cleanMap(LS.profile);
  cleanMap(LS.friends,{values:true});
  cleanMap(LS.gifts);
  cleanMap(LS.badgeOwn);
  cleanMap(LS.now);
  cleanMap(LS.notifsD);
  cleanMap(LS.wallet);
  cleanMap(LS.clicks);
  cleanMap(LS.seen);
  cleanMap(LS.notifSeen);
  cleanMap(LS.feedSeen);
  cleanMap(LS.blocks,{values:true});
  cleanMap(LS.visitors,{values:true});
  cleanMap(LS.freq,{values:true});
  /* отметки «прочитано» — простой список ников */
  const cr=load(LS.chatRead,null);
  if(Array.isArray(cr)){
    const n=cr.filter(x=>has(x));
    if(n.length!==cr.length)saveIf(LS.chatRead,n);
  }
  /* диалоги с удалёнными котиками не висят в личных сообщениях */
  if(me&&!me.guest){
    try{
      const c=encLoad(chatsKey(),null);
      if(c&&typeof c==='object'){
        let ch=false;
        Object.keys(c).forEach(pal=>{if(pal!==SELF.n&&!has(pal)){delete c[pal];ch=true;}});
        if(ch){encSave(chatsKey(),c);changed=true;}
      }
    }catch(e){}
    /* метки «удалить у себя» для удалённых котиков тоже не нужны */
    try{
      ['chat','msg'].forEach(kind=>{
        const m=load(localHideKey(kind),null);
        if(!m||typeof m!=='object')return;
        let ch=false;
        if(kind==='chat'){
          Object.keys(m).forEach(pk=>{const p=String(pk).split('~');if(p.some(n=>n&&!has(n))){delete m[pk];ch=true;}});
        }else{
          Object.keys(m).forEach(pal=>{if(pal!==SELF.n&&!has(pal)){delete m[pal];ch=true;}});
        }
        if(ch){save(localHideKey(kind),m);changed=true;}
      });
    }catch(e){}
  }
  /* надгробия удалённых котиков: помнить больше нечего */
  try{
    const pruneTomb=(k,isMsg)=>{
      const m=load(k,null);
      if(!m||typeof m!=='object'||Array.isArray(m))return;
      let ch=false;
      Object.keys(m).forEach(key=>{
        const p=String(key).split('~');
        const names=isMsg?p.slice(0,2):p;
        if(names.some(n=>n&&!has(n))){delete m[key];ch=true;}
      });
      if(ch){save(k,m);changed=true;}
    };
    pruneTomb(LS.msgTomb,true);
    pruneTomb(LS.chatTomb,false);
  }catch(e){}
  /* предложка: заявки удалённых котиков не висят в админке */
  const pr=load(LS.props,null);
  if(Array.isArray(pr)){
    const n=pr.filter(p=>!p||!p.by||p.by==='—'||has(p.by));
    if(n.length!==pr.length)saveIf(LS.props,n);
  }
  /* записи: удаляем и ставим надгробие, чтобы облако их не вернуло */
  const posts=load(LS.posts,null);
  if(Array.isArray(posts)){
    const gone=posts.filter(p=>p&&p.author&&!has(p.author));
    if(gone.length){
      gone.forEach(p=>{try{tombAdd(LS.posts,p.id)}catch(e){}});
      saveIf(LS.posts,posts.filter(p=>gone.indexOf(p)<0));
    }
  }
  const st=load(LS.stories,null);
  if(Array.isArray(st)){
    const n=st.filter(s=>s&&(!s.user||has(s.user)));
    if(n.length!==st.length)saveIf(LS.stories,n);
  }
  /* треки НЕ чистим: они остаются навсегда, удалить может только человек
     (вручную или админ). раньше чистка выкидывала треки, владелец которых
     не нашёлся в аккаунтах этого браузера — из-за них музыка «пропадала» */
  const gr=load(LS.groups,null);
  if(Array.isArray(gr)){
    let ch=false;
    gr.forEach(g=>{
      if(!g)return;
      if(g.owner&&!has(g.owner)){g.owner=ADMIN;ch=true;}
      if(Array.isArray(g.members)){
        const n=g.members.filter(x=>has(x));
        if(n.length!==g.members.length){g.members=n;ch=true;}
      }
    });
    if(ch)saveIf(LS.groups,gr);
  }
  const pls=load(LS.playlists,null);
  if(Array.isArray(pls)){
    let ch=false;
    pls.forEach(pl=>{
      if(!pl)return;
      if(pl.owner&&!has(pl.owner)){pl.owner=ADMIN;ch=true;}
      if(Array.isArray(pl.members)){
        const n=pl.members.filter(x=>has(x));
        if(n.length!==pl.members.length){pl.members=n;ch=true;}
      }
    });
    if(ch)saveIf(LS.playlists,pls);
  }
  /* ключи, которые «использовал» удалённый котик, снова свободны */
  const ks=load(LS.keys,null);
  if(ks&&typeof ks==='object'){
    let ch=false;
    Object.keys(ks).forEach(k=>{const e=ks[k];if(e&&e.used&&!has(e.used)){e.used=null;ch=true;}});
    if(ch)saveIf(LS.keys,ks);
  }
  /* личные ключи (журнал и чаты) удалённых котиков: в браузере и в облаке */
  try{
    const kill=[],nodes=[];
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);if(!k)continue;
      let owner='',node='';
      if(k.indexOf(LS.logs+'__')===0){owner=k.slice(LS.logs.length+2);node=LVNODE(owner);}
      else if(k.indexOf(LS.chats+'__')===0){owner=k.slice(LS.chats.length+2);node=CHNODE(owner);}
      else if(k.indexOf('oomy.chatsX__')===0){owner=k.slice('oomy.chatsX__'.length);node=CHNODE(owner);}
      else if(k.indexOf('oomy.hide__')===0){owner=k.slice('oomy.hide__'.length).split('.')[0];node='';}
      if(owner&&owner!=='guest'&&!has(owner)){kill.push(k);if(node)nodes.push(node);}
    }
    kill.forEach(k=>{try{localStorage.removeItem(k)}catch(e){}});
    if(kill.length)changed=true;
    if(nodes.length&&cloudEnabled()){
      const root=cloudRoot().slice(0,-5);
      Array.from(new Set(nodes)).forEach(n=>{try{cloudFetch(root+n+'.json',{method:'DELETE'}).catch(()=>{});}catch(e){}});
    }
  }catch(e){}
  /* узлы котиков, которые исчезли с сайта ещё до этой чистки — убираем один раз */
  try{
    const prev=load(WORLD_ACCS,[]);
    if(Array.isArray(prev)&&prev.length&&cloudEnabled()){
      const done=load('oomy.purgedNodes',[]);
      const fresh=[];
      prev.forEach(u=>{if(u&&!has(u)&&done.indexOf(u)<0&&fresh.indexOf(u)<0)fresh.push(u);});
      if(fresh.length){
        const root=cloudRoot().slice(0,-5);
        fresh.forEach(u=>{
          [CHNODE(u),LVNODE(u)].forEach(n=>{try{cloudFetch(root+n+'.json',{method:'DELETE'}).catch(()=>{});}catch(e){}});
          done.push(u);
        });
        try{localStorage.setItem('oomy.purgedNodes',JSON.stringify(done));}catch(e){}
      }
    }
  }catch(e){}
  return changed;
}
function healWorld(){
  try{
    const accs=encLoad(LS.acc,{});
    const names=Object.keys(accs);
    if(!names.length)return false;
    return purgeTraces(new Set(names));
  }catch(e){return false}
}
/* полное удаление котика: аккаунт, личные ключи, облачные узлы и все следы */
function purgeUser(u){
  u=String(u||'').trim();
  if(!u||u===ADMIN)return false;
  const accs=encLoad(LS.acc,{});
  if(!Object.prototype.hasOwnProperty.call(accs,u))return false;
  delete accs[u];
  encSave(LS.acc,accs);
  try{const c=chatsData();if(c[u]){delete c[u];chatsSave(c);}}catch(e){}
  try{localStorage.removeItem(logKeyFor(u));}catch(e){}
  try{localStorage.removeItem(LS.chats+'__'+u);}catch(e){}
  purgeTraces(new Set(Object.keys(accs)));
  try{
    if(cloudEnabled()){
      const root=cloudRoot().slice(0,-5);
      [CHNODE(u),LVNODE(u)].forEach(n=>{try{cloudFetch(root+n+'.json',{method:'DELETE'}).catch(()=>{});}catch(e){}});
    }
  }catch(e){}
  return true;
}
/* ============ СТАРТ ============ */
/* держим статус «в сети» живым, пока вкладка открыта */
setInterval(()=>{try{if(me&&!me.guest)touchSeen();}catch(e){}},60000);
/* «сейчас играет» не должно протухать: пока трек играет — обновляем метку времени */
setInterval(()=>{try{if(player&&player.playing&&player.currentId)syncNowPlaying(true);}catch(e){}},4*60*1000);
/* восстановление входа: эти аккаунты должны открываться указанными паролями */
function ensureAccounts(){
  /* демо-аккаунтов больше нет: на сайте остаются только реальные регистрации.
     пароли никто не перетирает — человек всегда входит так, как регался,
     и пароль меняется только им самим (настройки → сменить пароль) */
}
(async function boot(){
  try{killAutofill();}catch(e){}
  try{ensureAccounts();}catch(e){}
  /* cleanupYmooWwoo() удалён: он стирал переписки и журналы котиков ymoo/wwoo —
     данные терялись навсегда. если понадобится чистка — только вручную из админки */
  try{tombFix();}catch(e){}
  try{setTimeout(preloadIdbMedia,500);}catch(e){}
  /* ============ ПУБЛИЧНЫЙ МИР ============
     в js/oomy-data.js лежит только текущее состояние сайта. новый браузер
     получает его целиком, старый — обновление с вычисткой удалённого.
     личные переписки, журналы, кошельки и уведомления сюда не входят. */
  try{
    if(applyPublicWorld())console.log('oomy: публичный мир обновлён');
  }catch(e){console.warn('oomy world',e);}
  try{healWorld();}catch(e){}
  try{sweepTombstones();}catch(e){}
  /* рабочий ключ по умолчанию: 1 ключ = 500 оонеток */
  if(!Object.keys(load(LS.keys,{})).length)save(LS.keys,{'OOMY-NEKO-0500-2026':{a:500,used:false}});
  try{cleanBag()}catch(e){}
  try{migrateMedia()}catch(e){}
  try{postsFix();}catch(e){}
  /* ссылка-приглашение в общий мир: site…#cloud=адрес базы */
  try{
    const cm=(location.hash||'').match(/#cloud=([A-Za-z0-9+/=]+)/);
    if(cm){const u=atob(cm[1]);if(/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(u))localStorage.setItem(LS.cloud,u);}
  }catch(e){}
  /* сессия восстанавливается мгновенно, без экрана входа; зеркало догружаем фоном */
  if(load(LS.sess,null)){
    /* пропускаем такт: страницы (например, шпилки) объявлены ниже по скрипту —
       иначе восстановление на «шпилки» падает на ещё не объявленной константе */
    await Promise.resolve();
    enterFeed();
    restoreFromMirror().then(got=>{
      if(got){
        console.log('oomy: восстановлено '+got+' ключей из зеркала');
        /* профили/подарки могли приехать уже после первой отрисовки — обновляем ник сразу */
        try{refreshChips();}catch(e){}
        try{if(me&&window.__PG)cloudRefresh();}catch(e){}
      }
      try{healWorld();}catch(e){}
      try{healTracksAll();}catch(e){}
    });
  }else{
    const got=await restoreFromMirror();
    if(got)console.log('oomy: восстановлено '+got+' ключей из зеркала');
    /* зеркало могло вернуть и сессию: тогда сразу в ленту, без лишнего входа */
    if(load(LS.sess,null)){
      await Promise.resolve();
      enterFeed();
    }else{
      /* общий мир: подтягиваем всё с сервера до входа, чтобы видны были все котики */
      if(cloudEnabled())await cloudPullAll();
    }
    try{healWorld();}catch(e){}
    liUser.focus();
  }
  cloudStart();
})();

/* ============ ШПИЛКИ: игры на двоих ============ */
const GAMES_ORDER=['chess','chk','ttt','cf4','rps'];
const GAMES_NAMES={chess:'шахматы',chk:'шашки',ttt:'крестики-нолики',cf4:'четыре в ряд',rps:'камень-ножницы-бумага'};
const GAMES_ICON={chess:'♞',chk:'⚫',ttt:'❌',cf4:'🔴',rps:'✂️'};
const GAMES_DESC={
  chess:'полные правила: рокировка, взятие на проходе, шах и мат',
  chk:'русские шашки: бить обязательно, дамки летают по диагонали',
  ttt:'классика — собери три в ряд',
  cf4:'бросай кружки и собери четыре подряд',
  rps:'камень, ножницы, бумага — до трёх побед'
};
const GAMES_RULES={
  chess:'белые внизу, чёрные сверху. кликни фигуру и клетку. пешка на последней линии становится ферзём.',
  chk:'белые внизу, чёрные сверху. бить обязательно; дамка ходит и бьёт на любое расстояние.',
  ttt:'три в ряд по горизонтали, вертикали или диагонали.',
  cf4:'четыре кружка подряд по горизонтали, вертикали или диагонали.',
  rps:'каждый выбирает тайно, потом сравниваем. до трёх побед.'
};
function chessFresh(){
  const b=Array(64).fill('');
  const back=['R','N','B','Q','K','B','N','R'];
  for(let c=0;c<8;c++){b[c]=back[c].toLowerCase();b[8+c]='p';b[48+c]='P';b[56+c]=back[c];}
  return {b:b,turn:'w',done:null,score:{a:0,b:0},msg:'белые начинают',last:null,ep:null,castle:{wK:1,wQ:1,bK:1,bQ:1},half:0};
}
function chkFresh(){
  const b=Array(64).fill('');
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    if((r+c)%2===1){
      if(r<3)b[r*8+c]='b';
      else if(r>4)b[r*8+c]='w';
    }
  }
  return {b:b,turn:'w',done:null,score:{a:0,b:0},msg:'белые начинают',last:null};
}
const GAMES_ST={game:'chess',seats:{1:null,2:null},
  ttt:{b:Array(9).fill(''),turn:'x',score:{x:0,o:0},done:null},
  cf4:{b:[],turn:'r',score:{r:0,y:0},done:null},
  rps:{p1:null,p2:null,phase:'p1',score:{a:0,b:0},msg:'место 1, выбирай',last:null},
  chess:chessFresh(),
  chk:chkFresh()};
const CHESS_UI={sel:null,moves:[]};
const CHK_UI={sel:null,moves:[]};
/* шпилки общие: состояние уезжает в облако, чтобы друг видел занятые места и ходы */
try{const gs=load('oomy.games',null);if(gs&&typeof gs==='object')Object.assign(GAMES_ST,gs);}catch(e){}
function gamesNorm(){
  if(!GAMES_ST.seats||typeof GAMES_ST.seats!=='object')GAMES_ST.seats={1:null,2:null};
  if(!GAMES_ST.rps||typeof GAMES_ST.rps!=='object')GAMES_ST.rps={p1:null,p2:null,phase:'p1',score:{a:0,b:0},msg:'место 1, выбирай',last:null};
  if(GAMES_ST.rps.p2===undefined)GAMES_ST.rps.p2=null;
  if(!GAMES_ST.rps.phase)GAMES_ST.rps.phase=(GAMES_ST.rps.p1===null||GAMES_ST.rps.p1===undefined)?'p1':'p2';
  if(!GAMES_ST.ttt||typeof GAMES_ST.ttt!=='object')GAMES_ST.ttt={b:Array(9).fill(''),turn:'x',score:{x:0,o:0},done:null};
  const tt=GAMES_ST.ttt;
  if(!Array.isArray(tt.b)||tt.b.length!==9)tt.b=Array(9).fill('');
  if(!tt.score||typeof tt.score!=='object')tt.score={x:0,o:0};
  if(tt.turn!=='x'&&tt.turn!=='o')tt.turn='x';
  if(tt.done!==undefined&&tt.done!==null&&tt.done!=='x'&&tt.done!=='o'&&tt.done!=='n')tt.done=null;
  if(!GAMES_ST.cf4||typeof GAMES_ST.cf4!=='object')GAMES_ST.cf4={};
  const c4=GAMES_ST.cf4;
  if(!Array.isArray(c4.b)||c4.b.length!==6||!c4.b.every(r=>Array.isArray(r)&&r.length===7))c4.b=Array.from({length:6},()=>Array(7).fill(''));
  if(!c4.score||typeof c4.score!=='object')c4.score={r:0,y:0};
  if(c4.turn!=='r'&&c4.turn!=='y')c4.turn='r';
  if(c4.done!==undefined&&c4.done!==null&&c4.done!=='r'&&c4.done!=='y'&&c4.done!=='n')c4.done=null;
  if(!GAMES_ST.rps.score||typeof GAMES_ST.rps.score!=='object')GAMES_ST.rps.score={a:0,b:0};
  if(!GAMES_ST.chess||typeof GAMES_ST.chess!=='object')GAMES_ST.chess=chessFresh();
  const c=GAMES_ST.chess;
  if(!Array.isArray(c.b)||c.b.length!==64||!c.b.every(x=>typeof x==='string'))c.b=chessFresh().b;
  if(c.turn!=='w'&&c.turn!=='b')c.turn='w';
  if(!c.score||typeof c.score!=='object')c.score={a:0,b:0};
  if(c.done!==undefined&&c.done!==null&&c.done!=='a'&&c.done!=='b'&&c.done!=='n')c.done=null;
  if(!c.castle||typeof c.castle!=='object')c.castle={wK:1,wQ:1,bK:1,bQ:1};
  ['wK','wQ','bK','bQ'].forEach(k=>{c.castle[k]=c.castle[k]?1:0;});
  if(c.ep!==null&&c.ep!==undefined&&(typeof c.ep!=='number'||c.ep<0||c.ep>63))c.ep=null;
  if(typeof c.half!=='number'||c.half<0)c.half=0;
  if(typeof c.msg!=='string')c.msg='';
  if(!GAMES_ST.chk||typeof GAMES_ST.chk!=='object')GAMES_ST.chk=chkFresh();
  const k=GAMES_ST.chk;
  if(!Array.isArray(k.b)||k.b.length!==64||!k.b.every(x=>typeof x==='string'))k.b=chkFresh().b;
  if(k.turn!=='w'&&k.turn!=='b')k.turn='w';
  if(!k.score||typeof k.score!=='object')k.score={a:0,b:0};
  if(k.done!==undefined&&k.done!==null&&k.done!=='a'&&k.done!=='b'&&k.done!=='n')k.done=null;
  if(typeof k.msg!=='string')k.msg='';
  if(!GAMES_NAMES[GAMES_ST.game])GAMES_ST.game='chess';
}
gamesNorm();
let gamesLastJSON='',gamesTimer=null;
/* выбранная вкладка — личное дело устройства, в подпись состояния не входит:
   иначе переключение игры затирало бы ход соперника */
function gamesSig(){const b=Object.assign({},GAMES_ST);delete b.ts;delete b.game;return JSON.stringify(b)}
gamesLastJSON=gamesSig();
function gamesSave(){
  try{
    const sig=gamesSig();
    if(sig===gamesLastJSON)return;
    gamesLastJSON=sig;
    GAMES_ST.ts=Date.now();
    save('oomy.games',GAMES_ST);
    const root=cloudRoot();if(!root||!cloudEnabled()||!me||me.guest)return;
    const bytes=new TextEncoder().encode(JSON.stringify(GAMES_ST));
    for(let i=0;i<bytes.length;i++)bytes[i]^=XKEY.charCodeAt(i%XKEY.length)%256;
    let bin='';for(const b of bytes)bin+=String.fromCharCode(b);
    fetch(root.slice(0,-5)+'oomy__games.json',{method:'PUT',body:JSON.stringify({v:2,d:btoa(bin)})}).catch(()=>{});
  }catch(e){}
}
function gamesPull(){
  try{
    const root=cloudRoot();if(!root||!cloudEnabled())return;
    fetch(root.slice(0,-5)+'oomy__games.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(v=>{
      /* старые версии клали состояние открытым текстом — принимаем и его */
      const R=v?(decEnv(v)||(v.seats&&v.ts?v:null)):null;
      if(!R||!R.ts||(R.ts||0)<=(GAMES_ST.ts||0))return;
      Object.keys(GAMES_ST).forEach(k=>delete GAMES_ST[k]);
      Object.assign(GAMES_ST,R);
      gamesNorm();
      gamesLastJSON=gamesSig();
      if(window.__PG==='games')renderGames();
    }).catch(()=>{});
  }catch(e){}
}
/* перед своим ходом сверяемся с сервером: если соперник успел сходить,
   его ход не затирается нашим устаревшим полем */
function gamesFresh(cb){
  let done=false;
  const run=()=>{if(done)return;done=true;cb();};
  const root=cloudRoot();
  if(!root||!cloudEnabled()||!me||me.guest){run();return;}
  const timer=setTimeout(run,1200);
  fetch(root.slice(0,-5)+'oomy__games.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(v=>{
    const R=v?(decEnv(v)||(v.seats&&v.ts?v:null)):null;
    if(R&&R.ts&&(R.ts||0)>(GAMES_ST.ts||0)){
      Object.keys(GAMES_ST).forEach(k=>delete GAMES_ST[k]);
      Object.assign(GAMES_ST,R);
      gamesNorm();
      gamesLastJSON=gamesSig();
      clearTimeout(timer);done=true;
      if(window.__PG==='games')renderGames();
      toast('соперник только что сходил — поле обновилось');
      return;
    }
    clearTimeout(timer);run();
  }).catch(()=>{clearTimeout(timer);run();});
}
function gamesSyncStart(){
  gamesPull();
  if(gamesTimer)clearInterval(gamesTimer);
  gamesTimer=setInterval(()=>{if(window.__PG==='games')gamesPull();},2000);
}
function gamesSyncStop(){if(gamesTimer){clearInterval(gamesTimer);gamesTimer=null;}}
/* --- чей ход: чужой человек физически не может сходить за тебя --- */
function gSeatUser(n){return GAMES_ST.seats[n]||null}
function gMine(n){return !!(me&&!me.guest&&GAMES_ST.seats[n]===me.user)}
function gTurnSeat(v){return (v==='x'||v==='r'||v==='a'||v==='w')?1:2}
function gCheckTurn(seat){
  const u=gSeatUser(seat);
  if(!u){toast('место '+seat+' свободно — сначала сядь за стол');return false;}
  if(!me||me.guest||me.user!==u){toast('сейчас ход @'+u+' — за него ходить нельзя');return false;}
  return true;
}
function gT(){return GAMES_ST[GAMES_ST.game];}
function accOf(u){return (encLoad(LS.acc,{})[u])||{ava:'🐈'}}
function seatName(n){const u=GAMES_ST.seats[n];return u||('место '+n)}
function seatAva(n){const u=GAMES_ST.seats[n];return u?avaHTML(u,accOf(u).ava||'🐈'):'<span style="font-size:20px">🪑</span>'}
function gScoreHTML(a,b){return `<div class="game-score"><span class="gs-side"><span class="ava" style="width:32px;height:32px;font-size:16px">${seatAva('1')}</span><b>${esc(seatName(1))}</b></span><span class="gs-num">${gT().score[a]}<i>:</i>${gT().score[b]}</span><span class="gs-side"><b>${esc(seatName(2))}</b><span class="ava" style="width:32px;height:32px;font-size:16px">${seatAva(2)}</span></span></div>`;}
function gTurn(n,extra){return `<span class="gturn"><span class="ava" style="width:26px;height:26px;font-size:13px">${seatAva(n)}</span>${esc(seatName(n))}${extra?' '+extra:''}</span>`;}

/* --- мини-предосмотры игр: чтобы сразу было видно, во что играешь --- */
function gpTTT(){
  const m=['✕','','◯','','✕','','◯','','✕'];
  let s='';for(let r=0;r<3;r++)for(let c=0;c<3;c++){const i=r*3+c;s+=`<div class="gpt-c">${m[i]||''}</div>`;}
  return `<div class="gp-ttt">${s}</div>`;
}
function gpCF4(){
  let s='';
  for(let r=0;r<6;r++)for(let c=0;c<7;c++){
    const disc=(r===0&&c===3)||(r===1&&c===3)||(r===0&&c===4)||(r===5&&c===2)||(r===5&&c===3)||(r===4&&c===3);
    s+=`<div class="gpc4-c">${disc?'<i></i>':''}</div>`;
  }
  return `<div class="gp-cf4">${s}</div>`;
}
function gpChess(){
  const top=['♜','♞','♝','♛','♚','♝','♞','♜'];
  const bot=['♖','♘','♗','♕','♔','♗','♘','♖'];
  let s='';
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const dark=(r+c)%2===1;
    let p='';
    if(r===0)p=top[c];else if(r===1)p='♟';else if(r===6)p='♙';else if(r===7)p=bot[c];
    s+=`<div class="gpc-sq ${dark?'d':'l'}">${p}</div>`;
  }
  return `<div class="gp-chess">${s}</div>`;
}
function gpChk(){
  let s='';
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const dark=(r+c)%2===1;
    let p='';
    if(dark){
      if(r<3)p='<i class="gpc-p b"></i>';
      else if(r>4)p='<i class="gpc-p w"></i>';
    }
    s+=`<div class="gpc-sq ${dark?'d':'l'}">${p}</div>`;
  }
  return `<div class="gp-chk">${s}</div>`;
}
function gpRPS(){
  return `<div class="gp-rps"><i>🪨</i><i>✂️</i><i>🧻</i></div>`;
}
function gamePreviewHTML(g){
  if(g==='chess')return gpChess();
  if(g==='chk')return gpChk();
  if(g==='cf4')return gpCF4();
  if(g==='rps')return gpRPS();
  return gpTTT();
}
function seatBox(n){
  const u=GAMES_ST.seats[n];
  if(u)return `<div class="seat-card filled" data-seat="${n}"><span class="ava" style="width:42px;height:42px;font-size:21px">${seatAva(n)}</span><span class="seat-mid"><b>${esc(u)}${badgeFor(u)}</b><span>место ${n} занято · нажми, чтобы освободить</span></span></div>`;
  return `<div class="seat-card" data-seat="${n}"><span class="ava seat-empty" style="width:42px;height:42px;font-size:19px">🪑</span><span class="seat-mid"><b>место ${n}</b><span>свободно · нажми, чтобы занять</span></span></div>`;
}
function renderGames(){
  const box=document.getElementById('pg-games');if(!box)return;
  gamesNorm();
  if(!GAMES_NAMES[GAMES_ST.game])GAMES_ST.game='chess';
  const g=GAMES_ST.game;
  const cards=GAMES_ORDER.map(k=>`<button class="game-card ${k===g?'active':''}" data-g="${k}">
      <span class="game-thumb">${gamePreviewHTML(k)}</span>
      <span class="game-info"><b>${GAMES_ICON[k]} ${GAMES_NAMES[k]}</b><span>${GAMES_DESC[k]}</span></span>
    </button>`).join('');
  const seats=`<div class="games-seats">${seatBox(1)}${seatBox(2)}</div>`;
  box.innerHTML=`<div class="pcard games-page">
    <div class="games-top">
      <div><div class="pf-name" style="font-size:20px">🎮 шпилки</div>
      <div class="pf-sub">игры на двоих: шахматы, шашки, крестики-нолики, четыре в ряд и камень-ножницы-бумага</div></div>
      <div class="games-status">${GAMES_ST.seats[1]&&GAMES_ST.seats[2]?'стол занят':'ждём второго игрока'}</div>
    </div>
    <div class="game-picker">${cards}</div>
    ${seats}
    <div class="game-scene" data-game="${g}" id="gameArea"></div>
    <div class="games-rules"><b>как играть:</b> ${GAMES_RULES[g]||''}</div>
  </div>`;
  box.querySelectorAll('.game-card').forEach(c=>c.onclick=()=>{
    const k=c.dataset.g;
    if(k===GAMES_ST.game){drawGame();return;}
    box.querySelectorAll('.game-card').forEach(x=>x.classList.toggle('active',x===c));
    CHESS_UI.sel=null;CHESS_UI.moves=[];CHK_UI.sel=null;CHK_UI.moves=[];
    gamesFresh(()=>{GAMES_ST.game=k;renderGames();});
  });
  box.querySelectorAll('[data-seat]').forEach(el=>el.onclick=()=>toggleSeat(+el.dataset.seat));
  drawGame();
}
function toggleSeat(n){
  if(!me||me.guest){toast('войди в аккаунт, чтобы сесть за стол');return;}
  gamesFresh(()=>{
    const u=GAMES_ST.seats[n];
    const other=1+2-n;
    if(u){
      /* чужое место освободить нельзя: иначе можно выкинуть соперника посреди партии */
      if(u!==me.user){toast('место '+n+' занято @'+u+' — он выйдет сам');return;}
      GAMES_ST.seats[n]=null;toast('место '+n+' освободилось');
    }else{
      if(GAMES_ST.seats[other]===me.user){toast('ты уже на другом месте, жулик');return;}
      GAMES_ST.seats[n]=me.user;toast('место '+n+' за тобой, @'+me.user);
    }
    renderGames();
  });
}
function drawGame(){
  const area=document.getElementById('gameArea');if(!area)return;
  gamesNorm();
  gamesSave();
  const g=GAMES_ST.game;
  area.dataset.game=g;
  if(!GAMES_ST.seats[1]||!GAMES_ST.seats[2]){
    const free=!GAMES_ST.seats[1]?1:2;
    const taken=GAMES_ST.seats[free===1?2:1];
    area.innerHTML=`<div class="game-wait">
      <div class="game-wait-prev">${gamePreviewHTML(g)}</div>
      <div class="game-wait-info">
        <b>${GAMES_ICON[g]} ${GAMES_NAMES[g]}</b>
        <span>${GAMES_DESC[g]}</span>
        <span class="game-wait-hint">${taken?'@'+esc(taken)+' уже за столом. ':''}займи свободное место выше — и доска откроется сама</span>
      </div>
    </div>`;
    return;
  }
  if(g==='chess')drawChess(area);
  else if(g==='chk')drawChk(area);
  else if(g==='ttt')drawTTT(area);
  else if(g==='cf4')drawCF4(area);
  else drawRPS(area);
}
/* --- крестики-нолики --- */
function drawTTT(area){
  const s=gT();
  const W=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  const win=W.find(w=>w.every(j=>s.b[j]&&s.b[j]===s.b[w[0]]));
  const winSet=win&&s.done&&s.done!=='n'?win:[];
  area.innerHTML=`${gScoreHTML('x','o')}
    <div class="ttt-board">${s.b.map((c,i)=>`<button class="ttt-c ${winSet.includes(i)?'win':''} ${c==='x'?'x':c==='o'?'o':''}" data-i="${i}">${c==='x'?'✕':c==='o'?'◯':''}</button>`).join('')}</div>
    <div class="game-turn">${s.done?(s.done==='n'?'ничья!':'победа: '+gTurn(s.done==='x'?'1':'2')+' 🎉'):'ходит '+gTurn(s.turn==='x'?'1':'2','('+(s.turn==='x'?'✕':'◯')+')')}</div>
    <div class="game-btns"><button class="minibtn" id="gReset">новый раунд</button><button class="minibtn" id="gZero">сбросить счёт</button></div>`;
  area.querySelectorAll('.ttt-c').forEach(c=>c.onclick=()=>{
    const i=+c.dataset.i;
    gamesFresh(()=>{
      const g=gT();
      if(g.b[i]||g.done)return;
      if(!gCheckTurn(gTurnSeat(g.turn)))return;
      g.b[i]=g.turn;
      const w=W.find(x=>x.every(j=>g.b[j]===g.turn));
      if(w){g.done=g.turn;g.score[g.turn]++;toast('победа! 🎉');}
      else if(g.b.every(x=>x)){g.done='n';}
      else g.turn=g.turn==='x'?'o':'x';
      drawGame();
    });
  });
  area.querySelector('#gReset').onclick=()=>gamesFresh(()=>{
    const g=gT();
    if(!g.done&&!gMine(gTurnSeat(g.turn))){toast('раунд идёт: сбросить может только тот, чей ход');return;}
    if(!gMine(1)&&!gMine(2)){toast('сначала займи место за столом');return;}
    g.b=Array(9).fill('');g.turn='x';g.done=null;drawGame();
  });
  area.querySelector('#gZero').onclick=()=>{
    if(!gMine(1)){toast('счёт обнуляет только игрок первого места');return;}
    gamesFresh(()=>{const g=gT();g.score={x:0,o:0};g.b=Array(9).fill('');g.turn='x';g.done=null;drawGame();});
  };
}
/* --- четыре в ряд --- */
function drawCF4(area){
  const s=gT();
  if(!Array.isArray(s.b)||s.b.length!==6||!s.b.every(r=>Array.isArray(r)&&r.length===7))s.b=Array.from({length:6},()=>Array(7).fill(''));
  const win4=(b,t)=>{for(let r=0;r<6;r++)for(let c=0;c<7;c++){
    if(c+3<7&&[0,1,2,3].every(k=>b[r][c+k]===t))return true;
    if(r+3<6&&[0,1,2,3].every(k=>b[r+k][c]===t))return true;
    if(c+3<7&&r+3<6&&[0,1,2,3].every(k=>b[r+k][c+k]===t))return true;
    if(c-3>=0&&r+3<6&&[0,1,2,3].every(k=>b[r+k][c-k]===t))return true;
  }return false;};
  const full=s.b[0].every(x=>x);
  area.innerHTML=`${gScoreHTML('r','y')}
    <div class="cf4-board">${s.b.map((row,r)=>row.map((c,ci)=>`<button class="cf4-cell" data-cf="${ci}" data-r="${r}">${c?`<i class="cf4-disc ${c}"></i>`:''}</button>`).join('')).join('')}</div>
    <div class="game-turn">${s.done?(s.done==='n'?'ничья!':'победа: '+gTurn(s.done==='r'?'1':'2')+' 🎉'):full?'ничья — поле полное!':'ходит '+gTurn(s.turn==='r'?'1':'2','('+(s.turn==='r'?'🔴':'🟡')+')')}</div>
    <div class="game-btns"><button class="minibtn" id="gReset">новый раунд</button><button class="minibtn" id="gZero">сбросить счёт</button></div>`;
  area.querySelectorAll('[data-cf]').forEach(c=>c.onclick=()=>{
    const ci=+c.dataset.cf;
    gamesFresh(()=>{
      const g=gT();
      if(g.done)return;
      if(!gCheckTurn(gTurnSeat(g.turn)))return;
      if(g.b[0][ci])return;
      let r=5;while(r>=0&&g.b[r][ci])r--;
      if(r<0)return;
      g.b[r][ci]=g.turn;
      if(win4(g.b,g.turn)){g.done=g.turn;g.score[g.turn]++;toast('четыре в ряд! 🎉');}
      else if(g.b[0].every(x=>x))g.done='n';
      else g.turn=g.turn==='r'?'y':'r';
      drawGame();
    });
  });
  area.querySelector('#gReset').onclick=()=>gamesFresh(()=>{
    const g=gT();
    if(!g.done&&!gMine(gTurnSeat(g.turn))){toast('партия идёт: сбросить может только тот, чей ход');return;}
    if(!gMine(1)&&!gMine(2)){toast('сначала займи место за столом');return;}
    g.b=[];g.turn='r';g.done=null;drawGame();
  });
  area.querySelector('#gZero').onclick=()=>{
    if(!gMine(1)){toast('счёт обнуляет только игрок первого места');return;}
    gamesFresh(()=>{const g=gT();g.score={r:0,y:0};g.b=[];g.turn='r';g.done=null;drawGame();});
  };
}

/* --- шашки (русские): бить обязательно, дамки ходят далеко --- */
const CHK_DIRS=[[-1,-1],[-1,1],[1,-1],[1,1]];
function chkColor(p){return p?p.toLowerCase():''}
function chkKing(p){return p==='W'||p==='B'}
function chkCapDFS(b,cur,piece,color,origin,captured,path,out){
  const king=chkKing(piece);
  let any=false;
  for(const [dr,dc] of CHK_DIRS){
    if(king){
      let r=(cur>>3)+dr,c=(cur&7)+dc;
      while(r>=0&&r<8&&c>=0&&c<8&&!b[r*8+c]){r+=dr;c+=dc;}
      if(r<0||r>=8||c<0||c>=8)continue;
      const mid=r*8+c;
      if(!b[mid]||chkColor(b[mid])===color||captured.includes(mid))continue;
      let rr=r+dr,cc=c+dc;
      while(rr>=0&&rr<8&&cc>=0&&cc<8&&!b[rr*8+cc]){
        const to=rr*8+cc;
        const b2=b.slice();b2[cur]='';b2[mid]='';b2[to]=piece;
        any=true;
        chkCapDFS(b2,to,piece,color,origin,captured.concat([mid]),path.concat([to]),out);
        rr+=dr;cc+=dc;
      }
    }else{
      const r=(cur>>3)+dr,c=(cur&7)+dc;
      if(r<0||r>=8||c<0||c>=8)continue;
      const mid=r*8+c;
      if(!b[mid]||chkColor(b[mid])===color||captured.includes(mid))continue;
      const tr=(cur>>3)+2*dr,tc=(cur&7)+2*dc;
      if(tr<0||tr>=8||tc<0||tc>=8)continue;
      const to=tr*8+tc;
      if(b[to])continue;
      let np=piece;
      if((color==='w'&&tr===0)||(color==='b'&&tr===7))np=color==='w'?'W':'B';
      const b2=b.slice();b2[cur]='';b2[mid]='';b2[to]=np;
      any=true;
      chkCapDFS(b2,to,np,color,origin,captured.concat([mid]),path.concat([to]),out);
    }
  }
  if(!any&&path.length){
    out.push({from:origin,to:path[path.length-1],path:[origin].concat(path),caps:captured});
  }
}
function chkCapMoves(b,color){
  const out=[];
  for(let i=0;i<64;i++){
    const p=b[i];
    if(p&&chkColor(p)===color)chkCapDFS(b,i,p,color,i,[],[],out);
  }
  return out;
}
function chkSimpleMoves(b,color){
  const out=[];
  for(let i=0;i<64;i++){
    const p=b[i];
    if(!p||chkColor(p)!==color)continue;
    const king=chkKing(p);
    const dirs=king?CHK_DIRS:(color==='w'?[[-1,-1],[-1,1]]:[[1,-1],[1,1]]);
    for(const [dr,dc] of dirs){
      let r=(i>>3)+dr,c=(i&7)+dc;
      while(r>=0&&r<8&&c>=0&&c<8){
        const to=r*8+c;
        if(b[to])break;
        out.push({from:i,to:to,path:[i,to],caps:[]});
        if(!king)break;
        r+=dr;c+=dc;
      }
    }
  }
  return out;
}
function chkMoves(b,color){
  const caps=chkCapMoves(b,color);
  return caps.length?caps:chkSimpleMoves(b,color);
}
function chkApply(g,m){
  const b=g.b.slice();
  const p=b[m.from],color=chkColor(p);
  b[m.from]='';
  (m.caps||[]).forEach(i=>{b[i]=''});
  let np=p;
  const r=m.to>>3;
  if((color==='w'&&r===0)||(color==='b'&&r===7))np=color==='w'?'W':'B';
  b[m.to]=np;
  g.b=b;
  g.last={from:m.from,to:m.to,path:(m.path||[m.from,m.to]).slice()};
  g.turn=color==='w'?'b':'w';
  const opp=g.turn;
  if(!chkMoves(g.b,opp).length){
    g.done=color==='w'?'a':'b';
    g.score[g.done]=(g.score[g.done]||0)+1;
    g.msg='победа: '+(color==='w'?'белые':'чёрные')+'! у соперника не осталось ходов';
    return {win:true,caps:(m.caps||[]).length};
  }
  g.msg=(opp==='w'?'белые':'чёрные')+(chkCapMoves(g.b,opp).length?' — есть чем бить!':' ходят');
  return {win:false,caps:(m.caps||[]).length};
}
function drawChk(area){
  const g=GAMES_ST.chk;
  const all=chkMoves(g.b,g.turn);
  const mustCapture=all.length&&all[0].caps.length>0;
  let selMoves=[];
  if(CHK_UI.sel!=null)selMoves=all.filter(m=>m.from===CHK_UI.sel);
  const dests=selMoves.map(m=>m.to);
  let cells='';
  for(let i=0;i<64;i++){
    const r=i>>3,c=i&7,dark=(r+c)%2===1;
    const p=g.b[i];
    const sel=CHK_UI.sel===i;
    const isDest=dests.includes(i);
    const isLast=g.last&&((g.last.path||[g.last.from,g.last.to]).includes(i));
    cells+=`<button class="chk-sq ${dark?'dark':'light'}${sel?' sel':''}${isLast?' last':''}" data-chk="${i}">${isDest?'<span class="chk-dot"></span>':''}${p?`<span class="chk-pc ${chkColor(p)==='w'?'w':'b'}${chkKing(p)?' king':''}"></span>`:''}</button>`;
  }
  area.innerHTML=`${gScoreHTML('a','b')}
    <div class="chk-board">${cells}</div>
    <div class="game-turn">${g.done?('победа: '+gTurn(g.done)+' 🎉 · '+esc(g.msg||'')):esc(g.msg||'')}</div>
    <div class="game-sub">${mustCapture?'есть взятие — бить обязательно':'ходи кликом: выбери шашку, потом клетку'}${CHK_UI.sel!=null&&!selMoves.length?' · этой шашкой ходить нечем':''}</div>
    <div class="game-btns"><button class="minibtn" id="gReset">новый раунд</button><button class="minibtn" id="gZero">сбросить счёт</button></div>`;
  area.querySelectorAll('[data-chk]').forEach(b=>b.onclick=()=>{
    const i=+b.dataset.chk;
    const p=g.b[i];
    if(CHK_UI.sel!=null&&dests.includes(i)){
      const from=CHK_UI.sel;
      if(!gCheckTurn(g.turn==='w'?1:2))return;
      gamesFresh(()=>{
        const gg=GAMES_ST.chk;
        const mv=chkMoves(gg.b,gg.turn).find(m=>m.from===from&&m.to===i);
        if(!mv)return;
        const res=chkApply(gg,mv);
        CHK_UI.sel=null;
        if(res.win)toast('победа! 🎉');else if(res.caps)toast(res.caps>1?'двойное взятие! 🔥':'взял шашку');
        drawGame();
      });
      return;
    }
    if(p&&chkColor(p)===g.turn){
      if(!gCheckTurn(g.turn==='w'?1:2))return;
      CHK_UI.sel=(CHK_UI.sel===i?null:i);
      drawChk(area);
      return;
    }
    CHK_UI.sel=null;drawChk(area);
  });
  area.querySelector('#gReset').onclick=()=>gamesFresh(()=>{
    const gg=GAMES_ST.chk;
    if(!gg.done&&!gMine(gTurnSeat(gg.turn))){toast('раунд идёт: сбросить может только тот, чей ход');return;}
    if(!gMine(1)&&!gMine(2)){toast('сначала займи место за столом');return;}
    const f=chkFresh();gg.b=f.b;gg.turn='w';gg.done=null;gg.msg=f.msg;CHK_UI.sel=null;drawGame();
  });
  area.querySelector('#gZero').onclick=()=>{
    if(!gMine(1)){toast('счёт обнуляет только игрок первого места');return;}
    gamesFresh(()=>{
      const gg=GAMES_ST.chk,f=chkFresh();
      gg.b=f.b;gg.turn='w';gg.done=null;gg.msg=f.msg;gg.score={a:0,b:0};CHK_UI.sel=null;drawGame();
    });
  };
}

/* --- шахматы: полные правила, рокировка, взятие на проходе, шах и мат --- */
const CHE_KN=[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
const CHE_KG=[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const CHE_DB=[[-1,-1],[-1,1],[1,-1],[1,1]];
const CHE_DR=[[-1,0],[1,0],[0,-1],[0,1]];
const CH_PIECES={K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'};
function cheColor(p){return p?(p===p.toUpperCase()?'w':'b'):''}
function cheSq(r,c){return r>=0&&r<8&&c>=0&&c<8?r*8+c:-1}
function cheFindKing(b,color){
  const k=color==='w'?'K':'k';
  for(let i=0;i<64;i++)if(b[i]===k)return i;
  return -1;
}
function cheAttacked(b,sq,by){
  if(sq<0)return false;
  const r=sq>>3,c=sq&7;
  if(by==='w'){
    for(const dc of [-1,1]){const rr=r+1,cc=c+dc;if(rr<8&&cc>=0&&cc<8&&b[rr*8+cc]==='P')return true;}
  }else{
    for(const dc of [-1,1]){const rr=r-1,cc=c+dc;if(rr>=0&&cc>=0&&cc<8&&b[rr*8+cc]==='p')return true;}
  }
  const kn=by==='w'?'N':'n';
  for(const [dr,dc] of CHE_KN){const rr=r+dr,cc=c+dc;if(rr>=0&&rr<8&&cc>=0&&cc<8&&b[rr*8+cc]===kn)return true;}
  const kg=by==='w'?'K':'k';
  for(const [dr,dc] of CHE_KG){const rr=r+dr,cc=c+dc;if(rr>=0&&rr<8&&cc>=0&&cc<8&&b[rr*8+cc]===kg)return true;}
  const diag=by==='w'?'B':'b',rook=by==='w'?'R':'r',queen=by==='w'?'Q':'q';
  for(const [dirs,pc] of [[CHE_DB,diag],[CHE_DR,rook]]){
    for(const [dr,dc] of dirs){
      let rr=r+dr,cc=c+dc;
      while(rr>=0&&rr<8&&cc>=0&&cc<8){
        const p=b[rr*8+cc];
        if(p){
          if(p===pc||p===queen)return true;
          break;
        }
        rr+=dr;cc+=dc;
      }
    }
  }
  return false;
}
function chePseudo(g,color){
  const b=g.b,out=[];
  const add=(from,to,extra)=>out.push(Object.assign({from:from,to:to,piece:b[from],capture:b[to]||''},extra||{}));
  for(let from=0;from<64;from++){
    const p=b[from];
    if(!p||cheColor(p)!==color)continue;
    const r=from>>3,c=from&7,low=p.toLowerCase();
    if(low==='p'){
      const dir=color==='w'?-1:1,start=color==='w'?6:1;
      const one=cheSq(r+dir,c);
      if(one>=0&&!b[one]){
        add(from,one);
        const two=cheSq(r+2*dir,c);
        if(r===start&&two>=0&&!b[two])add(from,two);
      }
      for(const dc of [-1,1]){
        const to=cheSq(r+dir,c+dc);
        if(to<0)continue;
        if(b[to]&&cheColor(b[to])!==color)add(from,to);
        else if(!b[to]&&g.ep===to)add(from,to,{ep:true});
      }
      continue;
    }
    if(low==='n'){
      for(const [dr,dc] of CHE_KN){const to=cheSq(r+dr,c+dc);if(to>=0&&(!b[to]||cheColor(b[to])!==color))add(from,to);}
      continue;
    }
    if(low==='k'){
      for(const [dr,dc] of CHE_KG){const to=cheSq(r+dr,c+dc);if(to>=0&&(!b[to]||cheColor(b[to])!==color))add(from,to);}
      const opp=color==='w'?'b':'w';
      if(from=== (color==='w'?60:4) && !cheAttacked(b,from,opp)){
        const row=color==='w'?7:0;
        if(g.castle[color+'K']&&b[row*8+7]===(color==='w'?'R':'r')&&!b[row*8+5]&&!b[row*8+6]&&!cheAttacked(b,row*8+5,opp)&&!cheAttacked(b,row*8+6,opp))add(from,row*8+6,{castle:'K'});
        if(g.castle[color+'Q']&&b[row*8]===(color==='w'?'R':'r')&&!b[row*8+1]&&!b[row*8+2]&&!b[row*8+3]&&!cheAttacked(b,row*8+3,opp)&&!cheAttacked(b,row*8+2,opp))add(from,row*8+2,{castle:'Q'});
      }
      continue;
    }
    const dirs=low==='b'?CHE_DB:low==='r'?CHE_DR:CHE_DB.concat(CHE_DR);
    for(const [dr,dc] of dirs){
      let rr=r+dr,cc=c+dc;
      while(rr>=0&&rr<8&&cc>=0&&cc<8){
        const to=rr*8+cc,p2=b[to];
        if(!p2)add(from,to);
        else{if(cheColor(p2)!==color)add(from,to);break;}
        rr+=dr;cc+=dc;
      }
    }
  }
  return out;
}
function cheApply(g,m){
  const b=g.b.slice();
  const piece=b[m.from],color=cheColor(piece);
  b[m.from]='';
  if(m.ep){const capSq=m.to+(color==='w'?8:-8);b[capSq]='';}
  b[m.to]=piece;
  if(m.castle){
    const row=color==='w'?7:0;
    if(m.castle==='K'){b[row*8+5]=b[row*8+7];b[row*8+7]='';}
    else{b[row*8+3]=b[row*8];b[row*8]='';}
  }
  const tr=m.to>>3;
  if(piece.toLowerCase()==='p'&&((color==='w'&&tr===0)||(color==='b'&&tr===7)))b[m.to]=color==='w'?'Q':'q';
  return b;
}
function cheLegal(g,color){
  const opp=color==='w'?'b':'w';
  return chePseudo(g,color).filter(m=>{
    const b2=cheApply(g,m);
    const k=cheFindKing(b2,color);
    return k>=0&&!cheAttacked(b2,k,opp);
  });
}
function cheTooThin(b){
  const ps=[];
  for(const p of b)if(p&&p.toLowerCase()!=='k')ps.push(p);
  if(!ps.length)return true;
  if(ps.length===1&&/[nb]/i.test(ps[0]))return true;
  return false;
}
function cheMove(g,m){
  const piece=g.b[m.from],color=cheColor(piece);
  const capSq=m.ep?m.to+(color==='w'?8:-8):m.to;
  const captured=g.b[capSq]||'';
  g.b=cheApply(g,m);
  g.last={from:m.from,to:m.to};
  g.ep=null;
  if(piece.toLowerCase()==='p'&&Math.abs((m.to>>3)-(m.from>>3))===2)g.ep=(m.from+m.to)/2;
  if(piece==='K'){g.castle.wK=0;g.castle.wQ=0;}
  if(piece==='k'){g.castle.bK=0;g.castle.bQ=0;}
  if(m.from===63||m.to===63)g.castle.wK=0;
  if(m.from===56||m.to===56)g.castle.wQ=0;
  if(m.from===7||m.to===7)g.castle.bK=0;
  if(m.from===0||m.to===0)g.castle.bQ=0;
  g.half=(piece.toLowerCase()==='p'||captured)?0:(g.half||0)+1;
  g.turn=color==='w'?'b':'w';
  const opp=g.turn;
  const moves=cheLegal(g,opp);
  const inCheck=cheAttacked(g.b,cheFindKing(g.b,opp),color);
  const promoted=piece.toLowerCase()==='p'&&((color==='w'&&(m.to>>3)===0)||(color==='b'&&(m.to>>3)===7));
  if(!moves.length){
    if(inCheck){
      g.done=color==='w'?'a':'b';
      g.score[g.done]=(g.score[g.done]||0)+1;
      g.msg='мат! победили '+(color==='w'?'белые':'чёрные');
      return {mated:true,captured:captured,promoted:promoted};
    }
    g.done='n';
    g.msg='пат — ничья';
    return {stalemate:true,captured:captured,promoted:promoted};
  }
  if(g.half>=100){g.done='n';g.msg='ничья: 50 ходов без взятий';return {stalemate:true,promoted:promoted};}
  if(cheTooThin(g.b)){g.done='n';g.msg='ничья: недостаточно фигур';return {stalemate:true,promoted:promoted};}
  g.msg=(opp==='w'?'белые':'чёрные')+(inCheck?' под шахом!':' ходят');
  return {captured:captured,inCheck:inCheck,promoted:promoted};
}
function drawChess(area){
  const g=GAMES_ST.chess;
  if(CHESS_UI.sel!=null){
    const p=g.b[CHESS_UI.sel];
    if(!p||cheColor(p)!==g.turn){CHESS_UI.sel=null;CHESS_UI.moves=[];}
  }
  let legal=[];
  if(CHESS_UI.sel!=null)legal=cheLegal(g,g.turn).filter(m=>m.from===CHESS_UI.sel);
  const dests=legal.map(m=>m.to);
  const kingSq=cheFindKing(g.b,g.turn);
  const inCheck=!g.done&&kingSq>=0&&cheAttacked(g.b,kingSq,g.turn==='w'?'b':'w');
  let cells='';
  for(let i=0;i<64;i++){
    const r=i>>3,c=i&7,dark=(r+c)%2===1;
    const p=g.b[i];
    const sel=CHESS_UI.sel===i;
    const isDest=dests.includes(i);
    const isLast=g.last&&(g.last.from===i||g.last.to===i);
    const isCheck=inCheck&&i===kingSq;
    const file='abcdefgh'[c],rank=8-r;
    cells+=`<button class="chess-sq ${dark?'dark':'light'}${sel?' sel':''}${isLast?' last':''}${isCheck?' check':''}" data-sq="${i}">
      ${c===0?`<span class="chess-rank">${rank}</span>`:''}
      ${r===7?`<span class="chess-file">${file}</span>`:''}
      ${isDest?'<span class="chess-dot"></span>':''}
      ${p?`<span class="chess-pc ${cheColor(p)==='w'?'w':'b'}">${CH_PIECES[p]||''}</span>`:''}
    </button>`;
  }
  area.innerHTML=`${gScoreHTML('a','b')}
    <div class="chess-board">${cells}</div>
    <div class="game-turn">${esc(g.msg||((g.turn==='w'?'белые':'чёрные')+' ходят'))}${inCheck?' <b class="chess-check">шах!</b>':''}</div>
    <div class="game-sub">${g.done?'нажми «новый раунд»':CHESS_UI.sel!=null?'выбери клетку для хода':'кликни свою фигуру — покажу, куда можно'}</div>
    <div class="game-btns"><button class="minibtn" id="gReset">новый раунд</button><button class="minibtn" id="gZero">сбросить счёт</button></div>`;
  area.querySelectorAll('[data-sq]').forEach(btn=>btn.onclick=()=>{
    const i=+btn.dataset.sq;
    if(g.done){toast('партия закончена — начни новый раунд');return;}
    if(CHESS_UI.sel!=null&&dests.includes(i)){
      const from=CHESS_UI.sel;
      if(!gCheckTurn(g.turn==='w'?1:2))return;
      gamesFresh(()=>{
        const gg=GAMES_ST.chess;
        const mv=cheLegal(gg,gg.turn).find(m=>m.from===from&&m.to===i);
        if(!mv){CHESS_UI.sel=null;CHESS_UI.moves=[];drawGame();return;}
        const res=cheMove(gg,mv);
        CHESS_UI.sel=null;CHESS_UI.moves=[];
        if(res.mated)toast('мат! 🎉');
        else if(res.stalemate)toast('ничья');
        else if(res.promoted)toast('пешка стала ферзём ♕');
        else if(res.inCheck)toast('шах!');
        drawGame();
      });
      return;
    }
    const p=g.b[i];
    if(p&&cheColor(p)===g.turn){
      if(!gCheckTurn(g.turn==='w'?1:2))return;
      CHESS_UI.sel=(CHESS_UI.sel===i?null:i);
      CHESS_UI.moves=[];
      drawChess(area);
      return;
    }
    CHESS_UI.sel=null;CHESS_UI.moves=[];drawChess(area);
  });
  area.querySelector('#gReset').onclick=()=>gamesFresh(()=>{
    if(!gMine(1)&&!gMine(2)){toast('сначала займи место за столом');return;}
    const gg=GAMES_ST.chess,f=chessFresh();
    gg.b=f.b;gg.turn='w';gg.done=null;gg.msg=f.msg;gg.last=null;gg.ep=null;gg.castle=f.castle;gg.half=0;
    CHESS_UI.sel=null;CHESS_UI.moves=[];drawGame();
  });
  area.querySelector('#gZero').onclick=()=>{
    if(!gMine(1)){toast('счёт обнуляет только игрок первого места');return;}
    gamesFresh(()=>{
      const gg=GAMES_ST.chess,f=chessFresh();
      gg.b=f.b;gg.turn='w';gg.done=null;gg.msg=f.msg;gg.last=null;gg.ep=null;gg.castle=f.castle;gg.half=0;gg.score={a:0,b:0};
      CHESS_UI.sel=null;CHESS_UI.moves=[];drawGame();
    });
  };
}

function drawRPS(area){
  const s=gT();
  if(s.p2===undefined)s.p2=null;
  if(!s.phase)s.phase=(s.p1===null||s.p1===undefined)?'p1':'p2';
  const pickSeat=s.phase==='p2'?2:1;
  area.innerHTML=`${gScoreHTML('a','b')}
    <div class="rps-msg">${esc(s.msg)}</div>
    <div class="game-sub">сейчас выбирает ${gTurn(pickSeat)}${s.phase==='p2'?' · его выбор скрыт от места 1':''}</div>
    <div class="rps-cards">${['🪨','✂️','🧻'].map((ic,i)=>`<button class="rps-c" data-i="${i}"><i>${ic}</i><span>${['камень','ножницы','бумага'][i]}</span></button>`).join('')}</div>
    ${s.last?`<div class="rps-last">раунд: ${esc(seatName(1))} ${['🪨','✂️','🧻'][s.last.a]} против ${esc(seatName(2))} ${['🪨','✂️','🧻'][s.last.b]} — ${esc(s.last.r)}</div>`:''}
    <div class="game-btns"><button class="minibtn" id="gReset">заново</button></div>`;
  const RES=['ничья','выиграл место 1','выиграл место 2'];
  area.querySelectorAll('.rps-c').forEach(c=>c.onclick=()=>{
    const i=+c.dataset.i;
    gamesFresh(()=>{
      const g=gT();
      if(g.p2===undefined)g.p2=null;
      if(!g.phase)g.phase=(g.p1===null||g.p1===undefined)?'p1':'p2';
      const seat=g.phase==='p2'?2:1;
      if(!gCheckTurn(seat))return;
      if(g.phase!=='p2'){
        g.p1=i;g.p2=null;g.phase='p2';
        g.msg='место 1 выбрало (скрыто). передай устройство: теперь выбирает '+seatName(2);
        drawGame();
        return;
      }
      const a=g.p1,b=i;
      let r;
      if(a===b)r=0;
      else if((a-b+3)%3===1)r=1;
      else r=2;
      if(r===1)g.score.a++;else if(r===2)g.score.b++;
      g.last={a:a,b:b,r:RES[r]};
      g.p1=null;g.p2=null;g.phase='p1';
      if(g.score.a>=3||g.score.b>=3){
        g.msg=(g.score.a>=3?seatName(1):seatName(2))+' выиграл со счётом 3:'+Math.min(g.score.a,g.score.b)+'! 🎉';
        g.score={a:0,b:0};g.last=null;
        toast('матч выигран! 🎉');
      }else{
        g.msg=(r===0?'ничья — ':RES[r]+' — ')+'место 1, выбирай снова';
      }
      drawGame();
    });
  });
  area.querySelector('#gReset').onclick=()=>{
    if(!gMine(1)){toast('партию начинает игрок первого места');return;}
    gamesFresh(()=>{
      const g=gT();g.p1=null;g.p2=null;g.phase='p1';g.score={a:0,b:0};g.msg='место 1, выбирай';g.last=null;drawGame();
    });
  };
}

/* ============ КАЗИНАК: слоты, рулетка, монетка, кости, блэкджек ============ */
const CASINO_ST={rhist:load('oomy.rhist',[])};
/* честный рандом без смещения: crypto, а если его нет — Math.random */
function fairInt(n){
  n=Math.floor(n);
  if(!(n>0))return 0;
  try{
    const b=new Uint32Array(1),lim=Math.floor(4294967296/n)*n;
    let v;do{crypto.getRandomValues(b);v=b[0];}while(v>=lim);
    return v%n;
  }catch(e){return Math.floor(Math.random()*n);}
}
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
  return w.slice(0,12).map(x=>`<div style="padding:5px 0;border-bottom:1px solid var(--line);font-size:12.5px;display:flex;gap:8px;align-items:center"><span class="ava" data-gu="${esc(x.u)}" style="width:24px;height:24px;font-size:12px;flex:none;cursor:pointer">${avaHTML(x.u,accOf(x.u).ava||'🐈')}</span><b data-gu="${esc(x.u)}" style="color:var(--text);cursor:pointer">@${esc(x.u)}</b><span style="color:#f5b301;font-weight:800">+${x.amt}</span><span style="color:var(--muted2)">· ${esc(x.game)}</span><span style="margin-left:auto;color:var(--muted2)">${fm(x.ts)}</span></div>`).join('')||'<div class="from-line">пока никто не выигрывал — будь первым</div>';
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
  const CAS_MODES=['slots','roul','coin','mines','balloon','blackjack'];
  if(!CAS_MODES.includes(CASINO_ST.tab))CASINO_ST.tab='slots';
  const t=CASINO_ST.tab;
  box.innerHTML=`<div class="pcard" style="padding:16px 18px">
    <div class="pf-name" style="font-size:18px">казинак 🎲</div>
    <div class="pf-sub">честный рандом: можно выиграть, можно проиграть. играй на оонетки умеренно, котик</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">
      <button class="stab ${t==='slots'?'active':''}" data-c="slots">🎰 слоты</button>
      <button class="stab ${t==='roul'?'active':''}" data-c="roul">🎡 рулетка</button>
      <button class="stab ${t==='coin'?'active':''}" data-c="coin">🪙 монетка</button>
      <button class="stab ${t==='mines'?'active':''}" data-c="mines">💣 мины</button>
      <button class="stab ${t==='balloon'?'active':''}" data-c="balloon">🎈 шар</button>
      <button class="stab ${t==='blackjack'?'active':''}" data-c="blackjack">🃏 блэкджек</button>
    </div>
    <div class="mode-line" id="casModeLine">сейчас режим: <b>${{slots:'🎰 слоты',roul:'🎡 рулетка',coin:'🪙 монетка',mines:'💣 мины',balloon:'🎈 шар',blackjack:'🃏 блэкджек'}[t]||'—'}</b></div>
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
  box.querySelectorAll('[data-c]').forEach(b=>b.onclick=()=>{
    CASINO_ST.tab=b.dataset.c;
    box.querySelectorAll('[data-c]').forEach(x=>x.classList.toggle('active',x===b));
    const labels={slots:'🎰 слоты',roul:'🎡 рулетка',coin:'🪙 монетка',mines:'💣 мины',balloon:'🎈 шар',blackjack:'🃏 блэкджек'};
    const ml=box.querySelector('#casModeLine');
    if(ml)ml.innerHTML='сейчас режим: <b>'+(labels[CASINO_ST.tab]||'—')+'</b>';
    drawCasino();
  });
  box.querySelectorAll('[data-gu]').forEach(el=>el.onclick=()=>{if(me&&!me.guest)openUserPage(el.dataset.gu);});
  drawCasino();
}
function drawCasino(){
  const area=document.getElementById('casArea');if(!area)return;
  area.dataset.mode=CASINO_ST.tab||'slots';
  ({slots:casSlots,roul:casRoul,coin:casCoin,mines:casMines,balloon:casBalloon,blackjack:casBlackjack})[CASINO_ST.tab||'slots'](area);
}
/* --- слоты --- */
const SLOTS_S=[{i:'🍒',m:5},{i:'🍋',m:3},{i:'🍇',m:3},{i:'🐱',m:8},{i:'⭐',m:10},{i:'7️⃣',m:20}];
/* одно нажатие на игру раз в 5 секунд — общий «замок» для слотов и монетки */
let casLastSpin=0;
function casLock(){
  const left=5000-(Date.now()-casLastSpin);
  if(left>0){toast('подожди ещё '+(left/1000).toFixed(1)+' сек');return false;}
  casLastSpin=Date.now();return true;
}
function casSlots(body){
  body.innerHTML=`<div style="text-align:center">
    <div class="panel" style="display:flex;gap:10px;justify-content:center;margin-bottom:14px;padding:14px;width:max-content;margin-left:auto;margin-right:auto" id="slReels">
      ${[0,1,2].map(i=>`<div class="sl-reel" data-r="${i}" style="width:84px;height:84px;font-size:46px;display:flex;align-items:center;justify-content:center;background:var(--card2);border:1px solid var(--line);border-radius:16px">${SLOTS_S[i].i}</div>`).join('')}
    </div>
    <button class="dan-btn" id="slSpin" style="padding:11px 30px;min-width:190px">крутить 🎰</button>
    <div class="from-line" style="margin-top:10px">3 одинаковых: 🍒×5 🍋×3 🍇×3 🐱×8 ⭐×10 7️⃣×20 · 2 одинаковых ×1.5</div>
  </div>`;
  body.querySelector('#slSpin').onclick=()=>{
    if(!casLock())return;
    const bet=casBet();if(!bet){casLastSpin=0;return;}
    addOon(-bet);refreshOonChip();
    const reels=body.querySelectorAll('.sl-reel');
    const btn=body.querySelector('#slSpin');btn.disabled=true;
    const fin=[0,1,2].map(()=>fairInt(SLOTS_S.length));
    const total=5000,started=Date.now();
    reels.forEach(r=>r.classList.add('sl-spin'));
    const iv=setInterval(()=>{
      const el=Date.now()-started;
      reels.forEach(r=>{r.textContent=SLOTS_S[fairInt(SLOTS_S.length)].i;});
      btn.textContent='крутится… '+Math.max(0,(total-el)/1000).toFixed(1)+' сек';
      if(el>=total){
        clearInterval(iv);
        reels.forEach(r=>r.classList.remove('sl-spin'));
        reels.forEach((r,i)=>{r.textContent=SLOTS_S[fin[i]].i;});
        const [a,b,c]=fin;
        let mult=0,txt='';
        if(a===b&&b===c){mult=SLOTS_S[a].m;txt='джекпот '+SLOTS_S[a].i+' ×'+mult;}
        else if(a===b||b===c||a===c){mult=1.5;txt='пара ×1.5';}
        if(mult)reels.forEach(r=>r.classList.add('sl-win'));
        casPayout(bet,mult,'слоты');
        if(mult)toast('+'+Math.round(bet*mult)+' оонеток! '+txt);else toast('мимо 🙀');
        btn.disabled=false;btn.textContent='крутить 🎰';
        setTimeout(()=>reels.forEach(r=>r.classList.remove('sl-win')),1400);
      }
    },70);
  };
}
/* --- рулетка: ждёт ставки, 10 секунд отсчёта, 5 секунд вращения, выплата только после остановки --- */
const ROUL_COLS=(()=>{const a=['green'];for(let i=1;i<15;i++)a.push(i<=7?'red':'black');return a})();
const ROUL_BET_MS=10000,ROUL_SPIN_MS=5000,ROUL_GAP_MS=2500;
function roulWord(c){return c==='red'?'красное':c==='black'?'чёрное':'зелёное'}
function casRoul(body){
  const root=cloudRoot()?cloudRoot().slice(0,-5):null;
  const roundURL=root?root+'oomy__roul/round.json':null;
  const betsURL=rid=>root?root+'oomy__roul/bets/'+rid:null;
  const newRid=()=>Date.now().toString(36)+fairInt(1296).toString(36);
  let R={rid:null,phase:'wait',betStart:0,spinStart:0,result:null,ts:0};
  let bets={},localBet=null,paidRid='',shownRid='',wheelRid='',lastPoll=0,lastBetsPoll=0;
  const CE=ROUL_COLS.map((c,i)=>`${c==='red'?'#ff4d6d':c==='black'?'#2b2b33':'#14b85a'} ${i*24}deg ${(i+1)*24}deg`).join(',');
  body.innerHTML=`<div style="text-align:center">
    <div style="position:relative;width:200px;height:200px;margin:0 auto 10px">
      <div id="roWheel" style="width:100%;height:100%;border-radius:50%;border:6px solid var(--line);box-shadow:0 10px 40px var(--shadow);background:conic-gradient(${CE});transition:transform 5s cubic-bezier(.12,.76,.18,1)"></div>
      <div style="position:absolute;top:-5px;left:50%;transform:translateX(-50%);font-size:20px;color:var(--text)">▼</div>
      <div id="roNum" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:800;color:#fff;text-shadow:0 2px 8px #000">?</div>
    </div>
    <div id="roTimer" style="font-size:13px;margin-bottom:8px">ожидаю ставок — поставь, и начнётся отсчёт</div>
    <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:10px">
      <button class="dan-btn" data-ro="red" style="background:#ff4d6d">🔴 красное ×2</button>
      <button class="dan-btn" data-ro="black" style="background:#333">⚫ чёрное ×2</button>
      <button class="dan-btn" data-ro="green" style="background:#14b85a">🟢 зелёное ×14</button>
    </div>
    <div id="roBets" class="from-line" style="margin-top:6px;display:flex;flex-wrap:wrap;justify-content:center;row-gap:4px">ставок пока нет — будь первым</div>
    <div style="margin-top:12px">
      <div class="from-line" style="margin-bottom:5px">последние 10 выпадений</div>
      <div id="roHist" style="display:flex;gap:5px;justify-content:center;flex-wrap:wrap"></div>
    </div>
  </div>`;
  const wheel=body.querySelector('#roWheel'),numEl=body.querySelector('#roNum'),tEl=body.querySelector('#roTimer'),betsEl=body.querySelector('#roBets'),histEl=body.querySelector('#roHist');
  const setAngle=()=>{wheel.style.transition='none';wheel.style.transform='rotate(0deg)';void wheel.offsetWidth;wheel.style.transition='transform 5s cubic-bezier(.12,.76,.18,1)';};
  const chip=n=>{const c=ROUL_COLS[n];return `<span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;font-size:11.5px;font-weight:700;color:#fff;background:${c==='red'?'#ff4d6d':c==='black'?'#2b2b33':'#14b85a'}">${n}</span>`};
  const drawHist=()=>{if(!histEl)return;const h=(Array.isArray(CASINO_ST.rhist)?CASINO_ST.rhist:[]).slice(0,10);histEl.innerHTML=h.length?h.map(chip).join(''):'<span class="from-line">пока пусто</span>';};
  const pushHist=n=>{CASINO_ST.rhist=(Array.isArray(CASINO_ST.rhist)?CASINO_ST.rhist:[]);CASINO_ST.rhist.unshift(n);CASINO_ST.rhist=CASINO_ST.rhist.slice(0,10);try{save('oomy.rhist',CASINO_ST.rhist);}catch(e){}drawHist();};
  const betColors=c=>c==='red'?'🔴':c==='black'?'⚫':'🟢';
  const showBets=()=>{
    const ks=Object.keys(bets||{});
    betsEl.innerHTML=ks.length?ks.map(u=>`<span style="display:inline-flex;align-items:center;gap:4px;margin:2px 6px 2px 0"><span class="ava" data-gu="${esc(u)}" style="width:20px;height:20px;font-size:10px;cursor:pointer">${avaHTML(u,accOf(u).ava||'🐈')}</span><b>${userLink(u)}</b> ${betColors(bets[u].c)} ${bets[u].amt}</span>`).join(''):'ставок пока нет — будь первым';
  };
  const pushRound=()=>{if(!roundURL)return;fetch(roundURL,{method:'PUT',body:JSON.stringify(R)}).catch(()=>{});};
  const startRound=()=>{
    R={rid:newRid(),phase:'bet',betStart:Date.now(),spinStart:0,result:null,ts:Date.now()};
    bets={};localBet=null;paidRid='';shownRid='';wheelRid='';numEl.textContent='?';setAngle();showBets();pushRound();
  };
  const pullBets=()=>{
    if(!root||!R.rid)return;
    fetch(betsURL(R.rid)+'.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(v=>{
      if(v&&typeof v==='object'&&R.rid){
        bets=v;
        if(localBet&&localBet.rid===R.rid)bets[me.user]={c:localBet.c,amt:localBet.amt};
        showBets();
      }
    }).catch(()=>{});
  };
  const adopt=v=>{
    if(!v||!v.rid)return;
    const nr={rid:v.rid,phase:v.phase||'wait',betStart:+v.betStart||0,spinStart:+v.spinStart||0,result:v.result==null?null:+v.result,ts:+v.ts||0};
    if(nr.ts<=(R.ts||0))return;
    const ridChanged=nr.rid!==R.rid;
    R=nr;
    if(ridChanged){
      bets={};localBet=null;paidRid='';shownRid='';wheelRid='';numEl.textContent='?';setAngle();showBets();drawHist();
      if(R.phase==='bet'||R.phase==='spin')pullBets();
    }
  };
  const cloudRound=cb=>{
    if(!roundURL){cb&&cb();return;}
    fetch(roundURL,{cache:'no-store'}).then(r=>r.ok?r.json():null).then(v=>{adopt(v);cb&&cb();}).catch(()=>{cb&&cb();});
  };
  const settle=()=>{
    if(paidRid===R.rid)return;
    paidRid=R.rid;
    const num=R.result!=null?R.result:fairInt(15);R.result=num;
    const col=ROUL_COLS[num];
    numEl.textContent=num;
    tEl.innerHTML='выпало <b>'+num+'</b> — '+roulWord(col);
    pushHist(num);
    const mine=(localBet&&localBet.rid===R.rid)?{c:localBet.c,amt:localBet.amt}:bets[me.user];
    if(mine&&mine.c===col){
      const mult=col==='green'?14:2;
      const amt=Math.round(mine.amt*mult);
      addOon(amt);refreshOonChip();casWin(amt,'рулетка');
      toast('🎉 выигрыш +'+amt+' оонеток!');
    }else if(mine){toast('мимо — выпало '+num+', '+roulWord(col));}
  };
  const sync=now=>{
    if(R.phase==='bet'&&now-R.betStart>ROUL_BET_MS+ROUL_SPIN_MS+ROUL_GAP_MS+30000){
      R={rid:R.rid,phase:'wait',betStart:0,spinStart:0,result:R.result,ts:Date.now()};
      pushRound();numEl.textContent='?';setAngle();bets={};localBet=null;showBets();
    }
    if(R.phase==='bet'){
      const left=R.betStart+ROUL_BET_MS-now;
      if(left>0){
        tEl.textContent='приём ставок: '+(left/1000).toFixed(1)+' сек';
      }else{
        R={rid:R.rid,phase:'spin',betStart:R.betStart,spinStart:now,result:fairInt(15),ts:Date.now()};
        wheelRid='';numEl.textContent='?';tEl.textContent='колесо крутится…';pushRound();
      }
    }
    if(R.phase==='spin'){
      const left=R.spinStart+ROUL_SPIN_MS-now;
      if(left>0){
        if(wheelRid!==R.rid){
          wheelRid=R.rid;
          const num=R.result!=null?R.result:fairInt(15);
          R.result=num;
          wheel.style.transform='rotate('+(360*5+(360-(num*24+12)))+'deg)';
        }
        numEl.textContent='?';tEl.textContent='колесо крутится…';
      }else{
        settle();
        if(now>R.spinStart+ROUL_SPIN_MS+ROUL_GAP_MS){
          R={rid:R.rid,phase:'wait',betStart:0,spinStart:0,result:R.result,ts:Date.now()};
          pushRound();numEl.textContent='?';setAngle();bets={};localBet=null;showBets();
          tEl.textContent='ожидаю ставок — поставь, и начнётся отсчёт';
        }
      }
    }
  };
  body.querySelectorAll('[data-ro]').forEach(b=>b.onclick=()=>{
    const now=Date.now();
    if(R.phase==='bet'&&now>=R.betStart+ROUL_BET_MS){toast('ставки закрыты — колесо крутится');return;}
    if(R.phase==='spin'){toast('колесо уже крутится — ставки закрыты');return;}
    const amt=casBet();if(!amt)return;
    if(R.phase!=='bet')startRound();
    addOon(-amt);refreshOonChip();
    const c=b.dataset.ro;
    localBet={rid:R.rid,c,amt};
    bets[me.user]={c,amt};
    showBets();
    if(root)fetch(betsURL(R.rid)+'/'+encodeURIComponent(me.user)+'.json',{method:'PUT',body:JSON.stringify({c,amt})}).catch(()=>{});
    addLog('casino',me.user,'рулетка: '+roulWord(c)+' '+amt);
  });
  drawHist();showBets();
  cloudRound(()=>sync(Date.now()));
  const iv=setInterval(()=>{
    if(!wheel.isConnected){clearInterval(iv);return;}
    const now=Date.now();
    if(now-lastPoll>=450){lastPoll=now;cloudRound(()=>sync(Date.now()));}
    else sync(now);
    if((R.phase==='bet'||R.phase==='spin')&&now-lastBetsPoll>=700){lastBetsPoll=now;pullBets();}
  },250);
}
/* --- мины: поле 5×5, сам выбираешь число мин, каждый безопасный клик растит x --- */
function casMines(body){
  const SIDE=5,CELLS=SIDE*SIDE,MINE_OPTS=[1,3,5,7,10,12];
  let playing=false,mines=[],opened=[],count=3,mult=1,bet=0;
  body.innerHTML=`<div class="cas-stage cas-mines">
    <div class="cas-head">
      <div class="cas-x">×<b id="mnMult">1.00</b></div>
      <label class="cas-mini">мин
        <select id="mnCount">${MINE_OPTS.map(n=>`<option value="${n}"${n===count?' selected':''}>${n}</option>`).join('')}</select>
      </label>
    </div>
    <div class="mn-grid" id="mnGrid">${Array.from({length:CELLS},(_,i)=>`<button class="mn-cell" data-i="${i}" disabled>?</button>`).join('')}</div>
    <div class="cas-row">
      <button class="dan-btn" id="mnStart">начать · ставка</button>
      <button class="dan-btn cas-cash" id="mnCash" disabled>забрать ×1.00</button>
    </div>
    <div class="from-line" id="mnMsg">выбери число мин и начни — каждая безопасная клетка повышает x</div>
  </div>`;
  const grid=body.querySelector('#mnGrid'),multEl=body.querySelector('#mnMult'),cash=body.querySelector('#mnCash'),
        start=body.querySelector('#mnStart'),msg=body.querySelector('#mnMsg'),countEl=body.querySelector('#mnCount');
  const cells=()=>[...grid.querySelectorAll('.mn-cell')];
  const multFor=(m,k)=>{
    if(k<=0)return 1;
    let prob=1;
    for(let i=0;i<k;i++)prob*=Math.max(0,(CELLS-m-i))/Math.max(1,(CELLS-i));
    return Math.max(1,Math.round((0.97/prob)*100)/100);
  };
  const reset=()=>{
    playing=false;mines=[];opened=[];mult=1;bet=0;
    cells().forEach(c=>{c.disabled=true;c.className='mn-cell';c.textContent='?';});
    multEl.textContent='1.00';cash.disabled=true;cash.textContent='забрать ×1.00';
    start.disabled=false;start.textContent='начать · ставка';countEl.disabled=false;
  };
  const finish=win=>{
    if(win){
      casPayout(bet,mult,'мины');
      msg.innerHTML='забрал <b style="color:#ffd23f">+'+Math.round(bet*mult)+' оонеток</b> · ×'+mult.toFixed(2);
    }else{
      msg.innerHTML='💥 <b style="color:#ff8a9a">мина!</b> ставка сгорела — попробуй ещё';
    }
    cash.disabled=true;start.disabled=false;start.textContent='ещё раз';countEl.disabled=false;
  };
  start.onclick=()=>{
    if(playing)return;
    const b=casBet();if(!b)return;
    bet=b;addOon(-bet);refreshOonChip();
    count=Number(countEl.value)||3;
    const pool=Array.from({length:CELLS},(_,i)=>i);
    for(let i=pool.length-1;i>0;i--){const j=fairInt(i+1);const x=pool[i];pool[i]=pool[j];pool[j]=x;}
    mines=pool.slice(0,count);opened=[];mult=1;playing=true;
    cells().forEach(c=>{c.disabled=false;c.className='mn-cell';c.textContent='?';});
    multEl.textContent='1.00';cash.disabled=true;cash.textContent='забрать ×1.00';
    start.disabled=true;countEl.disabled=true;
    msg.innerHTML='поле '+CELLS+' клеток · мин <b>'+count+'</b> · жми на клетки и вовремя забирай';
  };
  countEl.onchange=()=>{count=Number(countEl.value)||3;if(!playing)msg.textContent='мин будет: '+count+' · чем больше, тем выше x';};
  cash.onclick=()=>{
    if(!playing||!opened.length)return;
    playing=false;cells().forEach(c=>c.disabled=true);finish(true);
  };
  grid.onclick=e=>{
    const c=e.target.closest('.mn-cell');if(!c||!playing)return;
    const i=Number(c.dataset.i);if(c.disabled||opened.includes(i))return;
    if(mines.includes(i)){
      c.classList.add('mine','hit');c.textContent='💣';c.disabled=true;
      cells().forEach((x,j)=>{if(mines.includes(j)){x.classList.add('mine');x.textContent='💣';x.disabled=true;}});
      playing=false;finish(false);return;
    }
    opened.push(i);c.classList.add('open');c.textContent='💎';c.disabled=true;
    mult=multFor(count,opened.length);
    multEl.textContent=mult.toFixed(2);cash.disabled=false;cash.textContent='забрать ×'+mult.toFixed(2);
    msg.innerHTML='безопасно · открыто '+opened.length+'/'+(CELLS-count)+' · сейчас <b style="color:#8fdcff">×'+mult.toFixed(2)+'</b>';
    if(opened.length>=CELLS-count){cells().forEach(x=>x.disabled=true);playing=false;finish(true);}
  };
  reset();
}
/* --- шар: кликаешь — надувается и растёт x, но может лопнуть. успей забрать! --- */
function casBalloon(body){
  let playing=false,clicks=0,mult=1,bet=0;
  body.innerHTML=`<div class="cas-stage cas-balloon">
    <div class="balloon-stage" id="blStage">
      <div class="balloon" id="blBall"><span id="blTxt">×1.00</span></div>
      <div class="balloon-pop" id="blPop">БАБАХ!</div>
    </div>
    <div class="cas-head">
      <div class="cas-x">×<b id="blMult">1.00</b></div>
      <div class="cas-mini" id="blChance">риск 0%</div>
    </div>
    <div class="cas-row">
      <button class="dan-btn" id="blStart">начать · ставка</button>
      <button class="dan-btn cas-pump" id="blPump" disabled>надуть 🎈</button>
      <button class="dan-btn cas-cash" id="blCash" disabled>забрать</button>
    </div>
    <div class="from-line" id="blMsg">начни, потом надувай шар — но успей забрать, пока он не лопнул</div>
  </div>`;
  const ball=body.querySelector('#blBall'),pop=body.querySelector('#blPop'),stage=body.querySelector('#blStage'),
        multEl=body.querySelector('#blMult'),chanceEl=body.querySelector('#blChance'),txt=body.querySelector('#blTxt'),
        start=body.querySelector('#blStart'),pump=body.querySelector('#blPump'),cash=body.querySelector('#blCash'),msg=body.querySelector('#blMsg');
  const chance=()=>playing?Math.min(0.92,0.035+0.021*clicks+Math.max(0,clicks-6)*0.012):0;
  const paint=()=>{
    const d=Math.min(188,64+clicks*11);
    ball.style.width=d+'px';ball.style.height=Math.round(d*1.16)+'px';
    ball.style.background='radial-gradient(circle at 32% 26%,#ffe1ef 0%,hsl('+(338+clicks*4)+' 92% 66%) 34%,hsl('+(330+clicks*5)+' 82% 48%) 72%,hsl('+(320+clicks*5)+' 75% 32%) 100%)';
    txt.textContent='×'+mult.toFixed(2);
    multEl.textContent=mult.toFixed(2);
    chanceEl.textContent='риск '+Math.round(chance()*100)+'%';
  };
  const reset=()=>{
    playing=false;clicks=0;mult=1;bet=0;
    ball.style.display='';ball.style.width='70px';ball.style.height='82px';
    pop.classList.remove('show');stage.classList.remove('pop-shake');
    pump.disabled=true;cash.disabled=true;start.disabled=false;start.textContent='начать · ставка';
    multEl.textContent='1.00';chanceEl.textContent='риск 0%';txt.textContent='×1.00';
    msg.textContent='начни, потом надувай шар — но успей забрать, пока он не лопнул';
  };
  start.onclick=()=>{
    if(playing)return;
    const b=casBet();if(!b)return;
    addOon(-b);refreshOonChip();
    playing=true;clicks=0;mult=1;bet=b;
    ball.style.display='';pop.classList.remove('show');stage.classList.remove('pop-shake');
    pump.disabled=false;cash.disabled=true;start.disabled=true;
    multEl.textContent='1.00';cash.textContent='забрать';
    msg.innerHTML='шар готов · жми «надуть» и следи за x';
    paint();
  };
  pump.onclick=()=>{
    if(!playing)return;
    if(fairInt(10000)/10000<chance()){
      playing=false;pump.disabled=true;cash.disabled=true;start.disabled=false;start.textContent='ещё раз';
      ball.style.display='none';pop.classList.add('show');stage.classList.add('pop-shake');
      msg.innerHTML='💥 шар лопнул — <b style="color:#ff9aa9">ставка сгорела</b>';
      refreshOonChip();
      return;
    }
    clicks++;mult=Math.max(1,Math.round((1+clicks*0.22)*100)/100);
    ball.classList.remove('boing');void ball.offsetWidth;ball.classList.add('boing');
    paint();cash.disabled=false;cash.textContent='забрать ×'+mult.toFixed(2);
    msg.innerHTML='шар надут ×'+mult.toFixed(2)+' · риск лопания '+Math.round(chance()*100)+'%';
  };
  cash.onclick=()=>{
    if(!playing)return;
    playing=false;pump.disabled=true;cash.disabled=true;start.disabled=false;start.textContent='ещё раз';
    casPayout(bet,mult,'шар');
    msg.innerHTML='успел! <b style="color:#ffd23f">+'+Math.round(bet*mult)+' оонеток</b> · ×'+mult.toFixed(2);
    pop.classList.remove('show');ball.style.display='none';
  };
  reset();
}
/* --- блэкджек: игрок против дилера, выплата после хода дилера --- */
function casBlackjack(body){
  const RANKS=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  const SUITS=['♠','♥','♦','♣'];
  const val=c=>c.r==='A'?11:['J','Q','K'].includes(c.r)?10:+c.r;
  const total=h=>{let t=h.reduce((a,c)=>a+val(c),0),a=h.filter(c=>c.r==='A').length;while(t>21&&a){t-=10;a--;}return t;};
  const freshDeck=()=>{
    const d=[];SUITS.forEach(s=>RANKS.forEach(r=>d.push({r,s})));
    for(let i=d.length-1;i>0;i--){const j=fairInt(i+1);const x=d[i];d[i]=d[j];d[j]=x;}
    return d;
  };
  let hand=null;
  body.innerHTML=`<div style="text-align:center"><div id="bjHint" class="from-line" style="margin-bottom:8px">собери 21 или больше, чем у дилера</div><div id="bjArea"></div></div>`;
  const area=body.querySelector('#bjArea');
  const cardHTML=(c,hide)=>{
    if(hide)return `<div style="width:52px;height:74px;border-radius:9px;border:1px solid var(--line);background:repeating-linear-gradient(45deg,#333 0 6px,#222 6px 12px);display:flex;align-items:center;justify-content:center;font-size:20px;color:#777">🂠</div>`;
    const red=c.s==='♥'||c.s==='♦';
    return `<div style="width:52px;height:74px;border-radius:9px;border:1px solid var(--line);background:var(--card2);display:flex;flex-direction:column;align-items:center;justify-content:center;color:${red?'#ff4d6d':'var(--text)'};font-weight:800;font-size:17px;line-height:1.05">${c.r}<span style="font-size:20px">${c.s}</span></div>`;
  };
  const draw=()=>{
    if(!hand){
      area.innerHTML=`<div class="from-line">нажми «раздать», ставка списывается сразу</div><div style="margin-top:12px"><button class="dan-btn" id="bjNew">раздать 🃏</button></div>`;
      area.querySelector('#bjNew').onclick=deal;return;
    }
    const pt=total(hand.player),dt=total(hand.dealer),show=hand.phase!=='play';
    area.innerHTML=`
      <div class="from-line">дилер${show?' · '+dt:' · ?'}</div>
      <div style="display:flex;gap:5px;justify-content:center;flex-wrap:wrap;margin:5px 0 12px">${hand.dealer.map((c,i)=>cardHTML(c,i===1&&!show)).join('')}</div>
      <div class="from-line">ты · ${pt}</div>
      <div style="display:flex;gap:5px;justify-content:center;flex-wrap:wrap;margin-top:5px">${hand.player.map(c=>cardHTML(c)).join('')}</div>
      <div id="bjRes" style="margin-top:12px;font-size:14px;font-weight:700;min-height:20px">${esc(hand.msg||'')}</div>
      ${hand.phase==='play'?`<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:10px">
        <button class="dan-btn" id="bjHit">ещё</button>
        <button class="dan-btn" id="bjStand" style="background:#444">хватит</button>
        ${hand.player.length===2&&myOon()>=hand.bet?'<button class="dan-btn" id="bjDouble" style="background:#7b3ff2">удвоить</button>':''}
      </div>`:hand.phase==='done'?`<div style="margin-top:10px"><button class="dan-btn" id="bjNew">новая раздача</button></div>`:''}`;
    const hitBtn=area.querySelector('#bjHit'),standBtn=area.querySelector('#bjStand'),dblBtn=area.querySelector('#bjDouble'),newBtn=area.querySelector('#bjNew');
    if(hitBtn)hitBtn.onclick=hit;if(standBtn)standBtn.onclick=stand;if(dblBtn)dblBtn.onclick=double;if(newBtn)newBtn.onclick=deal;
  };
  const deal=()=>{
    if(hand&&hand.phase!=='done'){toast('сначала доиграй раздачу');return;}
    const bet=casBet();if(!bet)return;
    addOon(-bet);refreshOonChip();
    const deck=freshDeck();
    hand={deck,player:[deck.pop(),deck.pop()],dealer:[deck.pop(),deck.pop()],bet,phase:'play',msg:'твой ход',settled:false};
    if(total(hand.player)===21){hand.phase='dealer';hand.msg='блэкджек!';draw();setTimeout(dealerStep,600);}
    else draw();
  };
  const hit=()=>{
    if(!hand||hand.phase!=='play')return;
    hand.player.push(hand.deck.pop());
    const pt=total(hand.player);
    if(pt>21){hand.phase='dealer';hand.msg='перебор!';draw();setTimeout(settle,700);}
    else if(pt===21){stand();}
    else {hand.msg='ещё или хватит';draw();}
  };
  const stand=()=>{
    if(!hand||hand.phase!=='play')return;
    hand.phase='dealer';hand.msg='дилер набирает…';draw();setTimeout(dealerStep,600);
  };
  const double=()=>{
    if(!hand||hand.phase!=='play'||hand.player.length!==2)return;
    if(myOon()<hand.bet){toast('не хватает оонеток');return;}
    addOon(-hand.bet);hand.bet*=2;refreshOonChip();
    hand.player.push(hand.deck.pop());
    if(total(hand.player)>21){hand.phase='dealer';hand.msg='перебор!';draw();setTimeout(settle,700);}
    else stand();
  };
  const dealerStep=()=>{
    if(!hand||hand.phase!=='dealer')return;
    if(total(hand.dealer)<17){hand.dealer.push(hand.deck.pop());draw();setTimeout(dealerStep,650);return;}
    settle();
  };
  const settle=()=>{
    if(!hand||hand.settled)return;hand.settled=true;hand.phase='done';
    const pt=total(hand.player),dt=total(hand.dealer);
    const pBJ=hand.player.length===2&&pt===21,dBJ=hand.dealer.length===2&&dt===21;
    let mult=0,txt='';
    if(pt>21)txt='перебор — проигрыш 😿';
    else if(pBJ&&dBJ){mult=1;txt='у обоих блэкджек — ничья';}
    else if(pBJ){mult=2.5;txt='блэкджек! ×2.5 🎉';}
    else if(dt>21){mult=2;txt='дилер перебрал — победа '+pt+':'+dt+' 🎉';}
    else if(pt>dt){mult=2;txt='ты выиграл '+pt+':'+dt+' 🎉';}
    else if(pt===dt){mult=1;txt='ничья — ставка возвращается';}
    else txt='дилер выиграл '+dt+':'+pt+' 😿';
    if(mult===1){addOon(hand.bet);refreshOonChip();}
    else if(mult>1){casPayout(hand.bet,mult,'блэкджек');toast('+'+Math.round(hand.bet*mult)+' оонеток!');}
    else{refreshOonChip();toast('мимо 🙀');}
    const bal=document.getElementById('casBal');if(bal)bal.textContent=myOon()+' оонеток';
    hand.msg=txt;draw();
  };
  draw();
}
/* --- монетка: каждый раз перед броском снова знак «?», после остановки видно только то, что выпало --- */
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
    if(!casLock())return;
    const bet=casBet();if(!bet){casLastSpin=0;return;}
    addOon(-bet);refreshOonChip();
    const n=fairInt(2);
    const mult=String(n)===b.dataset.cn?1.95:0;
    const el=body.querySelector('#cnCoin'),lab=body.querySelector('#cnLab');
    const btns=body.querySelectorAll('[data-cn]');
    btns.forEach(x=>x.disabled=true);
    /* перед каждым броском монетка снова «?» — прошлого результата не видно */
    el.innerHTML='?';el.style.transform='';
    lab.textContent='монетка крутится…';
    if(el.animate)el.animate([{transform:'rotateY(0deg) scale(1)'},{transform:'rotateY(1440deg) scale(1.18)'},{transform:'rotateY(1800deg) scale(1)'}],{duration:5000,easing:'cubic-bezier(.2,.7,.2,1)'});
    else el.style.transform='scale(1.1)';
    setTimeout(()=>{
      casPayout(bet,mult,'монетка');
      /* после остановки на монетке только то, что выпало */
      el.innerHTML=n?'<span style="font-size:44px">1</span>':'🦅';
      lab.innerHTML='выпало: <b>'+(n?'решка':'орёл')+'</b>'+(mult?' · <b style="color:#f5b301">+'+Math.round(bet*mult)+' оонеток 🎉</b>':' · мимо 🙀');
      toast(mult?'+'+Math.round(bet*mult)+' оонеток!':'мимо 🙀');
      btns.forEach(x=>x.disabled=false);
    },5000);
  });
}
