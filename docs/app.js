'use strict';
const API_ROOT = String(window.LIV_API_URL || '').replace(/\/$/, '');
function apiUrl(path) {
  if (!(/^https:\/\/[^/]+/i.test(API_ROOT) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(API_ROOT)) || API_ROOT.includes('YOUR-WORKER')) {
    throw new Error('Backend not configured yet. Set the Worker URL in api-config.js.');
  }
  return API_ROOT + path;
}
const $=id=>document.getElementById(id);
const store={clips:[], mine:new Map(), list:[], current:null, name:'', busy:false};
const choices=['include','maybe','skip'];
let toastTimeout;
const savedId=localStorage.getItem('liv_reviewer_id');
let reviewerId=savedId && /^[a-f0-9-]{20,60}$/i.test(savedId)?savedId:crypto.randomUUID();
localStorage.setItem('liv_reviewer_id',reviewerId);
function toast(message){const t=$('toast');t.textContent=message;t.classList.remove('hidden');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>t.classList.add('hidden'),3000);}
function fmtDate(date){const d=new Date(date.replace(' ','T')+'Z');return Number.isNaN(d.getTime())?date:new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(d);}
function fmtTime(n){const v=Math.round(Number(n)||0);return `${Math.floor(v/60)}:${String(v%60).padStart(2,'0')}`;}
function make(tag,cls,txt){const el=document.createElement(tag);if(cls)el.className=cls;if(txt!==undefined)el.textContent=txt;return el;}
async function api(path,options={}){
 const res=await fetch(apiUrl(path),{...options,headers:{'X-Reviewer-Id':reviewerId,...options.headers}});
 let body;try{body=await res.json();}catch{throw new Error('Server unavailable. Please try again.');}
 if(!res.ok)throw new Error(body.error||`Error ${res.status}`);
 return body;
}
async function enter(name){
 store.name=name.trim() || 'Anonymous';
 const data=await api('/api/bootstrap');
 store.clips=data.clips;store.mine=new Map(data.mine.map(v=>[v.clipId,v]));
 if(name.trim()) localStorage.setItem('liv_reviewer_name',store.name);
 else localStorage.removeItem('liv_reviewer_name');
 $('whoami').textContent=store.name === 'Anonymous' ? 'Guest reviewer' : store.name;
 $('login').classList.add('hidden');$('main-content').classList.remove('hidden');$('switch-user').classList.remove('hidden');
 updateProgress();render();
}
function updateProgress(){
 const done=store.mine.size,total=store.clips.length,p=Math.round(done/total*100);
 $('progress-label').textContent=`${done} of ${total} clips reviewed`;
 $('progress-percent').textContent=`${p}%`;$('progress-fill').style.width=p+'%';
}
function filtered(){
 const search=$('search').value.toLowerCase().trim(), filter=$('filter').value,sort=$('sort').value;
 const arr=store.clips.filter(c=>{
  const vote=store.mine.get(c.id)?.choice;
  if(filter==='unreviewed'&&vote)return false;
  if(choices.includes(filter)&&vote!==filter)return false;
  if(search&&!`${c.title} ${c.clipper} ${c.createdAt}`.toLowerCase().includes(search))return false;
  return true;
 });
 if(sort==='newest')arr.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 if(sort==='oldest')arr.sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
 if(sort==='views')arr.sort((a,b)=>b.views-a.views);
 if(sort==='shortest')arr.sort((a,b)=>a.duration-b.duration);
 if(sort==='random')arr.sort((a,b)=>(simpleHash(a.id+'liv')-simpleHash(b.id+'liv')));
 return arr;
}
function simpleHash(str){let n=2166136261;for(let i=0;i<str.length;i++)n=Math.imul(n^str.charCodeAt(i),16777619);return n>>>0;}
function render(){
 store.list=filtered();$('result-count').textContent=`${store.list.length} clip${store.list.length===1?'':'s'}`;
 $('empty').classList.toggle('hidden',store.list.length!==0);
 const frag=document.createDocumentFragment();
 for(const c of store.list){
  const choice=store.mine.get(c.id)?.choice;
  const card=make('article','clip-card'+(choice?' is-'+choice:''));card.dataset.id=c.id;
  const thumb=make('button','thumb-button');thumb.type='button';thumb.setAttribute('aria-label','Watch '+c.title);
  const img=make('img');img.src=c.thumbnail;img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';thumb.append(img,make('span','play-icon','▶'),make('span','duration-pill',fmtTime(c.duration)));
  if(choice)thumb.append(make('span','choice-pill '+choice,choice==='include'?'✓ Include':choice==='maybe'?'~ Maybe':'× Skip'));
  thumb.addEventListener('click',()=>openModal(c.id));card.append(thumb);
  const info=make('div','card-info');info.append(make('div','card-date',fmtDate(c.createdAt)));
  const title=make('div','card-title',c.title);title.title=c.title;info.append(title);
  const meta=make('div','card-meta');meta.append(make('span','',`by ${c.clipper}`),make('span','',`${Number(c.views).toLocaleString()} views`));info.append(meta);
  const buttons=make('div','mini-choices');
  for(const ch of choices){const btn=make('button','mini-btn'+(choice===ch?' active':''),ch[0].toUpperCase()+ch.slice(1));btn.type='button';btn.dataset.choice=ch;btn.setAttribute('aria-label',`Mark ${c.title} as ${ch}`);btn.addEventListener('click',()=>vote(c.id,ch,store.mine.get(c.id)?.note||'',true));buttons.append(btn);}
  info.append(buttons);card.append(info);frag.append(card);
 }
 $('cards').replaceChildren(frag);
}
function openModal(id){
 const c=store.clips.find(c=>c.id===id);if(!c)return;
 store.current=id;$('modal').classList.remove('hidden');document.body.style.overflow='hidden';
 const index=store.list.findIndex(x=>x.id===id);
 $('modal-pos').textContent=index>=0?`• ${index+1} / ${store.list.length}`:'';
 $('modal-title').textContent=c.title;$('modal-date').textContent=fmtDate(c.createdAt);
 $('modal-meta').textContent=`Clipped by ${c.clipper} · ${fmtTime(c.duration)} · ${c.views.toLocaleString()} views`;
 $('open-twitch').href=c.url;
 const iframe=make('iframe');iframe.title='Twitch clip: '+c.title;iframe.allow='autoplay; fullscreen';iframe.allowFullscreen=true;iframe.loading='eager';
 iframe.src=`https://clips.twitch.tv/embed?clip=${encodeURIComponent(c.id)}&parent=${encodeURIComponent(location.hostname)}&autoplay=false&muted=false`;
 $('player-wrap').replaceChildren(iframe);
 $('note').value=store.mine.get(id)?.note||'';
 $('save-feedback').textContent='';
 paintModalChoice();updateModalNav();
}
function paintModalChoice(){const current=store.mine.get(store.current)?.choice;document.querySelectorAll('#modal-choices button').forEach(b=>{const selected=b.dataset.choice===current;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});}
function updateModalNav(){const i=store.list.findIndex(x=>x.id===store.current);$('prev').disabled=i<=0;$('next').disabled=i<0||i>=store.list.length-1;$('modal-progress').textContent=i<0?'':`${i+1} of ${store.list.length}`;}
function closeModal(){$('modal').classList.add('hidden');$('player-wrap').replaceChildren();document.body.style.overflow='';store.current=null;}
async function vote(clipId,choice,note,quick=false){
 if(store.busy)return;store.busy=true;
 const old=store.mine.get(clipId);
 try{
  await api('/api/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clipId,choice,note,name:store.name})});
  if(choice==='clear')store.mine.delete(clipId);else store.mine.set(clipId,{clipId,choice,note});
  updateProgress();
  // Preserve the current queue when a filter is active, otherwise modal navigation jumps unexpectedly.
  if($('modal').classList.contains('hidden'))render();
  else{paintModalChoice();$('save-feedback').textContent=choice==='clear'?'Selection removed.':'Saved ✓';
    if($('filter').value==='all'){render();} // other filters are refreshed on close
  }
  if(quick)toast('Saved as '+choice);
 }catch(err){toast('Could not save: '+err.message);if(!quick)$('save-feedback').textContent=err.message;}
 finally{store.busy=false;}
}
function step(amount){const i=store.list.findIndex(c=>c.id===store.current);const next=store.list[i+amount];if(next)openModal(next.id);}
$('login-form').addEventListener('submit',async e=>{e.preventDefault();$('login-error').textContent='';const btn=e.currentTarget.querySelector('button');btn.disabled=true;try{await enter($('name').value);}catch(err){$('login-error').textContent=err.message;}finally{btn.disabled=false;}});
$('switch-user').addEventListener('click',()=>{localStorage.removeItem('liv_reviewer_name');reviewerId=crypto.randomUUID();localStorage.setItem('liv_reviewer_id',reviewerId);closeModal();$('login').classList.remove('hidden');$('main-content').classList.add('hidden');$('name').value='';$('switch-user').classList.add('hidden');});
for(const id of ['search','filter','sort'])$(id).addEventListener(id==='search'?'input':'change',render);
$('modal-close').addEventListener('click',()=>{closeModal();render();});
$('modal').addEventListener('click',e=>{if(e.target===$('modal')){closeModal();render();}});
$('prev').addEventListener('click',()=>step(-1));$('next').addEventListener('click',()=>step(1));
$('modal-choices').addEventListener('click',e=>{const button=e.target.closest('button[data-choice]');if(button&&store.current)vote(store.current,button.dataset.choice,$('note').value);});
$('save-note').addEventListener('click',()=>{const item=store.mine.get(store.current);if(!item){$('save-feedback').textContent='Choose Include, Maybe or Skip first.';return;}vote(store.current,item.choice,$('note').value);});
$('clear-vote').addEventListener('click',()=>{if(store.current)vote(store.current,'clear','');});
document.addEventListener('keydown',e=>{if($('modal').classList.contains('hidden'))return;if(['INPUT','TEXTAREA'].includes(document.activeElement.tagName))return;if(e.key==='Escape'){closeModal();render();}else if(e.key==='ArrowRight')step(1);else if(e.key==='ArrowLeft')step(-1);else if(['1','2','3'].includes(e.key)){const ch=choices[Number(e.key)-1];vote(store.current,ch,$('note').value);}});
window.addEventListener('DOMContentLoaded',async()=>{
 $('name').value=localStorage.getItem('liv_reviewer_name')||'';
 if($('name').value){try{await enter($('name').value);}catch{}}
});
