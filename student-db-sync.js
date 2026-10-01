(function(){
  "use strict";
  function showLogin(){var home=document.getElementById("edsaPublicHome"),login=document.getElementById("edsaLoginScreen"),reg=document.getElementById("edsaRegisterScreen"),dash=document.getElementById("edsaDashboard");if(home)home.style.display="none";if(dash)dash.style.display="none";if(reg)reg.style.display="none";if(login){login.style.display="flex";login.classList.add("show");}window.scrollTo(0,0);var email=document.getElementById("loginEmail");if(email)setTimeout(function(){email.focus();},50);}
  function showRegister(){var home=document.getElementById("edsaPublicHome"),login=document.getElementById("edsaLoginScreen"),reg=document.getElementById("edsaRegisterScreen"),dash=document.getElementById("edsaDashboard");if(home)home.style.display="none";if(dash)dash.style.display="none";if(login)login.style.display="none";if(reg){reg.style.display="flex";reg.classList.add("show");}window.scrollTo(0,0);var name=document.getElementById("registerName");if(name)setTimeout(function(){name.focus();},50);}
  function getCourseId(target){var node=target&&target.closest?target.closest(".edsa-ref-courses article,.edsa-pcourse"):null;if(!node)return null;var onclick=node.getAttribute("onclick")||"";var m=onclick.match(/EDSA_OPEN_COURSE\(['\"]([^'\"]+)['\"]/);if(m)return m[1];var button=node.querySelector("[onclick*=EDSA_OPEN_COURSE]");if(button){m=(button.getAttribute("onclick")||"").match(/EDSA_OPEN_COURSE\(['\"]([^'\"]+)['\"]/);if(m)return m[1];}return node.getAttribute("data-course")||null;}
  function openCourseFromHome(e){var target=e.target,card=target&&target.closest?target.closest(".edsa-ref-courses article,.edsa-pcourse"):null;if(!card)return;var id=getCourseId(target);if(!id)return;var profile=null;try{var accounts=JSON.parse(localStorage.getItem("EDSA_STUDENT_ACCOUNTS")||"{}");var active=String(localStorage.getItem("EDSA_ACTIVE_EMAIL")||"").toLowerCase();profile=active&&accounts[active]?accounts[active]:null;}catch(_){}if(!profile){e.preventDefault();e.stopImmediatePropagation();showLogin();}}
  window.EDSA_SHOW_LOGIN=window.EDSA_SHOW_LOGIN||showLogin;window.EDSA_SHOW_REGISTER=window.EDSA_SHOW_REGISTER||showRegister;window.EDSA_START=window.EDSA_START||showLogin;

  function activeEmail(){try{return String(localStorage.getItem("EDSA_ACTIVE_EMAIL")||localStorage.getItem("EDSA_LAST_ACTIVATED_EMAIL")||"").trim().toLowerCase();}catch(_){return "";}}
  function isCourseUnlocked(id){var e=activeEmail();try{return !!e&&localStorage.getItem("EDSA_COURSE_UNLOCKED_"+e+"_"+id)==="1";}catch(_){return false;}}

  async function activateAndOpenLearning(e){
    if(e)e.preventDefault();
    try{
      var token=sessionStorage.getItem("EDSA_SESSION_TOKEN")||localStorage.getItem("EDSA_SESSION_TOKEN")||"",headers=token?{"Authorization":"Bearer "+token}:{};
      var auth=await fetch("/api/auth-me",{credentials:"include",headers:headers,cache:"no-store"}),a=await auth.json().catch(function(){return {};});
      if(!auth.ok||!a.ok||!a.authenticated||!a.user||a.user.role!=="student"){window.location.href="/?login=1&return="+encodeURIComponent(location.pathname+location.search);return;}
      var course=window.state&&window.state.selectedCourse,courseId=course&&course.id;if(!courseId)courseId=new URLSearchParams(location.search).get("course");if(!courseId){alert("Please select a course first.");return;}
      courseId=String(courseId).trim().toLowerCase();
      var examRequested=new URLSearchParams(location.search).get("exam")==="1";
      // A student who already activated this course has already paid. Never ask for another payment.
      if(isCourseUnlocked(courseId)){
        if(examRequested){
          sessionStorage.setItem("EDSA_PAID_EXAM_"+courseId,"1");
          var original=window.__EDSA_ORIGINAL_VERIFY_AND_START;
          if(typeof original==="function"){
            var key=localStorage.getItem("EDSA_LAST_ACTIVATION_KEY_"+activeEmail()+"_"+courseId)||"";
            var input=document.getElementById("accessKey");if(input&&key)input.value=key;
            return original.call(window,e);
          }
        }
        window.location.href="/learning.html?course="+encodeURIComponent(courseId)+"&lesson=0";return;
      }
      var keyInput=document.getElementById("accessKey"),code=keyInput?String(keyInput.value||"").trim().toUpperCase():"";if(!code){alert("Please enter your activation key.");return;}
      var activation=await fetch("/api/activate-key",{method:"POST",credentials:"include",headers:Object.assign({"Content-Type":"application/json"},headers),body:JSON.stringify({code:code,courseId:courseId})}),result=await activation.json().catch(function(){return {};});
      if(!activation.ok||!result.ok){alert(result.error||"This activation key is invalid or has already been used.");return;}
      var email=String(a.user.email||"").trim().toLowerCase();localStorage.setItem("EDSA_LAST_ACTIVATED_COURSE",courseId);localStorage.setItem("EDSA_LAST_ACTIVATED_EMAIL",email);localStorage.setItem("EDSA_COURSE_UNLOCKED_"+email+"_"+courseId,"1");localStorage.setItem("EDSA_LAST_ACTIVATION_KEY_"+email+"_"+courseId,code);
      window.location.href="/learning.html?course="+encodeURIComponent(courseId)+"&lesson=0";
    }catch(err){console.error("[EDSA] Course activation flow failed:",err);alert("We could not verify the activation key right now. Please try again.");}
  }

  function installOnePaymentExamBridge(){
    if(location.pathname!=="/edsa-app.html")return;
    try{
      var params=new URLSearchParams(location.search),courseId=String(params.get("course")||"").trim().toLowerCase();
      if(!courseId||params.get("exam")!=="1"||!isCourseUnlocked(courseId))return;
      sessionStorage.setItem("EDSA_PAID_EXAM_"+courseId,"1");
      // Keep the original exam engine. We only bypass its second payment/activation gate for the same paid course.
      var original=window.verifyAndStartExam;
      if(typeof original==="function"&&!window.__EDSA_ORIGINAL_VERIFY_AND_START){window.__EDSA_ORIGINAL_VERIFY_AND_START=original;}
      var originalSaved=window.__EDSA_ORIGINAL_VERIFY_AND_START;
      if(typeof originalSaved!=="function")return;
      var input=document.getElementById("accessKey"),key=localStorage.getItem("EDSA_LAST_ACTIVATION_KEY_"+activeEmail()+"_"+courseId)||"";
      if(input&&key)input.value=key;
      // Intercept only the activation request used by the old exam gate; all other API requests remain untouched.
      if(!window.__EDSA_ONE_PAYMENT_FETCH_PATCH){
        var nativeFetch=window.fetch.bind(window);
        window.fetch=function(input,init){
          try{
            var url=new URL(typeof input==="string"?input:(input&&input.url)||"",location.href);
            if(url.pathname==="/api/activate-key"&&courseId&&isCourseUnlocked(courseId)){
              return Promise.resolve(new Response(JSON.stringify({ok:true,activated:true,alreadyActivated:true,amount:400,courseId:courseId}),{status:200,headers:{"Content-Type":"application/json"}}));
            }
          }catch(_){}
          return nativeFetch(input,init);
        };
        window.__EDSA_ONE_PAYMENT_FETCH_PATCH=true;
      }
      // Give the original page a moment to finish defining its course state, then launch the same exam path without a second payment.
      setTimeout(function(){
        try{
          var form=document.getElementById("paymentForm");
          if(form&&typeof window.verifyAndStartExam==="function")window.verifyAndStartExam({preventDefault:function(){}});
        }catch(err){console.error("[EDSA] one-payment exam bridge",err);}
      },350);
    }catch(err){console.warn("[EDSA] one-payment exam bridge setup failed",err);}
  }

  function updatePriceLabels(){try{var root=document.body;if(!root)return;var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);var node;while(node=walker.nextNode()){if(node.nodeValue&&/500\s*ETB/i.test(node.nodeValue))node.nodeValue=node.nodeValue.replace(/500\s*ETB/gi,"400 ETB");}document.querySelectorAll("input,button,a").forEach(function(el){["placeholder","title","aria-label"].forEach(function(attr){var v=el.getAttribute(attr);if(v&&/500\s*ETB/i.test(v))el.setAttribute(attr,v.replace(/500\s*ETB/gi,"400 ETB");});if(el.textContent&&/500\s*ETB/i.test(el.textContent))el.textContent=el.textContent.replace(/500\s*ETB/gi,"400 ETB");});}catch(err){console.warn("[EDSA] price label update failed",err);}}

  document.addEventListener("DOMContentLoaded",function(){
    updatePriceLabels();
    document.addEventListener("click",function(e){var target=e.target&&e.target.closest?e.target.closest(".edsa-ref-sign,.edsa-ref-primary"):null;if(target){e.preventDefault();showLogin();return;}var create=e.target&&e.target.closest?e.target.closest('#edsaLoginScreen .edsa-login-links button:first-child'):null;if(create){e.preventDefault();e.stopImmediatePropagation();showRegister();return;}openCourseFromHome(e);},true);
    var lf=document.getElementById("edsaLoginForm");if(lf)lf.addEventListener("submit",function(e){e.preventDefault();if(typeof window.EDSA_SIGN_IN==="function")window.EDSA_SIGN_IN();},true);
    var rf=document.getElementById("edsaRegisterForm");if(rf)rf.addEventListener("submit",function(e){e.preventDefault();if(typeof window.EDSA_REGISTER==="function")window.EDSA_REGISTER();},true);
    try{if(new URLSearchParams(location.search).get("login")==="1")showLogin();}catch(_){}
    if(location.pathname==="/edsa-app.html"){
      if(typeof window.verifyAndStartExam==="function"&&!window.__EDSA_ORIGINAL_VERIFY_AND_START)window.__EDSA_ORIGINAL_VERIFY_AND_START=window.verifyAndStartExam;
      window.verifyAndStartExam=activateAndOpenLearning;
      setTimeout(installOnePaymentExamBridge,250);
    }
    if(location.pathname==="/learning.html"){var lfScript=document.createElement("script");lfScript.src="/learning-fallback.js?v=16";lfScript.async=false;document.head.appendChild(lfScript);}
  });
  var s=document.createElement("script");s.src="/student-db-sync-original.js?v=3";s.async=false;document.head.appendChild(s);
})();
