const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const PaymentEngine=require('./dist/engine.js');
const PaymentRevisions=require('./dist/revisions.js');

// A small DOM adapter runs the real app and its registered handlers without a browser.
const html=fs.readFileSync('dist/index.html','utf8');
const decode=s=>s.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
let quoteKind='full',focused;
class Element {
  constructor(id=''){this.id=id;this.value='';this.hidden=false;this.open=false;this.disabled=false;this.handlers={};this.attributes={};this.cards=[];this.classList={toggle(){}};}
  addEventListener(type,fn){(this.handlers[type]??=[]).push(fn);}
  dispatch(type,target=this){for(const fn of this.handlers[type]??[])fn({target,preventDefault(){}});}
  set innerHTML(value){this.html=value;this.textContent=value.replace(/<[^>]*>/g,'');if(this.id==='extraDraftCards'){
    this.cards=value.split(/<div class="extra-card" data-index="\d+">/).slice(1).map(part=>{
      const card=new Element(),fields={};
      for(const match of part.matchAll(/<(input|select)\b[^>]*data-field="([^"]+)"[^>]*>/g)){
        const field=new Element(),tag=match[0];
        if(match[1]==='input')field.value=decode(tag.match(/value="([^"]*)"/)?.[1]??'');
        else{const options=part.slice(match.index+tag.length).split('</select>')[0];field.value=[...options.matchAll(/<option value="([^"]+)"([^>]*)>/g)].find(x=>x[2].includes('selected'))?.[1]??options.match(/value="([^"]+)"/)?.[1]??'';}
        fields[match[2]]=field;
      }
      card.querySelector=selector=>fields[selector.match(/data-field="([^"]+)"/)?.[1]]??null;return card;
    });
  }}
  get innerHTML(){return this.html??'';}
  querySelectorAll(selector){return selector==='.extra-card'?this.cards:[];}
  querySelector(selector){if(this.id==='newQuoteForm')return {value:quoteKind};if(selector==='p')return this.paragraph??=new Element();return null;}
  get lastElementChild(){return this.cards.at(-1);}
  closest(selector){return selector==='.editor'?editor:null;}
  showModal(){this.open=true;}
  close(){this.open=false;this.dispatch('close');}
  setAttribute(name,value){this.attributes[name]=value;}
  removeAttribute(name){delete this.attributes[name];}
  focus(){focused=this.id;}
  select(){}
}
const ids={};for(const match of html.matchAll(/\bid="([^"]+)"/g)){assert(!ids[match[1]],'Duplicate ID '+match[1]);ids[match[1]]=new Element(match[1]);}
const editor=new Element(),results=new Element(),topbar=new Element();
const pages=Array.from({length:6},()=>new Element());
const local=new Map(),revoked=[];
const context={PaymentEngine,PaymentRevisions,structuredClone,Intl,Date,Number,String,Math,Array,Map,Set,JSON,console,
  document:{getElementById:id=>{assert(ids[id],'Missing element '+id);return ids[id];},querySelectorAll:()=>pages,querySelector:selector=>selector==='.results'?results:topbar},
  localStorage:{getItem:key=>local.get(key),setItem:(key,value)=>local.set(key,value)},
  window:{scrollTo(){}},setTimeout:()=>1,clearTimeout(){},fetch:async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)}),
  URL:{revokeObjectURL:url=>revoked.push(url)},confirm:()=>{throw Error('Unexpected native confirmation');}
};
vm.createContext(context);vm.runInContext(fs.readFileSync('dist/app.js','utf8'),context);
const run=code=>vm.runInContext(code,context);
const snapshot=()=>JSON.parse(run('JSON.stringify(state)'));
const draft=()=>JSON.parse(run('JSON.stringify(extraEdit.list)'));
const fixture={...PaymentRevisions.emptyPlan(),client:'María Pérez',idNumber:'0123456789',representative:'José Muñoz',project:'Magnus',unit:'E1612',area:30.04,balcony:2,storage:1,parking:1,price:100000,reserve:1000,reserveDate:'2026-12-30',entry:30,entryType:'percent',entryDate:'2026-12-30',first:'2027-01-30',delivery:'2027-12-30',selectedScenario:'fixed',fixedMonthly:5000,notes:'Condición anterior',fixedExtras:[{amount:10000,date:'2027-06-30',timing:'fixed',label:'Extra junio',mode:'add'}],extras:[{amount:6000,date:'2027-06-30',timing:'fixed',label:'Alternativa plazo',mode:'add'}]};
function loadFixture(){context.fixture=structuredClone(fixture);run('currentStep=0;state=structuredClone(fixture);populate();showStep(6,false)');assert.equal(run('currentStep'),6);assert.equal(ids.print.disabled,false);}
function setDraft(list){context.proposal=list;run('extraEdit.list=structuredClone(proposal);renderExtraDraft()');}

// Re-entry starts empty, cancel restores the old quote, and autosave is untouched.
loadFixture();const old=snapshot(),saved=local.get('alpha-builders-payment-plan-v2');
ids.finalEditExtras.dispatch('click');assert.equal(ids.extrasDialog.open,true);assert.equal(draft()[0].amount,0);assert.equal(draft().length,old.fixedExtras.length);
assert.deepEqual(snapshot(),old);assert.equal(local.get('alpha-builders-payment-plan-v2'),saved);
ids.extrasDialog.close();assert.deepEqual(snapshot(),old);assert.equal(run('extraEdit'),null);

// Increase to two, sum same-date regular + extras, and replace rather than append.
ids.finalEditExtras.dispatch('click');ids.draftParts.value='2';ids.resizeDraft.dispatch('click');assert.equal(draft().length,2);
setDraft([{amount:4000,date:'2027-06-30',timing:'fixed',label:'Primera',mode:'add'},{amount:6000,date:'2027-06-30',timing:'fixed',label:'Segunda',mode:'add'}]);
ids.extraEditForm.dispatch('submit');assert.equal(ids.extrasDialog.open,false);assert.equal(snapshot().fixedExtras.length,2);assert.deepEqual(snapshot().extras,old.extras);
assert.equal(run('currentStep'),6);assert.equal(run('result.difference'),0);assert.equal(run("result.schedule.find(row=>row.date==='2027-06-30').amountDueOnDate"),1500000);
assert.match(ids.preview.innerHTML,/Cuotas Extraordinarias/);assert.equal(run('assertFinal().difference'),0);

// Decrease to zero: store the removal, keep the gap visible, block report and exports.
ids.finalEditExtras.dispatch('click');ids.draftParts.value='0';ids.resizeDraft.dispatch('click');ids.extraEditForm.dispatch('submit');
assert.equal(snapshot().fixedExtras.length,0);assert.equal(run('currentStep'),4);assert.equal(ids.print.disabled,true);assert.equal(ids.csv.disabled,true);
assert.equal(run('exportReady()'),false);assert.equal(run('showStep(6,false)'),false);assert.match(ids.stepError.textContent,/Faltan/);

// Invalid dates cannot overwrite a good distribution.
loadFixture();const validBefore=snapshot();ids.editChosenExtras.dispatch('click');
setDraft([{amount:10000,date:'2028-01-01',timing:'fixed',label:'Fuera del plazo',mode:'add'}]);ids.extraEditForm.dispatch('submit');
assert.equal(ids.extrasDialog.open,true);assert.equal(ids.extraEditError.hidden,false);assert.deepEqual(snapshot(),validBefore);ids.extrasDialog.close();

// Monthly edits cancel safely, preserve extras for the same value and clear only Forma 2 on change.
ids.finalEditFixed.dispatch('click');ids.newFixedMonthly.value='4500';ids.fixedDialog.close();assert.deepEqual(snapshot(),validBefore);
ids.finalEditFixed.dispatch('click');ids.newFixedMonthly.value='5000.00';ids.fixedEditForm.dispatch('submit');assert.deepEqual(snapshot().fixedExtras,validBefore.fixedExtras);assert.equal(run('currentStep'),6);
ids.finalEditFixed.dispatch('click');ids.newFixedMonthly.value='-1';ids.fixedEditForm.dispatch('submit');assert.equal(ids.fixedDialog.open,true);assert.equal(ids.fixedEditError.hidden,false);assert.deepEqual(snapshot().fixedExtras,validBefore.fixedExtras);
run("pdfURL='blob:old-pdf';pdfFile={};");ids.newFixedMonthly.value='4500';ids.fixedEditForm.dispatch('submit');
assert.equal(snapshot().fixedMonthly,'4500.00');assert.equal(snapshot().fixedExtras.length,0);assert.deepEqual(snapshot().extras,validBefore.extras);
assert.equal(run('currentStep'),4);assert.equal(ids.print.disabled,true);assert.equal(run('exportReady()'),false);assert(revoked.includes('blob:old-pdf'));

// Automatic proposals are only drafts until applied. The new value can be balanced again.
ids.extraParts.value='3';ids.distributeExtra.dispatch('click');assert.equal(snapshot().fixedExtras.length,0);assert.equal(draft().length,3);
ids.extrasDialog.close();assert.equal(snapshot().fixedExtras.length,0);
ids.distributeExtra.dispatch('click');ids.extraEditForm.dispatch('submit');assert.equal(snapshot().fixedExtras.length,3);assert.equal(run('assertFinal().difference'),0);assert.equal(run('showStep(6,false)'),undefined);assert.equal(run('currentStep'),6);assert.equal(run('exportReady()'),true);

// The last-positive-payment cap also survives the revision workflow.
ids.finalEditExtras.dispatch('click');setDraft([{amount:12000,date:fixture.delivery,timing:'delivery',label:'Entrega',mode:'replace'}]);ids.extraEditForm.dispatch('submit');
assert.equal(ids.extrasDialog.open,false);assert.equal(ids.print.disabled,true);assert.equal(run('showStep(6,false)'),false);assert.match(ids.stepError.textContent,/10%/);

// Each new-quote option clears financial conditions and old exports from the completed quote.
for(const kind of ['full','client','property']){
  loadFixture();const previous=snapshot();ids.newPlan.dispatch('click');assert.equal(ids.newQuoteDialog.open,true);
  ids.newQuoteDialog.close();assert.deepEqual(snapshot(),previous);
  ids.newPlan.dispatch('click');quoteKind=kind;ids.newQuoteForm.dispatch('submit');const next=snapshot();
  const expected=PaymentRevisions.newQuote(previous,kind);for(const key of Object.keys(expected))assert.deepEqual(String(next[key]),String(expected[key]),kind+': '+key);
  assert.equal(next.fixedExtras.length,0);assert.equal(next.extras.length,0);assert.equal(ids.print.disabled,true);assert.equal(ids.paymentBudget.hidden,true);
  assert.equal(run('currentStep'),kind==='property'?1:0);assert.equal(ids.newQuoteDialog.open,false);assert.equal(run('pdfURL'),null);
  if(kind!=='full')assert.equal(next.idNumber,'0123456789');
}
assert.throws(()=>PaymentRevisions.newQuote(fixture,'unknown'),/Selecciona/);
for(const n of [-1,101,1.5,'invalid'])assert.throws(()=>PaymentRevisions.resizeExtras([],n,fixture.delivery),/0 y 100/);
assert.equal(PaymentRevisions.resizeExtras([],100,fixture.delivery).length,100);
console.log('Revision flows verified: cancel/apply, increase/decrease/remove extras, fixed-payment resets, independent scenarios, proposal review, report/export gates, 10% cap and all three quote reuse options.');
