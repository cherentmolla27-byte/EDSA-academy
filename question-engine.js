(function(){
'use strict';

// EDSA QUESTION ENGINE
// SMM, Digital Marketing, and PBM are handled by dedicated validated banks.
// Other subjects remain untouched until they are individually verified.

function shuffle(a){
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function getCourses(){
  try{ if(Array.isArray(window.COURSES)) return window.COURSES; }catch(_){ }
  try{ const c=eval('COURSES'); return Array.isArray(c)?c:[]; }catch(_){ return []; }
}

function normalizeQuestion(q){
  if(!q || typeof q.q!=='string' || !Array.isArray(q.options) || q.options.length!==4) return null;
  if(!Number.isInteger(q.correct) || q.correct<0 || q.correct>=4) return null;
  if(q.options.some(x=>typeof x!=='string' || !x.trim())) return null;
  const options=shuffle(q.options.map((text,i)=>({text,correct:i===q.correct})));
  return {q:q.q.trim(),options:options.map(x=>x.text),correct:options.findIndex(x=>x.correct)};
}

function cleanBank(bank,label){
  const seen=new Set();
  const clean=[];
  (Array.isArray(bank)?bank:[]).forEach(raw=>{
    const q=normalizeQuestion(raw);
    if(!q) return;
    const key=q.q.toLowerCase();
    if(seen.has(key)) return;
    seen.add(key);
    clean.push(q);
  });
  if(clean.length<50){
    console.error('[EDSA] '+label+' bank is not ready: '+clean.length+'/50 valid unique questions.');
    return [];
  }
  return shuffle(clean.slice(0,50));
}

function buildSMM(){
  return cleanBank(window.EDSA_ADVANCED_BANKS && window.EDSA_ADVANCED_BANKS.smm,'SMM');
}

function buildDME(){
  return cleanBank(window.EDSA_DIGITAL_MARKETING_BANK,'Digital Marketing');
}

function buildPBM(){
  return cleanBank(window.EDSA_PROJECT_BUSINESS_MANAGEMENT_BANK,'Project/Business Management');
}

function applyBanks(){
  const courses=getCourses();
  if(!Array.isArray(courses)) return;
  const smm=courses.find(x=>x&&x.id==='smm');
  const dme=courses.find(x=>x&&x.id==='dme');
  const pbm=courses.find(x=>x&&x.id==='pbm');
  if(smm){ const q=buildSMM(); if(q.length===50) smm.questions=q; }
  if(dme){ const q=buildDME(); if(q.length===50) dme.questions=q; }
  if(pbm){ const q=buildPBM(); if(q.length===50) pbm.questions=q; }
}

function install(){
  applyBanks();
  const originalSelect=window.selectCourse;
  if(typeof originalSelect==='function' && !originalSelect.__edsaDedicatedBanks){
    const wrapped=function(id){
      if(String(id)==='smm'){
        const q=buildSMM();
        const c=getCourses().find(x=>x&&x.id==='smm');
        if(c&&q.length===50) c.questions=q;
      }
      if(String(id)==='dme'){
        const q=buildDME();
        const c=getCourses().find(x=>x&&x.id==='dme');
        if(c&&q.length===50) c.questions=q;
      }
      if(String(id)==='pbm'){
        const q=buildPBM();
        const c=getCourses().find(x=>x&&x.id==='pbm');
        if(c&&q.length===50) c.questions=q;
      }
      return originalSelect.apply(this,arguments);
    };
    wrapped.__edsaDedicatedBanks=true;
    window.selectCourse=wrapped;
  }
}

function loadScript(src,marker,done){
  if(document.querySelector('script['+marker+']')){ done(); return; }
  const s=document.createElement('script');
  s.src=src;
  s.setAttribute(marker,'1');
  s.onload=done;
  s.onerror=function(){ console.error('[EDSA] Could not load '+src); done(); };
  document.head.appendChild(s);
}

function boot(){
  const tasks=[];
  if(!(window.EDSA_ADVANCED_BANKS&&Array.isArray(window.EDSA_ADVANCED_BANKS.smm))){
    tasks.push(function(next){loadScript('/advanced-question-banks.js','data-edsa-advanced-bank',next);});
  }
  if(!Array.isArray(window.EDSA_DIGITAL_MARKETING_BANK)){
    tasks.push(function(next){loadScript('/digital-marketing-question-bank.js','data-edsa-dme-bank',next);});
  }
  if(!Array.isArray(window.EDSA_PROJECT_BUSINESS_MANAGEMENT_BANK)){
    tasks.push(function(next){loadScript('/project-business-management-question-bank.js','data-edsa-pbm-bank',next);});
  }
  let i=0;
  function next(){
    if(i>=tasks.length){ install(); return; }
    tasks[i++](next);
  }
  next();
}

window.EDSA_INSTALL_QUESTION_ENGINE=install;
boot();
})();