(function(){
'use strict';
const SUBJECTS=['smm','dme','pbm','gdm','fme','dbi'];
const ADV=window.EDSA_ADVANCED_BANKS||{};
const BANKS=window.EDSA_QUESTION_BANKS||{};

function shuffle(a){
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}

const stems={
 what:[t=>`Which statement most accurately defines ${t}?`,t=>`A professional is asked to explain ${t}. Which answer is the most precise?`,t=>`Which description best distinguishes ${t} from related practices?`,t=>`Which claim about ${t} would be safest to defend in a professional setting?`],
 why:[t=>`Why does ${t} matter when making a business decision?`,t=>`Which rationale best explains the practical importance of ${t}?`,t=>`What outcome is most directly supported by using ${t} correctly?`,t=>`A manager asks why ${t} should receive attention. Which explanation is strongest?`],
 action:[t=>`A team needs to apply ${t}. Which action follows sound practice?`,t=>`Results involving ${t} are weaker than expected. What should the practitioner do first?`,t=>`Which sequence is most appropriate when working with ${t}?`,t=>`Which choice demonstrates competent professional practice in ${t}?`],
 signal:[t=>`Which evidence would be most useful for evaluating ${t}?`,t=>`A manager wants to monitor ${t}. Which signal deserves the most attention?`,t=>`Which measurement would provide the clearest indication of performance related to ${t}?`,t=>`When reviewing ${t}, which evidence is most relevant to the decision?`]
};

function topicQuestion(topic,field,index,topics){
  const value=topic[field];
  const others=topics.filter(x=>x!==topic);
  const distractors=shuffle(others.slice()).slice(0,3).map(x=>x[field]);
  const opts=shuffle([{text:value,correct:true},...distractors.map(text=>({text,correct:false}))]);
  return {q:stems[field][index%stems[field].length](topic.t),options:opts.map(x=>x.text),correct:opts.findIndex(x=>x.correct)};
}

function build50(key){
  if(key==='smm'&&Array.isArray(ADV.smm)&&ADV.smm.length>=50){
    return shuffle(ADV.smm.slice(0,50).map(q=>{
      const opts=shuffle(q.options.map((text,i)=>({text,correct:i===q.correct})));
      return {q:q.q,options:opts.map(x=>x.text),correct:opts.findIndex(x=>x.correct)};
    }));
  }

  const result=[];
  if(Array.isArray(ADV[key])){
    ADV[key].slice(0,10).forEach(q=>{
      const opts=shuffle(q.options.map((text,i)=>({text,correct:i===q.correct})));
      result.push({q:q.q,options:opts.map(x=>x.text),correct:opts.findIndex(x=>x.correct)});
    });
  }

  const topics=BANKS[key]||[];
  const fields=['what','why','action','signal'];
  if(topics.length>=10){
    topics.slice(0,10).forEach((topic,i)=>{
      fields.forEach((field,j)=>result.push(topicQuestion(topic,field,i+j,topics)));
    });
  }
  return shuffle(result).slice(0,50);
}

function getCourses(){try{return eval('COURSES');}catch(_){return []}}
function getState(){try{return eval('state');}catch(_){return null}}

function install(){
  const courses=getCourses();
  SUBJECTS.forEach(key=>{const c=courses.find(x=>x.id===key);if(c)c.questions=build50(key);});
  const originalSelect=window.selectCourse;
  if(typeof originalSelect==='function'&&!originalSelect.__edsaAdvanced){
    const wrapped=function(id){
      originalSelect(id);
      const s=getState();
      if(s&&s.selectedCourse){
        const c=s.selectedCourse;
        if(SUBJECTS.includes(c.id))c.questions=build50(c.id);
      }
    };
    wrapped.__edsaAdvanced=true;
    window.selectCourse=wrapped;
  }
}

window.EDSA_INSTALL_QUESTION_ENGINE=install;

if(!Object.keys(ADV).length){
  const s=document.createElement('script');
  s.src='/advanced-question-banks.js';
  s.onload=install;
  s.onerror=install;
  document.head.appendChild(s);
}else{
  install();
}
})();