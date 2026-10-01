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
  document.addEventListener('DOMContentLoaded',async function(){
    if(!(await isAdmin())) return;

    if(location.pathname==='/learning.html'){
      setTimeout(async function(){
        try{
          state.email='admin'; state.name='EDSA Administrator';
          const q=new URLSearchParams(location.search).get('course');
          if(q&&COURSES[q]){
            const lessons=await getLessons(q);
            LESSON_CACHE[q]=lessons; state.unlocked[q]=true; state.courseId=q;
            const requested=Number(new URLSearchParams(location.search).get('lesson'));
            state.lesson=Number.isFinite(requested)?Math.min(Math.max(0,requested),lessons.length-1):0;
            document.getElementById('courseHome').style.display='none';
            document.getElementById('courseView').style.display='grid';
            renderCourses(); renderCourse();
          }else{
            document.getElementById('welcome').textContent='Admin Preview Mode — all courses are available for testing. Student access and payments are unchanged.';
            renderCourses();
          }
        }catch(e){console.error('[EDSA] Admin learning preview:',e);}
      },150);
    }

    if(location.pathname==='/edsa-app.html'){
      const originalSelect=window.selectCourse;
      window.selectCourse=async function(courseId){
        const course=COURSES.find(c=>c.id===courseId);
        if(course){
          // Admins preview the exact student course/lesson flow without becoming a student,
          // consuming a key, changing course ownership, or creating exam entitlements.
          location.href='/learning.html?course='+encodeURIComponent(courseId)+'&lesson=0';
        }
      };

      const originalAuth=window.authenticateAdmin;
      if(typeof originalAuth==='function'){
        window.authenticateAdmin=async function(){
          await originalAuth.apply(this,arguments);
          if(state.adminAuthenticated){
            closeAdminModal();stopTimer();state.selectedCourse=null;showSection('stepCatalog');
            document.getElementById('userStatus').innerText='Admin Preview Mode';
          }
        };
      }

      const q=new URLSearchParams(location.search).get('course');
      if(q&&COURSES.some(c=>c.id===q)){
        setTimeout(async function(){
          if(await isAdmin()) location.href='/learning.html?course='+encodeURIComponent(q)+'&lesson=0';
        },250);
      }
    }
  });
})();
