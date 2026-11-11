const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('node:assert/strict');
function load(file,stubs){let exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:k=>{if(!(k in stubs))throw Error(k);return stubs[k]},console,crypto:require('crypto')});return exports;}
let count=0;async function test(name,fn){await fn();console.log('PASS',++count,name)}
const helper=load('src/lib/events/bbq-staff-codes.ts',{'@/lib/supabase/server':{createAdminClient:()=>db},'@/lib/stripe/server':{stripe:{}}});
let db;
const row={claim_token:'mine',payment_intent_id:'pi_1'};
const input={ownedClaimToken:'mine',amountCents:1000,eventSlug:'teens-bbq',email:'test@example.invalid',attendees:2,sponsorAmount:0,coverFee:false};
const base={id:'pi_1',status:'requires_payment_method',amount:1000,client_secret:'test-secret',metadata:{event_slug:'teens-bbq',donor_email:'test@example.invalid',bbq_staff_code:'1',attendees:'2',sponsor_amount:'0',cover_fee:'0'}};
async function probe(status,opts={},params={},rowOpts={}) {let calls=[];const pi={...base,status,...opts};const result=await helper.reconcileBbqRetryRow({...row,...rowOpts},{...input,...params},{retrieve:async()=>{calls.push('retrieve');if(pi.status==='retrieve_error')throw Error();return pi},cancel:async()=>{calls.push('cancel');if(opts.cancelError)throw Error();return {status:opts.cancelStatus??'canceled'}},release:async()=>{calls.push('release');if(opts.releaseError)throw Error()}});return {result,calls};}
(async()=>{
for(const status of ['requires_payment_method','requires_confirmation','requires_action'])await test('owned '+status+' resumes exact PI',async()=>{const {result,calls}=await probe(status);assert.equal(result.kind,'resume');assert.equal(result.paymentIntentId,'pi_1');assert.deepEqual(calls,['retrieve'])});
for(const status of ['processing','requires_capture','future_status'])await test(status+' never cancels',async()=>{const {result,calls}=await probe(status);assert.equal(result.kind,'pending');assert.deepEqual(calls,['retrieve'])});
for(const status of ['requires_payment_method','requires_confirmation','requires_action','processing','canceled','succeeded'])await test('foreign '+status+' untouched',async()=>{const {result,calls}=await probe(status,{}, {ownedClaimToken:'foreign'});assert.equal(result.kind,'pending');assert.deepEqual(calls,[])});
await test('cookie absent untouched',async()=>assert.deepEqual((await probe('canceled',{}, {ownedClaimToken:undefined})).calls,[]));
await test('owned paid never released',async()=>{let x=await probe('succeeded');assert.equal(x.result.kind,'used');assert.deepEqual(x.calls,['retrieve'])});
await test('owned canceled released',async()=>{let x=await probe('canceled');assert.equal(x.result.kind,'available');assert.deepEqual(x.calls,['retrieve','release'])});
await test('owned unbound released',async()=>{let x=await probe('x',{}, {},{payment_intent_id:null});assert.equal(x.result.kind,'available');assert.deepEqual(x.calls,['release'])});
await test('changed cart canceled before release',async()=>{let x=await probe('requires_payment_method',{}, {amountCents:2000});assert.equal(x.result.kind,'available');assert.deepEqual(x.calls,['retrieve','cancel','release'])});
for(const status of ['requires_action','requires_confirmation','processing','future_status'])await test('changed '+status+' untouched',async()=>{let x=await probe(status,{}, {amountCents:0});assert.equal(x.result.kind,'pending');assert.deepEqual(x.calls,['retrieve'])});
for(const [name,opts] of [['cancel race',{cancelError:true}],['nonterminal cancel',{cancelStatus:'processing'}],['release error',{releaseError:true}]])await test(name+' fails closed',async()=>{let x=await probe('requires_payment_method',opts,{amountCents:0});assert.equal(x.result.kind,'failure');if(opts.cancelError||opts.cancelStatus)assert(!x.calls.includes('release'))});
for(const metadata of [{...base.metadata,event_slug:'other'},{...base.metadata,donor_email:'other@example.invalid'},{...base.metadata,bbq_staff_code:''}])await test('metadata mismatch fails closed',async()=>{let x=await probe('requires_payment_method',{metadata});assert.equal(x.result.kind,'failure');assert.deepEqual(x.calls,['retrieve'])});
for (const [field,value] of [['attendees','3'],['sponsor_amount','10'],['cover_fee','1']])await test('equal price but different '+field+' cannot resume',async()=>{let x=await probe('requires_action',{metadata:{...base.metadata,[field]:value}});assert.equal(x.result.kind,'pending');assert.deepEqual(x.calls,['retrieve'])});
await test('Stripe retrieve error holds',async()=>assert.equal((await probe('retrieve_error')).result.kind,'failure'));
// Exact production lookup function tested against all statuses and cookie ownership.
for(const [status,token,valid,reason] of [['available',undefined,true,undefined],['held',undefined,false,'in_progress'],['held','foreign',false,'in_progress'],['held','mine',true,undefined],['consumed','mine',false,'already_used']])await test('lookup '+status+'/'+token,async()=>{let q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{code:'BBQ-TESTABCD',status,claim_token:'mine'},error:null})};db={from:()=>q};let x=await helper.verifyBbqStaffCode('bbq-testabcd',token);assert.equal(x.valid,valid);assert.equal(x.reason,reason)});
// Exercise the actual route, not a rewritten decision. Other events' imports stubbed only.
let retry={kind:'resume',clientSecret:'same-secret',paymentIntentId:'pi_original'},created=0,cookie;
const next={NextResponse:{json:(body,opt)=>({body,opt,cookies:{set:(...args)=>{cookie=args}}})}};
const route=load('src/app/api/stripe/event-payment-intent/route.ts',{
'next/server':next,'@/lib/stripe/server':{stripe:{paymentIntents:{create:async()=>{created++;return {id:'pi_new',client_secret:'new-secret'}},cancel:async()=>({status:'canceled'})}}},
'@/lib/donations/normalize-donor':{normalizeDonorEmail:x=>x.toLowerCase()},'@/lib/events/paid-events':{getPaidEvent:()=>({type:'bbq',slug:'teens-bbq',title:'BBQ'})},'@/lib/events/paid-event-capacity':{assertPaidEventHasRoom:async()=>({ok:true}),paidEventUnitsFromInput:()=>2},
'@/lib/events/paid-event-pricing':{computePaidEventTotal:x=>({total:x.bbq.attendees*10-(x.bbq.staffFree?10:0)+(x.sponsorAmount??0),ticketSubtotal:10,sponsorAmount:0,cardFee:0}),totalToCents:x=>x*100},
'@/lib/events/hebrew-fair-codes':{},'@/lib/events/chai-member-event-codes':{},'@/lib/events/skate-allowance':{},'@/lib/events/hebrew-fair-code-holds':{},'@/lib/events/sync':{},
'@/lib/events/bbq-staff-codes':{reconcileBbqCheckout:async()=>retry,verifyBbqStaffCode:async()=>({supported:true,valid:true,code:'BBQ-TESTABCD'}),claimBbqStaffCode:async()=>({supported:true,claimed:true}),bindBbqStaffCodePayment:async()=>{},releaseBbqStaffCode:async()=>{}}});
const body={slug:'teens-bbq',amountCents:1000,firstName:'Test',lastName:'Person',email:'test@example.invalid',bbq:{attendees:2,staffCode:'BBQ-TESTABCD'}};
const req=b=>({json:async()=>b,cookies:{get:()=>({value:'mine'})}});
await test('route resumes same intent without creating new one',async()=>{let x=await route.POST(req(body));assert.equal(x.body.paymentIntentId,'pi_original');assert.equal(created,0)});
for(const kind of ['pending','used','failure'])await test('route '+kind+' no PI',async()=>{retry={kind};let x=await route.POST(req(body));assert(x.body.error);assert.equal(created,0)});
await test('route rejects changed client price before reconcile/create',async()=>{retry={kind:'available'};let x=await route.POST(req({...body,amountCents:2000}));assert(x.body.error);assert.equal(created,0)});
await test('route available claims and sets own cookie',async()=>{let x=await route.POST(req(body));assert.equal(x.body.paymentIntentId,'pi_new');assert.equal(created,1);assert.equal(cookie[0],'bbq_claim_token');assert(cookie[2].httpOnly);assert.equal(cookie[2].sameSite,'lax')});
console.log(count+' tests passed');
})().catch(e=>{console.error(e);process.exit(1)});
