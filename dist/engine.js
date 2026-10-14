(function(root){
  'use strict';
  function dateOK(s){return typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number(s.slice(0,4))>=1900 && Number(s.slice(0,4))<=2200 && !isNaN(new Date(s+'T12:00:00Z').getTime()) && new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;}
  function amount(v,label){const n=Number(v);if(!Number.isFinite(n)||n<0||n>1e10)throw Error(label+': ingresa un valor válido, mayor o igual a cero.');return Math.round((n+Number.EPSILON)*100);}
  function initialPayments(s,net){
    if(!['percent','usd'].includes(s.entryType))throw Error('Selecciona el tipo de entrada.');
    const reserve=amount(s.reserve,'Abono inicial');let entry;
    if(s.entryType==='percent'){
      const p=Number(s.entry);amount(p,'Entrada total');if(p>100)throw Error('La entrada total no puede superar el 100%.');
      const total=Math.round(net*p/100);
      if(reserve>total)throw Error('El abono inicial supera la entrada total indicada. Aumenta el porcentaje de entrada o reduce el abono inicial.');
      entry=total-reserve;
    }else entry=amount(s.entry,'Entrada adicional');
    if(reserve+entry>net)throw Error('El abono inicial y la entrada adicional superan el precio final.');
    return {net,reserve,entry,initial:reserve+entry};
  }
  function deliveryAmount(s,net){
    const type=s.deliveryPaymentType||'none';if(type==='none')return 0;
    if(!['usd','percent'].includes(type))throw Error('Selecciona el tipo de pago a la entrega.');
    const value=Number(s.deliveryPayment);amount(value,'Pago a la entrega');
    if(type==='percent'&&value>10)throw Error('El pago a la entrega no puede superar el 10% del precio final.');
    const cents=type==='percent'?Math.min(Math.round(net*value/100),Math.floor(net/10)):amount(value,'Pago a la entrega');
    if(cents>Math.floor(net/10))throw Error('El pago a la entrega no puede superar el 10% del precio final.');
    return cents;
  }
  function months(first,end){if(!dateOK(first)||!dateOK(end))throw Error('Ingresa fechas válidas para la primera cuota y la entrega.');if(end<first)throw Error('La entrega debe ser igual o posterior a la primera cuota.');const [y,m,day]=first.split('-').map(Number), out=[];for(let i=0;i<=600;i++){const total=m-1+i,year=y+Math.floor(total/12),month=total%12;const d=Math.min(day,new Date(Date.UTC(year,month+1,0)).getUTCDate());const s=year+'-'+String(month+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');if(s>end)return out;out.push(s);}throw Error('El plazo máximo permitido es de 600 meses.');}
  function calculate(s,options={}){
    const price=amount(s.price,'Precio');if(!price)throw Error('Ingresa el precio de venta de la propiedad.');
    if(!['percent','usd'].includes(s.discountType)||!['percent','usd'].includes(s.entryType))throw Error('Selecciona el tipo de descuento y entrada.');
    let discount;if(s.discountType==='percent'){const p=Number(s.discount);amount(p,'Descuento');if(p>100)throw Error('El descuento no puede superar el 100%.');discount=Math.round(price*p/100);}else discount=amount(s.discount,'Descuento');
    if(discount>=price)throw Error('El descuento debe ser menor que el precio de venta.');
    const net=price-discount,{reserve,entry}=initialPayments(s,net);
    for(const [val,name,money] of [[s.reserveDate,'reserva',reserve],[s.entryDate,'entrada',entry]]){if(money>0&&!dateOK(val))throw Error('Ingresa una fecha válida para la '+name+'.');if(money>0&&val>s.first)throw Error('La fecha de '+name+' debe ser anterior o igual a la primera cuota.');}
    if(reserve>0&&entry>0&&s.reserveDate>s.entryDate)throw Error('La reserva debe ser anterior o igual a la entrada.');
    const dates=months(s.first,s.delivery);if(!Array.isArray(s.extras)||s.extras.length>100)throw Error('Puedes ingresar hasta 100 cuotas extraordinarias.');
    // Todas las extraordinarias se acumulan; nunca eliminan mensualidades.
    const replaced=new Set(),extras=s.extras.map((x,i)=>{const cents=amount(x.amount,'Cuota extraordinaria '+(i+1));if(!cents)throw Error('Ingresa el valor de la cuota extraordinaria '+(i+1)+'.');if(!dateOK(x.date)||x.date<s.first||x.date>=s.delivery)throw Error('La cuota extraordinaria '+(i+1)+' debe tener una fecha desde la primera mensualidad y anterior a la entrega.');return {date:x.date,cents,type:'extra',sourceIndex:i,mode:'add',label:String(x.label||'Cuota extraordinaria')};});
    const deliveryConfigured=deliveryAmount(s,net);
    if(deliveryConfigured){if(deliveryConfigured>net-reserve-entry)throw Error('La entrada total y el pago a la entrega superan el precio final.');replaced.add(s.delivery);extras.push({date:s.delivery,cents:deliveryConfigured,type:'extra',isDeliveryPayment:true,label:'Pago a la entrega'});}
    const extraTotal=extras.reduce((t,x)=>t+x.cents,0),balance=net-reserve-entry;
    const mode=s.mode||s.selectedScenario||'term';if(!['term','fixed'].includes(mode))throw Error('Selecciona una forma de cálculo válida.');
    const regularDates=dates.filter(d=>!replaced.has(d));
    let n,base,regular;
    if(mode==='term'){
      const target=Math.max(0,balance-extraTotal);
      
      n=target>0?regularDates.length:0;base=n?Math.round(target/n):0;
      if(n&&target-base*(n-1)<0)base=Math.floor(target/n);
      regular=n?regularDates.map((date,i)=>({date,cents:i===n-1?target-base*(n-1):base,type:'monthly',label:'Cuota mensual'})):[];
    }else{
      base=amount(s.fixedMonthly,'Cuota mensual fija');
      if(!base&&balance>extraTotal&&!options.allowUnbalanced)throw Error('Ingresa un valor de cuota mensual mayor que cero para la Forma 2.');
      n=base?regularDates.length:0;
      regular=base?regularDates.map(date=>({date,cents:base,type:'monthly',label:'Cuota mensual'})):[];
    }
    const rawMonthlyTotal=regular.reduce((t,x)=>t+x.cents,0),rawExtraTotal=extraTotal;
    const rawCoveredTotal=reserve+entry+rawMonthlyTotal+rawExtraTotal,originalDifference=net-rawCoveredTotal;
    const roundingAdjustment=n?regular.at(-1).cents-base:0;
    const schedule=[...regular,...extras].sort((a,b)=>a.date.localeCompare(b.date)||(a.type===b.type?0:a.type==='monthly'?-1:1));
    const lastPaymentLimit=Math.floor(net/10);
    const closingAdjustments=[];let pending=originalDifference;
    function adjust(row,change){const before=row.cents;row.cents+=change;row.closingChange=(row.closingChange||0)+change;closingAdjustments.push({date:row.date,type:row.type,label:row.label,sourceIndex:row.sourceIndex,before,after:row.cents,change});}
    if(options.applyClosing!==false){
      if(pending>0&&schedule.length){const row=[...schedule].reverse().find(x=>x.cents>0)||schedule.at(-1);const addition=Math.min(pending,Math.max(0,lastPaymentLimit-row.cents));if(addition)adjust(row,addition);pending-=addition;}
      else if(pending<0){let excess=-pending;for(const row of [...schedule].reverse()){if(row.type!=='extra')continue;const discount=Math.min(excess,row.cents);if(discount)adjust(row,-discount);excess-=discount;if(!excess)break;}pending=-excess;}
    }
    const monthlyTotal=regular.reduce((t,x)=>t+x.cents,0),finalExtraTotal=extras.reduce((t,x)=>t+x.cents,0);
    const plannedTotal=monthlyTotal+finalExtraTotal,coveredTotal=reserve+entry+plannedTotal,difference=net-coveredTotal;
    let remaining=balance;for(const row of schedule){remaining-=row.cents;row.remaining=remaining;}
    const dueByDate=new Map();
    for(const row of schedule){const due=dueByDate.get(row.date)||{total:0,monthly:0,extras:0,delivery:0};due.total+=row.cents;if(row.type==='monthly')due.monthly+=row.cents;else if(row.isDeliveryPayment)due.delivery+=row.cents;else due.extras+=row.cents;dueByDate.set(row.date,due);}
    for(const row of schedule){const due=dueByDate.get(row.date);row.amountDueOnDate=due.total;row.regularOnDate=due.monthly;row.extrasOnDate=due.extras;row.deliveryOnDate=due.delivery;}
    const lastPayment=[...schedule].reverse().find(x=>x.cents>0)?.cents||0;
    const lastPaymentValid=lastPayment<=lastPaymentLimit;
    const deliveryTotal=extras.find(x=>x.isDeliveryPayment)?.cents||0;
    const result={price,discount,net,reserve,entry,initial:reserve+entry,balance,deliveryConfigured,deliveryTotal,extraTotal:finalExtraTotal,monthlyTotal,plannedTotal,coveredTotal,difference,fullyCovered:difference===0,lastPaymentLimit,lastPayment,lastPaymentValid,mode,base,count:n,dates,schedule,last:regular.at(-1)?.cents||0,adjustment:n?regular.at(-1).cents-base:0,roundingAdjustment,originalDifference,rawMonthlyTotal,rawExtraTotal,rawCoveredTotal,closingAdjustments};
    if(!options.allowUnbalanced)assertBalanced(result);
    return result;

  }
  function assertBalanced(result){
    const last=[...result.schedule].reverse().find(row=>row.cents>0);
    if(last&&last.cents>Math.floor(result.net/10))throw Error('La última cuota no puede superar el 10% del precio final (USD '+(Math.floor(result.net/10)/100).toLocaleString('es-EC',{minimumFractionDigits:2,maximumFractionDigits:2})+'). Ajusta las cuotas extraordinarias o la cuota mensual antes de continuar.');
    const total=result.initial+result.schedule.reduce((sum,row)=>sum+row.cents,0);
    const difference=result.net-total;
    if(difference!==0){const value=(Math.abs(difference)/100).toLocaleString('es-EC',{minimumFractionDigits:2,maximumFractionDigits:2});throw Error(difference>0?'Faltan USD '+value+' para cubrir el inmueble. Distribuye la diferencia en cuotas extraordinarias.':'Los pagos exceden el precio del inmueble en USD '+value+'. Las cuotas extraordinarias no alcanzan para descontar todo el sobrante. Ajusta la cuota mensual antes de continuar.');}
    return true;
  }
  function distributeDifference(s,parts){
    const r=calculate({...s,mode:'fixed'},{allowUnbalanced:true,applyClosing:false}),n=Number(parts);
    if(r.difference<=0)throw Error('No hay una diferencia pendiente para distribuir.');
    if(!Number.isInteger(n)||n<1||n>100||n>r.difference)throw Error('Elige entre 1 y '+Math.min(100,r.difference)+' cuotas extraordinarias.');
    if(s.extras.length+n>100)throw Error('El plan admite hasta 100 cuotas extraordinarias.');
    const cents=Math.floor(r.difference/n),rem=r.difference%n;
    const eligible=r.dates.filter(d=>d<s.delivery);
    if(!eligible.length)throw Error('No hay fechas disponibles antes de la entrega para cuotas extraordinarias.');
    return Array.from({length:n},(_,i)=>({amount:((cents+(i<rem?1:0))/100).toFixed(2),date:eligible[Math.min(eligible.length-1,Math.floor((i+.5)*eligible.length/n))],timing:'fixed',label:'Cuota extraordinaria '+(i+1),mode:'add'}));
  }
  const api={calculate,months,dateOK,assertBalanced,distributeDifference,initialPayments,deliveryAmount};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PaymentEngine=api;
})(typeof globalThis!=='undefined'?globalThis:this);
