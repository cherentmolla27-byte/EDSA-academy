const auth=require("./_auth");
const REPO=process.env.EDSA_AUTH_REPO||"cherentmolla27-byte/EDSA-academy",BRANCH="main",PATH="activation-keys.json";
async function gh(path,options={}){const t=process.env.EDSA_GITHUB_TOKEN;if(!t)throw new Error("EDSA_GITHUB_TOKEN is not configured");const r=await fetch("https://api.github.com"+path,{...options,headers:{Accept:"application/vnd.github+json",Authorization:"Bearer "+t,"X-GitHub-Api-Version":"2022-11-28",...(options.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(d.message||"GitHub request failed");e.status=r.status;throw e}return d}
async function read(){try{const d=await gh("/repos/"+REPO+"/contents/"+PATH+"?ref="+BRANCH);return{keys:JSON.parse(Buffer.from(d.content||"","base64").toString("utf8")||"[]"),sha:d.sha}}catch(e){if(e.status===404)return{keys:[],sha:null};throw e}}
async function write(keys,sha){const body={message:"Activate EDSA 500 ETB key",content:Buffer.from(JSON.stringify(keys,null,2)+"
").toString("base64"),branch:BRANCH};if(sha)body.sha=sha;return gh("/repos/"+REPO+"/contents/"+PATH,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})}
module.exports=async function(req,res){
 if(req.method!=="POST")return auth.json(res,405,{ok:false,error:"Method not allowed"});
 const s=auth.readSession(req);if(!s||s.role!=="student")return auth.json(res,401,{ok:false,error:"Student sign-in required."});
 try{
  const code=String((req.body||{}).code||"").trim().toUpperCase(),courseId=String((req.body||{}).courseId||"").trim();
  if(!/^EDSA-[A-F0-9]{8}$/.test(code))return auth.json(res,400,{ok:false,error:"Invalid activation key."});
  const {keys,sha}=await read(),key=keys.find(k=>k.code===code);
  if(!key)return auth.json(res,404,{ok:false,error:"Invalid activation key."});
  if(key.status!=="active")return auth.json(res,409,{ok:false,error:"This activation key has already been used."});
  if(key.amount!==500)return auth.json(res,409,{ok:false,error:"This key is not valid for the current 500 ETB fee."});
  if(key.scope!=="ALL"&&key.scope!==courseId)return auth.json(res,409,{ok:false,error:"This key is for a different course."});
  key.status="used";key.usedAt=new Date().toISOString();key.usedBy=s.name||"Student";key.usedEmail=s.email;key.usedCourse=courseId;
  await write(keys,sha);
  return auth.json(res,200,{ok:true,activated:true,amount:500,courseId});
 }catch(e){console.error("[EDSA activate key]",e);return auth.json(res,e.status||500,{ok:false,error:"Activation could not be completed. Please try again."})}
};