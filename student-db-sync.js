(function(){
  "use strict";
  function showLogin(){var home=document.getElementById("edsaPublicHome"),login=document.getElementById("edsaLoginScreen"),reg=document.getElementById("edsaRegisterScreen"),dash=document.getElementById("edsaDashboard");if(home)home.style.display="none";if(dash)dash.style.display="none";if(reg)reg.style.display="none";if(login){login.style.display="flex";login.classList.add("show");}window.scrollTo(0,0);var email=document.getElementById("loginEmail");if(email)setTimeout(function(){email.focus();},50);}
  function showRegister(){var home=document.getElementById("edsaPublicHome"),login=document.getElementById("edsaLoginScreen"),reg=document.getElementById("edsaRegisterScreen"),dash=document.getElementById("edsaDashboard");if(home)home.style.display="none";if(dash)dash.style.display="none";if(login)login.style.display="none";if(reg)reg.style.display="flex",reg.classList.add("show");window.scrollTo(0,0);var name=document.getElementById("registerName");if(name)setTimeout(function(){name.focus();},50);}
  function getCourseId(target){var node=target&&target.closest?target.closest(".edsa-ref-courses article,.edsa-pcourse"):null;if(!node)return null;var onclick=node.getAttribute("onclick")||"";var m=onclick.match(/EDSA_OPEN_COURSE\(['\"]([^'\"]+)['\"]/);if(m)return m[1];var button=node.querySelector("[onclick*=EDSA_OPEN_COURSE]");if(button){m=(button.getAttribute("onclick")||"").match(/EDSA_OPEN_COURSE\(['\"]([^'\"]+)['\"]/);if(m)return m[1];}return node.getAttribute("data-course")||null;}
  function openCourseFromHome(e){var target=e.target,card=target&&target.closest?target.closest(".edsa-ref-courses article,.edsa-pcourse"):null;if(!card)return;var id=getCourseId(target);if(!id)return;var profile=null;try{var accounts=JSON.parse(localStorage.getItem("EDSA_STUDENT_ACCOUNTS")||"{}");var active=String(localStorage.getItem("EDSA_ACTIVE_EMAIL")||"").toLowerCase();profile=active&&accounts[active]?accounts[active]:null;}catch(_){}if(!profile){e.preventDefault();e.stopImmediatePropagation();showLogin();}}
  window.EDSA_SHOW_LOGIN=window.EDSA_SHOW_LOGIN||showLogin;window.EDSA_SHOW_REGISTER=window.EDSA_SHOW_REGISTER||showRegister;window.EDSA_START=window.EDSA_START||showLogin;
  async function activateAndOpenLearning(e){if(e)e.preventDefault();try{var token=sessionStorage.getItem("EDSA_SESSION_TOKEN")||localStorage.getItem("EDSA_SESSION_TOKEN")||"",headers=token?{"Authorization":"Bearer "+token}:{};var auth=await fetch("/api/auth-me",{credentials:"include",headers:headers,cache:"no-store"}),a=await auth.json().catch(function(){return {};});if(!auth.ok||!a.ok||!a.authenticated||!a.user||a.user.role!=="student"){window.location.href="/?login=1&return="+encodeURIComponent(location.pathname+location.search);return;}var course=window.state&&window.state.selectedCourse,courseId=course&&course.id;if(!courseId)courseId=new URLSearchParams(location.search).get("course");if(!courseId){alert("Please select a course first.");return;}var keyInput=document.getElementById("accessKey"),code=keyInput?String(keyInput.value||"").trim().toUpperCase():"";if(!code){alert("Please enter your activation key.");return;}var activation=await fetch("/api/activate-key",{method:"POST",credentials:"include",headers:Object.assign({"Content-Type":"application/json"},headers),body:JSON.stringify({code:code,courseId:courseId}),result=await activation.json().catch(function(){return {};});if(!activation.ok||!result.ok){alert(result.error||"This activation key is invalid or has already been used.");return;}var email=String(a.user.email||"").trim().toLowerCase();localStorage.setItem("EDSA_LAST_ACTIVATED_COURSE",courseId);localStorage.setItem("EDSA_LAST_ACTIVATED_EMAIL",email);localStorage.setItem("EDSA_COURSE_UNLOCKED_"+email+"_"+courseId,"1");window.location.href="/learning.html?course="+encodeURIComponent(courseId)+"&lesson=0";}catch(err){console.error("[EDSA] Course activation flow failed:",err);alert("We could not verify the activation key right now. Please try again.");}}
  function updatePriceLabels(){try{var root=document.body;if(!root)return;var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);var node;while(node=walker.nextNode()){if(node.nodeValue&&/500\s*ETB/i.test(node.nodeValue))node.nodeValue=node.nodeValue.replace(/500\s*ETB/gi,"400 ETB");}document.querySelectorAll("input,button,a").forEach(function(el){["placeholder","title","aria-label"].forEach(function(attr){var v=el.getAttribute(attr);if(v&&/500\s*ETB/i.test(v))el.setAttribute(attr,v.replace(/500\s*ETB/gi,"400 ETB"));});if(el.textContent&&/500\s*ETB/i.test(el.textContent))el.textContent=el.textContent.replace(/500\s*ETB/gi,"400 ETB");});}catch(err){console.warn("[EDSA] price label update failed",err);}}
  function patchFreeLearn(){
    if(location.pathname!=="/learn.html")return;
    setTimeout(function(){
      if(typeof window.learningSelectCourse!=="function")return;
      var original=window.learningSelectCourse;
      if(original.__EDSA_FREE_COURSES)return;
      if(window.learningState&&window.LEARNING_COURSES){Object.keys(window.LEARNING_COURSES).forEach(function(id){window.learningState.unlocked[id]=true;});}
      async function freeLearningSelectCourse(id,lessonIndex){
        var oldAccess=window.checkCourseAccess;
        window.checkCourseAccess=async function(){return true;};
        try{return await original.call(this,id,lessonIndex||0);}finally{window.checkCourseAccess=oldAccess;}
      }
      freeLearningSelectCourse.__EDSA_FREE_COURSES=true;
      window.learningSelectCourse=freeLearningSelectCourse;
      if(typeof window.renderCourses==="function")window.renderCourses();
    },0);
  }
  document.addEventListener("DOMContentLoaded",function(){
    updatePriceLabels();
    patchFreeLearn();
    document.addEventListener("click",function(e){var target=e.target&&e.target.closest?e.target.closest(".edsa-ref-sign,.edsa-ref-primary"):null;if(target){e.preventDefault();showLogin();return;}var create=e.target&&e.target.closest?e.target.closest('#edsaLoginScreen .edsa-login-links button:first-child'):null;if(create){e.preventDefault();e.stopImmediatePropagation();showRegister();return;}openCourseFromHome(e);},true);
    var lf=document.getElementById("edsaLoginForm");if(lf)lf.addEventListener("submit",function(e){e.preventDefault();if(typeof window.EDSA_SIGN_IN==="function")window.EDSA_SIGN_IN();},true);
    var rf=document.getElementById("edsaRegisterForm");if(rf)rf.addEventListener("submit",function(e){e.preventDefault();e.stopImmediatePropagation();if(typeof window.EDSA_REGISTER==="function")window.EDSA_REGISTER();},true);
    try{if(new URLSearchParams(location.search).get("login")==="1")showLogin();}catch(_){}
    if(location.pathname==="/edsa-app.html"){
      try{if(new URLSearchParams(location.search).get("adminPreview")==="1")return;}catch(_){}
      var originalVerifyAndStartExam=window.verifyAndStartExam;
      window.verifyAndStartExam=async function(e){try{var courseId=new URLSearchParams(location.search).get("course")||"";if(courseId){var token=sessionStorage.getItem("EDSA_SESSION_TOKEN")||localStorage.getItem("EDSA_SESSION_TOKEN")||"",headers=token?{"Authorization":"Bearer "+token}:{};var access=await fetch("/api/course-access?courseId="+encodeURIComponent(courseId),{credentials:"include",headers:headers,cache:"no-store"});var result=await access.json().catch(function(){return {};});if(access.ok&&result.ok&&result.unlocked&&typeof originalVerifyAndStartExam==="function")return originalVerifyAndStartExam(e);}}catch(err){console.warn("[EDSA] Existing course access check failed:",err);}return activateAndOpenLearning(e);};
    }
    if(location.pathname==="/learning.html"){var lfScript=document.createElement("script");lfScript.src="/learning-fallback.js?v=15";lfScript.async=false;document.head.appendChild(lfScript);}
  });
  var ap=document.createElement("script");ap.src="/admin-preview.js?v=6";ap.async=false;document.head.appendChild(ap);
  var s=document.createElement("script");s.src="/student-db-sync-original.js?v=2";s.async=false;document.head.appendChild(s);
})();
