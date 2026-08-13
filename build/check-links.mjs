#!/usr/bin/env node
/** Link and anchor checker for the generated site. Exits non-zero on any break. */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
const OUT='docs'; const files=[];
async function walk(d){for(const e of await readdir(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())await walk(p);else if(p.endsWith('.html'))files.push(p);}}
await walk(OUT);
const pageSet=new Set(files.map(f=>'/'+path.relative(OUT,f).replace(/index\.html$/,'').replace(/\\/g,'/')));
const broken=new Map(); const anchors=new Map();
for(const f of files){
  const html=await readFile(f,'utf8');
  const from='/'+path.relative(OUT,f).replace(/index\.html$/,'');
  const ids=new Set([...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]));
  anchors.set(from,ids);
  for(const m of html.matchAll(/href="(\/[^"#?]*)([#?][^"]*)?"/g)){
    let href=m[1]; if(!href.endsWith('/')&&!/\.\w+$/.test(href))href+='/';
    if(/\.(css|js|json|svg|xml|txt)$/.test(href))continue;
    if(!pageSet.has(href)){ if(!broken.has(href))broken.set(href,new Set()); broken.get(href).add(from); }
  }
}
// second pass: anchors
const badAnchor=new Map();
for(const f of files){
  const html=await readFile(f,'utf8');
  const from='/'+path.relative(OUT,f).replace(/index\.html$/,'');
  for(const m of html.matchAll(/href="(\/[^"#]*)#([^"]+)"/g)){
    let href=m[1]; if(!href.endsWith('/'))href+='/';
    if(!pageSet.has(href))continue;
    const ids=anchors.get(href.replace(/\/$/,'/')) || anchors.get(href);
    if(ids && !ids.has(m[2])){ const k=href+'#'+m[2]; if(!badAnchor.has(k))badAnchor.set(k,new Set()); badAnchor.get(k).add(from); }
  }
}
console.log('pages:',pageSet.size);
console.log('\nBROKEN PAGE LINKS:');
for(const [h,srcs] of broken) console.log('  ',h,'←',[...srcs].slice(0,3).join(', '));
console.log('\nBROKEN ANCHORS:');
for(const [h,srcs] of badAnchor) console.log('  ',h,'←',[...srcs].slice(0,2).join(', '));

if (broken.size || badAnchor.size) { console.error('\nFAILED: broken references found'); process.exit(1); }
console.log('all internal links and anchors resolve');
