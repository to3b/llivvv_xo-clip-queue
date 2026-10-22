'use strict';
const $=id=>document.getElementById(id);
const ROOT=String(window.LIV_API_URL||'').replace(/\/$/,'');
const id=localStorage.getItem('liv_reviewer_id')||crypto.randomUUID();localStorage.setItem('liv_reviewer_id',id);
let clips=[],mine=new Map(),list=[],index=0,busy=false;
const name=()=>localStorage.getItem('liv_reviewer_name')||'Anonymous';
function message(t){$('toast').textContent=t;$('toast').style.display='block';setTimeout(()=>$('toast').style.display='none',2200)}
async function api(path,opts={}){const r=await fetch(ROOT+path,{...opts,headers:{'X-Reviewer-Id':id,...opts.headers}});const j=await r.json();if(!r.ok)throw Error(j.error||'Server error');return j}
function current(){return list[index]}
function order(){let old=current()?.id;list=clips.filter(c=>!$('unreviewed').checked||!mine.has(c.id));let s=$('order').value;list.sort((a,b)=>s==='views'?b.views-a.views:s==='newest'?b.createdAt.localeCompare(a.createdAt):a.createdAt.localeCompare(b.createdAt));index=Math.max(0,list.findIndex(c=>c.id===old));show()}
function show(){const c=current();$('count').textContent=list.length?(index+1)+' / '+list.length:'0 clips';$('player').replaceChildren();if(!c){$('title').textContent='All caught up';$('meta').textContent='';return}
const frame=document.createElement('iframe');frame.allow='autoplay; fullscreen; picture-in-picture';frame.allowFullscreen=true;frame.title=c.title;frame.src='https://clips.twitch.tv/embed?clip='+encodeURIComponent(c.id)+'&parent='+encodeURIComponent(location.hostname)+'&autoplay=false';$('player').append(frame);
$('title').textContent=c.title;$('meta').textContent='by '+c.clipper+' · '+c.createdAt.slice(0,10);$('open-twitch').href='https://www.twitch.tv/llivvv_xo/clip/'+encodeURIComponent(c.id);
$('note').value=mine.get(c.id)?.note||'';
document.querySelectorAll('[data-choice]').forEach(b=>b.classList.toggle('active',mine.get(c.id)?.choice===b.dataset.choice));
$('prev').disabled=index===0;$('next').disabled=index===list.length-1}
function move(d){if(!list.length)return;index=Math.min(list.length-1,Math.max(0,index+d));show()}
async function vote(choice){const c=current();if(!c||busy)return;busy=true;let old=mine.get(c.id);let note=$('note').value;try{await api('/api/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clipId:c.id,choice,note,name:name()})});mine.set(c.id,{choice,note});if($('unreviewed').checked){order()}else{show();if(index<list.length-1)move(1)} }catch(e){message(e.message)}finally{busy=false}}
document.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>vote(b.dataset.choice));
$('next').onclick=()=>move(1);$('prev').onclick=()=>move(-1);
$('settings').onclick=()=>{$('name').value=name()==='Anonymous'?'':name();$('panel').hidden=false};
$('close').onclick=()=>$('panel').hidden=true;
$('save-name').onclick=()=>{let v=$('name').value.trim();if(v)localStorage.setItem('liv_reviewer_name',v);else localStorage.removeItem('liv_reviewer_name');$('panel').hidden=true;message('Saved')};
$('save-note').onclick=async()=>{let c=current(),v=mine.get(c?.id);if(!v)return message('Choose Include / Maybe / Skip first');try{await api('/api/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clipId:c.id,choice:v.choice,note:$('note').value,name:name()})});v.note=$('note').value;message('Note saved')}catch(e){message(e.message)}};
$('order').onchange=order;$('unreviewed').onchange=order;
let touchY=null;const feed=$('feed');feed.addEventListener('touchstart',e=>{touchY=e.touches[0].clientY},{passive:true});feed.addEventListener('touchend',e=>{if(touchY!==null){let delta=e.changedTouches[0].clientY-touchY;if(Math.abs(delta)>65)move(delta<0?1:-1);touchY=null}},{passive:true});
let wheelTime=0;feed.addEventListener('wheel',e=>{if(Math.abs(e.deltaY)>18&&Date.now()-wheelTime>550){move(e.deltaY>0?1:-1);wheelTime=Date.now()}},{passive:true});
document.addEventListener('keydown',e=>{if(!$('panel').hidden)return;if(['INPUT','TEXTAREA'].includes(document.activeElement.tagName))return;if(e.key==='ArrowDown'||e.key==='ArrowRight')move(1);if(e.key==='ArrowUp'||e.key==='ArrowLeft')move(-1);if(['1','2','3'].includes(e.key))vote(['include','maybe','skip'][+e.key-1])});
(async()=>{try{const d=await api('/api/bootstrap');clips=d.clips;mine=new Map(d.mine.map(v=>[v.clipId,v]));order()}catch(e){$('error').style.display='block';$('error').textContent=e.message;$('count').textContent='Offline'}})();