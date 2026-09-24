module.exports=async function(req,res){
  if(req.method!=="GET") return res.status(405).json({ok:false,error:"Method not allowed"});
  const courseId=String((req.query&&req.query.courseId)||"").trim().toLowerCase();
  if(!courseId) return res.status(400).json({ok:false,error:"Course is required."});
  try{
    const r=await fetch("https://xcdezvnnkahdogywllkk.supabase.co/functions/v1/edsa-course-lessons?courseId="+encodeURIComponent(courseId),{
      headers:{cookie:String(req.headers.cookie||""),accept:"application/json"},
      cache:"no-store"
    });
    const body=await r.json().catch(()=>({ok:false,error:"Invalid course response."}));
    res.setHeader("Cache-Control","no-store, private");
    return res.status(r.status).json(body);
  }catch(e){
    console.error("[EDSA course lessons proxy]",e);
    return res.status(500).json({ok:false,error:"Course lessons could not be loaded."});
  }
};
