// Synthetic in-memory mail transport. Never contacts a real provider or production account.
const assert=require('node:assert/strict');
module.exports=function mailFixture(env){
 Object.assign(env,{RESEND_API_KEY:'test-only-mail-key',LINGQI_MAIL_FROM:'Lingqi <test@example.test>',LINGQI_SITE_URL:'https://site.example'});
 const messages=[];
 return {messages,fetch:async(url,init)=>{assert.equal(url,'https://api.resend.com/emails');messages.push(JSON.parse(init.body));return Response.json({id:'test-mail'});},async register(auth,request,email,password){
  const sent=await auth.emailAuthResponse(request({action:'register',email}));assert.equal(sent.status,200,await sent.clone().text());
  const message=messages.findLast(m=>m.to[0]===email.trim().toLowerCase()),token=message.text.match(/token=([a-f0-9]{64})/)[1];
  const completed=await auth.emailAuthResponse(request({action:'complete-registration',token,password}));assert.equal(completed.status,200,await completed.clone().text());assert.equal(completed.headers.get('set-cookie'),null);
  return auth.emailAuthResponse(request({action:'login',email,password}));
 }};
};
