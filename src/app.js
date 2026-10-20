(function(){
function $(i){return document.getElementById(i)}
function r5(x){return Math.round(x/5)*5}
function mmss(s){s=Math.max(0,Math.round(s));return Math.floor(s/60)+':'+('0'+(s%60)).slice(-2)}
function signed(s){s=Math.round(s);return (s>0?'+':s<0?'\u2212':'')+Math.abs(s)+'s'}

/* who this phone brews as: each person keeps their own settings, log, packs and places (sync/install.js sets this up) */
var WHO=window.__who||{id:'me',name:'',dir:'',suffix:'',people:[],connected:false};
var SKEY='fp.v1'+WHO.suffix, LKEY='fp.log.v1'+WHO.suffix, TKEY='fp.log.test.v1'+WHO.suffix;
var FAULTS=['Sour','Grassy','Bitter','Astringent','Flat','Thin','Silty','Stalled pour','Too hot','Too cool'];
var TASTES=['Sweet','Juicy','Fruity','Floral','Citrus','Chocolatey','Nutty','Winey'];
var DKEY='fp.log.del.v1'+WHO.suffix;
var CONTACT={pour:1,steep:1,crust:1,settle:1,plunge:1,decant:1};
/* step times can be corrected after the fact, e.g. when a timer kept running because Next was tapped late */
function stepEditHTML(e,px){
  if(!e.steps||!e.steps.length)return '';
  return '<div class="grid">'+e.steps.map(function(st,i){
    var sid=px+'-st-'+i;
    return '<div><label for="'+sid+'">'+esc(st.t)+'</label><div class="stp sm"><button type="button" class="sb" data-st="'+sid+'" data-d="-5" aria-label="5 seconds less">\u2212</button>'
      +'<input type="text" id="'+sid+'" class="tin sv" enterkeyhint="done" data-fmt="ms" data-'+px+'="'+i+'" value="'+mmss(st.actual)+'" placeholder="m:ss">'
      +'<button type="button" class="sb" data-st="'+sid+'" data-d="5" aria-label="5 seconds more">+</button></div></div>';
  }).join('')+'</div><p class="cap">Type minutes and seconds, like 4:30, or tap \u2212 and + to move 5 seconds at a time. Contact time and total update when you save.</p>';
}
function parseMS(v){
  v=String(v||'').trim(); var m=v.match(/^(\d{1,3}):(\d{1,2})$/);
  if(m&&Number(m[2])<60)return Number(m[1])*60+Number(m[2]);
  if(/^\d{1,4}$/.test(v))return Number(v);
  return null;
}
function applyStepEdits(e,px){
  if(!e.steps)return false;
  var changed=false, oldSum=0, newSum=0;
  e.steps.forEach(function(st,i){
    oldSum+=st.actual;
    var el=document.querySelector('[data-'+px+'="'+i+'"]');
    var v=el?parseMS(el.value):null;
    if(v!==null&&v!==st.actual){st.actual=v;st.fixed=true;changed=true}
    newSum+=st.actual;
  });
  if(changed){e.contact=Math.round(contactOf(e.steps));e.total=Math.max(0,Math.round((e.total||0)+newSum-oldSum))}
  return changed;
}

var DEF={black:{tgt:200,ratio:16.9},hoff:{tgt:300,ratio:16.7},iced:{tgt:280,ratio:16.9},aulait:{tgt:300,ratio:12.5},viet:{tgt:110,ratio:7.3},
  vietHot:{tgt:140,ratio:7.3},vietIced:{tgt:290,ratio:7.3}};
var S={recipe:'black',mode:'direct',vmode:'iced',pratio:14.6,ved:20,ceil:450,temp:94,panloss:30,dspeed:10,lead:3,theme:'',
  r:{black:{tgt:200,ratio:16.9},iced:{tgt:280,ratio:16.9},aulait:{tgt:300,ratio:12.5},vietHot:{tgt:140,ratio:7.3},vietIced:{tgt:290,ratio:7.3}},
  bean:{name:'',roaster:'',roasted:'',ground:'',bought:'',pre:false,grind:''}};
var LOG=[], TLOG=[], testMode=false, speed=1, logView='real';
try{var raw=localStorage.getItem(SKEY);if(raw){var p=JSON.parse(raw);for(var k in S){if(p[k]!==undefined&&p[k]!==null)S[k]=p[k]}}}catch(e){}
/* the Vietnamese target used to be the concentrate; it is now the finished drink, hot or iced */
if(S.r&&S.r.viet&&!S.r.vietIced){var ov=S.r.viet,oc=ov.tgt>0?ov.tgt:110,orr=ov.ratio>0?ov.ratio:7.3;
  S.r.vietHot={tgt:Math.round(oc*1.27/5)*5,ratio:orr};S.r.vietIced={tgt:Math.round(oc*2.63/5)*5,ratio:orr};delete S.r.viet}
if(S.vmode!=='hot')S.vmode='iced';
/* the theme belongs to the phone, not the person */
try{var th=localStorage.getItem('fp.theme.v1');if(th!==null)S.theme=th}catch(e){}
try{var lr=localStorage.getItem(LKEY);if(lr){var la=JSON.parse(lr);if(la&&la.length)LOG=la}}catch(e){}
try{var tr=localStorage.getItem(TKEY);if(tr){var ta2=JSON.parse(tr);if(ta2&&ta2.length)TLOG=ta2}}catch(e){}
var DEL=[]; try{var dl=localStorage.getItem(DKEY);if(dl){var da=JSON.parse(dl);if(da&&da.length)DEL=da}}catch(e){}
function saveDel(){try{localStorage.setItem(DKEY,JSON.stringify(DEL.slice(-500)))}catch(e){}}
var PKEY='fp.packs.v1'+WHO.suffix, RKEY='fp.run.v1'+WHO.suffix;
var PK={packs:[],active:null,rev:0};
try{var pkr=localStorage.getItem(PKEY);if(pkr){var pkp=JSON.parse(pkr);if(pkp&&pkp.packs)PK=pkp}}catch(e){}
function normalize(e){
  var b=e&&e.bean;
  /* pre-ground packs are ground at the roastery: grind age tracks roast age, not purchase */
  if(b&&b.pre&&!b.ground&&b.groundAgeEst&&b.roastAge!==null&&b.roastAge!==undefined&&b.groundAge!==b.roastAge)b.groundAge=b.roastAge;
  return e;
}
LOG.forEach(normalize);
function byDate(a,b){return new Date(b.at)-new Date(a.at)}
function saveS(){try{localStorage.setItem(SKEY,JSON.stringify(S))}catch(e){}}
var saveFail=false;
function saveL(){try{localStorage.setItem(LKEY,JSON.stringify(LOG));saveFail=false}catch(e){saveFail=true}}
function saveT(){try{localStorage.setItem(TKEY,JSON.stringify(TLOG.slice(0,20)))}catch(e){}}
/* cups someone said they didn't drink stay in the data (so they are not asked again) but not in the log */
function viewArr(){if(logView==='test')return TLOG;if(logView==='all')return allArr();return LOG.filter(function(e){return !e.skipped})}
var beanFilter=null;
function beanKey(e){return brewPack(e)||''}
function baseArr(){var a=viewArr();if(logView!=='real'||beanFilter===null)return a;return a.filter(function(e){return beanKey(e)===beanFilter})}

/* ---------- people ---------- */
function people(){return WHO.people||[]}
function multi(){return people().length>1}
function othersList(){return people().filter(function(p){return p.id!==WHO.id})}
function nameOf(id){if(id===WHO.id)return WHO.name||'You';var n='';people().forEach(function(p){if(p.id===id)n=p.name});return n||(OTH[id]&&OTH[id].name)||'Someone'}
function switchTo(id){try{localStorage.setItem('fp.who.v1',id)}catch(e){}location.reload()}
/* everyone else's brews, read-only: shared carafes and the Everyone log */
var OTH={};
function subOthers(){
  (window.__others||[]).forEach(function(o){
    if(OTH[o.id]){OTH[o.id].name=o.name;return}
    OTH[o.id]={name:o.name,brews:[]};
    try{o.db.doc('x').collection('brews').onSnapshot(function(snap){
      var arr=[];snap.docs.forEach(function(d){var v=d.data();if(v&&v.id!==undefined)arr.push(v)});
      arr.sort(byDate);OTH[o.id].brews=arr;
      whenIdle('oth',function(){paintBanners();relogIfVisible()});
    },function(){})}catch(err){}
  });
}
function refBrew(e){var r=null,o=e&&e.ref&&OTH[e.ref.who];if(o)o.brews.forEach(function(b){if(String(b.id)===String(e.ref.id))r=b});return r}
/* my cup of someone else's brew */
function cupFor(pid,bid){var r=null;LOG.forEach(function(e){if(e.ref&&e.ref.who===pid&&String(e.ref.id)===String(bid))r=e});return r}
/* anyone's cup of a brew by owner */
function cupOf(pid,owner,bid){
  if(pid===WHO.id)return cupFor(owner,bid);
  var r=null,o=OTH[pid];if(o)o.brews.forEach(function(c){if(c.ref&&c.ref.who===owner&&String(c.ref.id)===String(bid))r=c});return r;
}
/* brews other people shared with me that I have not scored or waved off yet */
function sharedPending(){
  var out=[],cut=Date.now()-30*86400000;
  Object.keys(OTH).forEach(function(pid){(OTH[pid].brews||[]).forEach(function(b){
    if(b.test||b.ref||!b.with||b.with.indexOf(WHO.id)<0||new Date(b.at).getTime()<cut)return;
    if(cupFor(pid,b.id))return;
    out.push({pid:pid,b:b});
  })});
  return out.sort(function(x,y){return new Date(y.b.at)-new Date(x.b.at)});
}
/* my cup of a shared carafe: the brew as it was made, with my own score, share and notes */
function makeCup(pid,bid,skip){
  var b=null,o=OTH[pid];if(o)o.brews.forEach(function(x){if(String(x.id)===String(bid))b=x});if(!b||cupFor(pid,bid))return cupFor(pid,bid);
  var n=(b.with||[]).length||1, bl=b.log||{}, bs=(bl.share!==undefined&&bl.share!==null)?bl.share:1;
  var share=bs<1?Math.max(0,(1-bs)/n):1/(n+1);
  var e=JSON.parse(JSON.stringify({id:b.id,at:b.at,rev:Date.now(),ref:{who:pid,id:String(b.id)},recipe:b.recipe,mode:b.mode,bean:b.bean,params:b.params,calc:b.calc,
    steps:b.steps||[],total:b.total,contact:b.contact,log:{temp:null,decant:bl.decant||null,score:null,tastes:[],faults:[],note:'',share:Math.round(share*1000)/1000}}));
  if(skip){e.skipped=true;e.log.share=0}else e.pending=true;
  LOG.push(e);LOG.sort(byDate);saveL();pushPending();
  return e;
}
function allArr(){
  var out=[];
  LOG.forEach(function(e){if(e.ref||e.skipped||e.test)return;var c=JSON.parse(JSON.stringify(e));c._by=WHO.id;out.push(c)});
  Object.keys(OTH).forEach(function(pid){(OTH[pid].brews||[]).forEach(function(b){if(b.ref||b.skipped||b.test)return;var c=JSON.parse(JSON.stringify(b));c._by=pid;out.push(c)})});
  return out.sort(byDate);
}
var whoOpen=false;
function paintWho(){
  var row=$('who-row'),pick=$('who-pick');
  if(!multi()){row.classList.add('hide');pick.classList.add('hide');return}
  row.classList.remove('hide');$('who-name').textContent=WHO.name;
  $('who-sw').textContent=whoOpen?'Close':'Switch';
  pick.classList.toggle('hide',!whoOpen);
  if(whoOpen)pick.innerHTML=othersList().map(function(p){return '<button class="chip" data-who="'+esc(p.id)+'">'+esc(p.name)+'</button>'}).join('');
}
function paintBeans(){
  var box=$('log-beans');
  if(logView!=='real'){box.classList.add('hide');return}
  var seen={},list=[];
  LOG.forEach(function(e){var k=beanKey(e);if(!(k in seen)){seen[k]=1;list.push([k,k?packLabel(k,e):'No pack'])}});
  if(beanFilter!==null&&!(beanFilter in seen))beanFilter=null;
  if(list.length<2){box.classList.add('hide');beanFilter=null;return}
  box.classList.remove('hide');
  box.innerHTML='<button data-bk="*" aria-pressed="'+(beanFilter===null)+'">All packs</button>'
    +list.map(function(x){return '<button data-bk="'+esc(x[0])+'" aria-pressed="'+(beanFilter===x[0])+'">'+esc(x[1])+'</button>'}).join('');
}
function daysSince(d){
  if(!d)return null;
  var a=new Date(d+'T00:00:00'); if(isNaN(a))return null;
  var n=new Date(); n.setHours(0,0,0,0);
  return Math.max(0,Math.round((n-a)/86400000));
}
function grindAge(b){
  b=b||{};
  var g=daysSince(b.ground);
  if(g!==null)return {age:g,est:false};
  if(b.pre){var r=daysSince(b.roasted);if(r!==null)return {age:r,est:true};var t=daysSince(b.bought);if(t!==null)return {age:t,est:true}}
  return {age:null,est:false};
}
function fmtScore(v){v=Math.round(Number(v)*10)/10;return v%1===0?String(v):v.toFixed(1)}
function fmtDay(d){if(!d)return '';var x=new Date(d+'T00:00:00');return isNaN(x)?'':x.toLocaleDateString(undefined,{day:'numeric',month:'short'})}
function todayStr(){var d=new Date();return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2)}
function slug(v){return String(v).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)}
/* brews logged before packs existed are matched to a pack by bean name, roaster and roast date */
function legacyId(b){return (b&&b.name)?'L-'+slug(b.name+'-'+(b.roaster||'')+'-'+(b.roasted||'nodate')):null}
function brewPack(e){var b=(e&&e.bean)||{};return b.packId||legacyId(b)}
function packById(id){var r=null;PK.packs.forEach(function(p){if(p.id===id)r=p});return r}
function openPacks(){return PK.packs.filter(function(p){return p.status!=='finished'})}
function activePack(){var p=packById(PK.active);return (p&&p.status!=='finished')?p:null}
function packBrews(p){return LOG.filter(function(e){return !e.test&&brewPack(e)===p.id})}
function usedG(p){var u=0;packBrews(p).forEach(function(e){u+=(e.calc&&e.calc.dose)||0});return u}
/* tracking counts only brews made after p.since; packs from before that are untracked until grams left is entered */
function usedSince(p){var t=new Date(p.since).getTime(),u=0;packBrews(p).forEach(function(e){if(new Date(e.at).getTime()>t)u+=(e.calc&&e.calc.dose)||0});return u}
function leftG(p){
  if(p.base!==undefined&&p.base!==null&&p.since)return Math.round(p.base-usedSince(p));
  if(p.size>0&&!p.since)return Math.round(p.size-usedG(p)-(p.adj||0));
  return null;
}
function paceOf(p){
  var l=leftG(p); if(l===null)return null;
  var now=Date.now(), from=Math.max(p.since?new Date(p.since).getTime():0, now-14*86400000), g=0, n=0;
  packBrews(p).forEach(function(e){var t=new Date(e.at).getTime();if(t>from){g+=(e.calc&&e.calc.dose)||0;n++}});
  if(n<2||g<=0)return null;
  var rate=g/Math.max(1,(now-from)/86400000);
  return {rate:rate,days:Math.max(0,l)/rate,left:l};
}
function fmtWk(t){return new Date(t).toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'})}
function fmtAt(iso){return new Date(iso).toLocaleDateString(undefined,{day:'numeric',month:'short'})}
function packLabel(id,e){var p=packById(id);if(p)return p.name+(p.roasted?' · roasted '+fmtDay(p.roasted):'');return (e&&e.bean&&e.bean.name)||'No pack'}
function beanSnap(){
  var p=activePack();
  if(!p)return {packId:'',name:'',roaster:'',roasted:'',ground:'',bought:'',pre:false,grind:'',roastAge:null,groundAge:null,groundAgeEst:false};
  var ga=grindAge(p);
  return {packId:p.id,name:p.name||'',roaster:p.roaster||'',roasted:p.roasted||'',ground:p.ground||'',
          bought:p.bought||'',pre:!!p.pre,grind:p.grind||'',
          roastAge:daysSince(p.roasted),groundAge:ga.age,groundAgeEst:ga.est};
}
function savePK(){try{localStorage.setItem(PKEY,JSON.stringify(PK))}catch(e){}}
function touchPK(){PK.rev=Date.now();savePK();pushPacks();refreshAll()}
function refreshAll(){paintBanners();render()}
function paintPack(){
  var ap=activePack(), op=openPacks();
  if(!ap&&op.length){PK.active=op[op.length-1].id;savePK();ap=activePack()}
  var sum=$('pack-sum');
  if(ap){
    var ra=daysSince(ap.roasted), g=grindAge(ap), l=leftG(ap), d=compute().D, bits=[];
    if(ra!==null)bits.push('day '+ra+' since roast');
    if(g.age!==null)bits.push((g.est?'ground about ':'ground ')+g.age+' day'+(g.age===1?'':'s')+' ago');
    else if(ap.pre)bits.push('no grind date');
    if(l!==null)bits.push(l+' g left');
    var warn=(g.age!==null&&g.age>14)||(g.age===null&&ra!==null&&ra>28)||(l!==null&&l<d);
    sum.innerHTML=esc(ap.name)+(ap.pre?' · pre-ground':'')+(bits.length?' <span class="age'+(warn?' old':'')+'">· '+esc(bits.join(' · '))+'</span>':'');
  } else sum.textContent=op.length?'Pick a pack':'No pack in use — add one';
  var pick=$('pack-pick');
  pick.classList.toggle('hide',op.length<2);
  pick.innerHTML=op.map(function(p){return '<button data-pk="'+esc(p.id)+'" aria-pressed="'+(!!ap&&p.id===ap.id)+'">'+esc(packLabel(p.id))+'</button>'}).join('');
  var meta;
  if(ap){
    var br=packBrews(ap), sc=br.filter(function(e){return e.log&&e.log.score}), l2=leftG(ap), m=[];
    if(ap.roasted)m.push('Roasted '+fmtDay(ap.roasted));
    if(ap.ground)m.push('ground '+fmtDay(ap.ground));
    m.push(l2!==null?(ap.size?l2+' of '+ap.size+' g left':l2+' g left'):'Not tracked yet — tap Edit this pack and enter grams left to start from now');
    var pc=paceOf(ap);
    if(pc){
      var dl=Math.round(pc.days);
      m.push('at about '+Math.round(pc.rate)+' g a day it lasts '+(pc.days<1?'less than a day':'about '+dl+' more day'+(dl===1?'':'s')+', to '+fmtWk(Date.now()+pc.days*86400000)));
      var gx=grindAge(ap).age; if(gx!==null&&gx+pc.days>14)m.push('it will pass two weeks from grinding before you finish it');
    }
    if(br.length)m.push(br.length+' brew'+(br.length>1?'s':'')+(sc.length?', average '+(sc.reduce(function(a,e){return a+e.log.score},0)/sc.length).toFixed(1):''));
    meta=esc(m.join(' · '));
  } else meta='Add the pack you are brewing from. Every brew then counts against it, so the app knows when it runs out.';
  $('pack-meta').innerHTML=meta;
  $('pack-edit').classList.toggle('hide',!ap); $('pack-done').classList.toggle('hide',!ap);
  var done=PK.packs.filter(function(p){return p.status==='finished'});
  $('pack-old').classList.toggle('hide',!done.length);
  $('pack-old-list').innerHTML=done.slice().reverse().map(function(p){
    var br=packBrews(p);
    return '<div class="prow"><span>'+esc(packLabel(p.id))+'<span class="pmeta2">'+br.length+' brew'+(br.length===1?'':'s')+(p.finishedAt?' · finished '+fmtDay(p.finishedAt):'')+'</span></span><button class="ghost" data-reopen="'+esc(p.id)+'">Reopen</button></div>';
  }).join('');
}
var PF=null;
function openPackForm(mode){
  var p=mode==='edit'?activePack():null, cur=activePack()||{};
  PF={mode:mode,id:p?p.id:null,left:p?leftG(p):null};
  $('pf-title').textContent=p?'Edit pack':'New pack';
  $('p-name').value=p?p.name:'';
  $('p-roaster').value=p?(p.roaster||''):(cur.roaster||'');
  $('p-pre').checked=p?!!p.pre:!!cur.pre;
  $('p-roasted').value=p?(p.roasted||''):'';
  $('p-ground').value=p?(p.ground||''):'';
  $('p-bought').value=p?(p.bought||''):todayStr();
  $('p-size').value=(p&&p.size)?p.size:'';
  $('p-left').value=(PF.left!==null)?PF.left:'';
  $('p-left').placeholder=p?'':'full';
  $('p-left').setAttribute('data-def',String((PF.left!==null&&PF.left!==undefined)?PF.left:(parseFloat($('p-size').value)||250)));
  $('pf-hint').textContent=p
    ?'Changing grams left restarts tracking from now. Use it for a pack you had already started, a spill, or a pack that weighed over or under.'
    :'Every brew from now on counts against this pack. Already opened it? Put what is left in grams left.';
  $('p-grind').value=p?(p.grind||''):(cur.grind||'');
  $('pf-err').classList.add('hide');
  $('pack-form').classList.remove('hide'); $('pack-acts').classList.add('hide');
}
function closePackForm(){PF=null;$('pack-form').classList.add('hide');$('pack-acts').classList.remove('hide')}
function savePackForm(){
  if(!PF)return;
  var name=$('p-name').value.trim();
  if(!name){var er=$('pf-err');er.textContent='Give the pack a name.';er.classList.remove('hide');return}
  var size=parseFloat($('p-size').value); size=size>0?Math.round(size):null;
  var f={name:name,roaster:$('p-roaster').value.trim(),pre:$('p-pre').checked,roasted:$('p-roasted').value,
         ground:$('p-ground').value,bought:$('p-bought').value,grind:$('p-grind').value.trim(),size:size};
  if(PF.mode==='edit'){
    var p=packById(PF.id); if(!p){closePackForm();return}
    var oldSize=p.size;
    for(var k in f)p[k]=f[k];
    var lv=$('p-left').value.trim(), lw=parseFloat(lv);
    /* grams left restarts tracking from now, but only when it was actually changed */
    if(lv!==''&&!isNaN(lw)&&Math.round(lw)!==PF.left){
      p.since=new Date().toISOString(); p.base=Math.round(lw); p.overridden=true;
    } else if(size&&size!==oldSize){
      if(p.base===undefined||p.base===null){p.since=new Date().toISOString();p.base=size}
      else if(!p.overridden)p.base=size;
    }
  } else {
    var nowIso=new Date().toISOString();
    var np={id:'p'+Date.now(),status:'open',created:nowIso,since:nowIso};
    for(var k2 in f)np[k2]=f[k2];
    var lnew=parseFloat($('p-left').value);
    np.base=(lnew>=0)?Math.round(lnew):size;
    if(np.base===null){delete np.since}
    PK.packs.push(np); PK.active=np.id;
    if(PF.fromTry){var tt=tryById(PF.fromTry);if(tt){tt.pack=np.id;if(tt.st==='todo'){tt.st='ordered';tt.ordAt=todayStr()}}}
  }
  closePackForm(); touchPK();
}
var lastAuto=null;
function checkPackAfterBrew(e){
  lastAuto=null;
  var p=packById(e.bean&&e.bean.packId); if(!p||p.status==='finished')return '';
  var l=leftG(p); if(l===null)return '';
  if(l<=3){
    var prev=PK.active;
    p.status='finished'; p.finishedAt=todayStr();
    var op=openPacks(); PK.active=op.length?op[op.length-1].id:null;
    lastAuto={brewId:e.id,packId:p.id,prev:prev};
    touchPK();
    return 'That used up '+p.name+', so it is marked finished. '+(PK.active?'Now using '+activePack().name+'.':'Add your next pack before the next brew.');
  }
  if(l<e.calc.dose)return 'About '+l+' g of '+p.name+' left — not enough for another cup like this one.';
  return '';
}
function tryMigrate(){
  /* only for logs from before packs existed; a person added later never had those */
  if(PK.packs.length||WHO.dir)return;
  var seen={},list=[];
  LOG.slice().reverse().forEach(function(e){
    if(e.ref)return;
    var b=e.bean||{},id=legacyId(b); if(!id)return;
    if(!seen[id]){seen[id]={id:id,name:b.name,roaster:b.roaster||'',roasted:b.roasted||'',ground:b.ground||'',bought:b.bought||'',pre:!!b.pre,grind:b.grind||'',size:null,adj:0,created:e.at,last:e.at};list.push(seen[id])}
    else seen[id].last=e.at;
  });
  var sb=S.bean||{}, sid=legacyId(sb);
  if(sid&&!seen[sid]){var nw=new Date().toISOString();seen[sid]={id:sid,name:sb.name,roaster:sb.roaster||'',roasted:sb.roasted||'',ground:sb.ground||'',bought:sb.bought||'',pre:!!sb.pre,grind:sb.grind||'',size:null,adj:0,created:nw,last:nw};list.push(seen[sid])}
  if(!list.length)return;
  list.forEach(function(p){
    var recent=(Date.now()-new Date(p.last).getTime())<7*86400000;
    p.status=(p.id===sid||recent)?'open':'finished';
    if(p.status==='finished')p.finishedAt=String(p.last).slice(0,10);
    delete p.last;
  });
  PK.packs=list; PK.active=(sid&&seen[sid])?sid:null;
  if(!PK.active){var op=openPacks();PK.active=op.length?op[op.length-1].id:null}
  PK.rev=Date.now(); savePK(); pushPacks(); refreshAll();
}
function med(a){
  if(!a.length)return null;
  var x=a.slice().sort(function(p,q){return p-q}), m=Math.floor(x.length/2);
  return x.length%2?x[m]:(x[m-1]+x[m])/2;
}

var RECIPES={
 black:{name:'Black',label:'Liquid in the cup',unit:'grams, after decanting',modes:true,
   hint:'Your dialled-in cup. All water through the bed, decanted off the sediment.'},
 hoff:{name:'Hoffmann',label:'Liquid in the cup',unit:'grams, poured straight from the press',modes:false,
   hint:'James Hoffmann\u2019s Ultimate French Press as written: 1:16.7, straight off the boil, no agitation except the crust break, a 5\u20138 minute settle, plunge only to the surface, pour gently. No decanter. Your coarse pre-ground will extract a little less than his medium grind.'},
 iced:{name:'Iced',label:'Finished iced coffee',unit:'grams in the glass, after the ice melts',modes:false,
   hint:'Japanese style. Half the liquid is brewed hot, half is ice that melts into it. No settling wait \u2014 the coffee goes onto the ice immediately, which is what traps the aromatics.'},
 aulait:{name:'Caf\u00E9 au lait',label:'Finished drink',unit:'grams, coffee plus milk',modes:false,
   hint:'Brewed tighter so it survives the milk. Flat hot milk at 65\u201370\u00B0C, never frothed.'},
 viet:{name:'Vietnamese',label:'Finished drink',unit:'grams in the glass',modes:false,
   hint:'A thick concentrate stirred into condensed milk. Hot is the drink as it is; iced pours it over a glass of ice. Pick which below.'}
};
/* grams of brew a rinsed paper and the sludge on it keep back, and the plain RO heated separately to rinse the paper */
var PAPER_LOSS=25, PAPER_RINSE=100;
function rkey(){return S.recipe==='viet'?(S.vmode==='hot'?'vietHot':'vietIced'):S.recipe}
function rs(){var k=rkey(),d=DEF[k];if(!S.r)S.r={};if(!S.r[k])S.r[k]={tgt:d.tgt,ratio:d.ratio};return S.r[k]}

function compute(){
  var st=rs(), T=st.tgt>0?st.tgt:DEF[rkey()].tgt, R=st.ratio>0?st.ratio:DEF[rkey()].ratio;
  var RP=S.pratio>0?S.pratio:14.6, vp=isNaN(S.ved)?20:S.ved, pl=isNaN(S.panloss)?30:S.panloss;
  var o={T:T,R:R,temp:Math.round(S.temp)||94,recipe:S.recipe};
  /* paper filter: the brew goes through a rinsed paper and the paper keeps a few grams; the rinse is plain RO heated on its own, so it never dilutes the brew water's Vedica */
  var L=st.paper?PAPER_LOSS:0; o.paper=!!st.paper; o.loss=L; o.rinse=st.paper?PAPER_RINSE:0;
  o.pflow=st.paper?(st.pflow==='press'?'press':'jug'):null;

  if(S.recipe==='black'){
    /* without paper, the jug keeps back a little at the end to hold the silt; through paper there is none to hold back */
    o.j=L?0:Math.round(15+T/40); o.Y=T+o.j;
    var W=r5((o.Y+L+20)/(1-2/R)); o.D=Math.round(W/R);
    if(S.mode==='direct'){o.press=W;o.decant=o.Y+L;o.bypass=0}
    else{o.press=r5(o.D*RP);o.decant=o.press-2*o.D-20;o.bypass=o.Y-(o.decant-L)}
    o.extra=0;
  } else if(S.recipe==='hoff'){
    var Wh=r5((T+L+20)/(1-2/R)); o.D=Math.round(Wh/R);
    o.press=Wh; o.decant=T+L; o.bypass=0; o.j=0; o.Y=T; o.extra=0;
    o.maxCup=Math.floor((S.ceil>0?S.ceil:450)*(1-2/R)-20-L);
  } else if(S.recipe==='iced'){
    o.yield=Math.round(T/2); o.ice=T-o.yield;
    o.D=Math.round((o.yield+L+20+o.ice)/(R-2));
    o.press=r5(o.yield+L+2*o.D+20);
    o.decant=o.yield+L; o.bypass=0; o.j=0; o.Y=T;
    o.serveIce=Math.round(T/2);
    o.extra=0;
  } else if(S.recipe==='aulait'){
    o.yield=Math.round(T/2); o.milk=T-o.yield;
    o.D=Math.round((o.yield+L+20)/(R-2));
    o.press=r5(o.yield+L+2*o.D+20);
    o.decant=o.yield+L; o.bypass=0; o.j=0; o.Y=T;
    o.extra=0;
  } else {
    /* finished drink = concentrate + condensed milk (0.27x) [+ ice 1.36x when iced] */
    var hot=S.vmode==='hot', cmK=0.27, iceK=hot?0:1.36;
    o.vmode=hot?'hot':'iced';
    o.conc=Math.round(T/(1+cmK+iceK));
    if(hot){o.cm=T-o.conc;o.ice=0}else{o.cm=Math.round(o.conc*cmK);o.ice=Math.max(0,T-o.conc-o.cm)}
    o.D=Math.round((o.conc+L+20)/(R-2));
    o.press=r5(o.conc+L+2*o.D+20);
    o.decant=o.conc+L; o.bypass=0; o.j=0; o.Y=o.conc;
    o.extra=0;
  }
  o.boil=o.press+Math.max(o.bypass,0)+pl;
  o.ved=Math.round(o.boil*vp/100);
  o.ro=o.boil-o.ved;
  o.iceVed=o.ice?Math.round(o.ice*vp/100):0;
  o.iceRo=o.ice?o.ice-o.iceVed:0;
  /* the dilution ice: frozen from the brew water blend, or whatever ice there was (logged, so a bad cup can be traced to it) */
  o.iceKind=o.ice?(st.ice==='other'?'other':'blend'):null;
  o.mode=S.mode;
  return o;
}

/* the numbers card: the recipe screen shows the plan, the brew panel the same rows for the run in progress */
function numRows(o,mode,loc){
  var rows=[], rk=o.recipe;
  if(loc)rows.push(['Location',esc(loc),'']);
  rows.push(['Boil',o.boil+' g','lead']);
  rows.push(['Vedica / RO',o.ved+' / '+o.ro+' g','']);
  if(o.paper)rows.push(['Paper rinse',o.rinse+' g plain RO','']);
  rows.push(['Coffee',o.D+' g','lead']);
  rows.push(['Water into press',o.press+' g','']);
  rows.push([o.paper?'Decant to':(rk==='hoff'?'Pour into the cup':(rk==='viet'?'Concentrate to decant':'Decant to')),Math.round(o.decant)+' g',rk==='hoff'?'lead':'']);
  if(rk==='black'){
    if(mode==='bypass')rows.push(['Add hot water',Math.round(o.bypass)+' g','accent']);
    if(!o.paper)rows.push(['Jug total',o.Y+' g','']);
    rows.push([o.paper?'Into the glass':'Pour off',Math.round(o.T)+' g','lead']);
    if(o.paper)rows.push(['Left in decanter and paper','\u2248 '+o.loss+' g','']);
    else rows.push(['Left in jug',o.j+' g','']);
  } else if(rk==='iced'){
    rows.push(['Ice to brew onto',o.ice+' g','accent']);
    rows.push(o.iceKind==='other'?['\u2003 which ice','Other ice','']:['\u2003 frozen from',o.iceVed+' / '+o.iceRo+' g Vedica / RO','']);
    rows.push(['Finished drink',o.T+' g','lead']);
    rows.push(['Ice in the glass','0\u201340 g','']);
  } else if(rk==='hoff'){
    rows.push(['Largest cup your press fits',o.maxCup+' g','']);
  } else if(rk==='aulait'){
    rows.push(['Milk at 65\u201370\u00B0C',o.milk+' g','accent']);
    rows.push(['Finished drink',o.T+' g','lead']);
  } else {
    rows.push(['Condensed milk',o.cm+' g','accent']);
    if(o.ice){rows.push(['Ice in the glass',o.ice+' g','accent']);rows.push(o.iceKind==='other'?['\u2003 which ice','Other ice','']:['\u2003 frozen from',o.iceVed+' / '+o.iceRo+' g Vedica / RO',''])}
    rows.push(['Finished drink',o.T+' g','lead']);
  }
  return rows;
}
function rowsHTML(rows){
  return rows.map(function(r){
    return '<div class="row '+r[2]+'"><span class="k">'+r[0]+'</span><span class="v">'+r[1]+'</span></div>';
  }).join('');
}
function render(){
  var o=compute(), rows=[], R=RECIPES[S.recipe];
  document.body.setAttribute('data-r',S.recipe);
  $('tgt-lab').textContent=R.label;
  $('tgt-unit').textContent=S.recipe==='viet'?(S.vmode==='hot'?'grams in the cup, coffee plus condensed milk':'grams in the glass, ice included'):R.unit;
  $('vseg').classList.toggle('hide',S.recipe!=='viet');
  $('v-hot').setAttribute('aria-pressed',String(S.vmode==='hot')); $('v-iced').setAttribute('aria-pressed',String(S.vmode!=='hot'));
  $('rhint').textContent=R.hint;
  $('modeseg').classList.toggle('hide',!R.modes);
  var lc=curLoc(); rows=numRows(o,S.mode,lc?lc.name:null);
  $('numbers').innerHTML=rowsHTML(rows);
  if(S.recipe==='black'){
    $('blurb').textContent=S.mode==='direct'
      ?'All the water goes through the coffee. Simplest, and what the 200 g cup was dialled in on.'
      :'Brewed tighter with less water in the press, then diluted in the jug. Use it when the fill gets deep enough for the bed to reach the screen on the tilt.';
  } else if(S.recipe==='iced'){
    $('blurb').textContent='Press ratio here is about 1:'+(o.press/o.D).toFixed(1)+' \u2014 much tighter than black, so the 4:00 steep has no slack. Glass ice depends on the jug: none at 10\u00B0C or below, up to 40 g above it.';
  } else if(S.recipe==='hoff'){
    $('blurb').textContent='A reference brew to compare against your Black recipe. Use the same bean and change nothing else, so the method is the only difference.';
  } else if(S.recipe==='aulait'){
    $('blurb').textContent='Full-cream milk carries the roast better than toned. Sugar, if you want it, goes into the hot coffee before the milk.';
  } else {
    $('blurb').textContent=(S.vmode==='hot'?'C\u00E0 ph\u00EA s\u1EEFa n\u00F3ng: drink it as soon as it is stirred. ':'C\u00E0 ph\u00EA s\u1EEFa \u0111\u00E1: covered ice only, or the freezer taste comes through. ')+'Built around dark robusta, so a medium arabica lands smoother and less punchy.';
  }
  $('f-mesh').setAttribute('aria-pressed',String(!o.paper)); $('f-paper').setAttribute('aria-pressed',String(o.paper));
  $('pwseg').classList.toggle('hide',!o.paper);
  $('pw-press').setAttribute('aria-pressed',String(o.pflow==='press')); $('pw-jug').setAttribute('aria-pressed',String(o.pflow==='jug'));
  $('iceseg').classList.toggle('hide',!o.ice);
  $('ice-blend').setAttribute('aria-pressed',String(o.iceKind!=='other')); $('ice-other').setAttribute('aria-pressed',String(o.iceKind==='other'));
  if(o.paper)$('blurb').textContent+=o.pflow==='press'
    ?' Paper filter, from the press: the paper is filled straight from the press, held at its tilt while the paper drains.'
    :' Paper filter, from the decanter: one pour from the press into the decanter, then through the paper. The press is only tipped once.';
  var f=$('flag'), msg='', cls='w';
  if(S.recipe==='black'&&S.mode==='bypass'&&o.bypass<10){msg='Press ratio is too loose \u2014 bypass falls to '+Math.round(o.bypass)+' g. Lower it for real headroom.';cls='s'}
  else if(o.press>S.ceil){msg='Needs '+o.press+' g in the press, above your '+S.ceil+' g ceiling.'+(S.recipe==='black'&&S.mode==='direct'?' Try bypass.':' Brew this in two batches.');cls=(S.recipe==='black'&&S.mode==='direct')?'w':'s'}
  else if(S.recipe==='viet'&&o.press<200){msg='Only '+o.press+' g in the press \u2014 shallow for a 600 ml carafe. It works; press gently. Making two drinks at once gives the mesh more to work against.';cls='w'}
  else if(S.recipe==='iced'&&o.press<200){msg='Only '+o.press+' g in the press \u2014 a little shallow for a 600 ml carafe. It still works; plunge extra slowly.';cls='w'}
  if(!msg){var apk=activePack(),lk=apk?leftG(apk):null;if(lk!==null&&o.D>lk){msg='Only '+lk+' g left in '+apk.name+' \u2014 this brew needs '+o.D+' g.';cls='w'}}
  if(msg){f.className='flag '+cls;f.textContent=msg}else{f.className='flag hide'}
  paintPack(); paintCaf(); paintBest();
}

/* Each step: k, t (title), d (one line: what to do, with the numbers), s (timer, seconds),
   more (the why and the tips, folded away), w (prep to do while this step's timer runs; at = seconds left when it is due) */
function buildSteps(){
  var o=compute(), s=[], P=o.paper, R=S.recipe, bypass=R==='black'&&S.mode==='bypass';
  /* paper filter, filled one of two ways:
     from the decanter: the press is tipped once into the decanter, and the paper on the cup (or jug of ice) is filled from there;
     from the press: the paper is filled straight from the press, held at its tilt while the paper drains */
  var FP=P&&o.pflow==='press', dec=Math.round(o.decant);
  function B(v){return '<b>'+v+'</b>'}
  function step(k,t,d,x){
    var r={k:k,t:t,d:d}; x=x||{};
    if(x.s)r.s=x.s;
    if(x.more)r.more=x.more;
    var w=(x.w||[]).filter(Boolean); if(w.length)r.w=w;
    return r;
  }
  function W(t,at){var x={t:t};if(at!==undefined)x.at=at;return x}
  var iceTxt=o.ice?B(o.ice+' g')+' '+(o.iceKind==='other'?'ice':'RO + Vedica ice'):'';
  var iceMore=o.ice?(o.iceKind==='other'
    ?'Logged as other ice, so a bad cup can be traced back to it.'
    :'Frozen from '+o.iceVed+' g Vedica and '+o.iceRo+' g RO in a covered tray, used within a few days: open ice picks up freezer smells.'):'';
  /* the paper rinse: plain RO heated during the steep, poured through the paper during the wait */
  var heatW=P?W('Heat '+B(o.rinse+' g')+' plain RO for the paper rinse'):null;
  function rinseW(into){return P?W('Paper in the dripper, seam folded flat. Rinse it with the hot RO '+(into?'into '+into+' to warm it, then tip that out':'over the sink')):null}
  /* the vessel the coffee is weighed into next, tared before the plunge */
  function tareW(dest,meshVessel,at){return W(FP?'Dripper on '+dest+', on the scale, tared':(P?'Decanter on the scale, tared':meshVessel+' on the scale, tared'),at===undefined?60:at)}
  function pressThrough(into,grams,more){return step('decant','Pour through the paper','From the press into the dripper on '+into+', to '+B(grams+' g')+'.',
    {more:'Pour fast while there is room, then slow down near the top and hold the press at its angle: standing it up and tipping again stirs the bed. Keep the level a centimetre below the paper’s edge.'+(more||'')})}
  function oneDecant(grams){return step('decant','Decant','Into the decanter in one slow pour, to '+B(grams+' g')+'.',
    {more:'Shallow tilt. Don’t set the press down mid-pour: every tilt back stirs the bed. It mixes as it pours, so there is no need to swirl.'})}
  function through(into,more){return step('filter','Pour through the paper','From the decanter into the dripper on '+into+', in two or three goes.',
    {more:'Set the decanter down in between; with the press out of the way there is nothing to stir up. Keep the level a centimetre below the paper’s edge, and leave the last spoonful in the decanter, where the heaviest silt sank.'+(more||'')})}
  var drain=step('drain','Let it drain','Hands off. Lift the dripper off at the beep.',{s:240,more:R==='iced'
    ?'No stirring, swirling or tapping the paper.'
    :'No stirring, swirling or tapping the paper. The last drips are slow but they are the same coffee: if you are letting it cool anyway, catch them in your cup.'});
  /* the steps after the plunge, either way */
  function paperSeq(dest,grams,more){return FP?[pressThrough(dest,grams,more),drain]:[oneDecant(grams),through(dest,more),drain]}
  function push(a){a.forEach(function(x){s.push(x)})}

  var common={
    prep:step('prep','Dose the carafe',B(o.D+' g')+' of coffee into the carafe, shaken level.',{more:'Screen clean and unwarped, carafe at room temperature.'}),
    dose:step('dose','Weigh the water',B(o.ved+' g')+' Vedica + '+B(o.ro+' g')+' RO, '+B(o.boil+' g')+' in all. Carafe on the scale, tared.'),
    pour:step('pour','Boil and pour','Off the boil, all of it fast, to '+B(o.press+' g')+'. Two or three gentle swirls.',
      {s:30,more:'About '+o.temp+'°C when it reaches the coffee. Check through the glass for dry patches on the bottom or a dry raft on top. No spoon. '
        +(R==='iced'?'Leftover water goes down the sink.':'Tip the last few grams into your glass so the decanter goes back empty.')}),
    steep:step('steep','Steep','Lid on, plunger up. Don’t touch.',{s:240,w:[heatW]}),
    plunge:step('plunge','Plunge','Slowly, until the screen touches the liquid. Done by the beep.',{s:15,more:'This counts as contact time.'})
  };

  if(R==='black'){
    push([common.prep,common.dose,common.pour,common.steep]);
    s.push(step('crust','Break the crust','Press the floating bed down a centimetre, three or four presses. No stirring.'+(P?' Skim the foam.':'')+' Lid back on.',
      {s:55,more:'Run the spoon along the walls to knock stuck grounds back in. '+(P?'Foam and floating bits are what clog a paper first.':'Skim only if there is real foam.')}));
    s.push(step('settle','Settle','Plunger stays up. Leave it.',{s:300,more:'This is what drops the fines out.',
      w:[rinseW(FP?null:'your glass'),tareW('the decanter','Decanter')]}));
    s.push(step('plunge','Plunge','Slowly, to a couple of centimetres above the bed. Never into it.',
      {s:30,more:'The screen then holds the bed still when you tilt. Done by the beep; this counts as contact time.'}));
    var byp=step('byp','Add hot water',B(Math.round(o.bypass)+' g')+' of the leftover hot water into the jug, to '+B(o.Y+' g')+'.');
    if(FP){
      s.push(pressThrough('the decanter',dec)); s.push(drain);
      if(bypass)s.push(byp);
      s.push(step('off','Swirl and pour','Gentle swirl, then all of it into the glass, about '+B(Math.round(o.T)+' g')+'.'));
    } else if(P){
      s.push(oneDecant(dec));
      if(bypass)s.push(byp);
      s.push(through('your glass')); s.push(drain);
    } else {
      s.push(step('decant','Decant','Shallow tilt, to '+B(dec+' g')+'.',
        {more:'Steep tilts make the bed avalanche onto the screen. If it stalls, don’t press the plunger: top up with hot water instead.'}));
      if(bypass)s.push(byp);
      s.push(step('jug','Settle in the decanter','Cap on, leave it.',{s:60,more:'The fine sediment drops and the neck holds most of what is left.',
        w:[W('Empty glass on the scale, tared')]}));
      s.push(step('off','Pour off','Slowly, '+B(Math.round(o.T)+' g')+' off the top. Leave the last '+B(o.j+' g')+'.',
        {more:'It should land at 56–58°C. Every week or so let one cup fall to 40°C and taste it: sweetness still holding means the extraction is clean.'}));
    }
  }
  else if(R==='hoff'){
    push([common.prep,common.dose]);
    s.push(step('pour','Boil and pour','Off the boil, all '+B(o.press+' g')+' in about ten seconds. No swirl, no spoon.',
      {s:10,more:'About '+o.temp+'°C. The force of the stream does the wetting. Tip the last few grams into your cup.'}));
    s.push(common.steep);
    s.push(step('crust','Break the crust','Stir just the top layer gently; most of it sinks. Skim the foam.',
      {s:45,more:'Two spoons works well. Keep the stir to the surface: a deeper stir is what gave you astringency before.'}));
    s.push(step('settle','Settle','Lid on, plunger up. Tap Next whenever you are ready.',{s:300,more:'Hoffmann waits 5 to 8 minutes; longer is cleaner.',
      w:[rinseW('your cup'),tareW('your cup','Cup')]}));
    s.push(step('plunge','Plunge','Only until the screen sits at the surface. No further.',{s:15,more:'Here the screen is a sieve, not a press.'}));
    if(P)push(paperSeq('your cup',dec));
    else s.push(step('decant','Pour into the cup','Slowly, to '+B(dec+' g')+'. Leave the last of it in the press.',
      {more:'That is where the silt sits. Let it cool to a comfortable sip before you score it.'}));
  }
  else if(R==='iced'){
    push([common.prep,common.dose,common.pour]);
    /* the ice stays in the freezer until the last minute of the steep: ice that melts early dilutes without chilling */
    s.push(step('steep','Steep','Lid on, plunger up. Don’t touch.',{s:240,
      more:'The ice comes out only in the last minute: ice that melts early waters the drink down without chilling it. '+iceMore,
      w:[W('Serving glass into the fridge'),heatW,rinseW(null),
        W(iceTxt+' into the jug'+(FP?', dripper on top, on the scale, tared':(P?', dripper on top. Decanter on the scale, tared':', on the scale, tared')),60)]}));
    s.push(step('crust','Break the crust','Press the bed down, skim the foam. No stirring.',
      {s:40,more:'Knock stuck grounds off the walls. Move faster than for black: there is no settle to absorb an overrun.'}));
    s.push(step('plunge','Plunge','Slowly, to just above the grounds. Stop at any resistance.',
      {s:20,more:'Done by the beep; this counts as contact time. Pressing into the bed squeezes fines and bitterness through the screen.'}));
    if(P)push(paperSeq('the jug of ice',dec,' It drips onto the ice as it filters, which is how Japanese iced pour-over works.'));
    else s.push(step('decant','Pour onto the ice','Straight onto the ice, steady, to '+B(o.yield+' g')+'.',
      {more:'Or stop sooner if the flow slows. The screen holds the bed in place.'}));
    s.push(step('chill','Stir until cold','Stir, don’t shake, until the ice is mostly gone. Note the temperature.',
      {s:30,more:'Shaking puts the fines back into suspension. You should have about '+o.T+' g.'}));
    s.push(step('off','Serve','Into the cold glass. Above 10°C, add two or three cubes, '+B('40 g')+' at most.',
      {more:'At 10°C or below, no ice. Unmelted chunks from the jug go in too; they are part of the recipe. Leave the last spoonful in the jug, where the silt sits.'}));
    s.push(step('rest','Taste','Now, and again in ten minutes as it warms.',
      {more:'Sweetness: cold hides it, so any is a good sign. Acidity: juicy is right; sharp and sour with fresh coffee means under-extracted, so add a minute to the steep. Clean but thin: tighten the ratio. Drying: plunge slower and leave more behind. Hold a sip a moment so it warms, for the aroma.'}));
  }
  else if(R==='aulait'){
    push([common.prep,common.dose,common.pour,common.steep]);
    s.push(step('crust','Break the crust','Press the bed down a centimetre, three or four presses. Skim real foam only.',{s:55}));
    s.push(step('settle','Settle','Plunger stays up.',{s:300,
      w:[rinseW('your mug'),W(B(o.milk+' g')+' full-cream milk into the pan'),tareW('your mug','Decanter')]}));
    s.push(common.plunge);
    if(P)push(paperSeq('your mug',dec,' Sugar? Stir it in once it has drained, before the milk.'));
    else s.push(step('decant','Decant','Shallow tilt, to '+B(o.yield+' g')+'.',{more:'Sugar? Stir it into the hot coffee now, before the milk.'}));
    s.push(step('milk','Heat the milk','Heat the '+B(o.milk+' g')+' of milk to '+B('65–70°C')+'.',
      {s:120,more:'Steaming, with fine bubbles at the edge: pull it just before it moves. Past 75°C the proteins denature and it tastes cooked.'}));
    s.push(step('off','Combine',P?'Milk into the coffee in one steady stream.':'Coffee into a warmed mug, then the milk in one steady stream.',
      {more:'Roughly 1:1. Don’t froth it: flat hot milk is the point.'}));
  }
  else {
    var cmg='the glass with the condensed milk';
    push([common.prep,common.dose,common.pour]);
    s.push(step('steep','Steep','Lid on, plunger up. Don’t touch.',{s:240,
      more:'Sweetened, not evaporated. Adjust sweetness there, not later. A pinch of salt with it cuts the sugar and deepens the coffee.',
      w:[W(B(o.cm+' g')+' sweetened condensed milk into '+(o.ice?'a tall glass':'your cup')),heatW]}));
    s.push(step('crust','Break the crust','Press the bed down, skim real foam only.',{s:55,more:'It will look almost syrupy.'}));
    s.push(step('settle','Settle','Plunger stays up.',{s:300,more:iceMore,
      w:[rinseW(null),o.ice?W(iceTxt+' into a second glass',60):null,tareW(cmg,'Decanter')]}));
    s.push(common.plunge);
    if(P)push(paperSeq(cmg,dec));
    else s.push(step('decant','Decant the concentrate','Pour out '+B(o.conc+' g')+', fully. Shallow tilt.'));
    s.push(step('off','Stir hard',(P?'Stir hard for 20 seconds,':'Over the condensed milk, then stir hard for 20 seconds,')+' until it is all one caramel colour.',
      {s:20,more:'It has to happen while the coffee is hot: condensed milk will not dissolve into cold coffee.'}));
    if(o.ice)s.push(step('rest','Pour over the ice','Over the '+iceTxt+', stir briefly. About '+B(o.T+' g')+'.'));
    else s.push(step('rest','Serve hot','Drink it now, while it is hot. About '+B(o.T+' g')+'.',{more:'Give it one more stir if the condensed milk starts to settle.'}));
  }
  return s;
}

var steps=[],idx=0,left=0,dur=0,running=false,tid=null,elapsed=0,wl=null,ac=null;
var brewT0=0,tStart=0,tBase=0;
var actuals=[],stepT0=0,runCalc=null,runMeta=null;
function saveRun(){
  if(!steps.length)return;
  try{localStorage.setItem(RKEY,JSON.stringify({steps:steps,idx:idx,actuals:actuals,brewT0:brewT0,tStart:tStart,tBase:tBase,
    running:running,dur:dur,stepT0:stepT0,speed:speed,testMode:testMode,runCalc:runCalc,meta:runMeta,savedAt:Date.now()}))}catch(e){}
}
function clearRun(){try{localStorage.removeItem(RKEY)}catch(e){}}
function readRun(){
  try{var r=JSON.parse(localStorage.getItem(RKEY)||'null');
    if(r&&r.steps&&r.steps.length&&Date.now()-r.savedAt<12*3600000)return r;
    if(r)clearRun();
  }catch(e){}
  return null;
}
function resumeRun(r){
  steps=r.steps; idx=r.idx; actuals=r.actuals||[]; brewT0=r.brewT0; tStart=r.tStart; tBase=r.tBase;
  running=!!r.running; dur=r.dur||0; stepT0=r.stepT0; speed=r.speed||1; testMode=!!r.testMode; runCalc=r.runCalc; runMeta=r.meta;
  left=Math.max(0,dur-tBase); cueDone={}; cueQuiet=true; closeRunPanel();
  $('dryflag').classList.toggle('hide',!testMode);
  show('sc-brew'); ctx(); lock();
  if(!tid)tid=setInterval(loop,200);
  $('pause').textContent=running?'Pause':(dur&&tBase>=dur?'Restart':'Resume');
  paint(); loop();
}

function ctx(){try{if(!ac)ac=new (window.AudioContext||window.webkitAudioContext)();if(ac.state==='suspended')ac.resume();return ac}catch(e){return null}}
function beep(n){
  var c=ctx();if(!c)return;
  for(var i=0;i<n;i++){(function(kk){
    var o=c.createOscillator(),g=c.createGain();
    o.connect(g);g.connect(c.destination);o.type='sine';o.frequency.value=784;
    var at=c.currentTime+kk*0.28;
    g.gain.setValueAtTime(0.0001,at);
    g.gain.exponentialRampToValueAtTime(0.25,at+0.012);
    g.gain.exponentialRampToValueAtTime(0.0001,at+0.24);
    o.start(at);o.stop(at+0.26);
  })(i)}
}
function lock(){try{if('wakeLock' in navigator)navigator.wakeLock.request('screen').then(function(x){wl=x},function(){})}catch(e){}}
function unlock(){try{if(wl){wl.release();wl=null}}catch(e){}}

function curScreen(){var c=null;SCREENS.forEach(function(s){if(!$(s).classList.contains('hide'))c=s});return c}
var SCREENS=['sc-recipe','sc-brew','sc-review','sc-log','sc-try','sc-settings'];
function show(id){
  /* repainting the screen that is already up must not yank the scroll position */
  var was=curScreen();
  SCREENS.forEach(function(s){$(s).classList.toggle('hide',s!==id)});
  if(was!==id)window.scrollTo(0,0);
  freshTipOff();
}

function paint(){
  var st=steps[idx];
  $('count').textContent=(idx+1)+' of '+steps.length;
  $('stage').textContent=st.t;
  $('detail').innerHTML=st.d;
  paintWait();
  var mo=$('more'); mo.open=false; mo.classList.toggle('hide',!st.more); $('more-b').innerHTML=st.more||'';
  paintRunBar(); paintRunPanel();
  var timed=!!st.s;
  $('timed').classList.toggle('hide',!timed);
  $('manual').classList.toggle('hide',timed);
  $('pause').classList.toggle('hide',!timed);
  $('acts').classList.toggle('two',timed);
  $('next').textContent=idx===steps.length-1?'Finish':'Next';
  var nx=steps[idx+1], u=$('upnext');
  if(nx)u.innerHTML='Next \u2014 <b>'+nx.t+'</b>'+(nx.s?', '+mmss(nx.s)+' timer':', no timer');
  else u.textContent='Last step';
  tickPaint();
}
function tickPaint(){
  var c=$('clock');
  c.textContent=mmss(left);
  c.className='clock'+(left<=0?' done':(left<=10?' low':''));
  $('bar').style.width=dur?Math.min(100,((dur-left)/dur)*100)+'%':'0%';
  $('total').textContent='Total elapsed '+mmss(elapsed);
  var rl=document.getElementById('rp-left'); if(rl)rl.textContent=mmss(left);
}
function loop(){
  /* everything derives from the wall clock, so time spent in another app still counts */
  var now=Date.now();
  elapsed=((now-brewT0)/1000)*speed;
  if(dur){
    var spent=tBase+(running?((now-tStart)/1000)*speed:0);
    var nl=Math.max(0,dur-spent);
    if(running&&nl<=0){running=false;tBase=dur;left=0;$('pause').textContent='Restart';beep(3)}
    else left=nl;
  }
  checkCues();
  tickPaint();
}
/* prep while a step's timer runs: cues with a time come due at that much time left, with a soft single tone
   (the triple beep stays for the end of a step); the first check after a step starts or the app reopens is silent */
var cueDone={}, cueQuiet=true;
function cueList(st){return (st&&st.w)||[]}
function cueHTML(c,i,cur){
  return '<li'+(cur?' data-c="'+i+'"'+(cueDone[i]?' class="due"':''):'')+'>'+(c.at!==undefined?'<span class="when">'+mmss(c.at)+' left</span> ':'')+c.t+'</li>';
}
function paintWait(){
  var st=steps[idx], w=cueList(st), el=$('wait');
  el.classList.toggle('hide',!w.length);
  el.innerHTML=w.length?'<li class="wh">'+(st.s?'While you wait':'Also')+'</li>'+w.map(function(c,i){return cueHTML(c,i,true)}).join(''):'';
}
function checkCues(){
  var st=steps[idx]; if(!st||!st.s)return;
  var quiet=cueQuiet; cueQuiet=false;
  cueList(st).forEach(function(c,i){
    if(c.at===undefined||cueDone[i]||left>c.at)return;
    cueDone[i]=true; if(!quiet)chime();
    ['#wait','#runpanel'].forEach(function(p){var li=document.querySelector(p+' li[data-c="'+i+'"]');if(li)li.classList.add('due')});
  });
}
function chime(){
  var c=ctx(); if(!c)return;
  var o=c.createOscillator(),g=c.createGain(),at=c.currentTime;
  o.connect(g);g.connect(c.destination);o.type='sine';o.frequency.value=587;
  g.gain.setValueAtTime(0.0001,at);
  g.gain.exponentialRampToValueAtTime(0.14,at+0.02);
  g.gain.exponentialRampToValueAtTime(0.0001,at+0.5);
  o.start(at);o.stop(at+0.52);
}

/* This brew: everything set before Start, kept for the run, one tap away without touching the timer */
function runTitle(){
  var o=runCalc||{}, m=runMeta||{}, p=m.params||{}, rk=o.recipe||m.recipe||'black';
  var n=(RECIPES[rk]||{}).name||'Brew';
  return rk==='viet'?n+' ('+(p.vmode||o.vmode||'iced')+')':n;
}
function paintRunBar(){
  var p=(runMeta&&runMeta.params)||{}, bits=[runTitle()];
  if(p.tgt)bits.push(p.tgt+' g'); if(p.ratio)bits.push('1:'+p.ratio);
  $('runbar-l').textContent='This brew · '+bits.join(' · ');
}
function paintRunPanel(){
  var el=$('runpanel'); if(el.classList.contains('hide'))return;
  var o=runCalc, m=runMeta||{}, p=m.params||{}, how=[], sub=[];
  if(m.recipe==='black')how.push(m.mode==='bypass'?'bypass':'direct');
  if(o)how.push(o.paper?'paper, '+(o.pflow==='press'?'from the press':'from the decanter'):'mesh only');
  if(o&&o.ice)how.push(o.iceKind==='other'?'other ice':'RO + Vedica ice');
  if(p.tgt)sub.push(p.tgt+' g'); if(p.ratio)sub.push('1:'+p.ratio); if(p.temp)sub.push(p.temp+'°C'); if(p.loc)sub.push(esc(p.loc));
  if(testMode)sub.push('dry run');
  var h='<p class="rp-h">'+runTitle()+(how.length?' · '+how.join(' · '):'')+'</p><p class="rp-sub">'+sub.join(' · ')+'</p>';
  if(o)h+='<div class="rp-nums">'+numRows(o,o.mode||m.mode,null).map(function(r){return '<div><span class="k">'+r[0].replace(/^\u2003 (.)/,function(x,c){return c.toUpperCase()})+'</span><span class="v">'+r[1]+'</span></div>'}).join('')+'</div>';
  /* steps already done fold into one line, so the current one sits just under the numbers */
  var done=steps.slice(0,idx).map(function(st,i){var a=actuals[i];return '<li><span class="ic">\u2713</span><span class="t">'+esc(st.t)+'</span><span class="tm">'+(st.s&&a?mmss(Math.round(a.actual)):'')+'</span></li>'}).join('');
  h+='<ol class="rp-steps">';
  if(idx)h+='<li class="done"><details class="rp-done"><summary><span class="ic">\u2713</span>'+idx+' of '+steps.length+' done</summary><ol class="rp-steps">'+done+'</ol></details></li>';
  h+=steps.map(function(st,i){
    if(i<idx)return '';
    var cur=i===idx, tm=cur?(st.s?'<span id="rp-left">'+mmss(left)+'</span> left':''):(st.s?mmss(st.s):''), w=cueList(st);
    return '<li class="'+(cur?'cur':'')+'"><span class="ic">'+(cur?'\u25CF':'\u25CB')+'</span><span class="t">'+esc(st.t)+'</span><span class="tm">'+tm+'</span>'
      +'<div class="d">'+st.d+'</div>'+(w.length?'<ul class="w">'+w.map(function(c,j){return cueHTML(c,j,cur)}).join('')+'</ul>':'')+'</li>';
  }).join('')+'</ol>';
  el.innerHTML=h;
}
function openRunPanel(){
  var el=$('runpanel');
  el.classList.remove('hide'); $('runshade').classList.remove('hide'); $('runbar').setAttribute('aria-expanded','true');
  paintRunPanel();
  /* the numbers first; scrolled down only when the current step would be out of sight */
  var cur=el.querySelector('li.cur'), hgt=el.clientHeight;
  el.scrollTop=(cur&&cur.offsetTop+48>hgt*0.8)?Math.max(0,cur.offsetTop-hgt*0.3):0;
}
function closeRunPanel(){
  $('runpanel').classList.add('hide'); $('runshade').classList.add('hide'); $('runbar').setAttribute('aria-expanded','false');
}
$('runbar').addEventListener('click',function(){if($('runpanel').classList.contains('hide'))openRunPanel();else closeRunPanel()});
$('runshade').addEventListener('click',closeRunPanel);
function go(i){
  idx=i; var st=steps[idx];
  dur=st.s?st.s:0; left=dur; running=!!st.s; tBase=0; tStart=Date.now();
  stepT0=Date.now(); cueDone={}; cueQuiet=true;
  $('pause').textContent='Pause';
  paint(); saveRun();
}
function leaveStep(){
  var st=steps[idx];
  actuals.push({k:st.k,t:st.t,target:st.s||0,actual:((Date.now()-stepT0)/1000)*speed});
}
function startBrew(isTest){
  testMode=!!isTest; speed=testMode?dryX():1;
  steps=buildSteps(); actuals=[]; elapsed=0; runCalc=compute(); brewT0=Date.now();
  runMeta={recipe:S.recipe,mode:S.mode,params:{tgt:rs().tgt,ratio:rs().ratio,pratio:S.pratio,ved:S.ved,temp:S.temp,loc:(curLoc()||{}).name||undefined,vmode:S.recipe==='viet'?S.vmode:undefined,paper:rs().paper?true:undefined,pfrom:rs().paper?(rs().pflow==='press'?'press':'decanter'):undefined,ice:runCalc.iceKind||undefined},bean:beanSnap()};
  closeRunPanel();
  $('dryflag').classList.toggle('hide',!testMode);
  show('sc-brew'); ctx(); lock();
  if(!tid)tid=setInterval(loop,200);
  go(0);
}
function dryX(){var v=Math.round(S.dspeed);return (v>=2&&v<=60)?v:10}
function paintDry(){
  var x=dryX();
  $('dry').innerHTML='Dry run &mdash; '+x+'&times; speed, kept out of the log';
  $('dryflag').innerHTML='Dry run &middot; timers at '+x+'&times;, recorded times scaled back up';
}
function endTimers(){running=false;if(tid){clearInterval(tid);tid=null}unlock()}

function contactOf(a){
  var s=0; a.forEach(function(x){if(CONTACT[x.k])s+=x.actual}); return s;
}
function sameRecipe(e){return (e.recipe||'black')===S.recipe}
function bestBrew(arr,rk){
  var b=null; rk=rk||S.recipe;
  (arr||LOG).filter(function(e){return (e.recipe||'black')===rk}).forEach(function(e){if(e.log&&e.log.score){if(!b||e.log.score>b.log.score)b=e}});
  return b;
}

function findAny(id){var r=null;LOG.concat(TLOG).forEach(function(x){if(String(x.id)===String(id))r=x});return r}
function finishBrew(){
  endTimers();
  var o=runCalc||compute();
  var m=runMeta||{recipe:S.recipe,mode:S.mode,params:{tgt:rs().tgt,ratio:rs().ratio,pratio:S.pratio,ved:S.ved,temp:S.temp,paper:rs().paper?true:undefined,pfrom:rs().paper?(rs().pflow==='press'?'press':'decanter'):undefined,ice:o.iceKind||undefined},bean:beanSnap()};
  var now=Date.now();
  var e={id:now, at:new Date(now).toISOString(), rev:now, pending:true,
    test:testMode||undefined, recipe:m.recipe, mode:m.mode, bean:m.bean, params:m.params,
    calc:{boil:o.boil,vedica:o.ved,ro:o.ro,dose:o.D,press:o.press,decant:Math.round(o.decant),jug:o.Y,pour:Math.round(o.recipe==='viet'?o.conc:o.T),ice:o.ice||0,milk:o.milk||0,cm:o.cm||0},
    steps:actuals.map(function(a){return {k:a.k,t:a.t,target:Math.round(a.target),actual:Math.round(a.actual)}}),
    total:Math.round(elapsed), contact:Math.round(contactOf(actuals)),
    log:{temp:null,decant:null,score:null,tastes:[],faults:[],note:''}};
  if(testMode){TLOG.unshift(e);saveT()}
  else{LOG.unshift(e);saveL();pushPending()}
  clearRun(); steps=[];
  var notice=testMode?'':checkPackAfterBrew(e);
  refreshAll();
  openReview(e.id,notice,true);
}
var RV=null;
function openReview(id,notice,fresh){
  var e=findAny(id); if(!e)return;
  var l=e.log||{}, isT=!!e.test, cup=!!e.ref, b=bestBrew(isT?TLOG:LOG,e.recipe||'black');
  RV={id:e.id,test:isT,cup:cup};
  $('rv-title').textContent=isT?'Dry run — how did it look':(cup?'How was your cup':'How was it');
  var lines;
  if(cup)lines='Brewed by <b>'+esc(nameOf(e.ref.who))+'</b> on '+esc(fmtWhen(e.at))+' · '+esc(rname(e))+(e.calc?', '+e.calc.dose+' g':'')+'. Contact time <b>'+mmss(e.contact||0)+'</b>.';
  else{
    lines=(fresh?'':'Brewed '+fmtWhen(e.at)+'. ')+(isT?'Scaled as if real. ':'')+'Contact time <b>'+mmss(e.contact||0)+'</b>, total <b>'+mmss(e.total||0)+'</b>.';
    if(b&&b.contact&&String(b.id)!==String(e.id))lines+=' Your best-rated '+(isT?'dry run':'brew')+' ran '+mmss(b.contact)+' — '+signed((e.contact||0)-b.contact)+'.';
  }
  if(!isT&&e.pending)lines+='<br>Already saved to your log. Score it now, or tap Score later and come back to it.';
  $('rv-summary').innerHTML=lines;
  $('rv-pack').classList.toggle('hide',!notice); $('rv-pack').textContent=notice||'';
  var iced=e.recipe==='iced';
  /* how the brew was made belongs to whoever made it: a cup only records your own side */
  $('rv-wt-wrap').classList.toggle('hide',cup); $('rv-dec-wrap').classList.toggle('hide',cup); $('rv-steps').classList.toggle('hide',cup);
  rvWith={}; (e.with||[]).forEach(function(pid){rvWith[pid]=1}); rvShareAuto=false;
  $('rv-with-wrap').classList.toggle('hide',cup||isT||!othersList().length);
  $('rv-dec').value=l.decant||(e.calc?e.calc.decant:'');
  $('rv-temp').value=(l.temp!==null&&l.temp!==undefined)?l.temp:'';
  $('rv-jug').value=(l.jug!==null&&l.jug!==undefined)?l.jug:''; $('rv-jug-wrap').classList.toggle('hide',!iced||cup);
  var lastT=null; LOG.forEach(function(x){if(lastT===null&&String(x.id)!==String(e.id)&&(x.recipe||'black')===(e.recipe||'black')&&x.log&&x.log.temp)lastT=x.log.temp});
  $('rv-temp').setAttribute('data-def',String(iced?6:(lastT||58)));
  $('rv-note').value=l.note||'';
  $('rv-wt').value=(e.params&&e.params.temp!==undefined)?e.params.temp:S.temp;
  rvScore=l.score||0; rvFaults={}; rvTastes={}; rvShare=(l.share!==undefined&&l.share!==null)?l.share:1;
  (l.faults||[]).forEach(function(f){rvFaults[f]=1}); (l.tastes||[]).forEach(function(t){rvTastes[t]=1});
  var sk=$('skip'); sk.removeAttribute('data-armed'); sk.innerHTML=skipLabel();
  $('rv-steps').open=false; $('rv-steps-body').innerHTML=cup?'':stepEditHTML(e,'rs');
  var dr=readDraft(e.id);
  if(dr&&(dr.at||0)>(e.rev||0)){
    ['wt','jug','temp','dec'].forEach(function(k){if(dr[k]!==undefined)$('rv-'+k).value=dr[k]});
    if(dr.note!==undefined)$('rv-note').value=dr.note;
    if(dr.share!==undefined)rvShare=dr.share; if(dr.score)rvScore=dr.score;
    if(dr.tastes)rvTastes=dr.tastes; if(dr.faults)rvFaults=dr.faults;
    if(dr.with&&!cup)rvWith=dr.with;
  }
  paintReview(); show('sc-review');
}
function deleteEntry(id,isTest){
  var did=String(id);
  if(isTest){TLOG=TLOG.filter(function(x){return String(x.id)!==did});saveT();return}
  /* a cup of someone else's brew is kept as "didn't have any", so it is not offered again */
  var cup=null;LOG.forEach(function(x){if(String(x.id)===did&&x.ref)cup=x});
  if(cup){cup.skipped=true;delete cup.pending;cup.log=cup.log||{};cup.log.share=0;cup.rev=Date.now();cup.synced=false;saveL();pushPending();return}
  LOG=LOG.filter(function(x){return String(x.id)!==did});saveL();DEL.push(did);saveDel();pushPending();
}
var rvScore=0, rvFaults={}, rvTastes={}, rvShare=1, rvWith={}, rvShareAuto=false;
function rname(e){var r=RECIPES[(e&&e.recipe)||'black'];return r?r.name:'Black'}
function skipLabel(){return RV&&RV.cup?'Didn’t have any':'Discard'}
/* grams of finished drink the brew made: the whole glass for Vietnamese, the cup for everything else */
function drinkTotal(e){var c=(e&&e.calc)||{};if(e.recipe==='viet')return Math.round((c.pour||0)+(c.cm||0)+(c.ice||0));return Math.round(c.pour||c.jug||0)}
function shareNote(l){if(l.share===undefined||l.share===null||l.share>=1)return '';return l.drank!==undefined&&l.drank!==null?' (you drank '+l.drank+' g)':' (your share of the brew)'}
var SHARES=[[1,'All of it'],[0.5,'Half'],[0.333,'A third'],[0,'None']];
function syncChips(box,list,attr,label,on){
  if(!box)return;
  var kids=box.children, same=kids.length===list.length;
  if(same)for(var i=0;i<list.length;i++){if(kids[i].getAttribute('data-'+attr)!==String(list[i])){same=false;break}}
  if(!same){box.innerHTML=list.map(function(k){return '<button class="chip" data-'+attr+'="'+esc(k)+'" aria-pressed="false">'+esc(label(k))+'</button>'}).join('')}
  Array.prototype.forEach.call(box.children,function(b,i){b.setAttribute('aria-pressed',String(!!on(list[i])))});
}
function shareLabel(v){var r='';SHARES.forEach(function(x){if(String(x[0])===String(v))r=x[1]});return r}
function paintReview(){
  var re0=RV&&findAny(RV.id), rt=re0?drinkTotal(re0):0;
  $('rv-of').textContent=rt?'grams you drank, of the '+rt+' g brew':'grams you drank'; $('rv-drank').max=rt||'';
  if(document.activeElement!==$('rv-drank'))$('rv-drank').value=rt?Math.round(rvShare*rt):'';
  syncChips($('rv-share'),SHARES.map(function(x){return x[0]}),'sh',shareLabel,function(v){return Math.abs(rvShare-v)<0.01});
  var re=RV&&findAny(RV.id), rc=(re&&!re.test)?cafOf(re.calc,Number($('rv-dec').value)||null,rvShare):null;
  $('rv-caf').textContent=rc?(rvShare>0?'About '+r5(rc.mid)+' mg of caffeine for you, somewhere between '+r5(rc.low)+' and '+r5(rc.high)+'.':'No caffeine counted for you from this brew.'):'';
  $('rv-val').textContent=rvScore?fmtScore(rvScore)+' / 5':'not scored yet';
  if(document.activeElement!==$('rv-fine'))$('rv-fine').value=rvScore||3;
  Array.prototype.forEach.call($('rv-score').children,function(b){
    b.setAttribute('aria-pressed',String(rvScore>0&&Number(b.dataset.v)===Math.round(rvScore)));
  });
  syncChips($('rv-faults'),FAULTS,'f',String,function(f){return rvFaults[f]});
  syncChips($('rv-tastes'),TASTES,'t',String,function(f){return rvTastes[f]});
  if(!$('rv-with-wrap').classList.contains('hide')){
    var ol=othersList();
    syncChips($('rv-with'),ol.map(function(p){return p.id}),'wp',nameOf,function(pid){return rvWith[pid]});
    var sel=ol.filter(function(p){return rvWith[p.id]}).map(function(p){return p.name});
    $('rv-with-note').textContent=sel.length?sel.join(' and ')+(sel.length>1?' each score their own cup':' scores their own cup')+', on their phone or here after switching to them. Set how much you drank below.':'';
  }
  saveDraftSoon();
}
$('rv-drank').addEventListener('input',function(){
  var e=RV&&findAny(RV.id), t=e?drinkTotal(e):0, g=parseFloat(this.value);
  if(t>0&&g>=0){rvShare=Math.min(1,g/t);rvShareAuto=false;paintReview()}
});
$('rv-share').addEventListener('click',function(e){var b=e.target.closest('[data-sh]');if(!b)return;rvShare=parseFloat(b.dataset.sh);rvShareAuto=false;paintReview()});
/* sharing the carafe: your own share defaults to an even split, until you set it yourself */
$('rv-with').addEventListener('click',function(e){
  var b=e.target.closest('[data-wp]'); if(!b)return;
  var pid=b.dataset.wp; if(rvWith[pid])delete rvWith[pid]; else rvWith[pid]=1;
  var n=Object.keys(rvWith).length;
  if(rvShare===1||rvShareAuto){rvShare=n?Math.round(1000/(n+1))/1000:1;rvShareAuto=n>0}
  paintReview();
});
$('rv-dec').addEventListener('input',function(){if(RV)paintReview()});
$('rv-tastes').addEventListener('click',function(e){
  var b=e.target.closest('button'); if(!b)return;
  var f=b.dataset.t; if(rvTastes[f])delete rvTastes[f]; else rvTastes[f]=1;
  paintReview();
});
$('rv-score').addEventListener('click',function(e){
  var b=e.target.closest('button'); if(!b)return;
  rvScore=Number(b.dataset.v); paintReview();
});
$('rv-fine').addEventListener('input',function(){rvScore=Math.round(parseFloat(this.value)*10)/10;paintReview()});
$('rv-faults').addEventListener('click',function(e){
  var b=e.target.closest('button'); if(!b)return;
  var f=b.dataset.f; if(rvFaults[f])delete rvFaults[f]; else rvFaults[f]=1;
  paintReview();
});
function readDraft(id){try{return JSON.parse(localStorage.getItem('fp.rvdraft'+WHO.suffix+'.'+id)||'null')}catch(e){return null}}
function clearDraft(id){try{localStorage.removeItem('fp.rvdraft'+WHO.suffix+'.'+id)}catch(e){}}
var draftT=null;
function saveDraftSoon(){
  if(!RV)return; var id=RV.id; clearTimeout(draftT);
  draftT=setTimeout(function(){if(!RV||String(RV.id)!==String(id))return;
    try{localStorage.setItem('fp.rvdraft'+WHO.suffix+'.'+id,JSON.stringify({at:Date.now(),wt:$('rv-wt').value,jug:$('rv-jug').value,temp:$('rv-temp').value,dec:$('rv-dec').value,
      note:$('rv-note').value,share:rvShare,score:rvScore,tastes:rvTastes,faults:rvFaults,with:rvWith}))}catch(e){}},250);
}
$('sc-review').addEventListener('input',saveDraftSoon);
function saveReview(){
  if(!RV)return; var e=findAny(RV.id); if(!e)return;
  var fl=[]; FAULTS.forEach(function(f){if(rvFaults[f])fl.push(f)});
  var tl=[]; TASTES.forEach(function(f){if(rvTastes[f])tl.push(f)});
  var wt=parseFloat($('rv-wt').value); if(!e.params)e.params={}; if(!isNaN(wt))e.params.temp=wt;
  var jv=parseFloat($('rv-jug').value);
  e.log={temp:Number($('rv-temp').value)||null, decant:Number($('rv-dec').value)||null,
         jug:(e.recipe==='iced'&&!isNaN(jv))?jv:undefined,
         score:rvScore||null, tastes:tl, faults:fl, note:$('rv-note').value.trim(), share:Math.round(rvShare*1000)/1000, drank:drinkTotal(e)?Math.round(rvShare*drinkTotal(e)):undefined};
  if(!e.test&&!e.ref){
    var w=Object.keys(rvWith).filter(function(pid){return othersList().some(function(p){return p.id===pid})});
    if(w.length)e.with=w; else delete e.with;
  }
  applyStepEdits(e,'rs');
  delete e.pending;
  if(e.test)saveT(); else{e.rev=Date.now();e.synced=false;saveL();pushPending()}
  clearTimeout(draftT); clearDraft(e.id);
  RV=null; lastAuto=null; refreshAll();
  openLog(e.test?'test':'real');
}

function paintBanners(){
  var h='', r=steps.length?null:readRun();
  if(r){
    var st=r.steps[r.idx]||{};
    h+='<div class="banner"><p>'+(r.testMode?'A dry run':'A brew')+' from '+esc(fmtWhen(new Date(r.brewT0).toISOString()))+' was interrupted at step '+(r.idx+1)+' of '+r.steps.length+', <b>'+esc(st.t||'')+'</b>. The timer kept counting while it was closed.</p>'
      +'<div class="bacts"><button class="go" data-run="resume">Resume</button><button class="ghost del" data-run="drop">Discard</button></div></div>';
  }
  var pend=LOG.filter(function(e){return e.pending&&!e.skipped});
  if(pend.length){
    var n=pend[0];
    h+='<div class="banner"><p>'+(pend.length>1?pend.length+' brews are waiting for a score.':(n.ref?'Your cup of '+esc(nameOf(n.ref.who))+'’s brew from '+esc(fmtWhen(n.at)):'Your brew from '+esc(fmtWhen(n.at)))+' is waiting for a score.')+'</p>'
      +'<div class="bacts"><button class="go" data-pend="'+esc(n.id)+'">'+(pend.length>1?'Score the latest':'Score it')+'</button></div></div>';
  }
  /* carafes someone else made and shared with you */
  var sp=sharedPending();
  if(sp.length){
    var x=sp[0], key=esc(x.pid)+'|'+esc(String(x.b.id));
    h+='<div class="banner"><p>'+(sp.length>1?sp.length+' shared brews are waiting for your score.':esc(nameOf(x.pid))+'’s brew from '+esc(fmtWhen(x.b.at))+' was shared with you. How was your cup?')+'</p>'
      +'<div class="bacts"><button class="go" data-cup="'+key+'">Score your cup</button><button class="ghost" data-cupskip="'+key+'">Didn’t have any</button></div></div>';
  }
  var lead=(S.lead>=0)?S.lead:3;
  openPacks().forEach(function(p){
    var pc=paceOf(p); if(!pc||pc.days>lead+1)return;
    var covered=openPacks().some(function(q){var lq=leftG(q);return q.id!==p.id&&(lq===null||lq>20)});
    if(covered)return;
    var dk=null; try{dk=localStorage.getItem('fp.nudge.'+p.id)}catch(err){}
    if(dk===todayStr())return;
    var dd=Math.round(pc.days);
    h+='<div class="banner"><p><b>'+esc(p.name)+'</b> runs out in '+(pc.days<1?'less than a day':'about '+dd+' day'+(dd===1?'':'s'))+' at your pace. Delivery takes about '+lead+' day'+(lead===1?'':'s')+', so order now to avoid a gap.</p>'
      +'<div class="bacts"><button class="ghost" data-nudge="'+esc(p.id)+'">Got it</button></div></div>';
  });
  $('banners').innerHTML=h;
}

/* ---------- caffeine ---------- */
var EXTRAS=[['Diet Coke can',40],['Cup of tea',45],['Espresso shot',65],['Energy drink can',80]];
var cafMenu=false;
function cafOf(c,dec,share){
  if(!c||!c.dose||!c.press)return null;
  var rec=(dec||c.decant||0)/c.press;
  if(c.jug&&c.pour&&c.jug>c.pour)rec*=c.pour/c.jug;
  rec=Math.max(0,Math.min(1,rec));
  var sh=(share===undefined||share===null)?1:share;
  /* arabica is roughly 1.0-1.4% caffeine and about 85-95% of it dissolves; the rest stays in the grounds and dregs */
  return {mid:c.dose*10.8*rec*sh, low:c.dose*8.5*rec*sh, high:c.dose*13.3*rec*sh};
}
function cafEvents(){
  var ev=[];
  LOG.forEach(function(e){if(e.test||e.skipped)return;var c=cafOf(e.calc,e.log&&e.log.decant,e.log&&e.log.share);if(c&&c.mid>0)ev.push({t:new Date(e.at).getTime(),mg:c.mid})});
  (PK.extras||[]).forEach(function(x){ev.push({t:new Date(x.at).getTime(),mg:x.mg})});
  return ev;
}
function midnight(){var m=new Date();m.setHours(0,0,0,0);return m.getTime()}
function cafToday(){var m=midnight(),s=0;cafEvents().forEach(function(v){if(v.t>=m)s+=v.mg});return s}
function cafNow(){var n=Date.now(),s=0;cafEvents().forEach(function(v){var hr=(n-v.t)/3600000;if(hr>=0&&hr<48)s+=v.mg*Math.pow(0.5,hr/5)});return s}
function paintCaf(){
  var o=compute(), c=cafOf({dose:o.D,press:o.press,decant:Math.round(o.decant),jug:o.Y,pour:Math.round(o.T)},null,1);
  var td=r5(cafToday()), nw=r5(cafNow());
  var h='<p>Caffeine today ≈ <b'+(td>400?' class="hot"':'')+'>'+td+' mg</b> · in your system now ≈ <b>'+nw+' mg</b>'+(c?' · this brew holds ≈ <b>'+r5(c.mid)+' mg</b>':'')+'</p>';
  var m=midnight(), ex=(PK.extras||[]).filter(function(x){return new Date(x.at).getTime()>=m});
  if(ex.length)h+='<p class="cafx">Also today: '+ex.map(function(x){return esc(x.label)+' '+x.mg+' mg<button class="ghost" data-xdel="'+esc(x.id)+'" aria-label="Remove '+esc(x.label)+'">×</button>'}).join(' · ')+'</p>';
  h+='<div class="cafacts"><button class="ghost" data-xmenu="1">'+(cafMenu?'Close':'+ Other caffeine')+'</button></div>';
  if(cafMenu)h+='<div class="chips" id="caf-menu">'+EXTRAS.map(function(x,i){return '<button class="chip" data-xadd="'+i+'">'+esc(x[0])+' ≈'+x[1]+' mg</button>'}).join('')
    +'</div><div class="cafc"><div>'+stpH('caf-mg','',10,0,1000,'mg','custom caffeine',50)+'</div><button class="chip" data-xadd="c">Add</button></div>';
  $('caf').innerHTML=h;
}
function addExtra(label,mg){
  if(!(mg>0))return;
  var cut=Date.now()-3*86400000;
  PK.extras=(PK.extras||[]).filter(function(x){return new Date(x.at).getTime()>cut});
  PK.extras.push({id:'x'+Date.now(),at:new Date().toISOString(),mg:Math.round(mg),label:label});
  cafMenu=false; touchPK();
}

/* ---------- best settings for the bean ---------- */
function bestForPack(){
  var ap=activePack(); if(!ap)return null;
  var nm=(ap.name||'').toLowerCase(), rt=(ap.roaster||'').toLowerCase(), b=null;
  LOG.forEach(function(e){
    if(e.test||!e.log||!e.log.score||e.log.score<4)return;
    if((e.recipe||'black')!==S.recipe)return;
    var bn=e.bean||{};
    if((bn.name||'').toLowerCase()!==nm||(bn.roaster||'').toLowerCase()!==rt)return;
    if(!b||e.log.score>b.log.score)b=e;
  });
  return b;
}
function paintBest(){
  var box=$('best'), e=bestForPack();
  if(!e){box.classList.add('hide');box.innerHTML='';return}
  var p=e.params||{}, rk=e.recipe||'black', bits=[];
  bits.push((p.tgt||e.calc.pour)+' g');
  if(p.ratio)bits.push('1:'+p.ratio);
  if(rk==='black')bits.push(e.mode==='bypass'?'Bypass with the press at 1:'+p.pratio:'Direct');
  if(p.temp)bits.push('water '+p.temp+'°C'+(p.loc?' in '+p.loc:''));
  bits.push(p.paper?'through paper':'mesh only');
  var jug=null;(e.steps||[]).forEach(function(st){if(st.k==='jug')jug=st.actual});
  if(jug)bits.push('settled '+mmss(jug)+' in the decanter');
  var same=Number(rs().tgt)===Number(p.tgt)&&Number(rs().ratio)===Number(p.ratio)&&!!rs().paper===!!p.paper&&(rk!=='black'||(S.mode===e.mode&&(e.mode!=='bypass'||Number(S.pratio)===Number(p.pratio))));
  box.innerHTML='<p><b>Your best '+esc(e.bean.name)+' '+esc(RECIPES[rk].name.toLowerCase())+'</b> scored '+fmtScore(e.log.score)+'/5 on '+esc(fmtAt(e.at))+': '+esc(bits.join(', '))+'.'
    +(e.log.tastes&&e.log.tastes.length?' Tasted '+esc(e.log.tastes.join(', ').toLowerCase())+'.':'')+'</p>'
    +(same?'<p class="bsame">You’re on these settings. Water temperature stays with your location.</p>':'<button class="ghost" id="best-use">Use these settings</button>');
  box.classList.remove('hide');
}

/* ---------- locations ---------- */
var LOCF=['temp','panloss','ved','ceil'], locT=null;
function curLoc(){var r=null;(PK.profiles||[]).forEach(function(p){if(p.id===PK.loc)r=p});return r}
function applyLocToS(){var p=curLoc();if(!p)return;LOCF.forEach(function(k){if(p[k]!==undefined&&p[k]!==null&&!isNaN(p[k])){S[k]=p[k];var el=$(k);if(el)el.value=p[k]}});saveS()}
function setLoc(id){PK.loc=id;applyLocToS();touchPK();paintLoc()}
function locEdit(id){var p=curLoc();if(!p||LOCF.indexOf(id)<0||isNaN(S[id]))return;p[id]=S[id];clearTimeout(locT);locT=setTimeout(touchPK,800)}
function paintLoc(){
  $('loc-pick').innerHTML=(PK.profiles||[]).map(function(p){return '<button data-loc="'+esc(p.id)+'" aria-pressed="'+(p.id===PK.loc)+'">'+esc(p.name)+'</button>'}).join('')
    +'<button data-loc="+">+ Add</button>';
}
function ensureProfiles(){
  if(PK.profiles&&PK.profiles.length){paintLoc();return}
  var b={panloss:isNaN(S.panloss)?30:S.panloss,ved:isNaN(S.ved)?20:S.ved,ceil:S.ceil||450};
  if(WHO.dir){
    /* someone added later starts with one place of their own, to rename or replace */
    PK.profiles=[{id:'home',name:'Home',temp:98,panloss:b.panloss,ved:b.ved,ceil:b.ceil}];
    PK.loc='home';
  }else{
    PK.profiles=[{id:'delhi',name:'Delhi',temp:98,panloss:b.panloss,ved:b.ved,ceil:b.ceil},
                 {id:'bangalore',name:'Bangalore',temp:96,panloss:b.panloss,ved:b.ved,ceil:b.ceil}];
    PK.loc=Number(S.temp)<=96?'bangalore':'delhi';
    var cl=curLoc(); if(cl&&!isNaN(S.temp))cl.temp=S.temp;
  }
  PK.rev=Date.now(); savePK(); pushPacks(); paintLoc(); render();
}

/* ---------- freshness chart ---------- */
var freshMode='grind', freshPts=[];
function freshPoints(){
  var first={};
  LOG.forEach(function(e){if(e.test)return;var k=brewPack(e);if(!k)return;var t=new Date(e.at).getTime();if(!(k in first)||t<first[k])first[k]=t});
  var pts=[];
  baseArr().forEach(function(e){
    if(e.test||!e.log||!e.log.score)return;
    var d=null;
    if(freshMode==='grind'){var g=e.bean&&e.bean.groundAge;if(g!==null&&g!==undefined&&!isNaN(g))d=g}
    else{var k=brewPack(e);if(k&&first[k]!==undefined)d=Math.floor((new Date(e.at).getTime()-first[k])/86400000)}
    if(d!==null)pts.push({d:d,s:e.log.score,e:e});
  });
  return pts;
}
function avg(a){return a.length?a.reduce(function(x,y){return x+y},0)/a.length:null}
function freshHTML(){
  if(logView==='test')return '';
  var pts=freshPoints(); freshPts=pts;
  var what=freshMode==='grind'?'days since grinding':'days since your first brew from the pack';
  var h='<div class="ins"><h2>Freshness</h2>'
    +'<div class="logseg fseg" role="group" aria-label="Count days from"><button data-fm="grind" aria-pressed="'+(freshMode==='grind')+'">Since grinding</button><button data-fm="open" aria-pressed="'+(freshMode==='open')+'">Since first brew</button></div>';
  if(pts.length<3)return h+'<p class="cap">The chart needs three scored brews '+(freshMode==='grind'?'with a roast or grind date':'from a pack')+'. You have '+pts.length+'.</p></div>';
  var W=320,H=178,L=26,R=310,T=10,B=144;
  var maxd=0; pts.forEach(function(p){if(p.d>maxd)maxd=p.d});
  var xmax=Math.max(7,Math.ceil(maxd)+1);
  function X(d){return L+(d/xmax)*(R-L)}
  function Y(v){return B-((v-1)/4)*(B-T)}
  var svg='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Brew score against '+what+'">';
  for(var v=1;v<=5;v++)svg+='<line class="fg" x1="'+L+'" x2="'+R+'" y1="'+Y(v)+'" y2="'+Y(v)+'"/><text class="ft" x="'+(L-8)+'" y="'+(Y(v)+4)+'" text-anchor="end">'+v+'</text>';
  var step=xmax<=8?1:xmax<=16?2:xmax<=35?5:10;
  for(var d=0;d<=xmax;d+=step)svg+='<text class="ft" x="'+X(d)+'" y="'+(B+18)+'" text-anchor="middle">'+d+'</text>';
  svg+='<text class="ft" x="'+((L+R)/2)+'" y="'+(H-2)+'" text-anchor="middle">'+what+'</text>';
  var grp={}, dots='', hits='';
  pts.forEach(function(p){var k=p.d+'|'+p.s;(grp[k]=grp[k]||[]).push(p)});
  pts.forEach(function(p,i){
    var g=grp[p.d+'|'+p.s], j=g.indexOf(p), cx=X(p.d)+(j-(g.length-1)/2)*9, cy=Y(p.s);
    p.cx=cx; p.cy=cy;
    hits+='<circle class="fhit" r="12" cx="'+cx+'" cy="'+cy+'" data-fi="'+i+'" tabindex="0"/>';
    dots+='<circle class="fdot" r="4.5" cx="'+cx+'" cy="'+cy+'" id="fd-'+i+'"/>';
  });
  svg+=dots+hits+'</svg>';
  var early=pts.filter(function(p){return p.d<=2}).map(function(p){return p.s}), late=pts.filter(function(p){return p.d>2}).map(function(p){return p.s});
  var cap=(early.length>=2&&late.length>=2)
    ?'In the first three days your brews average <b>'+avg(early).toFixed(1)+'</b>; after that, <b>'+avg(late).toFixed(1)+'</b>.'
    :'Keep logging. The comparison needs two scored brews on each side of day 3.';
  var buckets=[[0,2,'0–2'],[3,5,'3–5'],[6,9,'6–9'],[10,14,'10–14'],[15,9999,'15+']], rows='';
  buckets.forEach(function(bk){var sc=pts.filter(function(p){return p.d>=bk[0]&&p.d<=bk[1]}).map(function(p){return p.s});if(sc.length)rows+='<tr><td>'+bk[2]+'</td><td>'+sc.length+'</td><td>'+avg(sc).toFixed(1)+'</td></tr>'});
  return h+'<p class="cap">'+cap+'</p><div class="fchart" id="fchart">'+svg+'<div class="ftip hide" id="ftip"></div></div>'
    +'<table><tr><th>Days</th><th>Brews</th><th>Average</th></tr>'+rows+'</table></div>';
}
function freshTip(i){
  var tip=$('ftip'), p=freshPts[i]; if(!tip||!p){return}
  var svg=document.querySelector('#fchart svg'), box=$('fchart').getBoundingClientRect(), sb=svg.getBoundingClientRect(), k=sb.width/320;
  Array.prototype.forEach.call(document.querySelectorAll('.fdot.on'),function(x){x.classList.remove('on')});
  var dot=$('fd-'+i); if(dot)dot.classList.add('on');
  tip.textContent=fmtAt(p.e.at)+' · '+packLabel(brewPack(p.e),p.e)+' · day '+p.d+' · '+fmtScore(p.s)+'/5';
  tip.classList.remove('hide');
  var half=tip.offsetWidth/2, x=sb.left-box.left+p.cx*k;
  x=Math.max(half+2,Math.min(box.width-half-2,x));
  tip.style.left=x+'px'; tip.style.top=(sb.top-box.top+p.cy*k)+'px';
}
function freshTipOff(){var t=$('ftip');if(t)t.classList.add('hide');Array.prototype.forEach.call(document.querySelectorAll('.fdot.on'),function(x){x.classList.remove('on')})}

function drCls(d,target){
  var a=Math.abs(d);
  if(target<=30){return a<=5?'dr-ok':a<=15?'dr-mid':'dr-bad'}
  return a<=10?'dr-ok':a<=30?'dr-mid':'dr-bad';
}
function entryDetail(e,editing){
  var h='<table><tr><th>Step</th><th>Target</th><th>Actual</th><th>Drift</th></tr>';
  e.steps.forEach(function(s){
    var tg=s.target?mmss(s.target):'\u2014';
    var dr='\u2014';
    if(s.target){var d=s.actual-s.target;dr='<span class="'+drCls(d,s.target)+'">'+signed(d)+'</span>'}
    h+='<tr><td>'+s.t+(s.fixed?' <span style="color:var(--faint)">(fixed)</span>':'')+'</td><td>'+tg+'</td><td>'+mmss(s.actual)+'</td><td>'+dr+'</td></tr>';
  });
  h+='</table>';
  var c=e.calc, l=e.log||{};
  if(e.bean&&(e.bean.name||e.bean.groundAge!==null)){
    var bb=[]; if(e.bean.name)bb.push(e.bean.name);
    if(e.bean.roastAge!==null&&e.bean.roastAge!==undefined)bb.push('roasted '+(e.bean.roasted?fmtDay(e.bean.roasted)+' ':'')+'('+e.bean.roastAge+' days before this brew)');
    if(e.bean.groundAge!==null&&e.bean.groundAge!==undefined)bb.push(e.bean.groundAgeEst?'ground about '+e.bean.groundAge+' days before (estimated from the roast date)':'ground '+(e.bean.ground?fmtDay(e.bean.ground)+' ':'')+'('+e.bean.groundAge+' days before)');
    if(e.bean.pre)bb.push('pre-ground');
    if(e.bean.grind)bb.push(e.bean.grind);
    h+='<p class="note" style="margin:16px 0 0;color:var(--steel)">'+esc(bb.join(' \u00B7 '))+'</p>';
  }
  h+='<p class="note" style="margin:8px 0 0">'+(RECIPES[e.recipe||'black']?RECIPES[e.recipe||'black'].name:'Black')+' \u00B7 '+c.dose+' g into '+c.press+' g \u00B7 decant target '+c.decant+' g'
   +(l.decant?', reached '+l.decant+' g':'')
   +' \u00B7 water '+e.params.temp+'\u00B0C'+(e.params.loc?' \u00B7 '+esc(e.params.loc):'')+(e.params.paper?' \u00B7 through a paper filter'+(e.params.pfrom==='press'?', straight from the press':e.params.pfrom==='decanter'?', from the decanter':''):'')+(e.params.ice?' \u00B7 '+(e.params.ice==='other'?'other ice':'RO + Vedica ice'):'')
   +(l.jug!==undefined&&l.jug!==null?' \u00B7 jug '+l.jug+'\u00B0C':'')
   +(l.temp?' \u00B7 cup '+l.temp+'\u00B0C':'')+'</p>';
  if(l.tastes&&l.tastes.length)h+='<p class="note tasted" style="margin:8px 0 0">Tasted '+esc(l.tastes.join(', ').toLowerCase())+'</p>';
  if(l.faults&&l.faults.length)h+='<p class="note" style="margin:8px 0 0;color:var(--stop)">'+esc(l.faults.join(', '))+'</p>';
  if(l.note)h+='<p class="note" style="margin:8px 0 0;color:var(--steel)">'+esc(l.note)+'</p>';
  var mine=!e._by||e._by===WHO.id;
  var cf=(e.test||!mine)?null:cafOf(e.calc,l.decant,l.share);
  if(cf)h+='<p class="note" style="margin:8px 0 0">Caffeine ≈ '+r5(cf.mid)+' mg for you'+shareNote(l)+'</p>';
  h+=sharedHTML(e);
  if(e.edited)h+='<p class="edited">Edited '+fmtWhen(e.edited)+'</p>';
  if(editing)h+=editForm(e);
  else if(logView==='all')h+='<div class="eacts"><button class="ghost" data-copy="'+e.id+'">Copy this brew</button></div>';
  else h+='<div class="eacts">'+(e.pending?'<button class="ghost" data-score="'+e.id+'">Score it</button>':'')+'<button class="ghost" data-copy="'+e.id+'">Copy this brew</button>'
    +'<button class="ghost" data-edit="'+e.id+'">Edit</button>'
    +'<button class="ghost del" data-del="'+e.id+'">'+(e.ref?'Remove':'Delete')+'</button></div>';
  return h;
}
/* who else drank a shared carafe, and what they thought */
function sharedHTML(e){
  var owner=e._by||WHO.id, h='', P='<p class="note shared">';
  if(e.ref){
    var rb=refBrew(e), rl=(rb&&rb.log)||{};
    h+=P+'Brewed by <b>'+esc(nameOf(e.ref.who))+'</b>'+(rl.score?', who scored it '+fmtScore(rl.score)+'/5':'')+'.</p>';
  }
  (e.with||[]).forEach(function(pid){
    var c=cupOf(pid,owner,e.id), you=pid===WHO.id, nm=you?'You':nameOf(pid);
    if(!c)h+=P+esc(nm)+(you?' haven’t':' hasn’t')+' scored '+(you?'your':'their')+' cup yet.</p>';
    else if(c.skipped)h+=P+esc(nm)+' didn’t have any.</p>';
    else{
      var cl=c.log||{}, bits=[];
      bits.push(cl.score?fmtScore(cl.score)+'/5':'not scored yet');
      if(cl.tastes&&cl.tastes.length)bits.push(cl.tastes.join(', ').toLowerCase());
      if(cl.faults&&cl.faults.length)bits.push(cl.faults.join(', '));
      if(cl.drank)bits.push(cl.drank+' g');
      h+=P+'<b>'+esc(nm)+'</b>: '+esc(bits.join(' · '))+(cl.note?'<br>“'+esc(cl.note)+'”':'')+'</p>';
    }
  });
  return h;
}
function esc(v){return String(v===null||v===undefined?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function fmtWhen(iso){var d=new Date(iso);return d.toLocaleDateString(undefined,{day:'numeric',month:'short'})+' '+d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}
function findEntry(id){var en=null;viewArr().forEach(function(x){if(String(x.id)===String(id))en=x});return en}
function expand(id){var w=$('dt-'+id),en=findEntry(id);if(!w||!en)return;w.innerHTML=entryDetail(en,false);w.classList.remove('hide')}

var ED=null;
function editForm(e){
  var l=e.log||{}, cup=!!e.ref;
  ED={id:e.id,score:l.score||0,faults:{},tastes:{},share:(l.share!==undefined&&l.share!==null)?l.share:1,total:drinkTotal(e),with:{}};
  (l.faults||[]).forEach(function(f){ED.faults[f]=1});
  (l.tastes||[]).forEach(function(f){ED.tastes[f]=1});
  (e.with||[]).forEach(function(pid){ED.with[pid]=1});
  return '<div class="edit">'
    +(cup?'':'<label class="lab" for="ed-wt">Water &deg;C</label>'+stpH('ed-wt',e.params&&e.params.temp,0.5,60,100,'','water temperature',S.temp))
    +'<label class="lab" for="ed-ct">Cup &deg;C at first sip</label>'+stpH('ed-ct',l.temp,1,0,95,'not taken','cup temperature',e.recipe==='iced'?6:58)
    +((e.recipe==='iced'&&!cup)?'<label class="lab" for="ed-jg">Jug &deg;C after stirring</label>'+stpH('ed-jg',l.jug,0.5,0,40,'not taken','jug temperature',8):'')
    +(cup?'':'<label class="lab" for="ed-dc">Grams actually decanted</label>'+stpH('ed-dc',l.decant,1,0,900,'','grams decanted',e.calc&&e.calc.decant))
    +'<label class="lab" for="ed-fine">Overall <span class="sval" id="ed-val"></span></label><div class="scale" id="ed-sc" role="group" aria-label="Score">'
    +[1,2,3,4,5].map(function(v){return '<button data-esc="'+v+'" aria-pressed="false">'+v+'</button>'}).join('')+'</div>'
    +'<div class="fine"><input type="range" id="ed-fine" min="1" max="5" step="0.1" value="3"><span class="fh">slide to fine-tune</span></div>'
    +((e.test||cup||!othersList().length)?'':'<label class="lab">Shared this carafe with</label><div class="chips" id="ed-with"></div>')
    +(e.test?'':'<label class="lab">How much of this brew did you drink</label><div class="chips" id="ed-sh"></div>'
      +'<label class="sr" for="ed-drank">Grams you drank</label>'+stpH('ed-drank',null,5,0,drinkTotal(e)||null,'grams','grams you drank',null)
      +'<p class="stp-sub">grams you drank, of the '+drinkTotal(e)+' g brew</p>')
    +'<label class="lab">What you tasted</label><div class="chips" id="ed-ts"></div>'
    +'<label class="lab">Anything off</label><div class="chips" id="ed-fl"></div>'
    +'<label class="lab" for="ed-nt">Notes</label><textarea id="ed-nt" class="tin" rows="4">'+esc(l.note)+'</textarea>'
    +(cup?'':'<details class="stepedit"><summary>Fix a step time</summary>'+stepEditHTML(e,'es')+'</details>')
    +'<div class="edacts"><button class="flat" data-ecancel="'+e.id+'">Cancel</button><button class="go" data-esave="'+e.id+'">Save changes</button></div>'
    +'</div>';
}
function edPaint(){
  if(!ED)return;
  var sc=$('ed-sc'),fl=$('ed-fl'),shb=$('ed-sh');
  if(shb){
    syncChips(shb,SHARES.map(function(x){return x[0]}),'esh',shareLabel,function(v){return Math.abs(ED.share-v)<0.01});
    if(document.activeElement!==$('ed-drank'))$('ed-drank').value=ED.total?Math.round(ED.share*ED.total):'';
  }
  if($('ed-val'))$('ed-val').textContent=ED.score?fmtScore(ED.score)+' / 5':'not scored';
  if($('ed-fine')&&document.activeElement!==$('ed-fine'))$('ed-fine').value=ED.score||3;
  if(sc)Array.prototype.forEach.call(sc.children,function(b){b.setAttribute('aria-pressed',String(ED.score>0&&Number(b.dataset.esc)===Math.round(ED.score)))});
  var ts=$('ed-ts');
  if(ts){
    var allT=TASTES.slice(); for(var t in ED.tastes)if(allT.indexOf(t)<0)allT.push(t);
    syncChips(ts,allT,'et',String,function(f){return ED.tastes[f]});
  }
  if(fl){
    var all=FAULTS.slice(); for(var f in ED.faults)if(all.indexOf(f)<0)all.push(f);
    syncChips(fl,all,'ef',String,function(f){return ED.faults[f]});
  }
  var ew=$('ed-with');
  if(ew)syncChips(ew,othersList().map(function(p){return p.id}),'ewp',nameOf,function(pid){return ED.with[pid]});
}
function openEdit(id){
  if(ED&&String(ED.id)!==String(id)){
    var pw=$('dt-'+ED.id);
    if(pw&&!pw.classList.contains('hide')){var pe=findEntry(ED.id);if(pe)pw.innerHTML=entryDetail(pe,false)}
  }
  var w=$('dt-'+id),en=findEntry(id); if(!w||!en)return;
  w.innerHTML=entryDetail(en,true); edPaint();
}
function saveEdit(id){
  var e=findEntry(id); if(!e||!ED)return;
  if(!e.log)e.log={}; if(!e.params)e.params={};
  var wtEl=$('ed-wt'), dcEl=$('ed-dc');
  var wt=wtEl?parseFloat(wtEl.value):NaN, ct=parseFloat($('ed-ct').value), dc=dcEl?parseFloat(dcEl.value):NaN;
  if(!isNaN(wt))e.params.temp=wt;
  e.log.temp=isNaN(ct)?null:ct;
  if(dcEl)e.log.decant=isNaN(dc)?null:Math.round(dc);
  if($('ed-with')){var w=Object.keys(ED.with).filter(function(pid){return othersList().some(function(p){return p.id===pid})});if(w.length)e.with=w;else delete e.with}
  if($('ed-jg')){var jg=parseFloat($('ed-jg').value);e.log.jug=isNaN(jg)?null:jg}
  e.log.score=ED.score||null;
  var fl=[]; FAULTS.forEach(function(f){if(ED.faults[f])fl.push(f)});
  for(var f in ED.faults)if(FAULTS.indexOf(f)<0)fl.push(f);
  e.log.faults=fl;
  var tl=[]; TASTES.forEach(function(t){if(ED.tastes[t])tl.push(t)});
  for(var t in ED.tastes)if(TASTES.indexOf(t)<0)tl.push(t);
  e.log.tastes=tl;
  e.log.note=$('ed-nt').value.trim();
  if(!e.test&&$('ed-sh')){e.log.share=Math.round(ED.share*1000)/1000;if(ED.total)e.log.drank=Math.round(ED.share*ED.total)}
  applyStepEdits(e,'es');
  e.edited=new Date().toISOString();
  if(logView==='test')saveT(); else{e.rev=Date.now();e.synced=false;saveL();pushPending()}
  ED=null; openLog(); expand(id);
}

function brewText(e){
  var d=new Date(e.at), l=e.log||{}, c=e.calc||{}, p=e.params||{}, b=e.bean||{};
  var rk=e.recipe||'black', rn=RECIPES[rk]?RECIPES[rk].name:'Black';
  var L=[];
  L.push((e.test?'Dry run ':'Brew ')+d.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})+' '
    +d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})+' \u00B7 '+rn+(rk==='black'?' ('+(e.mode||'direct')+')':'')
    +' \u00B7 score '+(l.score?fmtScore(l.score)+'/5':'none'));
  var bb=[];
  if(b.name)bb.push(b.name+(b.roaster?', '+b.roaster:''));
  if(b.roastAge!==null&&b.roastAge!==undefined)bb.push('roasted '+(b.roasted?b.roasted+' ':'')+'('+b.roastAge+' days before)');
  if(b.groundAge!==null&&b.groundAge!==undefined)bb.push(b.groundAgeEst?'ground about '+b.groundAge+' days before (estimated)':'ground '+(b.ground?b.ground+' ':'')+'('+b.groundAge+' days before)');
  if(b.pre)bb.push('pre-ground');
  if(b.grind)bb.push(b.grind);
  if(bb.length)L.push('Bean: '+bb.join(' \u00B7 '));
  var r=[c.dose+' g coffee',c.press+' g in the press'];
  if(c.ice)r.push(c.ice+' g ice');
  if(c.milk)r.push(c.milk+' g milk');
  if(c.cm)r.push(c.cm+' g condensed milk');
  r.push('target '+(p.tgt!==undefined?p.tgt:c.pour)+' g');
  if(p.ratio)r.push('1:'+p.ratio);
  if(rk==='black'&&e.mode==='bypass'&&p.pratio)r.push('press 1:'+p.pratio);
  if(p.temp!==undefined)r.push('water '+p.temp+'\u00B0C');
  if(p.loc)r.push(p.loc);
  if(p.ved!==undefined)r.push(p.ved+'% Vedica');
  if(p.ice)r.push(p.ice==='other'?'other ice':'RO + Vedica ice');
  r.push(p.paper?'filtered through paper'+(p.pfrom?' ('+(p.pfrom==='press'?'from the press':'from the decanter')+')':''):'mesh only');
  L.push('Recipe: '+r.join(' \u00B7 '));
  var res=['decanted '+(l.decant?l.decant+' g':'not logged')+' (target '+c.decant+' g)'];
  if(l.jug!==null&&l.jug!==undefined)res.push('jug '+l.jug+'\u00B0C after stirring');
  if(l.temp!==null&&l.temp!==undefined)res.push('cup '+l.temp+'\u00B0C');
  res.push('contact '+mmss(e.contact||0)); res.push('total '+mmss(e.total||0));
  L.push('Result: '+res.join(' \u00B7 '));
  L.push('Steps, actual (target):');
  (e.steps||[]).forEach(function(s){L.push('  '+s.t+' '+mmss(s.actual)+(s.target?' ('+mmss(s.target)+')':''))});
  var cft=e.test?null:cafOf(c,l.decant,l.share);
  if(cft)L.push('Caffeine: about '+r5(cft.mid)+' mg for me'+shareNote(l).replace('you drank','I drank').replace('your share','my share'));
  if(l.tastes&&l.tastes.length)L.push('Tasted: '+l.tastes.join(', '));
  L.push('Faults: '+(l.faults&&l.faults.length?l.faults.join(', '):'none'));
  if(l.note)L.push('Note: '+l.note);
  if(e.edited)L.push('Edited after brewing');
  return L.join('\n');
}
function copyText(t,btn,idle){
  function done(m){btn.textContent=m;setTimeout(function(){btn.textContent=idle},1600)}
  function fb(){
    try{
      var ta=document.createElement('textarea');ta.value=t;ta.style.position='fixed';ta.style.opacity='0';
      document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);done('Copied');
    }catch(e){done('Copy failed')}
  }
  try{
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t).then(function(){done('Copied')},fb);
    else fb();
  }catch(e){fb()}
}
function insights(){
  var box=$('log-insights');
  if(logView!=='real'){box.innerHTML='';return}
  var rn=RECIPES[S.recipe].name;
  var scored=baseArr().filter(sameRecipe).filter(function(e){return e.log&&e.log.score});
  if(scored.length<3){
    box.innerHTML='<div class="hl">Insights for <b>'+rn+'</b> need three scored brews. You have <b>'+scored.length+'</b>.</div>'+freshHTML();
    return;
  }
  var good=[],rest=[];
  scored.forEach(function(e){(e.log.score>=4?good:rest).push(e)});
  function pull(arr,f){var o=[];arr.forEach(function(e){var v=f(e);if(v!==null&&v!==undefined&&!isNaN(v))o.push(v)});return o}
  var metrics=[
    ['Contact time',function(e){return e.contact},function(v){return mmss(v)}],
    ['Water \u00B0C',function(e){return e.params&&e.params.temp},function(v){return v+'\u00B0'}],
    ['Cup \u00B0C',function(e){return e.log.temp},function(v){return (Math.round(v*10)/10)+'\u00B0'}],
    ['Days since grind',function(e){return e.bean&&e.bean.groundAge},function(v){return Math.round(v)+' d'}],
    ['Decant vs target',function(e){return (e.log.decant&&e.calc)?(e.log.decant-e.calc.decant):null},function(v){return signed2(v)}]
  ];
  var h='<div class="ins"><h2>What separates your '+rn.toLowerCase()+' cups</h2>';
  h+='<p class="cap">'+good.length+' scored 4\u20135, '+rest.length+' scored 1\u20133. Medians.'
    +(scored.length<10?' Under ten brews this is a hint, not a finding.':'')+'</p>';
  h+='<table><tr><th>Metric</th><th>Good</th><th>Rest</th></tr>';
  metrics.forEach(function(m){
    var g=med(pull(good,m[1])), r=med(pull(rest,m[1]));
    if(g===null&&r===null)return;
    h+='<tr><td>'+m[0]+'</td><td>'+(g===null?'\u2014':m[2](g))+'</td><td>'+(r===null?'\u2014':m[2](r))+'</td></tr>';
  });
  h+='</table>';

  function tally(arr){var c={},any=false;arr.forEach(function(e){(e.log.tastes||[]).forEach(function(t){c[t]=(c[t]||0)+1;any=true})});
    if(!any)return null;var o=[];for(var t in c)o.push([t,c[t]]);o.sort(function(a,b){return b[1]-a[1]});
    return o.map(function(x){return x[0]+' \u00D7'+x[1]}).join(', ')}
  var tg=tally(good),tr=tally(rest);
  if(tg||tr){
    h+='<h2>Flavours by score</h2><p class="cap">'+(tg?'In your 4\u20135 cups: '+tg+'. ':'')+(tr?'In the rest: '+tr+'.':'')+'</p>';
  }

  var spread={},names={};
  scored.forEach(function(e){
    e.steps.forEach(function(st){
      if(!st.target)return;
      var d=st.actual-st.target;
      if(!spread[st.k]){spread[st.k]=[];names[st.k]=st.t}
      spread[st.k].push(d);
    });
  });
  var worst=null;
  for(var k in spread){
    var a=spread[k]; if(a.length<2)continue;
    var rg=Math.max.apply(null,a)-Math.min.apply(null,a);
    if(!worst||rg>worst.rg)worst={k:k,rg:rg,a:a};
  }
  if(worst){
    h+='<h2>Least consistent step</h2><p class="cap"><b>'+names[worst.k]+'</b> swings '+Math.round(worst.rg)
      +'s across your brews, median drift '+signed(med(worst.a))+'. That is where a change is most likely to be accidental.</p>';
  }

  var fc={},n=0;
  baseArr().filter(sameRecipe).forEach(function(e){(e.log&&e.log.faults||[]).forEach(function(f){fc[f]=(fc[f]||0)+1;n++})});
  if(n){
    var fl=[]; for(var f in fc)fl.push([f,fc[f]]);
    fl.sort(function(a,b){return b[1]-a[1]});
    h+='<h2>Faults recorded</h2><p class="cap">'+fl.map(function(x){return x[0]+' \u00D7'+x[1]}).join(' \u00B7 ')+'</p>';
  }
  h+='</div>';
  box.innerHTML=h+freshHTML();
}
function signed2(v){v=Math.round(v);return (v>0?'+':v<0?'\u2212':'')+Math.abs(v)+' g'}

function openLog(v){
  if(v)logView=v;
  if(logView==='all'&&!multi())logView='real';
  ED=null;
  $('log-err').classList.toggle('hide',!saveFail);
  paintBeans(); paintSync();
  var arr=baseArr(), isT=logView==='test', isA=logView==='all';
  $('lv-real').setAttribute('aria-pressed',String(logView==='real'));
  $('lv-test').setAttribute('aria-pressed',String(isT));
  $('lv-all').setAttribute('aria-pressed',String(isA));
  $('lv-real').textContent=multi()?'Mine':'Brews';
  $('lv-all').classList.toggle('hide',!multi());
  $('log-seg').classList.toggle('three',multi());
  $('log-clear').classList.toggle('hide',!(isT&&TLOG.length));
  var list=$('log-list'), stats=$('log-stats');
  if(!arr.length){
    stats.innerHTML='';
    insights();
    list.innerHTML=isT
      ?'<p class="empty">No dry runs yet. Use the dry run button on the recipe screen to walk the whole flow in about a minute \u2014 timers sped up (set the speed under Calibration), and nothing lands in your real log.</p>'
      :isA?'<p class="empty">No brews from anyone yet.</p>'
      :'<p class="empty">No brews logged yet. Run a brew and the timings record themselves \u2014 then add the cup temperature and how it tasted at the end.</p>';
    $('log-copy').classList.add('hide');
    show('sc-log'); return;
  }
  insights();
  var b=bestBrew(arr), scored=arr.filter(function(e){return e.log&&e.log.score});
  var avg=scored.length?scored.reduce(function(a,e){return a+e.log.score},0)/scored.length:0;
  var h='<div class="hl"><b>'+arr.length+'</b> '+(isT?'dry run':'brew')+(arr.length>1?'s':'')+(isA?' by everyone':' logged');
  if(scored.length)h+=' \u00B7 average score <b>'+avg.toFixed(1)+'</b>';
  if(b&&b.contact)h+='<br>Best scored <b>'+fmtScore(b.log.score)+'</b> with a contact time of <b>'+mmss(b.contact)+'</b>';
  /* once some brews went through paper: how they score against mesh only */
  var pp=scored.filter(function(e){return e.params&&e.params.paper}), mm=scored.filter(function(e){return !(e.params&&e.params.paper)});
  if(pp.length&&!isT){var av=function(a){return (a.reduce(function(x,e){return x+e.log.score},0)/a.length).toFixed(1)};
    h+='<br>Through paper <b>'+av(pp)+'</b> over '+pp.length+(mm.length?' \u00B7 mesh only <b>'+av(mm)+'</b> over '+mm.length:'');
    var fpp=pp.filter(function(e){return e.params.pfrom==='press'}), fjj=pp.filter(function(e){return e.params.pfrom==='decanter'});
    if(fpp.length&&fjj.length)h+='<br>Paper from the press <b>'+av(fpp)+'</b> over '+fpp.length+' \u00B7 from the decanter <b>'+av(fjj)+'</b> over '+fjj.length;}
  h+='</div>';
  stats.innerHTML=h;
  list.innerHTML=arr.map(function(e){
    var d=new Date(e.at), l=e.log||{};
    var ds=d.toLocaleDateString(undefined,{day:'numeric',month:'short'})+' '+d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
    var by=isA?' \u00B7 '+esc(nameOf(e._by)):e.ref?' \u00B7 '+esc(nameOf(e.ref.who))+'\u2019s brew':(e.with&&e.with.length?' \u00B7 shared':'');
    return '<button class="entry" data-id="'+e.id+'">'
      +'<span class="l1"><span class="d">'+ds+'</span><span class="sc">'+(l.score?fmtScore(l.score)+'/5':(e.pending?'Not scored':''))+'</span></span>'
      +'<span class="l2">'+rname(e)+(e.params&&e.params.vmode?' ('+e.params.vmode+')':'')+(e.params&&e.params.paper?' \u00B7 paper':'')+(e.params&&e.params.ice==='other'?' \u00B7 other ice':'')+by+' \u00B7 '+e.calc.dose+' g \u00B7 contact '+mmss(e.contact||0)+(l.temp?' \u00B7 cup '+l.temp+'\u00B0C':'')+'</span></button>'
      +'<div class="detwrap hide" id="dt-'+e.id+'"></div>';
  }).join('');
  $('log-copy').classList.toggle('hide',isA);
  show('sc-log');
}
$('log-list').addEventListener('input',function(e){if(e.target.id==='ed-drank'&&ED){var g=parseFloat(e.target.value);if(ED.total>0&&g>=0){ED.share=Math.min(1,g/ED.total);edPaint()}return}if(e.target.id==='ed-fine'&&ED){ED.score=Math.round(parseFloat(e.target.value)*10)/10;edPaint()}});
$('log-list').addEventListener('click',function(e){
  var x;
  if((x=e.target.closest('[data-score]'))){openReview(x.dataset.score,'',false);return}
  if((x=e.target.closest('[data-copy]'))){var ce=findEntry(x.dataset.copy);if(ce)copyText(brewText(ce),x,'Copy this brew');return}
  if((x=e.target.closest('[data-edit]'))){openEdit(x.dataset.edit);return}
  if((x=e.target.closest('[data-esh]'))){if(ED){ED.share=parseFloat(x.dataset.esh);edPaint()}return}
  if((x=e.target.closest('[data-esc]'))){if(ED){ED.score=Number(x.dataset.esc);edPaint()}return}
  if((x=e.target.closest('[data-et]'))){if(ED){var et=x.dataset.et;if(ED.tastes[et])delete ED.tastes[et];else ED.tastes[et]=1;edPaint()}return}
  if((x=e.target.closest('[data-ef]'))){if(ED){var ef=x.dataset.ef;if(ED.faults[ef])delete ED.faults[ef];else ED.faults[ef]=1;edPaint()}return}
  if((x=e.target.closest('[data-ewp]'))){if(ED){var wp=x.dataset.ewp;if(ED.with[wp])delete ED.with[wp];else ED.with[wp]=1;edPaint()}return}
  if((x=e.target.closest('[data-ecancel]'))){ED=null;expand(x.dataset.ecancel);return}
  if((x=e.target.closest('[data-esave]'))){saveEdit(x.dataset.esave);return}
  var del=e.target.closest('[data-del]');
  if(del){
    if(!del.hasAttribute('data-armed')){
      del.setAttribute('data-armed','1');del.textContent='Tap again to delete';
      setTimeout(function(){if(document.body.contains(del)){del.removeAttribute('data-armed');del.textContent='Delete'}},4000);
      return;
    }
    deleteEntry(del.dataset.del,logView==='test');
    refreshAll(); openLog(); return;
  }
  var btn=e.target.closest('.entry'); if(!btn)return;
  var id=btn.dataset.id, w=$('dt-'+id);
  if(!w)return;
  if(w.classList.contains('hide'))expand(id);
  else{if(ED&&String(ED.id)===String(id))ED=null;w.classList.add('hide')}
});
$('log-copy').addEventListener('click',function(){copyText(JSON.stringify(viewArr().map(cleanForDb),null,2),this,'Copy all as JSON')});

$('rs-go').addEventListener('click',function(){
  var msg=$('rs-msg'), raw=$('rs-text').value.trim();
  function say(m){msg.textContent=m;msg.classList.remove('hide')}
  if(!raw){say('Paste the backup text first.');return}
  var data;
  try{data=JSON.parse(raw)}catch(err){say('That isn\u2019t a complete backup. Tap Copy all as JSON again and paste the whole text, from the first [ to the last ].');return}
  if(!Array.isArray(data))data=[data];
  var added=0,skipped=0,bad=0;
  data.forEach(function(en){
    if(!en||typeof en!=='object'||en.id===undefined||!en.at||!Array.isArray(en.steps)||!en.calc){bad++;return}
    var arr=en.test?TLOG:LOG;
    if(arr.some(function(y){return String(y.id)===String(en.id)})){skipped++;return}
    delete en.synced; normalize(en);
    if(!en.test){DEL=DEL.filter(function(d){return d!==String(en.id)});saveDel()}
    arr.push(en);added++;
  });
  LOG.sort(byDate);TLOG.sort(byDate);
  if(added){saveL();saveT();pushPending()}
  $('rs-text').value='';
  openLog();
  var parts=[];
  parts.push(added?'Added '+added+' brew'+(added>1?'s':'')+'.':'Nothing new to add.');
  if(skipped)parts.push(skipped+' '+(skipped>1?'were':'was')+' already in the log.');
  if(bad)parts.push(bad+' '+(bad>1?'entries weren\u2019t':'entry wasn\u2019t')+' a brew and got skipped.');
  say(parts.join(' '));
});

$('pause').addEventListener('click',function(){
  var now=Date.now();
  if(left<=0){tBase=0;tStart=now;left=dur;running=true;this.textContent='Pause';cueDone={};cueQuiet=true;paintWait()}
  else if(running){tBase+=((now-tStart)/1000)*speed;running=false;this.textContent='Resume'}
  else{tStart=now;running=true;this.textContent='Pause'}
  ctx();loop();saveRun();
});
$('next').addEventListener('click',function(){
  leaveStep();
  if(idx<steps.length-1)go(idx+1); else finishBrew();
});
function twoTap(b,armedHtml,idleHtml,act){
  if(!b.hasAttribute('data-armed')){
    b.setAttribute('data-armed','1');b.innerHTML=armedHtml;
    setTimeout(function(){if(b.hasAttribute('data-armed')){b.removeAttribute('data-armed');b.innerHTML=idleHtml}},4000);
    return;
  }
  b.removeAttribute('data-armed');b.innerHTML=idleHtml;act();
}
$('abandon').addEventListener('click',function(){
  function stop(){endTimers();clearRun();steps=[];refreshAll();show('sc-recipe')}
  if(testMode){stop();return}
  twoTap(this,'Tap again to stop','&larr; Stop',stop);
});
$('start').addEventListener('click',function(){startBrew(false)});
$('dry').addEventListener('click',function(){startBrew(true)});
$('lv-real').addEventListener('click',function(){openLog('real')});
$('lv-test').addEventListener('click',function(){openLog('test')});
$('lv-all').addEventListener('click',function(){openLog('all')});
$('who-sw').addEventListener('click',function(){whoOpen=!whoOpen;paintWho()});
$('who-pick').addEventListener('click',function(e){var b=e.target.closest('[data-who]');if(b)switchTo(b.dataset.who)});
window.addEventListener('brew:people',function(){subOthers();paintWho();paintBanners();relogIfVisible()});
$('log-beans').addEventListener('click',function(e){
  var b=e.target.closest('button'); if(!b)return;
  beanFilter=b.dataset.bk==='*'?null:b.dataset.bk; openLog();
});
$('log-clear').addEventListener('click',function(){TLOG=[];saveT();openLog('test')});
$('skip').addEventListener('click',function(){
  function drop(){
    if(RV){
      clearTimeout(draftT); clearDraft(RV.id);
      deleteEntry(RV.id,RV.test);
      if(lastAuto&&String(lastAuto.brewId)===String(RV.id)){var pa=packById(lastAuto.packId);if(pa){pa.status='open';delete pa.finishedAt;PK.active=lastAuto.prev||pa.id;PK.rev=Date.now();savePK();pushPacks()}}
    }
    RV=null; lastAuto=null; refreshAll(); show('sc-recipe');
  }
  if(RV&&RV.test){drop();return}
  twoTap(this,RV&&RV.cup?'Tap again to confirm':'Tap again to discard',skipLabel(),drop);
});
$('later').addEventListener('click',function(){RV=null;lastAuto=null;refreshAll();show('sc-recipe')});
$('rv-save').addEventListener('click',saveReview);
$('open-log').addEventListener('click',function(){openLog(logView)});
$('log-back').addEventListener('click',function(){show('sc-recipe')});
window.addEventListener('pagehide',function(){if(tid)saveRun()});
document.addEventListener('visibilitychange',function(){
  if(document.hidden){if(tid)saveRun();return}
  if(tid){loop();lock()}
  syncResume();
});

if(S.theme)document.documentElement.setAttribute('data-theme',S.theme);
$('theme').addEventListener('click',function(){
  var cur=document.documentElement.getAttribute('data-theme');
  var dark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;
  var next=cur?(cur==='dark'?'light':''):(dark?'light':'dark');
  if(next)document.documentElement.setAttribute('data-theme',next); else document.documentElement.removeAttribute('data-theme');
  S.theme=next; saveS(); try{localStorage.setItem('fp.theme.v1',next)}catch(e){}
});
$('pack-edit').addEventListener('click',function(){openPackForm('edit')});
$('pack-new').addEventListener('click',function(){openPackForm('new')});
$('pf-cancel').addEventListener('click',closePackForm);
$('p-size').addEventListener('input',function(){if(!$('p-left').value)$('p-left').setAttribute('data-def',String(parseFloat(this.value)||250))});
$('pf-save').addEventListener('click',savePackForm);
$('pack-done').addEventListener('click',function(){
  twoTap(this,'Tap again to finish it','Mark finished',function(){
    var p=activePack(); if(!p)return;
    p.status='finished'; p.finishedAt=todayStr();
    var op=openPacks(); PK.active=op.length?op[op.length-1].id:null;
    touchPK();
  });
});
$('pack-pick').addEventListener('click',function(e){var b=e.target.closest('[data-pk]');if(!b)return;PK.active=b.dataset.pk;touchPK()});
$('pack-old-list').addEventListener('click',function(e){
  var b=e.target.closest('[data-reopen]'); if(!b)return;
  var p=packById(b.dataset.reopen); if(!p)return;
  p.status='open'; delete p.finishedAt; PK.active=p.id; touchPK();
});
$('banners').addEventListener('click',function(e){
  var b=e.target.closest('button'); if(!b)return;
  if(b.dataset.run==='resume'){var r=readRun();if(r)resumeRun(r);else paintBanners();return}
  if(b.dataset.run==='drop'){twoTap(b,'Tap again to discard','Discard',function(){clearRun();paintBanners()});return}
  if(b.dataset.pend){openReview(b.dataset.pend,'',false);return}
  if(b.dataset.cup){var cp=b.dataset.cup.split('|'),ce=makeCup(cp[0],cp[1],false);if(ce){refreshAll();openReview(ce.id,'',false)}return}
  if(b.dataset.cupskip){var cs=b.dataset.cupskip.split('|');twoTap(b,'Tap again to confirm','Didn’t have any',function(){makeCup(cs[0],cs[1],true);refreshAll()});return}
  if(b.dataset.nudge){try{localStorage.setItem('fp.nudge.'+b.dataset.nudge,todayStr())}catch(err){}paintBanners();return}
});
['pratio','ved','ceil','temp','panloss','dspeed','lead'].forEach(function(id){
  $(id).value=S[id];
  $(id).addEventListener('input',function(){S[id]=parseFloat(this.value);saveS();locEdit(id);render();paintDry();paintBanners()});
});
$('loc-pick').addEventListener('click',function(e){
  var b=e.target.closest('[data-loc]'); if(!b)return;
  if(b.dataset.loc==='+'){$('loc-add').classList.remove('hide');$('loc-name').value='';$('loc-name').focus();return}
  setLoc(b.dataset.loc);
});
$('loc-cancel').addEventListener('click',function(){$('loc-add').classList.add('hide')});
$('loc-save').addEventListener('click',function(){
  var n=$('loc-name').value.trim(); if(!n)return;
  var np={id:'loc'+Date.now(),name:n}; LOCF.forEach(function(k){np[k]=S[k]});
  PK.profiles=(PK.profiles||[]).concat([np]); PK.loc=np.id;
  $('loc-add').classList.add('hide'); touchPK(); paintLoc();
});
$('caf').addEventListener('click',function(e){
  var b=e.target.closest('button'); if(!b)return;
  if(b.dataset.xmenu){cafMenu=!cafMenu;paintCaf();return}
  if(b.dataset.xdel){PK.extras=(PK.extras||[]).filter(function(x){return x.id!==b.dataset.xdel});touchPK();return}
  if(b.dataset.xadd!==undefined){
    if(b.dataset.xadd==='c'){var mg=parseFloat(($('caf-mg')||{}).value);addExtra('Other',mg);return}
    var x=EXTRAS[Number(b.dataset.xadd)]; if(x)addExtra(x[0],x[1]);
  }
});
$('best').addEventListener('click',function(ev){
  if(!ev.target.closest('#best-use'))return;
  var e=bestForPack(); if(!e)return; var p=e.params||{};
  if((e.recipe||'black')==='viet'){
    if(p.vmode)S.vmode=p.vmode;
    if(p.tgt)rs().tgt=p.vmode?p.tgt:Math.round(p.tgt*(S.vmode==='hot'?1.27:2.63)/5)*5;
  } else if(p.tgt)rs().tgt=p.tgt;
  if(p.ratio)rs().ratio=p.ratio;
  if(p.paper)rs().paper=true; else delete rs().paper;
  if(p.pfrom==='press')rs().pflow='press'; else delete rs().pflow;
  if((e.recipe||'black')==='black'){S.mode=e.mode||'direct';if(p.pratio){S.pratio=p.pratio;$('pratio').value=p.pratio}}
  saveS(); syncRecipeInputs(); setMode(S.mode);
});
$('log-insights').addEventListener('click',function(e){
  var fm=e.target.closest('[data-fm]'); if(fm){freshMode=fm.dataset.fm;insights();return}
  var hit=e.target.closest('[data-fi]'); if(hit){freshTip(Number(hit.dataset.fi));return}
  freshTipOff();
});
$('log-insights').addEventListener('mouseover',function(e){var hit=e.target.closest('[data-fi]');if(hit)freshTip(Number(hit.dataset.fi))});
$('log-insights').addEventListener('mouseout',function(e){if(e.target.closest('[data-fi]'))freshTipOff()});
$('log-insights').addEventListener('focusin',function(e){var hit=e.target.closest('[data-fi]');if(hit)freshTip(Number(hit.dataset.fi))});
$('log-insights').addEventListener('focusout',freshTipOff);
paintDry();
$('tgt').addEventListener('input',function(){rs().tgt=parseFloat(this.value);saveS();render()});
$('ratio').addEventListener('input',function(){rs().ratio=parseFloat(this.value);saveS();render()});
function syncRecipeInputs(){$('tgt').value=rs().tgt;$('ratio').value=rs().ratio}
function paintPicker(){
  $('rpick').innerHTML=Object.keys(RECIPES).map(function(k){
    return '<button data-r="'+k+'" aria-pressed="'+(k===S.recipe)+'">'+RECIPES[k].name+'</button>';
  }).join('');
}
$('rpick').addEventListener('click',function(e){
  var b=e.target.closest('button'); if(!b)return;
  S.recipe=b.dataset.r; saveS(); paintPicker(); syncRecipeInputs(); render();
});
paintPicker(); syncRecipeInputs();
function setMode(m){
  S.mode=m; saveS();
  $('m-direct').setAttribute('aria-pressed',String(m==='direct'));
  $('m-bypass').setAttribute('aria-pressed',String(m==='bypass'));
  render();
}
$('m-direct').addEventListener('click',function(){setMode('direct')});
function setV(m){S.vmode=m;saveS();syncRecipeInputs();render()}
$('v-hot').addEventListener('click',function(){setV('hot')});
$('v-iced').addEventListener('click',function(){setV('iced')});
$('m-bypass').addEventListener('click',function(){setMode('bypass')});
/* paper filter, remembered per recipe */
function setPaper(on){if(on)rs().paper=true;else delete rs().paper;saveS();render()}
$('f-mesh').addEventListener('click',function(){setPaper(false)});
$('f-paper').addEventListener('click',function(){setPaper(true)});
function setPflow(v){if(v==='press')rs().pflow='press';else delete rs().pflow;saveS();render()}
$('pw-press').addEventListener('click',function(){setPflow('press')});
$('pw-jug').addEventListener('click',function(){setPflow('jug')});
/* the dilution ice, remembered per recipe: frozen from the brew water blend, or other ice */
function setIce(v){if(v==='other')rs().ice='other';else delete rs().ice;saveS();render()}
$('ice-blend').addEventListener('click',function(){setIce('blend')});
$('ice-other').addEventListener('click',function(){setIce('other')});
paintLoc();
setMode(S.mode);
paintBanners();



/* ---------- steppers ---------- */
function stpH(id,val,step,mn,mx,ph,lab,def){
  return '<div class="stp"><button type="button" class="sb" data-st="'+id+'" data-d="-'+step+'" aria-label="Lower '+lab+'">\u2212</button>'
    +'<input type="number" id="'+id+'" class="tin sv" inputmode="decimal" enterkeyhint="done"'+(mn!==null&&mn!==undefined?' min="'+mn+'"':'')+(mx!==null&&mx!==undefined?' max="'+mx+'"':'')
    +' step="'+step+'" value="'+esc(val===null||val===undefined?'':val)+'" placeholder="'+esc(ph||'')+'"'+(def!==null&&def!==undefined&&def!==''?' data-def="'+esc(def)+'"':'')+'>'
    +'<button type="button" class="sb" data-st="'+id+'" data-d="'+step+'" aria-label="Raise '+lab+'">+</button></div>';
}
function stepVal(id,d){
  var el=$(id); if(!el)return;
  if(el.getAttribute('data-fmt')==='ms'){var cs=parseMS(el.value);if(cs===null)cs=0;el.value=mmss(Math.max(0,Math.min(7200,cs+d)));el.dispatchEvent(new Event('input',{bubbles:true}));return}
  var mn=parseFloat(el.min), mx=parseFloat(el.max), v=parseFloat(el.value);
  if(isNaN(v)){v=parseFloat(el.getAttribute('data-def'));if(isNaN(v))v=isNaN(mn)?0:mn}
  else v=v+d;
  if(!isNaN(mn))v=Math.max(mn,v); if(!isNaN(mx))v=Math.min(mx,v);
  el.value=String(Math.round(v*10)/10);
  el.dispatchEvent(new Event('input',{bubbles:true}));
}
var SP=null, spSkip=0;
function endSP(){if(!SP)return;clearTimeout(SP.t);clearInterval(SP.i);if(SP.held)spSkip=Date.now();SP=null}
document.addEventListener('pointerdown',function(e){
  var b=e.target&&e.target.closest&&e.target.closest('.sb'); if(!b)return;
  endSP(); spSkip=0; var sp={b:b,x:e.clientX,y:e.clientY,held:false,n:0}; SP=sp;
  sp.t=setTimeout(function(){
    if(SP!==sp)return; sp.held=true; var d=parseFloat(b.dataset.d); stepVal(b.dataset.st,d);
    sp.i=setInterval(function(){if(SP!==sp)return;sp.n++;stepVal(b.dataset.st,d*(sp.n>24?10:sp.n>10?4:1))},110);
  },450);
},true);
document.addEventListener('pointermove',function(e){if(SP&&!SP.held&&(Math.abs(e.clientX-SP.x)>8||Math.abs(e.clientY-SP.y)>8))endSP()},true);
document.addEventListener('pointerup',endSP,true);
document.addEventListener('pointercancel',endSP,true);
document.addEventListener('contextmenu',function(e){if(e.target&&e.target.closest&&e.target.closest('.sb'))e.preventDefault()},true);
document.addEventListener('click',function(e){
  var b=e.target&&e.target.closest&&e.target.closest('.sb'); if(!b)return;
  if(spSkip&&Date.now()-spSkip<800){spSkip=0;return}
  stepVal(b.dataset.st,parseFloat(b.dataset.d));
},true);
window.addEventListener('resize',function(){setTimeout(function(){if(typeof resyncView==='function')resyncView()},150)});

/* ---------- interaction guard: repaints from sync wait until the finger is off the glass ---------- */
var UI={t:0,down:false,q:{},timer:null};
function uiMark(){UI.t=Date.now()}
document.addEventListener('touchstart',function(e){UI.down=true;uiMark();if(!(e.target&&e.target.closest&&e.target.closest('#fchart')))freshTipOff()},{passive:true,capture:true});
document.addEventListener('touchend',function(){UI.down=false;uiMark()},{passive:true,capture:true});
document.addEventListener('touchcancel',function(){UI.down=false;uiMark()},{passive:true,capture:true});
document.addEventListener('pointerdown',uiMark,{passive:true,capture:true});
window.addEventListener('scroll',function(){uiMark();var t=$('ftip');if(t&&!t.classList.contains('hide'))freshTipOff()},{passive:true});
/* after the editor closes, nudge the scroll position so the browser re-syncs where things are on screen */
function resyncView(){var x=window.scrollX,y=window.scrollY;window.scrollTo(x,y+1);window.scrollTo(x,y)}
function uiBusy(){
  var quiet=Date.now()-UI.t;
  if(quiet>4000)UI.down=false;
  var a=document.activeElement, typing=a&&(a.tagName==='INPUT'||a.tagName==='TEXTAREA')&&a.type!=='range'&&a.type!=='checkbox';
  return UI.down||quiet<700||(typing&&quiet<20000);
}
function whenIdle(key,fn){
  UI.q[key]=fn; if(UI.timer)return;
  (function tick(){
    if(uiBusy()){UI.timer=setTimeout(tick,300);return}
    UI.timer=null; var q=UI.q; UI.q={}; for(var k in q){try{q[k]()}catch(err){}}
  })();
}

/* ---------- to try: a shopping list of coffees, synced inside the packs document ---------- */
var SEEDV=1, TRY_SEED=[{"id": "sb-pearl-omni", "g": "now", "n": "Project Pearl, Ratnagiri — Naturals + Anaerobic Honey", "b": "Project Pearl Omni", "r": "Subko", "p": "₹995 · 250 g", "ro": "Medium (Omni)", "notes": "Raw mango, blossom honey, hazelnut", "w": "Online. No Subko café in Delhi; the Bangalore one is in Indiranagar.", "tag": "Start here", "url": "https://www.subko.coffee/products/project-pearl-ratnagiri-estate-karnataka-naturals-anaerobic-honey-omni-roast"}, {"id": "bt-kalledevarapura", "g": "now", "n": "Kalledevarapura, Pulp Sun Dried", "b": "Kalledevarapura", "r": "Blue Tokai", "p": "₹800 · 250 g", "ro": "", "notes": "Brown sugar, roasted almond, raisin — the closest to Selection", "w": "A Blue Tokai café if they have it, ground on the spot. Check the roast date.", "url": "https://bluetokaicoffee.com/collections/roasted-and-ground-coffee-beans"}, {"id": "bt-amaltas", "g": "now", "n": "Amaltas Blend", "b": "Amaltas", "r": "Blue Tokai", "p": "₹700 · 250 g", "ro": "", "notes": "Blueberry, milk chocolate", "w": "Café or online.", "url": "https://bluetokaicoffee.com/collections/roasted-and-ground-coffee-beans"}, {"id": "bt-ms-estate", "g": "now", "n": "M.S. Estate", "b": "M.S. Estate", "r": "Blue Tokai", "p": "₹800 · 250 g", "ro": "Roast not listed", "notes": "Orange marmalade, dried date, Earl Grey — tests whether floral works when fruit leads", "w": "Café or online.", "url": "https://bluetokaicoffee.com/collections/roasted-and-ground-coffee-beans"}, {"id": "gs-raspberry-loop", "g": "now", "n": "Raspberry in Loop", "b": "Raspberry in Loop", "r": "Grey Soul", "p": "", "ro": "Medium · anaerobic", "notes": "Raspberry, pineapple, prune, milk chocolate; heavy body", "w": "Grey Soul’s own shop. It is on Blinkit too, but quick-commerce stock can be weeks old."}, {"id": "gs-jampui", "g": "now", "n": "Jampui, Tripura", "b": "Jampui", "r": "Grey Soul", "p": "", "ro": "Medium-light · natural", "notes": "Brown sugar, honey, pomegranate, apple, melon", "w": "Grey Soul’s own shop."}, {"id": "gs-strawberry-loop", "g": "now", "n": "Strawberry in Loop", "b": "Strawberry in Loop", "r": "Grey Soul", "p": "", "ro": "Medium", "notes": "Strawberry, raspberry, peach", "w": "Grey Soul’s own shop."}, {"id": "nv-peach", "g": "now", "n": "Ratnagiri Culture Naturals — Peach", "b": "Ratnagiri Peach", "r": "Naivo", "p": "", "ro": "Medium", "notes": "Peach candy, muskmelon, starfruit", "w": "Online; Bengaluru roaster."}, {"id": "nv-strawberry", "g": "now", "n": "Ratnagiri Culture Naturals — Strawberry", "b": "Ratnagiri Strawberry", "r": "Naivo", "p": "", "ro": "Medium", "notes": "Strawberry", "w": "Online; Bengaluru roaster."}, {"id": "nv-tropical", "g": "now", "n": "Tropical Splash — Baarbara pineapple ferment", "b": "Tropical Splash", "r": "Naivo", "p": "", "ro": "Medium", "notes": "Pineapple, mosambi", "w": "Online; Bengaluru roaster."}, {"id": "qbf-orchardale", "g": "now", "n": "Orchardale Estate Naturals", "b": "Orchardale", "r": "Quick Brown Fox", "p": "", "ro": "Medium-light", "notes": "Black cherry, plum, black grape", "w": "Delhi roaster — Chhattarpur roastery-café. Call ahead about beans and grinding: +91 99992 66545."}, {"id": "qbf-bison", "g": "now", "n": "Bison Valley Estate Naturals", "b": "Bison Valley", "r": "Quick Brown Fox", "p": "", "ro": "Medium-light", "notes": "Goji berry, prune, peach", "w": "Delhi roaster — buy at the Chhattarpur café."}, {"id": "rc-thermal", "g": "now", "n": "Ratnagiri Thermal Shock (yeast)", "b": "Ratnagiri Thermal Shock", "r": "Roast Coffee", "p": "₹900 · 250 g", "ro": "Medium-light", "notes": "Muskmelon, papaya, blackcurrant", "w": "Online. Found only on a listing site — check the roaster’s shop first.", "url": "https://coffeebeansindia.com/coffee/roastcoffee/ratnagiri-yeast-thermal-shock/"}, {"id": "tf-annanas", "g": "now", "n": "Annanas — pineapple fermented", "b": "Annanas", "r": "Toffee Coffee Roasters", "p": "from ₹960", "ro": "Roast not listed", "notes": "Fermented with pineapple pulp. A fun, flavour-forward novelty rather than a microlot", "w": "Online.", "url": "https://toffeecoffeeroasters.com/collections/all"}, {"id": "sb-pearl-filter", "g": "later", "n": "Project Pearl, Ratnagiri — Culture + Anaerobic Naturals", "b": "Project Pearl Filter", "r": "Subko", "p": "₹1,095 · 250 g", "ro": "Light (filter)", "notes": "Marigold, dragon fruit, peach tea", "w": "Online. Can’t wait? It is the one light roast worth trying now, in the iced recipe.", "tag": "Your Subko cup", "url": "https://subko.coffee/products/project-pearl-ratnagiri-estate-karnataka-sca-86-culture-naturals-anaerobic-naturals-filter-roast"}, {"id": "sb-kerehaklu-cw3", "g": "later", "n": "Kerehaklu Lot CW3 — cultured washed", "b": "Kerehaklu CW3", "r": "Subko", "p": "₹1,095 · 250 g", "ro": "Light (filter)", "notes": "Orange creamsicle, green grape, caramel", "w": "Online.", "url": "https://www.subko.coffee/products/project-yung-gun-kerehaklu-cw3-aerobic-washed-light"}, {"id": "bt-dark-room", "g": "later", "n": "Ratnagiri Dark Room Natural", "b": "Ratnagiri Dark Room", "r": "Blue Tokai", "p": "₹600 · 100 g", "ro": "Light", "notes": "Passionfruit, pineapple, strawberry, black-tea finish", "w": "Online; limited release. Rest 8 days.", "url": "https://bluetokaicoffee.com/collections/roasted-and-ground-coffee-beans/products/ratnagiri-estate-dark-room-natural"}, {"id": "gs-kodaikanal", "g": "later", "n": "Summer in Kodaikanal", "b": "Summer in Kodaikanal", "r": "Grey Soul", "p": "", "ro": "Light · natural", "notes": "Strawberry, mandarin, plum, pineapple, cacao", "w": "Grey Soul’s own shop."}, {"id": "gs-pink-lemonade", "g": "later", "n": "Pink Lemonade, Nagaland", "b": "Pink Lemonade", "r": "Grey Soul", "p": "", "ro": "Ultra-light · anaerobic natural", "notes": "Pineapple, orange, blueberry, apple", "w": "Grey Soul’s own shop. Ultra-light really needs your own grinder."}, {"id": "eth-natural", "g": "later", "n": "A natural Ethiopian, Guji or Sidama", "b": "Ethiopia natural", "r": "Any roaster", "p": "", "ro": "", "notes": "Blueberry, strawberry jam. Pick a natural, not a washed Yirgacheffe, which leans jasmine and bergamot", "w": "Whenever you see one."}, {"id": "nv-jasmine", "g": "later", "n": "Ratnagiri Culture Naturals — Jasmine", "b": "Ratnagiri Jasmine", "r": "Naivo", "p": "", "ro": "Light", "notes": "Jasmine, tuberose — the most floral coffee here; try it last", "w": "Online; Bengaluru roaster."}, {"id": "bt-fruit-punch", "g": "notify", "n": "Riverdale Fruit Punch", "b": "Riverdale Fruit Punch", "r": "Blue Tokai", "p": "₹875 · 200 g", "ro": "Light", "notes": "Peach, strawberry, red grape, tangerine, mango finish", "w": "Rest 18 days.", "url": "https://bluetokaicoffee.com/products/riverdale-estate-fruit-punch"}, {"id": "bt-sicc", "g": "notify", "n": "SICC Mooleh Manay", "b": "SICC Mooleh Manay", "r": "Blue Tokai", "p": "₹850 · 250 g", "ro": "Light", "notes": "Plum, red cherry, winey, juicy", "w": "Rest 11 days.", "url": "https://bluetokaicoffee.com/products/sicc-mooleh-manay-estate"}, {"id": "bt-raxidi-pichia", "g": "notify", "n": "Raxidi Lobo Pichia", "b": "Raxidi Lobo Pichia", "r": "Blue Tokai", "p": "₹1,000 · 250 g", "ro": "", "notes": "Raspberry, plum tart, marigold, red cherry — closest to your Subko cup", "w": "", "url": "https://bluetokaicoffee.com/collections/roasted-and-ground-coffee-beans?page=2"}, {"id": "bt-blossom", "g": "notify", "n": "Kerehaklu Blossom Culture", "b": "Kerehaklu Blossom", "r": "Blue Tokai", "p": "₹1,000 · 250 g", "ro": "", "notes": "Strawberry, orange blossom, pomegranate, sun melon", "w": "", "url": "https://bluetokaicoffee.com/collections/roasted-and-ground-coffee-beans?page=2"}, {"id": "bt-mosto", "g": "notify", "n": "Riverdale Mosto", "b": "Riverdale Mosto", "r": "Blue Tokai", "p": "₹1,000 · 250 g", "ro": "", "notes": "Pink pomelo, chamomile, tart cherry — try late", "w": "", "url": "https://bluetokaicoffee.com/collections/roasted-and-ground-coffee-beans?page=2"}, {"id": "bt-terroir", "g": "notify", "n": "Ratnagiri Terroir Culture", "b": "Ratnagiri Terroir Culture", "r": "Blue Tokai", "p": "₹1,000 · 250 g", "ro": "", "notes": "Rose, lychee, custard apple, forest honey — the most perfumed, try last", "w": "", "url": "https://bluetokaicoffee.com/collections/roasted-and-ground-coffee-beans?page=3"}, {"id": "c7-gungegiri", "g": "notify", "n": "Gungegiri Estate", "b": "Gungegiri", "r": "Corridor Seven", "p": "₹800", "ro": "Light (filter)", "notes": "Gooseberry, peach, white tea", "w": "Nagpur roaster; everything was sold out when checked.", "url": "https://corridorseven.coffee"}, {"id": "c7-salawara", "g": "notify", "n": "Salawara Mosto Honey, sun dried", "b": "Salawara Mosto Honey", "r": "Corridor Seven", "p": "₹940", "ro": "Light (filter)", "notes": "Muscat grape, soft pear", "w": "Nagpur roaster.", "url": "https://corridorseven.coffee"}];
var TRYG=[['now','Try now','Medium roasts that hold up pre-ground. In a shop, have it ground the day you buy it.'],
  ['later','After the grinder','Light roasts. Rest the whole beans as the roaster says, then grind for each brew.'],
  ['notify','Sold out \u2014 notify me','Out of stock when added. Turn on notify me on the shop page.']];
var TRYGRP='now';
var CHECK='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function tries(){if(!PK.tries)PK.tries=[];return PK.tries}
function tryById(id){var r=null;tries().forEach(function(t){if(t.id===id)r=t});return r}
function isSeedTry(id){return TRY_SEED.some(function(x){return x.id===id})}
function seedTries(){
  if((PK.trySeed||0)>=SEEDV)return;
  /* the built-in list was picked for the first person; everyone else starts with an empty list of their own */
  if(WHO.dir){PK.trySeed=SEEDV;tries();PK.rev=Date.now();savePK();pushPacks();return}
  var have={},gone={}; tries().forEach(function(t){have[t.id]=1}); (PK.tryGone||[]).forEach(function(id){gone[id]=1});
  TRY_SEED.forEach(function(x){if(!have[x.id]&&!gone[x.id]){var o=JSON.parse(JSON.stringify(x));o.st='todo';o.added=todayStr();PK.tries.push(o)}});
  PK.trySeed=SEEDV; PK.rev=Date.now(); savePK(); pushPacks(); paintTryIfOpen();
}
function touchTry(){PK.rev=Date.now();savePK();pushPacks();paintTry()}
function tryBrews(t){if(!t.pack)return [];return LOG.filter(function(e){return !e.test&&brewPack(e)===t.pack})}
function tryLine(t){
  var b=tryBrews(t), sc=b.filter(function(e){return e.log&&e.log.score});
  var bits=[t.r,t.p,t.ro].filter(Boolean);
  var h=esc(bits.join(' \u00B7 '));
  if(sc.length){var best=Math.max.apply(null,sc.map(function(e){return e.log.score}));h+=(h?' \u00B7 ':'')+'<span class="tscore">best '+fmtScore(best)+'/5</span> over '+sc.length+' brew'+(sc.length>1?'s':'')}
  else if(b.length)h+=(h?' \u00B7 ':'')+b.length+' brew'+(b.length>1?'s':'')+' logged';
  return h;
}
function tryItemHTML(t){
  var id=esc(t.id), tried=t.st==='tried', ord=t.st==='ordered';
  var a='';
  if(tried)a+='<span class="tdate">Tried'+(t.triedAt?' '+fmtDay(t.triedAt):'')+'</span>';
  else a+='<button class="ghost" data-tord="'+id+'" aria-pressed="'+ord+'">'+(ord?'Ordered'+(t.ordAt?' '+fmtDay(t.ordAt):''):'Mark ordered')+'</button>';
  if(ord&&!t.pack)a+='<button class="ghost" data-tpack="'+id+'">Arrived? Add as pack</button>';
  if(t.url)a+='<a class="ghost" href="'+esc(t.url)+'" target="_blank" rel="noopener">Shop</a>';
  a+='<button class="ghost del" data-tdel="'+id+'">Remove</button>';
  return '<div class="ti'+(tried?' done':'')+'">'
    +'<button class="tick" data-tt="'+id+'" aria-pressed="'+tried+'" aria-label="Tried '+esc(t.n)+'">'+(tried?CHECK:'')+'</button>'
    +'<div class="tb"><p class="tn">'+esc(t.n)+(t.tag&&!tried?'<span class="ttag">'+esc(t.tag)+'</span>':'')+'</p>'
    +'<p class="tr">'+tryLine(t)+'</p>'
    +(t.notes?'<p class="tnotes">'+esc(t.notes)+'</p>':'')
    +(t.w&&!tried?'<p class="twhere">'+esc(t.w)+'</p>':'')
    +'<div class="tacts">'+a+'</div></div></div>';
}
function autoTick(){
  /* once a brew is logged against the pack made from an entry, the entry counts as tried */
  var ch=false;
  tries().forEach(function(t){
    if(t.st==='tried'||!t.pack||t.noAuto)return;
    var b=tryBrews(t); if(!b.length)return;
    var first=b.reduce(function(m,e){return new Date(e.at)<new Date(m.at)?e:m},b[0]);
    t.st='tried'; t.triedAt=String(first.at).slice(0,10); ch=true;
  });
  if(ch){PK.rev=Date.now();savePK();pushPacks()}
}
function paintTry(){
  autoTick();
  var L=tries(), tried=L.filter(function(t){return t.st==='tried'}).length, ord=L.filter(function(t){return t.st==='ordered'}).length;
  $('try-sum').textContent=L.length?(tried+' of '+L.length+' tried'+(ord?' \u00B7 '+ord+' ordered':'')):'Nothing on the list yet.';
  var rank={ordered:0,todo:1,tried:2}, h='';
  TRYG.forEach(function(g){
    var items=L.filter(function(t){return (t.g||'now')===g[0]}); if(!items.length)return;
    items=items.map(function(t,i){return [t,i]}).sort(function(x,y){return ((rank[x[0].st]===undefined?1:rank[x[0].st])-(rank[y[0].st]===undefined?1:rank[y[0].st]))||(x[1]-y[1])}).map(function(x){return x[0]});
    var dn=items.filter(function(t){return t.st==='tried'}).length;
    h+='<p class="tgrp"><b>'+g[1]+'</b><span>'+dn+' of '+items.length+' tried</span></p><p class="tcap">'+g[2]+'</p>'+items.map(tryItemHTML).join('');
  });
  $('try-list').innerHTML=h;
  $('t-grp').innerHTML=TRYG.map(function(g){return '<button data-tg="'+g[0]+'" aria-pressed="'+(TRYGRP===g[0])+'">'+(g[0]==='notify'?'Sold out':g[1])+'</button>'}).join('');
}
function paintTryIfOpen(){if(!$('sc-try').classList.contains('hide'))paintTry()}
function openTry(){paintTry();show('sc-try')}
function openTryPack(id){
  var t=tryById(id); if(!t)return;
  show('sc-recipe'); $('packbox').open=true; openPackForm('new'); PF.fromTry=id;
  $('p-name').value=t.b||t.n; $('p-roaster').value=(t.r&&t.r!=='Any roaster')?t.r:''; $('p-pre').checked=true;
  if(!$('p-grind').value)$('p-grind').value='French press';
  $('pf-title').textContent='New pack \u00B7 from your list';
}
$('open-try').addEventListener('click',openTry);
$('try-back').addEventListener('click',function(){show('sc-recipe')});
$('try-list').addEventListener('click',function(e){
  var b;
  if((b=e.target.closest('[data-tt]'))){var t=tryById(b.dataset.tt);if(!t)return;
    if(t.st==='tried'){t.st=t.ordAt?'ordered':'todo';delete t.triedAt;t.noAuto=true}else{t.st='tried';t.triedAt=todayStr()}
    touchTry();return}
  if((b=e.target.closest('[data-tord]'))){var t2=tryById(b.dataset.tord);if(!t2)return;
    if(t2.st==='ordered'){t2.st='todo';delete t2.ordAt}else{t2.st='ordered';t2.ordAt=todayStr()}
    touchTry();return}
  if((b=e.target.closest('[data-tpack]'))){openTryPack(b.dataset.tpack);return}
  if((b=e.target.closest('[data-tdel]'))){var rid=b.dataset.tdel;
    twoTap(b,'Tap again to remove','Remove',function(){
      PK.tries=tries().filter(function(x){return x.id!==rid});
      PK.tryGone=unionStr(PK.tryGone,[rid]); /* remembered so another phone's older copy cannot bring it back */
      touchTry();
    });return}
});
$('t-grp').addEventListener('click',function(e){var b=e.target.closest('[data-tg]');if(!b)return;TRYGRP=b.dataset.tg;paintTry()});
$('t-save').addEventListener('click',function(){
  var n=$('t-name').value.trim(), er=$('t-err');
  if(!n){er.textContent='Give it a name.';er.classList.remove('hide');return}
  er.classList.add('hide');
  tries().push({id:'u'+Date.now(),g:TRYGRP,n:n,b:n,r:$('t-roaster').value.trim(),notes:$('t-notes').value.trim(),st:'todo',added:todayStr()});
  $('t-name').value='';$('t-roaster').value='';$('t-notes').value='';
  touchTry();
});

/* ---------- account sync: the log lives in the artifact's private per-user store ---------- */
var SY={db:null,col:null,pdoc:null,state:'start',ready:false,busy:false,dead:false,n:0,packsReady:false,pbusy:false,needMigrate:false};
function pushPacks(){
  if(!SY.pdoc||!SY.packsReady)return;
  /* a save already in flight: send again once it lands, so a change made meanwhile is never stranded */
  if(SY.pbusy){SY.pagain=true;return}
  SY.pbusy=true; SY.pagain=false; var body=JSON.parse(JSON.stringify(PK));
  SY.pdoc.set(body).then(function(){SY.pbusy=false;if(SY.pagain||(PK.rev||0)!==(body.rev||0))pushPacks()},function(){SY.pbusy=false;SY.pagain=false});
}
/* set when this phone connects to a repository for the first time: that repository's packs, places and To try list are the ones to keep */
var JOINK='fp.gh.join.v1'+WHO.suffix;
function joining(){try{return !!localStorage.getItem(JOINK)}catch(e){return false}}
function joined(){try{localStorage.removeItem(JOINK)}catch(e){}}
function clonePK(d){var o=JSON.parse(JSON.stringify(d||{}));if(!o.packs)o.packs=[];return o}
function unionStr(a,b){var o=(a||[]).slice();(b||[]).forEach(function(x){if(o.indexOf(x)<0)o.push(x)});return o}
function byIdMerge(a,b){var out=(a||[]).slice(),ids={};out.forEach(function(x){ids[x.id]=1});(b||[]).forEach(function(x){if(!ids[x.id])out.push(x)});return out}
function onPacks(snap){
  if(snap.exists){
    var d=clonePK(snap.data());
    if(!SY.packsReady){
      /* first look at the account copy: merge with anything made on this device before it arrived.
         On a phone joining for the first time, the account copy wins for anything both have (its places, To try ticks),
         and only things that exist on this phone alone are added to it. */
      SY.packsReady=true;
      var join=joining(); joined();
      if(PK.packs.length||(PK.extras||[]).length||(PK.profiles||[]).length||(PK.tries||[]).length){
        var newer=(join||(PK.rev||0)<=(d.rev||0))?d:PK, older=newer===PK?d:PK, m=clonePK(newer);
        /* the built-in To try list a new phone fills in by itself is not the person's own: the account already has its copy */
        var olderTries=(older.tries||[]).filter(function(t){return !(join&&older===PK&&(d.trySeed||0)>=SEEDV&&isSeedTry(t.id))});
        m.packs=byIdMerge(newer.packs,older.packs);
        m.profiles=byIdMerge(newer.profiles,older.profiles);
        m.extras=byIdMerge(newer.extras,older.extras);
        m.tryGone=unionStr(newer.tryGone,older.tryGone); m.trySeed=Math.max(newer.trySeed||0,older.trySeed||0);
        /* anything removed on either side stays removed */
        m.tries=byIdMerge(newer.tries,olderTries).filter(function(t){return m.tryGone.indexOf(t.id)<0});
        if(!m.active)m.active=older.active||null; if(!m.loc)m.loc=older.loc||null;
        var same=JSON.stringify([m.packs,m.profiles,m.extras,m.active||null,m.loc||null,m.tries,m.tryGone,m.trySeed||0])===JSON.stringify([d.packs,d.profiles||[],d.extras||[],d.active||null,d.loc||null,d.tries||[],d.tryGone||[],d.trySeed||0]);
        PK=m; PK.rev=same?(d.rev||0):Date.now(); savePK(); if(!same)pushPacks();
      } else {PK=d;savePK()}
      ensureProfiles(); applyLocToS(); refreshAll(); seedTries();
      if(!PK.packs.length){if(SY.ready)tryMigrate();else SY.needMigrate=true}
      return;
    }
    if((d.rev||0)>(PK.rev||0)){PK=d;savePK();applyLocToS();whenIdle('all',function(){refreshAll();paintTryIfOpen()})}
    else if((d.rev||0)<(PK.rev||0))pushPacks();
    return;
  }
  if(snap.metadata&&snap.metadata.fromCache)return;
  SY.packsReady=true; joined();
  ensureProfiles(); seedTries();
  if(PK.packs.length)pushPacks();
  else{
    /* nothing in the repository yet: share this phone's places and list (a save cut short by switching person is resent here) */
    if((PK.profiles||[]).length||(PK.tries||[]).length||(PK.extras||[]).length)pushPacks();
    if(SY.ready)tryMigrate(); else SY.needMigrate=true;
  }
}
function goLocal(){SY.state='local';SY.local=true;paintSync();tryMigrate();ensureProfiles();seedTries()}
function cleanForDb(e){var o=JSON.parse(JSON.stringify(e));delete o.synced;return o}
function paintSync(){
  var el=$('log-sync'); if(!el)return;
  if(logView==='test'){el.textContent='Dry runs stay on this device.';el.className='syncl';return}
  var t={start:'Connecting to your account\u2026',
    connecting:'Connecting to your account\u2026',
    local:'Saved on this phone only. Connect GitHub in Settings to back up and sync.',
    pending:'Syncing '+SY.n+' change'+(SY.n===1?'':'s')+'\u2026',
    synced:'Synced to GitHub. Every phone or computer connected to it sees the same log.',
    error:'Sync paused. Brews are saved on this phone and will sync when the connection is back.',
    auth:'GitHub sync needs attention: the token was rejected or cannot reach the repository. Fix it in Settings.',
    full:'GitHub storage is full. New brews are saved on this phone only.'}[SY.state]||'';
  el.textContent=t;
  el.className='syncl'+((SY.state==='error'||SY.state==='full'||SY.state==='auth')?' bad':'');
}
function relogIfVisible(){
  whenIdle('log',function(){
    if($('sc-log').classList.contains('hide')||ED)return;
    var open=Array.prototype.map.call(document.querySelectorAll('#log-list .detwrap:not(.hide)'),function(w){return w.id.slice(3)});
    openLog();
    open.forEach(function(id){expand(id)});
  });
}
function onRemote(snap){
  var remote={};
  snap.docs.forEach(function(d){var v=d.data();if(v&&v.id!==undefined)remote[String(v.id)]=v});
  var byId={},changed=false;
  LOG.forEach(function(e){byId[String(e.id)]=e});
  for(var id in remote){
    if(DEL.indexOf(id)>=0)continue;
    var r=normalize(JSON.parse(JSON.stringify(remote[id])));
    var l=byId[id];
    if(!l){r.synced=true;LOG.push(r);changed=true}
    else if((r.rev||0)>(l.rev||0)){r.synced=true;LOG[LOG.indexOf(l)]=r;changed=true}
    else if(!l.synced&&(r.rev||0)===(l.rev||0)){l.synced=true;changed=true}
  }
  if(!snap.metadata.fromCache){
    var before=LOG.length;
    /* a brew this device had synced but the account no longer has was deleted elsewhere */
    LOG=LOG.filter(function(e){return !(e.synced&&!remote[String(e.id)])});
    if(LOG.length!==before)changed=true;
    SY.ready=true;
    if(SY.needMigrate){SY.needMigrate=false;setTimeout(tryMigrate,0)}
  }
  if(changed){LOG.sort(byDate);saveL();relogIfVisible();whenIdle('all',function(){refreshAll();paintTryIfOpen()})}
  if(SY.ready)pushPending();
  paintSync();
}
function subscribe(){
  SY.dead=false;
  SY.col.onSnapshot(onRemote,function(err){
    SY.dead=true;
    SY.state=(err&&err.code==='revoked')?'auth':'error';
    paintSync();
  });
}
function pushPending(){
  if(!SY.ready||SY.busy||!SY.col)return;
  var todo=LOG.filter(function(e){return !e.synced}), dels=DEL.slice();
  if(!todo.length&&!dels.length){SY.state='synced';paintSync();return}
  SY.busy=true; SY.n=todo.length+dels.length; SY.state='pending'; paintSync();
  var chain=Promise.resolve();
  todo.forEach(function(e){chain=chain.then(function(){
    var rev=e.rev||0;
    return SY.col.doc(String(e.id)).set(cleanForDb(e)).then(function(){if((e.rev||0)===rev)e.synced=true;SY.n--;paintSync()});
  })});
  dels.forEach(function(id){chain=chain.then(function(){
    return SY.col.doc(String(id)).delete().then(function(){DEL=DEL.filter(function(x){return x!==id});saveDel();SY.n--;paintSync()});
  })});
  chain.then(function(){
    SY.busy=false; saveL();
    if(LOG.some(function(e){return !e.synced})||DEL.length)setTimeout(pushPending,500);
    else{SY.state='synced';paintSync()}
  },function(err){
    SY.busy=false; saveL();
    SY.state=(err&&err.code==='quota_exceeded')?'full':((err&&err.code==='revoked')?'auth':'error'); paintSync();
  });
}
function syncResume(){
  if(!SY.col)return;
  if(SY.dead){SY.state='connecting';paintSync();subscribe();return}
  if(SY.state==='error'){SY.state='pending';pushPending()}
}
(function initSync(){
  if(!window.claude||typeof window.claude.use!=='function'){goLocal();return}
  SY.state='connecting'; paintSync();
  Promise.all([window.claude.use('db'),window.claude.use('user')]).then(function(r){
    var db=r[0],user=r[1];
    if(!db||!user){goLocal();return}
    return user.id().then(function(uid){
      if(!uid){goLocal();return}
      SY.db=db;
      SY.col=db.doc('data/users/'+uid+'/coffee').collection('brews');
      subscribe();
      SY.pdoc=db.doc('data/users/'+uid+'/coffee');
      SY.pdoc.onSnapshot(onPacks,function(){});
      subOthers();
    });
  }).catch(goLocal);
})();
/* a small window into the app for the Settings screen */
paintWho();
window.__brewApp={
  show:show,
  switchTo:switchTo,
  busy:function(){return steps.length>0},
  syncState:function(){return SY.state},
  exportAll:function(){return {app:'brew',version:1,person:WHO.name||undefined,exportedAt:new Date().toISOString(),brews:LOG.map(cleanForDb),dryRuns:TLOG,packs:PK,settings:S}}
};
})();
