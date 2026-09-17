(function(){
  'use strict';
  const BANKS = window.EDSA_QUESTION_BANKS || {};
  const SUBJECTS = ['dme','pbm','gdm','fme','dbi'];

  function shuffle(a){
    for(let i=a.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [a[i],a[j]]=[a[j],a[i]];
    }
    return a;
  }

  const stems = {
    what: [
      t => `Which statement most accurately describes ${t}?`,
      t => `A learner is asked to explain ${t}. Which definition is the most precise?`,
      t => `Which option best captures the core meaning of ${t}?`,
      t => `When distinguishing ${t} from related practices, which description is most accurate?`,
      t => `Which explanation would be most defensible when introducing ${t} to a professional?`
    ],
    why: [
      t => `Why is ${t} important when making a professional decision?`,
      t => `What is the strongest reason to use ${t} appropriately?`,
      t => `Which business outcome is most directly supported by understanding ${t}?`,
      t => `A manager asks why ${t} matters. Which answer is best supported by the course material?`,
      t => `Which rationale best explains the practical value of ${t}?`
    ],
    action: [
      t => `A team needs to apply ${t}. Which action follows the recommended approach?`,
      t => `Which sequence would be most appropriate when working with ${t}?`,
      t => `If results involving ${t} are weaker than expected, what should the practitioner do first?`,
      t => `Which action demonstrates sound professional practice in ${t}?`,
      t => `A practitioner is planning work around ${t}. Which choice is most consistent with the stated approach?`
    ],
    signal: [
      t => `Which evidence would be most useful for evaluating ${t}?`,
      t => `A manager wants to monitor ${t}. Which signal should receive attention?`,
      t => `Which measurement would provide the clearest indication of performance related to ${t}?`,
      t => `When reviewing ${t}, which evidence is most relevant to the decision?`,
      t => `Which set of indicators best reflects whether ${t} is working as intended?`
    ],
    scenario: [
      t => `Consider this situation involving ${t}. Which response best applies the course guidance?`,
      t => `A real-world problem has appeared around ${t}. What is the most appropriate next step?`,
      t => `A practitioner faces the following ${t} challenge. Which response is most sound?`,
      t => `Which decision would best resolve a problem involving ${t} without ignoring the underlying issue?`,
      t => `In a professional scenario involving ${t}, which action should be prioritized?`
    ]
  };

  function makeQuestion(topic, field, index, topics){
    const value = topic[field];
    const stem = stems[field][index % stems[field].length](topic.t);
    const others = topics.filter(x => x !== topic);
    const distractors = shuffle(others.slice()).slice(0,3).map(x => x[field]);
    const options = [{text:value,correct:true}, ...distractors.map(text => ({text,correct:false}))];
    shuffle(options);
    return { q: stem, options: options.map(x=>x.text), correct: options.findIndex(x=>x.correct) };
  }

  function build50(key){
    const topics = BANKS[key] || [];
    if(topics.length < 10) return [];
    const fields=['what','why','action','signal','scenario'];
    const questions=[];
    topics.slice(0,10).forEach(topic=>{
      fields.forEach((field,i)=>questions.push(makeQuestion(topic,field,i,topics)));
    });
    return shuffle(questions);
  }

  function install(){
    SUBJECTS.forEach(key=>{
      const course = (window.COURSES||[]).find(c=>c.id===key);
      if(course) course.questions=build50(key);
    });

    const originalSelect = window.selectCourse;
    if(typeof originalSelect==='function' && !originalSelect.__edsaVaried){
      const wrapped=function(courseId){
        originalSelect(courseId);
        if(window.state && window.state.selectedCourse){
          const c=window.state.selectedCourse;
          if(SUBJECTS.includes(c.id)){
            c.questions=build50(c.id);
          } else if(c.id==='smm' && Array.isArray(c.questions)){
            c.questions=shuffle(c.questions.map(q=>{
              const opts=q.options.map((text,i)=>({text,correct:i===q.correct}));
              shuffle(opts);
              return {q:q.q,options:opts.map(x=>x.text),correct:opts.findIndex(x=>x.correct)};
            }));
          }
        }
      };
      wrapped.__edsaVaried=true;
      window.selectCourse=wrapped;
    }
  }

  window.EDSA_INSTALL_QUESTION_ENGINE=install;
  install();
})();
