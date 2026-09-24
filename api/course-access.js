const auth=require("./_auth");
const REPO=process.env.EDSA_AUTH_REPO||"cherentmolla27-byte/EDSA-academy",BRANCH="main",PATH="activation-keys.json";
async function gh(path){const t=process.env.EDSA_GITHUB_TOKEN;if(!t)throw new Error("EDSA_GITHUB_TOKEN is not configured");const r=await fetch("https://api.github.com"+path,{headers:{Accept:"application/vnd.github+json",Authorization:"Bearer "+t,"X-GitHub-Api-Version":"2022-11-28"}});const d=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(d.message||"GitHub request failed");e.status=r.status;throw e}return d}
async function read(){const d=await gh("/repos/"+REPO+"/contents/"+PATH+"?ref="+BRANCH);return JSON.parse(Buffer.from(d.content||"","base64").toString("utf8")||"[]")}
module.exports=async function(req,res){
 if(req.method!=="GET")return auth.json(res,405,{ok:false,error:"Method not allowed"});
 const s=auth.readSession(req);if(!s||s.role!=="student")return auth.json(res,401,{ok:false,error:"Student sign-in required."});
 try{
  const courseId=String((req.query&&req.query.courseId)||"").trim();
  if(!courseId)return auth.json(res,400,{ok:false,error:"Course is required."});
  const email=auth.normalizeEmail(s.email);
  const keys=await read();
  const access=keys.some(k=>k.status==="used"&&k.amount===500&&String(k.usedEmail||"").toLowerCase()===email&&(k.usedCourse===courseId||k.scope==="ALL"));
  return auth.json(res,200,{ok:true,unlocked:access,courseId});
 }catch(e){console.error("[EDSA course access]",e);return auth.json(res,e.status||500,{ok:false,error:"Course access could not be checked."})}
};