const crypto = require("crypto");
const auth = require("./_auth");

const REPO = process.env.EDSA_AUTH_REPO || "cherentmolla27-byte/EDSA-academy";
const BRANCH = "main";
const PATH = "activation-keys.json";

function token(){ return process.env.EDSA_GITHUB_TOKEN || ""; }
async function github(path, options={}){
  const t=token(); if(!t) throw new Error("EDSA_GITHUB_TOKEN is not configured");
  const r=await fetch("https://api.github.com"+path,{...options,headers:{
    Accept:"application/vnd.github+json",Authorization:"Bearer "+t,"X-GitHub-Api-Version":"2022-11-28",...(options.headers||{})
  }});
  const data=await r.json().catch(()=>({}));
  if(!r.ok){const e=new Error(data.message||"GitHub request failed");e.status=r.status;throw e;}
  return data;
}
async function readKeys(){
  try{
    const d=await github("/repos/"+REPO+"/contents/"+PATH+"?ref="+BRANCH);
    return {keys:JSON.parse(Buffer.from(d.content||"","base64").toString("utf8")||"[]"),sha:d.sha};
  }catch(e){if(e.status===404)return {keys:[],sha:null};throw e;}
}
async function writeKeys(keys,sha,message){
  const content=Buffer.from(JSON.stringify(keys,null,2)+"
","utf8").toString("base64");
  const body={message,content,branch:BRANCH}; if(sha)body.sha=sha;
  return github("/repos/"+REPO+"/contents/"+PATH,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
}
module.exports=async function(req,res){
  if(req.method!=="POST")return auth.json(res,405,{ok:false,error:"Method not allowed"});
  const session=auth.readSession(req);
  if(!session||session.role!=="admin")return auth.json(res,401,{ok:false,error:"Admin sign-in required."});
  try{
    const body=req.body||{},scope=String(body.scope||"ALL").trim(),count=Math.min(Math.max(Number(body.count)||1,1),20);
    const allowed=["ALL","smm","dme","pbm","gdm","fme","dbi"];
    if(!allowed.includes(scope))return auth.json(res,400,{ok:false,error:"Invalid course scope."});
    const {keys,sha}=await readKeys(),created=[];
    for(let i=0;i<count;i++){
      const code="EDSA-"+crypto.randomBytes(4).toString("hex").toUpperCase();
      const key={code,scope,amount:500,status:"active",createdAt:new Date().toISOString()};
      keys.unshift(key);created.push(key);
    }
    await writeKeys(keys,sha,"Generate EDSA 500 ETB activation key(s)");
    return auth.json(res,200,{ok:true,keys:created});
  }catch(e){console.error("[EDSA generate key]",e);return auth.json(res,e.status||500,{ok:false,error:"Activation key could not be generated."});}
};