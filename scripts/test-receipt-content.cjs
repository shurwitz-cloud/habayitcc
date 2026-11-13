const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
function load(file,stubs){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:k=>{if(!(k in stubs))throw Error(k);return stubs[k]},console,Buffer,URL,Set,Date,Number,Object,process:{env:{RECEIPT_SIGNING_SECRET:'synthetic-test-key'}}});return exports;}
const url=load('src/lib/donations/receipt-url.ts',{'server-only':{},crypto:require('crypto'),'./receipt-date':{formatReceiptDate:()=> '11/13/2026'},'./memo':{}});
let rows,writes,denied;
const clone=x=>JSON.parse(JSON.stringify(x));
const db={from:table=>{let op='read',payload,filters={};const q={select:()=>q,eq:(k,v)=>{filters[k]=v;return q},is:(k,v)=>{filters[k]=v;return q},order:()=>q,limit:()=>q,update:x=>{op='update';payload=x;return q},insert:x=>{op='insert';payload=x;return q},maybeSingle:async()=>({data:clone(rows[table]??null),error:null}),then:resolve=>{writes.push({table,op,payload,filters});resolve({data:[{original_sig:'test'}],error:null})}};return q}};
const helper=load('src/lib/donations/receipt-correction.ts',{'server-only':{},'@/lib/supabase/server':{createAdminClient:()=>db},'./receipt-method':{receiptMethodFromDonationType:()=> 'Zelle'}});
const route=load('src/app/api/admin/receipt-content-corrections/route.ts',{'next/server':{NextResponse:{json:(body,opts)=>({body,status:opts?.status??200})}},'@/lib/admin/guard':{requireCapabilityApi:async()=>denied?{status:403}:null},'@/lib/supabase/server':{createAdminClient:()=>db},'@/lib/donations/receipt-url':url,'@/lib/donations/receipt-date':{formatReceiptDate:()=> '11/13/2026'},'@/lib/donations/receipt-correction':helper});
const original={name:'Example Person',amount:'100.00',date:'11/13/2026',method:'Zelle'};
const link=p=>'https://habayitcc.org/receipt?'+new URLSearchParams({...p,sig:url.computeReceiptSig(p)});
const base={donationId:'synthetic-id',receiptUrl:link(original)};
function reset(){writes=[];denied=false;rows={donations:{id:'synthetic-id',first_name:'Example',last_name:'Person',company:'Example Organization',amount:100,memo:'Printing · via Zelle',campaign:null,donation_type:'One-Time',status:'succeeded'},payments:{paid_at:'2026-11-13T17:00:00Z',status:'succeeded'},receipt_corrections:null};}
const req=(body,origin='https://www.habayitcc.org')=>({nextUrl:{origin:'https://www.habayitcc.org'},headers:{get:()=>origin},json:async()=>body});
let count=0;async function test(name,fn){reset();await fn();console.log('PASS',++count,name)}
(async()=>{
await test('preview verifies actual signed URL and shows company/memo without write',async()=>{const x=await route.POST(req(base));assert.equal(x.body.corrected.name,'Example Organization');assert.equal(x.body.corrected.memo,'Printing');assert.equal(writes.length,0)});
await test('confirm adds only exact-link opt-in flag',async()=>{const x=await route.POST(req(base));const y=await route.POST(req({...base,confirm:true,expectedCorrectedSig:x.body.correctedSig}));assert.equal(y.body.success,true);assert.equal(writes.length,1);assert.equal(writes[0].table,'receipt_corrections');assert.equal(writes[0].payload.correct_content,true);assert.equal(writes[0].payload.donation_id,'synthetic-id')});
await test('idempotent confirmation does not write again',async()=>{rows.receipt_corrections={donation_id:'synthetic-id',correct_content:true};const x=await route.POST(req(base));const y=await route.POST(req({...base,confirm:true,expectedCorrectedSig:x.body.correctedSig}));assert.equal(y.body.alreadyExisted,true);assert.equal(writes.length,0)});
for(const [name,mutate,body] of [
 ['unauthorized',()=>denied=true,base],['cross-site',()=>{},base],
 ['bad signature',()=>{},{...base,receiptUrl:base.receiptUrl.replace('100.00','200.00')}],
 ['foreign donation',()=>rows.donations.first_name='Other',base],['wrong amount',()=>rows.donations.amount=101,base],
 ['failed donation',()=>rows.donations.status='failed',base],['failed payment',()=>rows.payments.status='failed',base],
 ['missing payment',()=>rows.payments=null,base],['date differs',()=>{},{...base,receiptUrl:link({...original,date:'11/12/2026'})}],
 ['different nonblank memo',()=>{},{...base,receiptUrl:link({...original,memo:'Other'})}],
 ['foreign mapping',()=>rows.receipt_corrections={donation_id:'other'},base],
 ['superseded mapping',()=>rows.receipt_corrections={donation_id:'synthetic-id',superseded_at:'today'},base],
 ['missing preview',()=>{},{...base,confirm:true}],
 ['unsupported qpq',()=>{},{...base,receiptUrl:base.receiptUrl+'&gd=goods'}],
 ['foreign host',()=>{},{...base,receiptUrl:base.receiptUrl.replace('habayitcc.org','evil.invalid')}],
 ['duplicate field',()=>{},{...base,receiptUrl:base.receiptUrl+'&name=Other'}],
]) await test(name+' refuses without writes',async()=>{mutate();const x=await route.POST(req(body,name==='cross-site'?'https://evil.invalid':undefined));assert(x.status>=400);assert.equal(writes.length,0)});
await test('record changed after preview refuses',async()=>{const x=await route.POST(req(base));rows.donations.company='Changed';const y=await route.POST(req({...base,confirm:true,expectedCorrectedSig:x.body.correctedSig}));assert.equal(y.status,409);assert.equal(writes.length,0)});
await test('legacy date-only resolver has no content override',async()=>{rows.receipt_corrections={donation_id:'synthetic-id',correct_content:false};const x=await helper.resolveReceiptCorrection({sig:'test',name:original.name,amount:100,method:'Zelle'});assert(x);assert.equal(x.content,undefined)});
await test('explicit content resolver returns stored company/memo',async()=>{rows.receipt_corrections={donation_id:'synthetic-id',correct_content:true};const x=await helper.resolveReceiptCorrection({sig:'test',name:original.name,amount:100,method:'Zelle'});assert.equal(x.content.name,'Example Organization');assert.equal(x.content.memo,'Printing')});
await test('no exact mapping means unchanged receipt',async()=>assert.equal(await helper.resolveReceiptCorrection({sig:'different',name:original.name,amount:100,method:'Zelle'}),null));
await test('content resolver mismatched donor fails closed',async()=>{rows.receipt_corrections={donation_id:'synthetic-id',correct_content:true};assert.equal(await helper.resolveReceiptCorrection({sig:'test',name:'Other',amount:100,method:'Zelle'}),null)});
console.log(count+' tests passed; all fixture data synthetic');
})().catch(e=>{console.error(e);process.exit(1)});
