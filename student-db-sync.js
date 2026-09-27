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
  window.EDSA_SHOW_LOGIN=window.EDSA_SHOW_LOGIN||showLogin;
  window.EDSA_START=window.EDSA_START||showLogin;
  document.addEventListener("DOMContentLoaded",function(){
    document.addEventListener("click",function(e){
      var target=e.target&&e.target.closest?e.target.closest(".edsa-ref-sign,.edsa-ref-primary"):null;
      if(target){e.preventDefault();showLogin();}
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
  s.src="/student-db-sync-original.js?v=1";
  s.async=false;
  document.head.appendChild(s);
})();
