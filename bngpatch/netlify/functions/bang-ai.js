// BANG general-purpose AI assistant for 1bang.top.
// Configure OPENAI_API_KEY in Netlify environment variables. Never put it in browser code.
const SYSTEM = `You are BANG, the friendly AI assistant inside the 1bang.top website, operated as the BANG BNG community platform.
Identity: Your name is BANG. If asked who you are, say "I'm BANG, the AI assistant for 1bang.top." Do not call yourself ChatGPT, an OpenAI employee, or a human.
Scope: Answer general questions across ordinary topics, not only 1bang.top. Explain science, education, writing, coding, technology, history, everyday questions and other safe topics. Be clear, useful and conversational. If you do not know, say so. For changing facts such as current prices, news, laws, weather or schedules, say that you may not have live information and recommend checking a current authoritative source. Do not invent sources, facts or current data.
Project accuracy: BANG BNG on 1bang.top has internal platform ledger features. Internal balances, mining/staking entries, transfers, P2P escrow records and swaps must not be described as automatically being public-chain assets or completed blockchain transactions. The displayed BNG value is an internal reference price, not a live exchange quote or guaranteed cash value. Do not claim the project is audited, regulator-approved, scam-free, guaranteed profitable, liquid, or independently verified unless the user provides verifiable evidence. Clearly distinguish currently available features from planned features.
Safety: Never ask users for passwords, one-time codes, recovery phrases, private keys, full card details or account secrets. Do not claim to execute transactions, change balances, access private accounts, or contact support. For account-specific problems, direct users to https://1bang.top/contact.html or support@1bang.top. Give cautious, lawful guidance for cybersecurity and financial topics.
Style: Use concise plain language. Match the user's language where practical.`;
const headers={"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"};
const rate=new Map();
exports.handler=async function(event){
  if(event.httpMethod==="OPTIONS")return {statusCode:204,headers:{"access-control-allow-origin":"https://1bang.top","access-control-allow-methods":"POST, OPTIONS","access-control-allow-headers":"content-type"}};
  if(event.httpMethod!=="POST")return {statusCode:405,headers,body:JSON.stringify({ok:false,error:"Use POST."})};
  if(!process.env.OPENAI_API_KEY)return {statusCode:503,headers,body:JSON.stringify({ok:false,error:"AI assistant is not configured yet. Add OPENAI_API_KEY to Netlify environment variables."})};
  let body;try{body=JSON.parse(event.body||"{}");}catch(_){return {statusCode:400,headers,body:JSON.stringify({ok:false,error:"Invalid request."})};}
  const question=String(body.message||"").trim();
  if(!question||question.length>1600)return {statusCode:400,headers,body:JSON.stringify({ok:false,error:"Message must contain 1–1600 characters."})};
  const ip=(event.headers&& (event.headers["x-nf-client-connection-ip"]||event.headers["x-forwarded-for"])||"unknown").split(",")[0].trim();
  const now=Date.now(),entry=rate.get(ip)||{start:now,count:0};
  if(now-entry.start>60000){entry.start=now;entry.count=0;}
  entry.count++;rate.set(ip,entry);
  if(entry.count>20)return {statusCode:429,headers,body:JSON.stringify({ok:false,error:"Please wait a moment before sending more questions."})};
  const history=Array.isArray(body.history)?body.history.slice(-10).map(m=>({role:m.role==="assistant"?"assistant":"user",content:String(m.content||"").slice(0,1600)})).filter(m=>m.content):[];
  const messages=[{role:"system",content:SYSTEM},...history,{role:"user",content:question}];
  try{
    const response=await fetch("https://api.openai.com/v1/chat/completions",{
      method:"POST",
      headers:{"authorization":"Bearer "+process.env.OPENAI_API_KEY,"content-type":"application/json"},
      body:JSON.stringify((()=>{const model=process.env.OPENAI_MODEL||"gpt-6-luna";const payload={model,messages,max_completion_tokens:650};if(model==="gpt-6-luna"||model==="gpt-6-sol")payload.reasoning_effort="none";return payload;})())
    });
    const data=await response.json();
    if(!response.ok)throw new Error(data&&data.error&&data.error.message||"AI provider request failed");
    const reply=data&&data.choices&&data.choices[0]&&data.choices[0].message&&data.choices[0].message.content;
    if(typeof reply!=="string"||!reply.trim())throw new Error("AI returned an empty response");
    return {statusCode:200,headers,body:JSON.stringify({ok:true,name:"BANG",reply:reply.trim()})};
  }catch(err){
    return {statusCode:502,headers,body:JSON.stringify({ok:false,error:"BANG is temporarily unable to reach the AI service. Please try again shortly."})};
  }
};
