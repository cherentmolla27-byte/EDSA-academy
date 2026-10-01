(function(){
  "use strict";
  async function isAdmin(){
    try{const r=await fetch('/api/admin-me',{credentials:'include',cache:'no-store'});const x=await r.json().catch(()=>({}));return !!(r.ok&&x.ok&&x.role==='admin');}catch(_){return false;}
  }
  async function getLessons(courseId){
    const r=await fetch('/api/admin-course-content?courseId='+encodeURIComponent(courseId),{credentials:'include',cache:'no-store'});
    const x=await r.json().catch(()=>({}));
    if(!r.ok||!x.ok) throw new Error(x.error||'Admin course preview unavailable');
    return x.lessons||[];
  }
  async function initAdminPreview(){
    if(window.__EDSA_ADMIN_PREVIEW_INITIALIZED) return;
    window.__EDSA_ADMIN_PREVIEW_INITIALIZED=true;
    if(!(await isAdmin())) return;

    if(location.pathname==='/learning.html'||location.pathname==='/admin-learning.html'){
      try{
        state.email='admin'; state.name='EDSA Administrator';
        const q=new URLSearchParams(location.search).get('course');
        if(q&&COURSES[q]){
          const lessons=await getLessons(q);
          LESSON_CACHE[q]=lessons; state.unlocked[q]=true; state.courseId=q;
          const requested=Number(new URLSearchParams(location.search).get('lesson'));
          state.lesson=Number.isFinite(requested)?Math.min(Math.max(0,requested),Math.max(0,lessons.length-1)):0;
          const home=document.getElementById('courseHome'), view=document.getElementById('courseView');
          if(home) home.style.display='none';
          if(view) view.style.display='grid';
          if(typeof renderCourses==='function') renderCourses();
          if(typeof renderCourse==='function') renderCourse();
        }else{
          const welcome=document.getElementById('welcome');
          if(welcome) welcome.textContent='Admin Preview Mode — all courses are available for testing. Student access and payments are unchanged.';
          if(typeof renderCourses==='function') renderCourses();
        }
      }catch(e){console.error('[EDSA] Admin learning preview:',e);}
    }

    if(location.pathname==='/edsa-app.html'){
      const originalSelect=window.selectCourse;
      if(typeof originalSelect==='function' && !window.__EDSA_ADMIN_SELECT_WRAPPED){
        window.__EDSA_ADMIN_SELECT_WRAPPED=true;
        window.selectCourse=async function(courseId){
          if(await isAdmin()){
            const course=typeof COURSES!=='undefined'&&COURSES.find(c=>c.id===courseId);
            if(course){
              location.href='/admin-learning.html?course='+encodeURIComponent(courseId)+'&lesson=0';
            }
            return;
          }
          return originalSelect.apply(this,arguments);
        };
      }

      const originalAuth=window.authenticateAdmin;
      if(typeof originalAuth==='function' && !window.__EDSA_ADMIN_AUTH_WRAPPED){
        window.__EDSA_ADMIN_AUTH_WRAPPED=true;
        window.authenticateAdmin=async function(){
          await originalAuth.apply(this,arguments);
          if(state.adminAuthenticated){
            closeAdminModal();
            if(typeof stopTimer==='function') stopTimer();
            state.selectedCourse=null;
            if(typeof showSection==='function') showSection('stepCatalog');
            const status=document.getElementById('userStatus');
            if(status) status.innerText='Admin Preview Mode';
          }
        };
      }

      const q=new URLSearchParams(location.search).get('course');
      if(q&&typeof COURSES!=='undefined'&&COURSES.some(c=>c.id===q)){
        setTimeout(async function(){
          if(await isAdmin()) location.href='/admin-learning.html?course='+encodeURIComponent(q)+'&lesson=0';
        },250);
      }
    }
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initAdminPreview,{once:true});
  else initAdminPreview();
})();