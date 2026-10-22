'use strict';
const API_ROOT = String(window.LIV_API_URL || '').replace(/\/$/, '');
function apiUrl(path) {
  if (!(/^https:\/\/[^/]+/i.test(API_ROOT) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(API_ROOT)) || API_ROOT.includes('YOUR-WORKER')) {
    throw new Error('Backend not configured yet. Set the Worker URL in api-config.js.');
  }
  return API_ROOT + path;
}
const $=id=>document.getElementById(id);
let adminKey='',all=[],reviewers=[];
const aliasKey='liv_admin_reviewer_aliases';
let aliases={};try{aliases=JSON.parse(localStorage.getItem(aliasKey)||'{}')||{}}catch{aliases={}}
function displayName(p){return aliases[p.id]||p.name}

let timer;
function elem(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;}
function notify(t){$('toast').textContent=t;$('toast').classList.remove('hidden');clearTimeout(timer);timer=setTimeout(()=>$('toast').classList.add('hidden'),3000);}
async function request(path){
 const res=await fetch(apiUrl(path),{headers:{'X-Admin-Key':adminKey}});
 if(!res.ok){let data={};try{data=await res.json();}catch{}throw Error(data.error||`Request failed (${res.status})`);}return res;
}
function date(t){return new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(t.replace(' ','T')+'Z'));}
async function load(){const result=await (await request('/api/admin/results')).json();all=result.clips;reviewers=result.reviewers;
 const completed=all.filter(x=>x.total).length;
 $('stat-reviewed').textContent=completed;$('stat-reviewed-sub').textContent=`of ${all.length} clips`;
 $('stat-votes').textContent=result.totalVotes;$('stat-include').textContent=all.reduce((n,x)=>n+x.include,0);
 $('stat-mods').textContent=reviewers.length;
 const frag=document.createDocumentFragment();
 if(!reviewers.length)frag.append(elem('div','muted','No reviews yet. Once mods start reviewing, they’ll appear here.'));
 for(const p of reviewers){const card=elem('div','reviewer-card');const avatar=elem('div','avatar',displayName(p).slice(0,1).toUpperCase());
 const detail=elem('div');detail.append(elem('strong','',displayName(p)),elem('small','',`${p.total} reviewed · ${p.include} include · ${p.maybe} maybe`));
 const edit=elem('button','text-button','Rename');edit.type='button';edit.title='Rename this reviewer on this browser';edit.addEventListener('click',()=>{const value=prompt('Display name for '+p.name+' (blank to reset):',aliases[p.id]||p.name);if(value===null)return;const clean=value.trim();if(clean&&clean.length>50){notify('Name must be 50 characters or fewer');return;}if(!clean||clean===p.name)delete aliases[p.id];else aliases[p.id]=clean;localStorage.setItem(aliasKey,JSON.stringify(aliases));load().catch(e=>notify(e.message));});
 card.append(avatar,detail,edit);frag.append(card);}
 $('reviewers').replaceChildren(frag);render();}
function selected(){const q=$('admin-search').value.toLowerCase().trim(),filter=$('admin-filter').value,sort=$('admin-sort').value;
 let rows=all.filter(c=>{
  if(q&&!`${c.title} ${c.clipper} ${c.createdAt}`.toLowerCase().includes(q))return false;
  if(filter==='reviewed'&&!c.total)return false;
  if(filter==='include'&&!c.include)return false;
  if(filter==='unreviewed'&&c.total)return false;
  return true;
 });
 rows.sort((a,b)=>{
  if(sort==='include')return b.include-a.include||b.total-a.total||b.views-a.views;
  if(sort==='ratio')return (b.total?b.include/b.total:0)-(a.total?a.include/a.total:0)||b.include-a.include;
  if(sort==='activity')return b.total-a.total||b.include-a.include;
  if(sort==='newest')return b.createdAt.localeCompare(a.createdAt);
  return b.views-a.views;
 });return rows;
}
function render(){const rows=selected();$('admin-count').textContent=`(${rows.length})`;
 const frag=document.createDocumentFragment();
 for(const c of rows){const article=elem('article','result-row');const head=elem('button','result-head');head.type='button';head.setAttribute('aria-expanded','false');
 const img=elem('img','result-thumb');img.src=c.thumbnail;img.alt='';img.loading='lazy';head.append(img);
 const info=elem('div');info.append(elem('div','result-title',c.title),elem('div','result-sub',`${date(c.createdAt)} · by ${c.clipper} · ${c.views} views`));head.append(info);
 const group=elem('div','count-group');
 for(const [ch,num,label] of [['include',c.include,'✓'],['maybe',c.maybe,'~'],['skip',c.skip,'×']])group.append(elem('span','count-pill '+ch,`${label} ${num}`));
 if(!c.total)group.append(elem('span','count-pill none','Not reviewed'));
 head.append(group,elem('span','chevron','⌄'));
 head.addEventListener('click',()=>{
   const shown=article.querySelector('.result-details');if(shown){shown.remove();head.setAttribute('aria-expanded','false');return;}
   const detail=elem('div','result-details');const links=elem('div','detail-links');const a=elem('a','', 'Watch on Twitch ↗');a.href=c.url;a.target='_blank';a.rel='noopener noreferrer';links.append(a,elem('span','muted',`${c.total} review${c.total===1?'':'s'}`));detail.append(links);
   if(!c.notes.length)detail.append(elem('div','muted','No reviews yet.'));
   for(const n of c.notes){const note=elem('div','comment');const heading=elem('div','comment-header');const label=elem('span','',n.name+' · ');label.append(elem('span','comment-badge '+n.choice,n.choice.toUpperCase()));heading.append(label,elem('span','comment-time',new Date(n.updatedAt).toLocaleString('en-AU')));note.append(heading);if(n.note)note.append(elem('p','',n.note));detail.append(note);}
   article.append(detail);head.setAttribute('aria-expanded','true');
 });
 article.append(head);frag.append(article);
 }
 $('result-list').replaceChildren(frag);
}
async function login(key){adminKey=key;await load();sessionStorage.setItem('liv_admin_key',key);$('admin-login').classList.add('hidden');$('dashboard').classList.remove('hidden');$('logout').classList.remove('hidden');}
$('admin-login-form').addEventListener('submit',async e=>{e.preventDefault();$('admin-error').textContent='';const btn=e.currentTarget.querySelector('button');btn.disabled=true;try{await login($('admin-pass').value);}catch(err){$('admin-error').textContent=err.message;}finally{btn.disabled=false;}});
$('logout').addEventListener('click',()=>{adminKey='';sessionStorage.removeItem('liv_admin_key');$('admin-login').classList.remove('hidden');$('dashboard').classList.add('hidden');$('logout').classList.add('hidden');$('admin-pass').value='';});
$('refresh').addEventListener('click',async()=>{try{await load();notify('Results updated');}catch(err){notify(err.message);}});
$('export').addEventListener('click',async()=>{try{const blob=await (await request('/api/admin/export.csv')).blob();const url=URL.createObjectURL(blob);const a=elem('a');a.href=url;a.download='liv-clip-reviews.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(err){notify(err.message);}});
for(const id of ['admin-search','admin-sort','admin-filter'])$(id).addEventListener(id==='admin-search'?'input':'change',render);
window.addEventListener('DOMContentLoaded',async()=>{const key=sessionStorage.getItem('liv_admin_key');if(key){try{await login(key);}catch{sessionStorage.removeItem('liv_admin_key');}}});
