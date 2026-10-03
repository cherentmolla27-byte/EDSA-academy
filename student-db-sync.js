(function(){
  "use strict";
  // Student learning is intentionally free after sign-in. The exam/payment
  // entitlement remains separate and is handled by the exam flow itself.
  function patchFreeLearning(){
    if(location.pathname!=="/learn.html") return;
    setTimeout(function(){
      try{
        if(window.learningState && window.LEARNING_COURSES){
          Object.keys(window.LEARNING_COURSES).forEach(function(id){
            window.learningState.unlocked[id]=true;
          });
        }
        if(typeof window.learningSelectCourse!=="function") return;
        var original=window.learningSelectCourse;
        if(original.__EDSA_FREE_COURSES) return;
        async function freeLearningSelectCourse(id,lessonIndex){
          var oldAccess=window.checkCourseAccess;
          window.checkCourseAccess=async function(){return true;};
          try{
            return await original.call(this,id,lessonIndex||0);
          }finally{
            window.checkCourseAccess=oldAccess;
          }
        }
        freeLearningSelectCourse.__EDSA_FREE_COURSES=true;
        window.learningSelectCourse=freeLearningSelectCourse;
        if(typeof window.renderCourses==="function") window.renderCourses();
      }catch(error){
        console.warn("[EDSA] Free learning patch failed:",error);
      }
    },0);
  }
  document.addEventListener("DOMContentLoaded",patchFreeLearning);
})();
