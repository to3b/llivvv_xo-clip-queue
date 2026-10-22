import { clips } from './clips-data.js';

const clipById = new Map(clips.map(c => [c.id, c]));
const enc = new TextEncoder();

// Compare password-derived digests without an early mismatch exit.
async function matches(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !b) return false;
  const [x, y] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b))
  ]);
  let diff = 0;
  const aa = new Uint8Array(x), bb = new Uint8Array(y);
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

function response(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status, headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extra,
    }
  });
}
function isId(s) { return typeof s === 'string' && /^[a-f0-9-]{20,60}$/i.test(s); }
function csvEscape(value) {
  let v = String(value ?? '');
  // Avoid formula interpretation when opening exports in spreadsheet apps.
  if (/^[\s\uFEFF]*[=+@\-]/.test(v)) v = "'" + v;
  return /[",\r\n]/.test(v) ? '"' + v.replaceAll('"','""') + '"' : v;
}
function csvContent(reviews) {
  const lines = [['Clip title','Clip ID','Clip URL','Clip creator','Clip date','Reviewer','Decision','Comment','Reviewed at']];
  for (const r of reviews) {
    const c = clipById.get(r.clip_id);
    if (!c) continue;
    lines.push([c.title,c.id,c.url,c.clipper,c.createdAt,r.name,r.choice,r.note,r.updated_at]);
  }
  return '\uFEFF' + lines.map(row => row.map(csvEscape).join(',')).join('\r\n');
}
function summarise(reviews) {
  const summaries = new Map(clips.map(c => [c.id, {include:0,maybe:0,skip:0,total:0,notes:[]}]));
  const people = new Map();
  for (const r of reviews) {
    const s = summaries.get(r.clip_id);
    if (!s || !['include','maybe','skip'].includes(r.choice)) continue;
    s[r.choice]++;
    s.total++;
    s.notes.push({name:r.name,choice:r.choice,note:r.note,updatedAt:r.updated_at});
    let person = people.get(r.reviewer_id);
    if (!person) {person={id:r.reviewer_id,name:r.name,total:0,include:0,maybe:0,skip:0};people.set(r.reviewer_id,person);}
    person.name = r.name;person.total++;person[r.choice]++;
  }
  return {
    clips: clips.map(c => ({...c,...summaries.get(c.id)})),
    reviewers: [...people.values()].sort((a,b)=>b.total-a.total),
    totalVotes: reviews.length
  };
}
function allowedOrigin(req, env) {
  const origin = req.headers.get('Origin');
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(x=>x.trim()).filter(Boolean);
  // Browser requests require an approved Origin. CLI clients still need valid secrets.
  return (!origin || allowed.includes(origin)) ? origin : null;
}
function withCors(res, origin) {
  if (origin) res.headers.set('Access-Control-Allow-Origin', origin);
  res.headers.set('Vary', 'Origin');
  res.headers.set('X-Content-Type-Options','nosniff');
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
async function getReviews(env) {
  const result = await env.DB.prepare('SELECT clip_id, reviewer_id, name, choice, note, updated_at FROM reviews').all();
  return result.results || [];
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin');
    const approvedOrigin = allowedOrigin(req, env);
    if (origin && !approvedOrigin) return response({error:'This website origin is not allowed'},403);
    if (req.method === 'OPTIONS') {
      return withCors(new Response(null,{status:204,headers:{
        'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers':'Content-Type, X-Reviewer-Id, X-Admin-Key',
        'Access-Control-Max-Age':'600'
      }}),approvedOrigin);
    }
    const reply = (body,status=200,headers={}) => withCors(response(body,status,headers),approvedOrigin);
    const pathname = new URL(req.url).pathname;
    try {
      if (pathname === '/health' && req.method === 'GET') return reply({ok:true,clips:clips.length});
      if (pathname === '/api/bootstrap' && req.method === 'GET') {
        const id=req.headers.get('X-Reviewer-Id');
        if (!isId(id)) return reply({error:'Missing reviewer ID'},400);
        const results=await env.DB.prepare('SELECT clip_id, choice, note FROM reviews WHERE reviewer_id = ?').bind(id).all();
        return reply({clips,mine:(results.results||[]).map(r=>({clipId:r.clip_id,choice:r.choice,note:r.note}))});
      }
      if (pathname === '/api/review' && req.method === 'POST') {
        const id=req.headers.get('X-Reviewer-Id');
        if (!isId(id)) return reply({error:'Invalid reviewer ID'},400);
        if (Number(req.headers.get('Content-Length')||0)>12000) return reply({error:'Request too large'},413);
        let body;
        try {const raw=await req.text(); if(raw.length>12000) return reply({error:'Request too large'},413); body=JSON.parse(raw);} catch {return reply({error:'Invalid JSON'},400);}
        if (!body || typeof body !== 'object') return reply({error:'Invalid request'},400);
        const name=(typeof body.name==='string'?body.name.trim():'') || 'Anonymous';
        const note=typeof body.note==='string'?body.note.trim():'';
        if (name.length<1 || name.length>32) return reply({error:'Name must be 1–32 characters'},400);
        if (!clipById.has(body.clipId)) return reply({error:'Unknown clip'},400);
        if (note.length>350) return reply({error:'Comment cannot exceed 350 characters'},400);
        if (!['include','maybe','skip','clear'].includes(body.choice)) return reply({error:'Invalid decision'},400);
        if (body.choice === 'clear') {
          await env.DB.prepare('DELETE FROM reviews WHERE clip_id = ? AND reviewer_id = ?').bind(body.clipId,id).run();
        } else {
          await env.DB.prepare(`INSERT INTO reviews (clip_id, reviewer_id, name, choice, note, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(clip_id,reviewer_id) DO UPDATE SET
           name=excluded.name, choice=excluded.choice, note=excluded.note, updated_at=excluded.updated_at`)
            .bind(body.clipId,id,name,body.choice,note,new Date().toISOString()).run();
        }
        return reply({ok:true});
      }
      if (pathname === '/api/admin/results' && req.method === 'GET') {
        if (!env.ADMIN_KEY) return reply({error:'Admin password not configured. Set ADMIN_KEY in Cloudflare.'},503);
        if (!await matches(req.headers.get('X-Admin-Key'),env.ADMIN_KEY)) return reply({error:'Invalid admin password'},401);
        return reply(summarise(await getReviews(env)));
      }
      if (pathname === '/api/admin/export.csv' && req.method === 'GET') {
        if (!await matches(req.headers.get('X-Admin-Key'),env.ADMIN_KEY)) return reply({error:'Invalid admin password'},401);
        return withCors(new Response(csvContent(await getReviews(env)),{status:200,headers:{
          'Content-Type':'text/csv; charset=utf-8',
          'Content-Disposition':'attachment; filename="liv-clip-reviews.csv"'
        }}),approvedOrigin);
      }
      return reply({error:'Not found'},404);
    } catch (e) {
      console.error('Clip Room API error',e);
      return reply({error:'Backend error; please retry'},500);
    }
  }
};
