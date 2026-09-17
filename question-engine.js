(function(){
'use strict';

// EDSA QUESTION ENGINE — SMM FIRST
// This version intentionally handles Social Media Management only.
// Other subjects will be added after SMM is verified.

function shuffle(a){
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function getCourses(){
  try{
    if(Array.isArray(window.COURSES)) return window.COURSES;
  }catch(_){ }
  try{
    const c=eval('COURSES');
    return Array.isArray(c)?c:[];
  }catch(_){
    return [];
  }
}

function getState(){
  try{
    if(window.state) return window.state;
  }catch(_){ }
  try{
    return eval('state');
  }catch(_){
    return null;
  }
}

function normalizeQuestion(q){
  if(!q || typeof q.q!=='string' || !Array.isArray(q.options) || q.options.length!==4) return null;
  if(!Number.isInteger(q.correct) || q.correct<0 || q.correct>=4) return null;
  if(q.options.some(x=>typeof x!=='string' || !x.trim())) return null;
  const options=shuffle(q.options.map((text,i)=>({text,correct:i===q.correct})));
  return {
    q:q.q.trim(),
    options:options.map(x=>x.text),
    correct:options.findIndex(x=>x.correct)
  };
}

function buildSMM(){
  const bank=window.EDSA_ADVANCED_BANKS && Array.isArray(window.EDSA_ADVANCED_BANKS.smm)
    ? window.EDSA_ADVANCED_BANKS.smm
    : [];

  const seen=new Set();
  const clean=[];
  bank.forEach(raw=>{
    const q=normalizeQuestion(raw);
    if(!q) return;
    const key=q.q.toLowerCase();
    if(seen.has(key)) return;
    seen.add(key);
    clean.push(q);
  });

  if(clean.length<50){
    console.error('[EDSA] SMM bank is not ready: '+clean.length+'/50 valid questions found.');
    return [];
  }

  // Exactly 50 unique SMM questions for this exam.
  return shuffle(clean.slice(0,50));
}

function applySMM(){
  const courses=getCourses();
  const course=courses.find(x=>x && x.id==='smm');
  if(!course) return false;

  const questions=buildSMM();
  if(questions.length!==50) return false;

  course.questions=questions;
  return true;
}

function install(){
  applySMM();

  const originalSelect=window.selectCourse;
  if(typeof originalSelect==='function' && !originalSelect.__edsaSMMFixed){
    const wrapped=function(id){
      originalSelect(id);
      if(String(id)==='smm'){
        const s=getState();
        const course=s && s.selectedCourse;
        const questions=buildSMM();
        if(course && course.id==='smm' && questions.length===50){
          course.questions=questions;
          // Re-render the exam with the verified 50-question SMM bank.
          try{
            if(typeof window.renderQuiz==='function') window.renderQuiz();
          }catch(_){ }
        }
      }
    };
    wrapped.__edsaSMMFixed=true;
    window.selectCourse=wrapped;
  }
}

window.EDSA_INSTALL_QUESTION_ENGINE=install;

function ensureAdvancedBank(){
  if(window.EDSA_ADVANCED_BANKS && Array.isArray(window.EDSA_ADVANCED_BANKS.smm)){
    install();
    return;
  }

  const existing=document.querySelector('script[data-edsa-advanced-bank="1"]');
  if(existing) return;

  const s=document.createElement('script');
  s.src='/advanced-question-banks.js';
  s.setAttribute('data-edsa-advanced-bank','1');
  s.onload=install;
  s.onerror=function(){
    console.error('[EDSA] Could not load advanced-question-banks.js');
  };
  document.head.appendChild(s);
}

ensureAdvancedBank();
})();