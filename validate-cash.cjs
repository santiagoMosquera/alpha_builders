const assert=require('node:assert/strict');
const E=require('./dist/engine.js');
const base={price:80000,discount:5,discountType:'percent',entryType:'usd',selectedScenario:'fixed',fixedMonthly:1000,first:'2026-11-01',delivery:'2029-12-01',reserve:0,entry:0,extras:[],paymentMethod:'cash',cashDelivery:'2029-12-01',cashReserveDate:'2026-10-14',cashPaymentDate:'2026-11-15'};
for(const reserve of [0,1000,1461.18,76000]){
 const r=E.calculate({...base,cashReserve:reserve});
 assert.equal(r.mode,'cash');assert.equal(r.difference,0);assert.equal(r.extraTotal,0);assert.equal(r.monthlyTotal,0);assert.equal(r.coveredTotal,r.net);assert.equal(r.schedule.length,reserve===76000?0:1);
 E.assertBalanced(r);
}
const r=E.calculate({...base,cashReserve:1461.18});
assert.equal(r.schedule[0].cents,7453882);assert.equal(r.schedule[0].date,'2026-11-15');
console.log('Pruebas de contado correctas: reserva + pago programado, sin extraordinarias.');
