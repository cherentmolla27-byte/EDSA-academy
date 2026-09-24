const auth=require("./_auth");
const db=require("./_db");

module.exports=async function(req,res){
  if(req.method!=="GET") return auth.json(res,405,{ok:false,error:"Method not allowed"});
  const session=auth.readSession(req);
  if(!session||session.role!=="student") return auth.json(res,401,{ok:false,error:"Student sign-in required."});

  const courseId=String((req.query&&req.query.courseId)||"").trim().toLowerCase();
  const allowed=["smm","dme","pbm","gdm","fme","dbi"];
  if(!allowed.includes(courseId)) return auth.json(res,404,{ok:false,error:"Course not found."});

  try{
    // IMPORTANT: lesson JSON is read only by the server using the Supabase
    // secret key. The browser never gets database credentials.
    const email=auth.normalizeEmail(session.email);
    const access=await fetch(
      "https://edsa-academy.vercel.app/api/course-access?courseId="+encodeURIComponent(courseId),
      {headers:{cookie:String(req.headers.cookie||""),accept:"application/json"},cache:"no-store"}
    );
    const accessBody=await access.json().catch(()=>({}));
    if(!access.ok||!accessBody.ok||!accessBody.unlocked){
      return auth.json(res,403,{ok:false,error:"Paid course access required."});
    }

    const rows=await db.select(
      "protected_course_lessons",
      "select=lessons&course_id=eq."+encodeURIComponent(courseId)+"&limit=1"
    );
    const record=Array.isArray(rows)?rows[0]:null;
    if(!record||!Array.isArray(record.lessons)){
      return auth.json(res,404,{ok:false,error:"Course lessons are unavailable."});
    }

    res.setHeader("Cache-Control","private,no-store,max-age=0");
    res.setHeader("Vary","Cookie");
    return auth.json(res,200,{ok:true,courseId,lessons:record.lessons});
  }catch(err){
    console.error("[EDSA protected course lessons]",err);
    return auth.json(res,err.status||500,{ok:false,error:"Protected course content could not be loaded."});
  }
};
