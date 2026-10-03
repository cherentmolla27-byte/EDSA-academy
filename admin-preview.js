(function(){
  "use strict";

  async function isAdmin(){
    try{
      const r=await fetch('/api/admin-me',{credentials:'include',cache:'no-store'});
      const x=await r.json().catch(()=>({}));
      const role=x&&x.user&&x.user.role ? x.user.role : (x&&x.role ? x.role : '');
      return !!(r.ok&&x.ok&&role==='admin');
    }catch(_){return false;}
  }

  async function getLessons(courseId){
    const r=await fetch('/api/admin-course-content?courseId='+encodeURIComponent(courseId),{credentials:'include',cache:'no-store'});
    const x=await r.json().catch(()=>({}));
    if(!r.ok||!x.ok) throw new Error(x.error||'Admin course preview unavailable');
    return x.lessons||[];
  }

  async function initAdminPreview(){
    if(window.__EDSA_ADMIN_PREVIEW_INITIALIZED)return;
    window.__EDSA_ADMIN_PREVIEW_INITIALIZED=true;
    if(!(await isAdmin()))return;

    window.__EDSA_ADMIN_PREVIEW=true;
    window.EDSA_ADMIN_PREVIEW=true;
    document.documentElement.setAttribute('data-edsa-admin-preview','true');

    // The normal Learning Center boot must not replace the administrator
    // preview state with a student-authentication failure.
    if(typeof state!=='undefined'){
      state.email='admin';
      state.name='EDSA Administrator';
      state.unlocked=state.unlocked||{};
    }

    const q=new URLSearchParams(location.search).get('course');
    if(q && typeof COURSES!=='undefined' && COURSES[q]){
      try{
        const lessons=await getLessons(q);
        LESSON_CACHE[q]=lessons;
        state.unlocked[q]=true;
        state.courseId=q;
        const requested=Number(new URLSearchParams(location.search).get('lesson'));
        state.lesson=Number.isFinite(requested)?Math.min(Math.max(0,requested),Math.max(0,lessons.length-1)):0;
        const home=document.getElementById('courseHome'), view=document.getElementById('courseView');
        if(home)home.style.display='none';
        if(view)view.style.display='grid';
        if(typeof renderCourses==='function')renderCourses();
        if(typeof renderCourse==='function')renderCourse();
        if(typeof scrollToLesson==='function')scrollToLesson();
      }catch(e){
        console.error('[EDSA] Admin learning preview:',e);
      }
    }else{
      const home=document.getElementById('courseHome'), view=document.getElementById('courseView');
      if(home)home.style.display='';
      if(view)view.style.display='none';
      const welcome=document.getElementById('welcome');
      if(welcome)welcome.textContent='Admin Preview Mode — all courses, lessons and exam access are available for testing. Student payments and access rules are unchanged.';
      if(typeof renderCourses==='function')renderCourses();
    }
  }

  // admin-learning.html injects this file into the head of learning.html.
  // Capture DOMContentLoaded so the normal student boot cannot run first.
  function install(){
    if(window.__EDSA_ADMIN_PREVIEW_LISTENER)return;
    window.__EDSA_ADMIN_PREVIEW_LISTENER=true;
    document.addEventListener('DOMContentLoaded',function(e){
      if(location.pathname==='/learning.html' || location.pathname==='/admin-learning.html'){
        e.stopImmediatePropagation();
        initAdminPreview();
      }
    },true);
  }
  install();
})();
