const assert=require('node:assert/strict');
const {calculate,months}=require('./dist/engine.js');
const base={price:81612.37,discount:3,discountType:'percent',reserve:1000,reserveDate:'2026-10-28',entry:28000,entryType:'usd',entryDate:'2026-10-28',first:'2026-11-28',delivery:'2029-12-28',extras:[{amount:5000,date:'2029-12-28',label:'Entrega',mode:'replace'}]};
function balanced(s){const r=calculate(s);assert.equal(r.initial+r.schedule.reduce((sum,x)=>sum+x.cents,0),r.net);assert(r.schedule.every(x=>x.cents>=0&&x.remaining>=0));if(r.schedule.length)assert.equal(r.schedule.at(-1).remaining,0);return r;}
const ref=balanced(base);assert.equal(ref.net,7916400);assert.equal(ref.balance,5016400);assert.equal(ref.count,37);assert.equal(ref.base,122065);assert.equal(ref.last,122060);assert.equal(ref.schedule.length,38);
assert.throws(()=>calculate({...base,extras:[{amount:60000,date:'2029-12-28',mode:'add'}]}),/10%/);balanced({...base,extras:[]});balanced({...base,extras:[{amount:5000,date:'2029-12-28',mode:'add'}]});
const sameDate=balanced({...base,extras:[{amount:100,date:'2026-11-28',mode:'add'},{amount:200,date:'2026-11-28',mode:'add'}]});assert.equal(sameDate.schedule.filter(r=>r.date==='2026-11-28').length,3);
assert.deepEqual(months('2027-01-31','2027-04-30'),['2027-01-31','2027-02-28','2027-03-31','2027-04-30']);assert.deepEqual(months('2028-01-31','2028-03-31'),['2028-01-31','2028-02-29','2028-03-31']);
assert.deepEqual(months('2026-11-28','2026-12-15'),['2026-11-28']);
balanced({...base,price:100000,discountType:'usd',discount:10000,entryType:'percent',entry:30,extras:[]});
const full=balanced({...base,price:100,discount:0,reserve:0,entry:100,extras:[]});assert.equal(full.schedule.length,0);
const onlyExtra=calculate({...base,price:100,discount:0,reserve:0,entry:0,first:'2026-11-28',delivery:'2026-11-28',extras:[{amount:100,date:'2026-11-28',mode:'replace'}]},{allowUnbalanced:true});assert.equal(onlyExtra.count,0);assert.throws(()=>calculate({...base,price:100,discount:0,reserve:0,entry:0,first:'2026-11-28',delivery:'2026-11-28',extras:[{amount:100,date:'2026-11-28',mode:'replace'}]}),/10%/);
for(const overrides of [{discount:101},{entry:100000},{delivery:'2026-01-01'},{reserveDate:'2027-12-28'},{extras:[{amount:100,date:'2030-01-01',mode:'add'}]},{extras:[{amount:100,date:'2026-11-29',mode:'replace'}]},{extras:[{amount:100,date:'2026-11-28',mode:'replace'},{amount:100,date:'2026-11-28',mode:'replace'}]},{first:'2026-02-30'}])assert.throws(()=>calculate({...base,...overrides}));
// Check rounding against tiny balances and several lengths, including dates at month ends.
for(const cents of [1,2,3,5,11,100,101,997,3000001])for(const delivery of ['2027-01-31','2027-04-30','2029-01-31']){const r=calculate({...base,price:cents/100,discount:0,reserve:0,entry:0,first:'2027-01-31',delivery,extras:[]},{allowUnbalanced:true});assert.equal(r.coveredTotal,r.net);assert(r.schedule.every(x=>x.cents>=0));}
console.log('Validated reference, discounts, monthly dates, extraordinary payments, paid-in-full cases, rounding and invalid inputs.');

// Percentage means the combined initial payment; USD remains additional to the deposit.
const percentState={...base,price:100000,discount:10,reserve:1000,entry:30,entryType:'percent',extras:[]};
const percentTotal=balanced(percentState);assert.equal(percentTotal.net,9000000);assert.equal(percentTotal.initial,2700000);assert.equal(percentTotal.entry,2600000);assert.equal(percentTotal.balance,6300000);
const equalDeposit=balanced({...percentState,reserve:27000});assert.equal(equalDeposit.entry,0);assert.equal(equalDeposit.initial,2700000);
assert.throws(()=>calculate({...percentState,reserve:27000.01}),/abono inicial supera/);assert.throws(()=>calculate({...percentState,entry:101}),/100%/);
const allPercent=balanced({...percentState,entry:100});assert.equal(allPercent.entry,8900000);assert.equal(allPercent.initial,9000000);assert.equal(allPercent.schedule.length,0);
const usdTotal=balanced({...percentState,entryType:'usd',entry:27000});assert.equal(usdTotal.initial,2800000);
console.log('Combined percentage entry, discounted price, deposit deduction, full payment and USD addition verified.');
