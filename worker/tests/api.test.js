import test from 'node:test';
import assert from 'node:assert/strict';
import api from '../src.js';
import {clips} from '../clips-data.js';

function fakeDb() {
  const rows = new Map();
  return {
    rows,
    prepare(sql) {
      let params=[];
      const statement = {
        bind(...items) {params=items;return statement;},
        async all() {
          if(sql.includes('WHERE reviewer_id = ?')) return {results:[...rows.values()].filter(x=>x.reviewer_id===params[0]).map(x=>({clip_id:x.clip_id,choice:x.choice,note:x.note}))};
          if(sql.includes('FROM reviews')) return {results:[...rows.values()]};
          throw Error('Unexpected query '+sql);
        },
        async run() {
          if(sql.startsWith('INSERT')){
            const [clip_id,reviewer_id,name,choice,note,updated_at]=params;
            rows.set(clip_id+':'+reviewer_id,{clip_id,reviewer_id,name,choice,note,updated_at});
          }else if(sql.startsWith('DELETE')){
            rows.delete(params[0]+':'+params[1]);
          }else throw Error('Unexpected query '+sql);
          return {success:true};
        }
      };
      return statement;
    }
  };
}
const id='12345678-1234-4123-8123-123456789abc';
const id2='87654321-1234-4123-8123-123456789abc';
const env = ()=>({DB:fakeDb(),REVIEW_CODE:'really-long-review-secret',ADMIN_KEY:'a-separate-long-admin-secret',ALLOWED_ORIGINS:'https://llivvv-xo.t-b.es'});
const origin='https://llivvv-xo.t-b.es';
async function call(e,path,{method='GET',headers={},body,from=origin}={}) {
  const h={...headers};if(from) h.Origin=from;
  const req = new Request('https://api.example.workers.dev'+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)});
  return await api.fetch(req,e);
}
const modheaders={'X-Access-Code':'really-long-review-secret','X-Reviewer-Id':id};
const adminheaders={'X-Admin-Key':'a-separate-long-admin-secret'};
test('catalogue has clips and valid URLs',()=>{
 assert.equal(clips.length,355);
 assert.equal(new Set(clips.map(c=>c.id)).size,355);
 assert.ok(clips.every(c=>c.url===`https://www.twitch.tv/llivvv_xo/clip/${c.id}`));
});
test('CORS preflight and disallowed origin',async()=>{
 const e=env();
 const good=await call(e,'/api/bootstrap',{method:'OPTIONS'});
 assert.equal(good.status,204);assert.equal(good.headers.get('Access-Control-Allow-Origin'),origin);
 const bad=await call(e,'/health',{from:'https://evil.invalid'});
 assert.equal(bad.status,403);assert.equal(bad.headers.get('Access-Control-Allow-Origin'),null);
});
test('login errors and rate limits on inputs',async()=>{
 const e=env();
 assert.equal((await call(e,'/api/bootstrap',{headers:{...modheaders,'X-Access-Code':'bad'}})).status,401);
 assert.equal((await call(e,'/api/admin/results',{headers:{...adminheaders,'X-Admin-Key':'bad'}})).status,401);
 assert.equal((await call(e,'/api/review',{method:'POST',headers:modheaders,body:{clipId:'invalid',name:'Tester',choice:'include'}})).status,400);
});
test('mod review create, edit, clear, isolation and admin export',async()=>{
 const e=env();const c=clips[0];
 const boot=await call(e,'/api/bootstrap',{headers:modheaders});assert.equal(boot.status,200);
 const initial=await boot.json();assert.equal(initial.clips.length,355);assert.equal(initial.mine.length,0);
 const write={clipId:c.id,name:'Kongz',choice:'include',note:'great clip'};
 assert.equal((await call(e,'/api/review',{method:'POST',headers:modheaders,body:write})).status,200);
 let mine=await (await call(e,'/api/bootstrap',{headers:modheaders})).json();assert.equal(mine.mine[0].choice,'include');
 // Different reviewer cannot see first person's decisions.
 const other=await (await call(e,'/api/bootstrap',{headers:{...modheaders,'X-Reviewer-Id':id2}})).json(); assert.equal(other.mine.length,0);
 const updated={...write,choice:'maybe',note:'wait for context'};
 assert.equal((await call(e,'/api/review',{method:'POST',headers:modheaders,body:updated})).status,200);
 let results=await (await call(e,'/api/admin/results',{headers:adminheaders})).json();
 assert.equal(results.totalVotes,1);assert.equal(results.clips[0].maybe,1);assert.equal(results.clips[0].include,0);assert.equal(results.clips[0].notes[0].note,'wait for context');
 const csv=await call(e,'/api/admin/export.csv',{headers:adminheaders}); assert.equal(csv.status,200);
 const text=await csv.text(); assert.ok(text.includes('wait for context')); assert.ok(text.includes(c.url));
 assert.equal((await call(e,'/api/review',{method:'POST',headers:modheaders,body:{...write,choice:'clear'}})).status,200);
 results=await (await call(e,'/api/admin/results',{headers:adminheaders})).json();assert.equal(results.totalVotes,0);
});
test('missing secrets fail closed',async()=>{
 const e=env();e.ADMIN_KEY='';
 const res=await call(e,'/api/bootstrap',{headers:modheaders});assert.equal(res.status,503);
});
