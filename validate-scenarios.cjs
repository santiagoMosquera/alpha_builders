const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {calculate,distributeDifference,assertBalanced}=require('./dist/engine.js');
const base={client:'Amy Astaire',project:'Magnus',unit:'E1612',area:30.04,balcony:0,storage:0,parking:0,price:81612.37,discount:3,discountType:'percent',reserve:1000,reserveDate:'2026-10-28',entry:28000,entryType:'usd',entryDate:'2026-10-28',first:'2026-11-28',delivery:'2029-12-28',extras:[],mode:'fixed',fixedMonthly:1000};
const preview=calculate(base,{allowUnbalanced:true,applyClosing:false});assert.equal(preview.count,38);assert.equal(preview.monthlyTotal,3800000);assert.equal(preview.coveredTotal,6700000);assert.equal(preview.difference,1216400);assert.equal(preview.fullyCovered,false);const closed=calculate(base,{allowUnbalanced:true});assert.equal(closed.difference,524760);assert.equal(closed.schedule.at(-1).cents,791640);assert.equal(closed.closingAdjustments[0].change,691640);assert.throws(()=>calculate(base),/Faltan/);assert.throws(()=>assertBalanced(preview),/Faltan/);
for(const n of [2,3,7,38]){const extras=distributeDifference(base,n);const final=calculate({...base,extras});assert.equal(extras.length,n);assert.equal(final.difference,0);assert.equal(final.schedule.at(-1).remaining,0);assert(final.schedule.filter(x=>x.type==='monthly').every(x=>x.cents===100000));assertBalanced(final);}
const replacement={...base,extras:[{amount:5000,date:'2029-12-28',mode:'replace'}]};const rep=calculate(replacement,{allowUnbalanced:true,applyClosing:false});assert.equal(rep.count,37);assert.equal(rep.monthlyTotal,3700000);assert.equal(rep.difference,816400);calculate({...replacement,extras:[...replacement.extras,...distributeDifference(replacement,2)]});
const over={...base,fixedMonthly:2000};assert(calculate(over,{allowUnbalanced:true}).difference<0);assert.throws(()=>calculate(over),/exceden/);assert.throws(()=>distributeDifference(over,1),/No hay/);assert.throws(()=>distributeDifference(base,39),/Elige/);
const tiny={...base,price:1.01,discount:0,reserve:0,entry:0,first:'2027-01-31',delivery:'2027-12-31',fixedMonthly:.07};const t=calculate(tiny,{allowUnbalanced:true,applyClosing:false});assert.equal(t.difference,17);calculate({...tiny,extras:distributeDifference(tiny,3)});
const covered={...base,price:100,discount:0,reserve:0,entry:100,fixedMonthly:0};assert.equal(calculate(covered).schedule.length,0);

// Reduce only extraordinary payments, newest date first regardless of entry order.
const reverse={...base,price:10000,discount:0,reserve:0,entry:0,first:'2027-01-28',delivery:'2027-12-28',fixedMonthly:750,extras:[{date:'2027-03-28',amount:500,mode:'add',label:'March'},{date:'2027-01-28',amount:1000,mode:'add',label:'January'},{date:'2027-02-28',amount:800,mode:'add',label:'February'}]};
const reduced=calculate(reverse);assert.equal(reduced.originalDifference,-130000);assert.equal(reduced.difference,0);assert.deepEqual(reduced.closingAdjustments.map(a=>a.label),['March','February']);assert.deepEqual(reduced.schedule.filter(x=>x.type==='extra').map(x=>x.cents),[100000,0,0]);assert(reduced.schedule.filter(x=>x.type==='monthly').every(x=>x.cents===75000));assert(reverse.extras.every(x=>x.amount>0));
const partial=calculate({...reverse,extras:reverse.extras.map(x=>({...x,amount:2000}))});assert.deepEqual(partial.closingAdjustments.map(a=>a.after),[0,0,100000]);
const insufficient={...reverse,fixedMonthly:1000};const bad=calculate(insufficient,{allowUnbalanced:true});assert.equal(bad.extraTotal,0);assert.equal(bad.difference,-200000);assert.throws(()=>calculate(insufficient),/exceden/);
const lastExtra=calculate(replacement,{allowUnbalanced:true});assert.equal(lastExtra.schedule.at(-1).type,'extra');assert.equal(lastExtra.schedule.at(-1).cents,791640);
const tied=calculate({...reverse,price:9700,extras:[{date:'2027-03-28',amount:500,mode:'add',label:'First'},{date:'2027-03-28',amount:500,mode:'add',label:'Last'}]});assert.equal(tied.closingAdjustments[0].label,'Last');assert.equal(tied.closingAdjustments[0].after,20000);

// Use the actual final-page gate and migration functions without a browser.
const source=fs.readFileSync('dist/app.js','utf8');
function fn(name){const start=source.indexOf('function '+name+'(');assert(start>=0);let end=source.indexOf('\nfunction ',start+1);const event=source.indexOf("\n$('",start+1);if(end<0||event>=0&&event<end)end=event;return source.slice(start,end);}
const ids={stepError:{hidden:true,textContent:''}};
const context={state:{...base,selectedScenario:'fixed',fixedExtras:[],extras:[]},currentStep:3,PaymentEngine:{calculate,assertBalanced},$:(id)=>ids[id]};vm.createContext(context);
for(const name of ['activeExtras','effectiveState','propertyValidate','assertFinal','showStep'])vm.runInContext(fn(name),context);
assert.throws(()=>vm.runInContext('assertFinal()',context),/Faltan/);context.state.fixedMonthly=0;assert.equal(vm.runInContext('showStep(6)',context),false);assert.equal(context.currentStep,3);assert.equal(ids.stepError.hidden,false);
context.state.fixedMonthly=2000;assert.equal(vm.runInContext('showStep(6)',context),false);assert.match(ids.stepError.textContent,/exceden/);
context.state.fixedMonthly=1000;context.state.fixedExtras=distributeDifference(base,3);assert.equal(vm.runInContext('assertFinal().difference',context),0);
context.state.selectedScenario='term';assert.equal(vm.runInContext('assertFinal().mode',context),'term');
vm.runInContext(source.match(/const fields=\[[^\n]+/)[0],context);
vm.runInContext(fn('normalizeImported'),context);vm.runInContext(fn('normalizeExtras'),context);
const old={...base,representative:'',idNumber:'',notes:''};delete old.fixedMonthly;delete old.selectedScenario;
context.old=old;assert.equal(vm.runInContext('normalizeImported(old).selectedScenario',context),'term');assert.equal(vm.runInContext('normalizeImported(old).fixedExtras.length',context),0);
console.log('Automatic final-payment increases, reverse reductions, zero lower bound, unresolved surplus gate, both modes, distribution and migration verified.');

// Exact 10% ceiling, zero-valued trailing extras, and positive amounts after discount.
const capBase={...base,price:10000,discount:10,reserve:675,entry:0,first:'2027-01-28',delivery:'2027-12-28',extras:[],fixedMonthly:675};
const capped=calculate(capBase);assert.equal(capped.lastPayment,90000);assert.equal(capped.lastPaymentLimit,90000);assert.equal(capped.difference,0);
const oneCent=calculate({...capBase,fixedMonthly:674.99},{allowUnbalanced:true});assert.equal(oneCent.lastPayment,90000);assert.equal(oneCent.difference,11);assert.throws(()=>calculate({...capBase,fixedMonthly:674.99}),/Faltan/);
const tooLarge=calculate({...capBase,fixedMonthly:1000,extras:[{date:capBase.delivery,amount:1,mode:'add'}]},{allowUnbalanced:true});assert.equal(tooLarge.schedule.at(-1).cents,0);assert.equal(tooLarge.lastPaymentValid,false);assert.throws(()=>assertBalanced(tooLarge),/10%/);
assert.throws(()=>calculate({...capBase,mode:'term',first:capBase.delivery}),/10%/);
// Persistent budget computes the chosen scenario's actual remaining balance.
const budgetIds={paymentBudget:{},budgetTarget:{},budgetGapLabel:{},budgetGap:{},budgetNote:{},budgetInitial:{},budgetInitialPercent:{}};
const budgetContext={state:{...base,selectedScenario:'fixed',fixedExtras:[],extras:[]},calculationStarted:true,PaymentEngine:{calculate,initialPayments:require('./dist/engine.js').initialPayments},$:(id)=>budgetIds[id],document:{querySelector:()=>({classList:{toggle(){}}})},money:c=>String(c)};vm.createContext(budgetContext);
for(const name of ['effectiveState','priceOnly','initialOnly','renderBudget'])vm.runInContext(fn(name),budgetContext);
vm.runInContext('renderBudget()',budgetContext);assert.equal(budgetIds.paymentBudget.hidden,false);assert.equal(budgetIds.budgetTarget.textContent,'7916400');assert.equal(budgetIds.budgetGap.textContent,'524760');
budgetContext.state.fixedExtras=distributeDifference(base,3);vm.runInContext('renderBudget()',budgetContext);assert.equal(budgetIds.budgetGap.textContent,'0');
console.log('10% cap, discounted basis, cent boundary, trailing zero and live budget verified.');

assert.equal(budgetIds.budgetInitial.textContent,'2900000');assert.equal(budgetIds.budgetInitialPercent.textContent,'36,63%');
budgetContext.state.entryType='percent';budgetContext.state.entry=30;vm.runInContext('renderBudget()',budgetContext);assert.equal(budgetIds.budgetInitial.textContent,'2374920');assert.equal(budgetIds.budgetInitialPercent.textContent,'30,00%');
console.log('Header total includes the initial deposit and shows the combined percentage.');
// Delivery is chosen before both scenarios and deducted before term installments.
const deliveryBase={...base,price:100000,discount:10,reserve:1000,entry:30,entryType:'percent',first:'2027-01-31',delivery:'2027-12-31',mode:'term',deliveryPaymentType:'percent',deliveryPayment:10,extras:[]};
const deliveryResult=calculate(deliveryBase);assert.equal(deliveryResult.net,9000000);assert.equal(deliveryResult.initial,2700000);assert.equal(deliveryResult.deliveryConfigured,900000);assert.equal(deliveryResult.deliveryTotal,900000);assert.equal(deliveryResult.count,11);assert.equal(deliveryResult.base,490909);assert.equal(deliveryResult.monthlyTotal,5400000);assert.equal(deliveryResult.schedule.at(-1).label,'Pago a la entrega');assert.equal(deliveryResult.schedule.at(-1).remaining,0);
const deliveryUsd=calculate({...deliveryBase,deliveryPaymentType:'usd',deliveryPayment:9000});assert.equal(deliveryUsd.base,deliveryResult.base);assert.equal(deliveryUsd.count,11);
const noDelivery=calculate({...deliveryBase,deliveryPaymentType:'none'});assert.equal(noDelivery.count,12);assert.equal(noDelivery.base,525000);assert.equal(noDelivery.deliveryTotal,0);assert(!noDelivery.schedule.some(x=>x.isDeliveryPayment));
const zeroDelivery=calculate({...deliveryBase,deliveryPayment:0});assert.equal(zeroDelivery.count,12);assert.equal(zeroDelivery.deliveryTotal,0);
assert.throws(()=>calculate({...deliveryBase,deliveryPayment:10.01}),/10%/);assert.throws(()=>calculate({...deliveryBase,deliveryPaymentType:'usd',deliveryPayment:9000.01}),/10%/);
assert.throws(()=>calculate({...deliveryBase,entry:95}),/superan/);
assert.throws(()=>calculate({...deliveryBase,extras:[{date:deliveryBase.delivery,amount:100,mode:'replace'}]}),/ya reemplaza/);
const offDate=calculate({...deliveryBase,delivery:'2027-12-30'});assert.equal(offDate.count,11);assert.equal(offDate.schedule.at(-1).date,'2027-12-30');
const fixedDelivery=calculate({...deliveryBase,mode:'fixed',fixedMonthly:4000},{allowUnbalanced:true});assert.equal(fixedDelivery.count,11);assert.equal(fixedDelivery.deliveryTotal,900000);assert.equal(fixedDelivery.difference,1000000);
const fixedClosed=calculate({...deliveryBase,mode:'fixed',fixedMonthly:4000,extras:distributeDifference({...deliveryBase,mode:'fixed',fixedMonthly:4000},3)});assert.equal(fixedClosed.difference,0);assert.equal(fixedClosed.deliveryTotal,900000);
assert.equal(vm.runInContext('normalizeImported(old).deliveryPaymentType',context),'none');assert.equal(vm.runInContext('normalizeImported(old).deliveryPayment',context),'0');
console.log('Optional delivery amount/percent, discounted basis, deduction before monthly value, both modes and old-plan defaults verified.');

// Additional extras keep the regular installment and sum actual amounts on that date.
const additiveBase={...base,price:100000,discount:0,reserve:1000,entry:30,entryType:'percent',first:'2027-01-30',delivery:'2027-12-30',fixedMonthly:5000,deliveryPaymentType:'none',extras:[{date:'2027-06-30',amount:10000,mode:'add'}]};
const additive=calculate(additiveBase);
const sameDate=additive.schedule.filter(row=>row.date==='2027-06-30');
assert.equal(additive.count,12);assert.equal(sameDate.length,2);
assert.equal(sameDate.find(row=>row.type==='monthly').cents,500000);
assert.equal(sameDate.find(row=>row.type==='extra').cents,1000000);
assert(sameDate.every(row=>row.amountDueOnDate===1500000&&row.regularOnDate===500000&&row.extrasOnDate===1000000));
assert.equal(sameDate[0].remaining-sameDate[1].remaining,1000000);
assert.equal(additive.monthlyTotal+additive.extraTotal,additive.balance);
assert.equal(additive.coveredTotal,additive.net);assert.equal(additive.difference,0);
const termAdditive=calculate({...additiveBase,mode:'term',extras:[{date:'2027-06-30',amount:6000,mode:'add'}]});
assert.equal(termAdditive.count,12);assert.equal(termAdditive.base,533333);
assert(termAdditive.schedule.filter(row=>row.date==='2027-06-30').every(row=>row.amountDueOnDate===1133333));
assert.equal(termAdditive.monthlyTotal+termAdditive.extraTotal,termAdditive.balance);
const replaced=calculate({...additiveBase,extras:[{date:'2027-06-30',amount:10000,mode:'replace'}]},{allowUnbalanced:true,applyClosing:false});
assert.equal(replaced.count,11);assert(!replaced.schedule.some(row=>row.date==='2027-06-30'&&row.type==='monthly'));
assert.equal(replaced.difference,500000);
const multiple=calculate({...additiveBase,extras:[{date:'2027-06-30',amount:4000,mode:'add'},{date:'2027-06-30',amount:6000,mode:'add'}]});
assert.equal(multiple.count,12);assert(multiple.schedule.filter(row=>row.date==='2027-06-30').every(row=>row.amountDueOnDate===1500000));
assert.equal(multiple.coveredTotal,multiple.net);
console.log('Additional extras verified in both scenarios: $5,000 regular + $10,000 extra = $15,000 due on the same date, counted once. Replacement and multiple extras also verified.');
