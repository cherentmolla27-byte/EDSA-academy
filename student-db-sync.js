(function(){
  "use strict";
  function showLogin(){
    var home=document.getElementById("edsaPublicHome"),login=document.getElementById("edsaLoginScreen"),reg=document.getElementById("edsaRegisterScreen"),dash=document.getElementById("edsaDashboard");
    if(home)home.style.display="none";
    if(dash)dash.style.display="none";
    if(reg)reg.style.display="none";
    if(login){login.style.display="flex";login.classList.add("show");}
    window.scrollTo(0,0);
    var email=document.getElementById("loginEmail");
    if(email)setTimeout(function(){email.focus();},50);
  }
  function showRegister(){
    var home=document.getElementById("edsaPublicHome"),login=document.getElementById("edsaLoginScreen"),reg=document.getElementById("edsaRegisterScreen"),dash=document.getElementById("edsaDashboard");
    if(home)home.style.display="none";
    if(dash)dash.style.display="none";
    if(login)login.style.display="none";
    if(reg){reg.style.display="flex";reg.classList.add("show");}
    window.scrollTo(0,0);
    var name=document.getElementById("registerName");
    if(name)setTimeout(function(){name.focus();},50);
  }
  function getCourseId(target){
    var node=target&&target.closest?target.closest(".edsa-ref-courses article,.edsa-pcourse"):null;
    if(!node)return null;
    var onclick=node.getAttribute("onclick")||"";
    var m=onclick.match(/EDSA_OPEN_COURSE\(['\"]([^'\"]+)['\"]/);
    if(m)return m[1];
    var button=node.querySelector("[onclick*=EDSA_OPEN_COURSE]");
    if(button){m=(button.getAttribute("onclick")||"").match(/EDSA_OPEN_COURSE\(['\"]([^'\"]+)['\"]/);if(m)return m[1];}
    return node.getAttribute("data-course")||null;
  }
  function openCourseFromHome(e){
    var target=e.target;
    var card=target&&target.closest?target.closest(".edsa-ref-courses article,.edsa-pcourse"):null;
    if(!card)return;
    var id=getCourseId(target);
    if(!id)return;
    var profile=null;
    try{
      var accounts=JSON.parse(localStorage.getItem("EDSA_STUDENT_ACCOUNTS")||"{}");
      var active=String(localStorage.getItem("EDSA_ACTIVE_EMAIL")||"").toLowerCase();
      profile=active&&accounts[active]?accounts[active]:null;
    }catch(_){}
    // A visitor must see the sign-in screen immediately. Do not wait for
    // /api/auth-me here; that network round-trip was making course taps feel broken.
    if(!profile){
      e.preventDefault();
      e.stopImmediatePropagation();
      showLogin();
      return;
    }
    // If already signed in, let the normal course handler continue.
  }
  window.EDSA_SHOW_LOGIN=window.EDSA_SHOW_LOGIN||showLogin;
  window.EDSA_SHOW_REGISTER=window.EDSA_SHOW_REGISTER||showRegister;
  window.EDSA_START=window.EDSA_START||showLogin;
  document.addEventListener("DOMContentLoaded",function(){
    document.addEventListener("click",function(e){
      var target=e.target&&e.target.closest?e.target.closest(".edsa-ref-sign,.edsa-ref-primary"):null;
      if(target){e.preventDefault();showLogin();return;}
      var create= e.target&&e.target.closest?e.target.closest('#edsaLoginScreen .edsa-login-links button:first-child'):null;
      if(create){e.preventDefault();e.stopImmediatePropagation();showRegister();return;}
      openCourseFromHome(e);
    },true);
    var lf=document.getElementById("edsaLoginForm");
    if(lf)lf.addEventListener("submit",function(e){
      e.preventDefault();
      if(typeof window.EDSA_SIGN_IN==="function")window.EDSA_SIGN_IN();
    },true);
    var rf=document.getElementById("edsaRegisterForm");
    if(rf)rf.addEventListener("submit",function(e){
      e.preventDefault();
      if(typeof window.EDSA_REGISTER==="function")window.EDSA_REGISTER();
    },true);
    try{if(new URLSearchParams(location.search).get("login")==="1")showLogin();}catch(_){}
  });
  // Preserve the full student database synchronization module after this
  // lightweight authentication recovery layer loads.
  var s=document.createElement("script");
  s.src="/student-db-sync-original.js?v=2";
  s.async=false;
  document.head.appendChild(s);
})();
