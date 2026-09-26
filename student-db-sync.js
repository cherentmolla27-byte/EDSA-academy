/* EDSA homepage visual layer — loads only on the public home page. */
(function(){
  try{
    if(location.pathname==='/' || location.pathname==='/index.html'){
      var link=document.createElement('link');
      link.rel='stylesheet';
      link.href='/home-redesign.css?v=1';
      document.head.appendChild(link);
      document.addEventListener('DOMContentLoaded',function(){
        var how=document.querySelectorAll('#how .edsa-info');
        how.forEach(function(card,i){card.setAttribute('data-step',String(i+1));});
      });
    }
  }catch(_){}
})();

/* EDSA Step 12 — server-backed student database bridge */
(function () {
  "use strict";

  // Some production browsers/proxies are dropping the session cookie on POST API calls.
  // Keep the HttpOnly cookie as the primary mechanism, but attach the short-lived
  // signed session token from sessionStorage as an Authorization fallback.
  const nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    try {
      const rawUrl = typeof input === "string" ? input : (input && input.url);
      const url = new URL(rawUrl || "", window.location.href);
      const token = sessionStorage.getItem("EDSA_SESSION_TOKEN") || "";
      if (token && url.origin === window.location.origin && url.pathname.startsWith("/api/")) {
        const headers = new Headers((init && init.headers) || (input instanceof Request ? input.headers : undefined));
        headers.set("Authorization", "Bearer " + token);
        return nativeFetch(input, Object.assign({}, init || {}, { headers }));
      }
    } catch (_) {}
    return nativeFetch(input, init);
  };

  const JOURNEY_KEY = "EDSA_STUDENT_JOURNEY";
  const CERT_KEY = "EDSA_CERTIFICATES";
  let syncing = false;

  function profile() {
    try {
      const accounts = JSON.parse(localStorage.getItem("EDSA_STUDENT_ACCOUNTS") || "{}");
      const active = String(localStorage.getItem("EDSA_ACTIVE_EMAIL") || "").toLowerCase();
      if (active && accounts[active]) return accounts[active];
      const legacy = JSON.parse(localStorage.getItem("EDSA_STUDENT_PROFILE") || "null");
      return legacy && legacy.email ? legacy : null;
    } catch (_) { return null; }
  }
  function saveProfile(p) {
    if (!p || !p.email) return;
    try {
      const accounts = JSON.parse(localStorage.getItem("EDSA_STUDENT_ACCOUNTS") || "{}");
      const email = String(p.email).trim().toLowerCase();
      accounts[email] = Object.assign({}, accounts[email] || {}, p);
      localStorage.setItem("EDSA_STUDENT_ACCOUNTS", JSON.stringify(accounts));
      localStorage.setItem("EDSA_ACTIVE_EMAIL", email);
      localStorage.setItem("EDSA_STUDENT_PROFILE", JSON.stringify(accounts[email]));
    } catch (_) {}
  }
  async function getServerProfile() {
    try {
      const response = await fetch("/api/auth-me", {method:"GET",credentials:"same-origin",cache:"no-store"});
      const result = await response.json().catch(()=>({}));
      if (response.ok && result.ok && result.user && result.user.email) { saveProfile(result.user); return result.user; }
    } catch (_) {}
    return null;
  }
  function journey(){try{const v=JSON.parse(localStorage.getItem(JOURNEY_KEY)||"{}");return v&&typeof v==='object'?v:{};}catch(_){return {};}}
  function certificates(){try{const v=JSON.parse(localStorage.getItem(CERT_KEY)||"{}");return v&&typeof v==='object'?v:{};}catch(_){return {};}}
  function saveJourney(v){localStorage.setItem(JOURNEY_KEY,JSON.stringify(v));}
  function saveCertificates(v){localStorage.setItem(CERT_KEY,JSON.stringify(v));}
  async function push(){
    if(syncing)return false; let p=profile(); if(!p||!p.email)p=await getServerProfile(); if(!p||!p.email)return false; syncing=true;
    try{const response=await fetch("/api/student-sync",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({profile:p,journey:journey(),certificates:certificates()})});return response.ok;}
    catch(_){return false}finally{syncing=false;}
  }
  async function pull(){
    let p=profile();if(!p||!p.email)p=await getServerProfile();if(!p||!p.email)return false;
    try{const response=await fetch("/api/student-sync",{method:"GET",credentials:"same-origin",cache:"no-store"});const result=await response.json().catch(()=>({}));if(!response.ok||!result.ok||!result.student)return false;
      const email=String(result.student.email||p.email).toLowerCase(),allJourney=journey(),localStudent=allJourney[email]||{courses:{}};localStudent.courses=localStudent.courses||{};
      (result.progress||[]).forEach(function(row){const current=localStudent.courses[row.course_id]||{};localStudent.courses[row.course_id]=Object.assign({},current,{courseTitle:row.course_title,attempts:Number(row.attempts||0),status:row.passed?'passed':(row.latest_status||current.status||'not-started'),bestScore:row.best_score,lastScore:row.latest_score,lastAttempt:row.last_attempt_at,certificateId:row.certificate_id||current.certificateId||null});});
      allJourney[email]=localStudent;saveJourney(allJourney);const localCerts=certificates();
      (result.certificates||[]).forEach(function(row){localCerts[row.certificate_id]=Object.assign({},localCerts[row.certificate_id]||{},{id:row.certificate_id,name:row.student_name,courseId:row.course_id,course:row.course_title,score:row.score,issueDate:row.issue_date,status:row.status,verificationUrl:row.verification_url,issuedBy:row.issued_by});});saveCertificates(localCerts);return true;
    }catch(_){return false;}
  }
  async function syncNow(){const ok=await push();if(ok)await pull();return ok;}
  window.EDSA_DB_SYNC={push,pull,syncNow};
  document.addEventListener("DOMContentLoaded",function(){setTimeout(function(){if(typeof installGoldCertificateRenderer==='function')installGoldCertificateRenderer();if(profile()) syncNow();setInterval(function(){ if(document.visibilityState === "visible" && profile()) syncNow(); },30000);},1200);});
  window.addEventListener("pagehide",function(){try{const p=profile();if(!p||!p.email||!navigator.sendBeacon)return;const payload=JSON.stringify({profile:p,journey:journey(),certificates:certificates()});navigator.sendBeacon("/api/student-sync",new Blob([payload],{type:"application/json"}));}catch(_){} });
})();

// Step 12: record each completed exam in Supabase without changing payment handling.
(function installExamAttemptRecorder(){
  let tries=0;const timer=setInterval(function(){tries++;
    if(typeof window.startTimer==='function'&&!window.__EDSA_START_TIMER_WRAPPED){const originalStartTimer=window.startTimer;window.startTimer=function(){window.__EDSA_EXAM_STARTED_AT=new Date().toISOString();window.__EDSA_EXAM_ATTEMPT_RECORDED=false;return originalStartTimer.apply(this,arguments)};window.__EDSA_START_TIMER_WRAPPED=true;}
    if(typeof window.renderResult==='function'&&!window.__EDSA_RESULT_WRAPPED){const originalRenderResult=window.renderResult;window.renderResult=function(passed,score,correctCount){const result=originalRenderResult.apply(this,arguments);recordExamAttempt(passed,score);return result};window.__EDSA_RESULT_WRAPPED=true;}
    if((window.__EDSA_START_TIMER_WRAPPED&&window.__EDSA_RESULT_WRAPPED)||tries>120)clearInterval(timer);
  },100);
  async function recordExamAttempt(passed,score){try{const params=new URLSearchParams(window.location.search);if(params.get('test')==='certificate')return;}catch(_){}if(window.__EDSA_EXAM_ATTEMPT_RECORDED)return;const numericScore=Number(score);if(!Number.isFinite(numericScore))return;const courseTitle=String((document.getElementById('examCourseTitle')||{}).innerText||'').trim();if(!courseTitle)return;window.__EDSA_EXAM_ATTEMPT_RECORDED=true;const completedAt=new Date().toISOString(),startedAt=window.__EDSA_EXAM_STARTED_AT||completedAt;try{const response=await fetch('/api/exam-attempt',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({courseTitle,score:numericScore,passed:!!passed,startedAt,completedAt})});const result=await response.json().catch(()=>({}));if(!response.ok||!result.ok)window.__EDSA_EXAM_ATTEMPT_RECORDED=false;}catch(_){window.__EDSA_EXAM_ATTEMPT_RECORDED=false;}}
})();
