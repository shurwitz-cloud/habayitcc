const root=require('path').resolve(__dirname,'..')+'/',fs=require('fs'),vm=require('vm'),ts=require(root+'node_modules/typescript'),assert=require('assert/strict');
let sent,receipt;
function load(path,stubs){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(root+path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:k=>{if(!(k in stubs))throw Error(k);return stubs[k]},console,Date,Number});return exports;}
const couple=load('src/lib/donations/couple-names.ts',{});
const helper=load('src/lib/email/donation-receipt.ts',{'@/lib/donations/receipt-method':{receiptMethodFromDonationType:()=> 'Credit Card'},'./client':{buildEmailHtml:x=>x,emailButton:(link,label)=>`<a href="${link}">${label}</a>`,getSiteUrl:()=> 'https://habayitcc.org',sendEmail:async x=>{sent=x;return true}},'@/lib/donations/receipt-url':{buildReceiptUrl:x=>{receipt=x;return '/receipt?synthetic-link'}},'@/lib/donations/couple-names':couple});
const base={email:'person@example.invalid',firstName:'Example',lastName:'Person',amountDollars:100,donationType:'One-Time',method:'Zelle',paidAt:'2026-11-13T17:00:00Z'};
let n=0;const ok=name=>console.log('PASS',++n,name);
(async()=>{
await helper.sendDonationReceiptEmailFromRecord(base);const baseline=sent.html;
assert.equal(receipt.name,'Example Person');assert.equal(receipt.memo,undefined);assert(sent.html.includes('Dear Example,'));ok('unchanged default personal name and greeting');
await helper.sendDonationReceiptEmailFromRecord({...base,memo:'Shabbat Kiddush'});assert.equal(receipt.memo,'Shabbat Kiddush');assert.equal(sent.html,baseline);ok('memo forwarded; standard email HTML unchanged apart from real signed URL');
await helper.sendDonationReceiptEmailFromRecord({...base,company:'Example Organization',memo:'Printing'});assert.equal(receipt.name,'Example Organization');assert.equal(receipt.memo,'Printing');assert.equal(sent.html,baseline);ok('company receipt retains personal email greeting and standard template');
assert.equal(sent.to.join(','),'person@example.invalid');ok('company does not change recipients');
await helper.sendDonationReceiptEmailFromRecord({...base,company:' ',receiptName:'Custom Record Name'});assert.equal(receipt.name,'Custom Record Name');ok('explicit receipt override fallback');
await helper.sendDonationReceiptEmailFromRecord({...base,company:'Company',receiptName:'Override'});assert.equal(receipt.name,'Company');ok('company takes precedence');
await helper.sendDonationReceiptEmailFromRecord({...base,spouseFirstName:'Partner',spouseLastName:'Person'});assert.equal(receipt.name,'Example & Partner Person');assert(sent.html.includes('Dear Example & Partner,'));ok('joint receipt/greeting fallback unchanged');
await helper.sendDonationReceiptEmailFromRecord({...base,spouseEmail:'partner@example.invalid',company:'Company'});assert.equal(sent.to.length,2);assert(sent.to.includes('partner@example.invalid'));ok('existing spouse recipients unchanged');
receipt=null;await helper.sendDonationReceiptEmailFromRecord({...base,includeReceiptLink:false,memo:'Printing'});assert.equal(receipt,null);assert(!sent.html.includes('View &amp; Print Tax Receipt'));ok('no-receipt opt-out preserved');
await helper.sendDonationReceiptEmailFromRecord({...base,goodsDescription:'Benefit',goodsFmv:10,deductibleAmount:90});assert.equal(receipt.goodsDescription,'Benefit');assert.equal(receipt.deductibleAmount,90);ok('QPQ fields unchanged');
assert.equal(await helper.sendDonationReceiptEmailFromRecord({...base,email:''}),false);ok('missing recipient fails without send');
console.log(n+' helper tests passed, fixture identities synthetic');
})().catch(e=>{console.error(e);process.exit(1)});
