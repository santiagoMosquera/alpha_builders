(function(root){
  'use strict';
  const clientFields=['client','idNumber','representative'];
  const propertyFields=['project','unit','area','balcony','storage','parking','price','delivery'];
  const clone=value=>structuredClone(value);
  function emptyPlan(){return {client:'',idNumber:'',representative:'',project:'',unit:'',area:0,balcony:0,storage:0,parking:0,price:0,discount:0,discountType:'percent',reserve:0,reserveDate:'',entry:0,entryType:'usd',entryDate:'',first:'',delivery:'',notes:'',deliveryPaymentType:'none',deliveryPayment:0,selectedScenario:'term',fixedMonthly:0,fixedExtras:[],extras:[]};}
  function newQuote(previous,kind){
    if(!['full','client','property'].includes(kind))throw Error('Selecciona una opción para la nueva cotización.');
    const next=emptyPlan();
    if(kind!=='full')for(const key of clientFields)next[key]=previous[key]??next[key];
    if(kind==='property')for(const key of propertyFields)next[key]=previous[key]??next[key];
    return next;
  }
  function changeFixedMonthly(previous,value){
    const n=Number(value);if(!Number.isFinite(n)||n<=0||n>1e10||Math.round(n*100)===0)throw Error('Ingresa una cuota mensual mayor que cero, con un valor válido.');
    const next=clone(previous),changed=Math.round((n+Number.EPSILON)*100)!==Math.round((Number(previous.fixedMonthly)+Number.EPSILON)*100);
    next.fixedMonthly=(Math.round((n+Number.EPSILON)*100)/100).toFixed(2);
    if(changed)next.fixedExtras=[];
    return {state:next,changed};
  }
  function replaceExtras(previous,mode,list){
    if(!['term','fixed'].includes(mode)||!Array.isArray(list)||list.length>100)throw Error('Distribución de extraordinarias no válida.');
    const next=clone(previous);next[mode==='fixed'?'fixedExtras':'extras']=clone(list);return next;
  }
  function resizeExtras(list,count,delivery){
    const n=Number(count);if(!Number.isInteger(n)||n<0||n>100)throw Error('Ingresa entre 0 y 100 cuotas extraordinarias.');
    return Array.from({length:n},(_,i)=>list[i]?clone(list[i]):{amount:0,date:delivery,timing:'delivery',label:'Cuota extraordinaria '+(i+1),mode:'add'});
  }
  const api={emptyPlan,newQuote,changeFixedMonthly,replaceExtras,resizeExtras};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PaymentRevisions=api;
})(typeof globalThis!=='undefined'?globalThis:this);
