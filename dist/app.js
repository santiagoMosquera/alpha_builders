'use strict';
const $=id=>document.getElementById(id);
const fields=['client','idNumber','representative','project','unit','area','balcony','storage','parking','price','discount','discountType','reserve','reserveDate','entry','entryType','entryDate','deliveryPaymentType','deliveryPayment','first','delivery','selectedScenario','fixedMonthly','notes'];
const storageKey='alpha-builders-payment-plan-v2';
function emptyPlan(){return PaymentRevisions.emptyPlan();}
let state=emptyPlan(),result=null,timer,currentStep=0,calculationStarted=false,pdfURL=null,pdfFile=null,extraEdit=null,recommendationTarget=null;
const stepNames=['Cliente y propiedad','Precio','Entrada y entrega','Plazo y escenarios','Cuotas extraordinarias','Observaciones','Cronograma'];
const formPages=[...document.querySelectorAll('#form > .form-section')];
const logoRequest=fetch('alpha-builders-pdf.jpg').then(response=>{if(!response.ok)throw Error('No se pudo cargar el logo.');return response.arrayBuffer();}).then(buffer=>new Uint8Array(buffer)).catch(()=>null);
const watermarkRequest=fetch('alpha-builders-watermark.jpg').then(response=>{if(!response.ok)throw Error('No se pudo cargar la marca de agua.');return response.arrayBuffer();}).then(buffer=>new Uint8Array(buffer)).catch(()=>null);
const money=c=>new Intl.NumberFormat('es-EC',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(c/100);
const qty=v=>new Intl.NumberFormat('es-EC',{maximumFractionDigits:2}).format(Number(v)||0);
const date=s=>PaymentEngine.dateOK(s)?new Intl.DateTimeFormat('es-EC',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(s+'T12:00:00Z')):'—';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(timer);timer=setTimeout(()=>$('toast').hidden=true,3500);}
function recommend(error,options={}){
  const message=String(error?.message||error||'Completa los datos de la propuesta para continuar.');
  let title='Completemos tu propuesta',step=currentStep,field=null,body=message;
  if(/Faltan USD|faltante|cubrir exactamente/i.test(message)){title='Completemos el plan de pagos';step=4;body=message+' Puedes distribuir el valor pendiente en cuotas extraordinarias.';}
  else if(/10%/.test(message)){title='Ajustemos el último pago';step=4;body=message+' Te recomendamos redistribuir los pagos para mantener el último dentro del límite.';}
  else if(/exceden|sobrante/i.test(message)){title='Equilibremos los pagos';step=state.selectedScenario==='fixed'?3:4;body=message;}
  else if(/cliente|proyecto|bien inmueble|áreas|bodegas|parqueaderos/i.test(message)){step=0;field=!state.client.trim()?'client':!state.project.trim()?'project':!state.unit.trim()?'unit':'area';}
  else if(/descuento|precio de venta/i.test(message)){step=1;field=/descuento/i.test(message)?'discount':'price';}
  else if(/cuota mensual.*cero|cuota mensual.*válido/i.test(message)){title='Definamos la cuota mensual';step=3;field='editFixedMonthly';}
  else if(/extraordinaria/i.test(message)){title='Revisemos las extraordinarias';step=4;field='editExtras';}
  else if(/primera cuota|entrega.*posterior|plazo máximo/i.test(message)){step=3;field='first';}
  else if(/entrada|reserva|abono inicial|pago a la entrega|fecha de entrega/i.test(message)){step=2;field=isCash()?(/fecha de entrega/i.test(message)?'cashDelivery':/fecha.*reserva/i.test(message)?'cashReserveDate':'cashReserve'):/reserva|abono inicial/i.test(message)?'reserve':'entry';}
  else if(/logo/i.test(message)){title='Preparemos el documento';body='Para generar el PDF, verifica que los archivos del logo estén en la carpeta de la aplicación y vuelve a cargar la página.';step=null;}
  else if(/PDF|compartir/i.test(message)){title='Continuemos con tu documento';step=null;}
  recommendationTarget={step,field,...options};
  $('recommendationTitle').textContent=title;$('recommendationMessage').textContent=body;
  $('recommendationAction').textContent=options.dialog?'Continuar edición':step===4?'Revisar cuotas':step===3?'Revisar condiciones':step===null?'Entendido':'Completar datos';
  $('stepError').textContent=message;$('stepError').hidden=true;
  if(!$('recommendationDialog').open)$('recommendationDialog').showModal();
}
function followRecommendation(){
  const target=recommendationTarget;$('recommendationDialog').close();if(!target)return;
  if(target.dialog){$(target.field||target.dialog).focus();return;}
  if(target.step!==null){showStep(target.step);if(target.field)$(target.field).focus();}
}
$('recommendationAction').addEventListener('click',followRecommendation);
$('closeRecommendation').addEventListener('click',()=>$('recommendationDialog').close());
function activeExtras(){return state.selectedScenario==='fixed'?state.fixedExtras:state.extras;}
function isCash(){return state.paymentMethod==='cash';}
function effectiveState(mode=state.selectedScenario){return {...state,mode:isCash()?'cash':mode,extras:isCash()?[]:mode==='fixed'?state.fixedExtras:state.extras};}
function read(){
  for(const key of fields)state[key]=$(key).value;
  state.paymentMethod=$('paymentMethod').checked?'cash':'financed';
  if(isCash())state.notes=$('cashNotes').value;state.cashReserve=$('cashReserve').value;state.cashReserveDate=$('cashReserveDate').value;state.cashDelivery=$('cashDelivery').value;
  for(const list of [state.extras,state.fixedExtras])for(const x of list)if(x.timing==='delivery')x.date=state.delivery;
  return state;
}
function populate(){for(const key of fields)$(key).value=state[key]??'';$('paymentMethod').checked=isCash();$('cashNotes').value=state.notes||'';$('cashReserve').value=state.cashReserve??0;$('cashReserveDate').value=state.cashReserveDate||'';$('cashDelivery').value=state.cashDelivery||'';renderExtras();refresh();}
function renderExtras(){
  let analysis;try{analysis=PaymentEngine.calculate(effectiveState(),{allowUnbalanced:true});}catch{}
  $('extras').innerHTML=activeExtras().map((x,i)=>{const row=analysis?.schedule.find(row=>row.type==='extra'&&row.sourceIndex===i);return `<article class="extra-saved"><div><strong>${esc(x.label||'Cuota extraordinaria '+(i+1))}</strong><span>${esc(date(x.timing==='delivery'?state.delivery:x.date))} · Se suma a la mensualidad</span></div><b>${money(row?.cents??Math.round(Number(x.amount)*100))}</b>${row?.mode==='add'?'<p>'+esc(additionDescription(row))+'</p>':''}${row?.closingChange?'<p>Valor ingresado: '+money(Math.round(Number(x.amount)*100))+' · ajuste de cierre: '+money(row.closingChange)+'</p>':''}</article>`;}).join('');
  $('extraCount').textContent=activeExtras().length;
}
function propertyValidate(){for(const key of ['area','balcony','storage','parking']){const n=Number(state[key]);if(!Number.isFinite(n)||n<0||n>1e7)throw Error('Las áreas y cantidades de la propiedad deben ser mayores o iguales a cero.');if(['storage','parking'].includes(key)&&!Number.isInteger(n))throw Error('Las bodegas y parqueaderos deben ser cantidades enteras.');}}
function refresh(){
  for(const card of $('extras').querySelectorAll('.extra-card'))if(card.querySelector('[data-field="timing"]').value==='delivery')card.querySelector('[data-field="date"]').value=state.delivery;
  try{propertyValidate();result=PaymentEngine.calculate(effectiveState());$('errors').hidden=true;$('miniNet').textContent=money(result.net);renderPreview();}catch(e){result=null;$('errors').hidden=true;$('errors').textContent=e.message;$('preview').innerHTML='<div class="invalid-placeholder">Completa los datos de tu propuesta para ver el cronograma.</div>';$('miniNet').textContent='—';}
  // Price feedback must remain useful even while a later section is incomplete.
  try{$('miniNet').textContent=money(priceOnly().net);}catch{$('miniNet').textContent=Number(state.price)===0?money(0):'—';}
  if(!isCash())renderScenarios();renderExtras();renderRevisionControls();if(!isCash()){renderInitial();renderDelivery();}renderBudget();$('cashRemaining').textContent=isCash()&&result?money(result.balance):'—';
  document.querySelector('.preview-toolbar .eyebrow').textContent=isCash()?'COTIZACIÓN DE CONTADO':'TU CRONOGRAMA';$('cashNotesWrap').hidden=!isCash();$('cashSummary').hidden=!isCash();if(isCash()){$('cashSummary').textContent='Precio de contado: '+(result?money(result.net):'Completa el precio y descuento')+'. La reserva y la fecha de entrega se ingresan en el siguiente paso.';$('finalEditExtras').hidden=true;$('finalEditFixed').hidden=true;}
  else {$('finalEditExtras').hidden=false;$('finalEditFixed').hidden=state.selectedScenario!=='fixed';}
  $('print').disabled=!result;$('csv').disabled=!result;
  if(currentStep===6&&!result){const message=$('errors').textContent;showStep(isCash()?2:4,false);recommend(message);}
  try{localStorage.setItem(storageKey,JSON.stringify(state));}catch{}
}
function renderPreview(){const r=result,s=effectiveState();
  const discountLabel=qty(r.discount/r.price*100)+'%';
  const initials=[...(r.mode==='cash'?[]:r.reserve?[{label:'Abono inicial (reserva)',date:s.reserveDate,cents:r.reserve}]:[]),...(r.mode==='cash'?[]:r.entry?[{label:'Entrada adicional',date:s.entryDate,cents:r.entry}]:[])];
  const rows=r.schedule.map((row,i)=>`<tr class="${row.type==='extra'?'extra-row':''}"><td>${String(i+1).padStart(2,'0')}</td><td>${esc(date(row.date))}</td><td>${row.type==='extra'?'<span class="extra-label">'+esc(row.label)+'</span>'+(row.mode==='add'?'<span class="date-due">Total en esta fecha: '+money(row.amountDueOnDate)+'</span>':''):'Mensual'}</td><td data-label="Valor USD">${money(row.cents)}</td><td data-label="Saldo USD">${money(row.remaining)}</td></tr>`).join('');
  $('preview').innerHTML=`<article class="document"><div class="document-body"><div class="doc-heading"><div><p class="doc-project">${esc(s.project||'PROYECTO')}</p><h2>${r.mode==='cash'?'Cotización de contado':'Cronograma de pagos'}</h2></div><div class="doc-ref">BIEN INMUEBLE<span class="ref-code">${esc(s.unit||'—')}</span>${(r.mode==='cash'?s.cashDelivery:s.delivery)?'Entrega · '+esc(date(r.mode==='cash'?s.cashDelivery:s.delivery)):''}</div></div>
  <div class="doc-client"><div><span class="meta-label">Cliente</span><span class="meta-value">${esc(s.client||'Nombre del cliente')}</span></div><div><span class="meta-label">Número de cédula</span><span class="meta-value">${esc(s.idNumber||'—')}</span></div><div><span class="meta-label">Representante legal</span><span class="meta-value">${esc(s.representative||'—')}</span></div></div>
  <div class="property-strip"><div><span class="meta-label">Área útil aprox.</span><span class="meta-value">${qty(s.area)} m²</span></div><div><span class="meta-label">Balcón aprox.</span><span class="meta-value">${qty(s.balcony)} m²</span></div><div><span class="meta-label">Bodegas</span><span class="meta-value">${qty(s.storage)} unidades</span></div><div><span class="meta-label">Parqueaderos</span><span class="meta-value">${qty(s.parking)} unidades</span></div></div>
  <div class="net-card"><div class="net-top"><div><span class="meta-label">PRECIO FINAL DEL INMUEBLE</span><div class="net-price">${money(r.net)}</div></div><span class="net-tag">USD</span></div><div class="price-breakdown"><div>Precio normal de venta<b>${money(r.price)}</b></div><div>${esc(discountLabel)}<b>− ${money(r.discount)}</b></div></div></div>
  ${r.mode==='cash'?`<div class="cash-report"><span class="meta-label">FORMA DE PAGO</span><h3>PAGO DE CONTADO</h3><p>Reserva: <strong>${money(r.reserve)}</strong>${r.reserve?' · '+esc(date(s.cashReserveDate)):''}.</p><p>Saldo de contado: <strong>${money(r.balance)}</strong> · ${esc(date(s.cashDelivery))}.</p><p>No se generan cuotas mensuales ni extraordinarias.</p></div>`:`<div class="summary-grid"><div class="summary-item"><span class="meta-label">Entrada Total</span><div class="summary-value">${money(r.initial)}</div><div class="summary-note">${(r.initial/r.net*100).toFixed(2).replace('.',',')}% del precio final</div></div><div class="summary-item"><span class="meta-label">Cuota Mensual</span><div class="summary-value">${money(r.base)}</div><div class="summary-note">${r.count} mensualidades${r.adjustment?' · ajuste en la última':''}</div></div><div class="summary-item"><span class="meta-label">Cuotas Extraordinarias</span><div class="summary-value">${money(r.extraTotal-r.deliveryTotal)}</div><div class="summary-note">${s.extras.length} pagos extraordinarios</div></div><div class="summary-item"><span class="meta-label">Valor Final a la Entrega</span><div class="summary-value">${money(r.deliveryTotal)}</div><div class="summary-note">${r.deliveryConfigured?esc(date(s.delivery)):'Sin pago a la entrega'}</div></div></div>`}
  ${r.mode==='cash'?'':`<div class="payment-heading"><h3>${r.mode==='fixed'?'Forma 2 · Cuota ingresada':'Forma 1 · Cuota según el plazo'}</h3><span class="pill">Sin intereses</span></div><table class="initial-table"><tbody>${initials.map(x=>`<tr><td>${esc(x.label)}</td><td>${esc(date(x.date))}</td><td>${money(x.cents)}</td></tr>`).join('')}<tr class="initial-total"><td>Entrada total (${(r.initial/r.net*100).toFixed(2).replace('.',',')}%)</td><td></td><td>${money(r.initial)}</td></tr><tr><td>Saldo durante la construcción</td><td></td><td>${money(r.balance)}</td></tr></tbody></table>
  <div class="schedule-heading"><h3>Detalle de las cuotas</h3><span>${r.schedule.length} pagos · ${esc(date(s.first))} a ${esc(date(s.delivery))}</span></div>
  ${r.schedule.length?`<div class="table-container" tabindex="0" aria-label="Tabla de cuotas, desplázate para ver todos los pagos"><table class="schedule-table"><thead><tr><th scope="col">N.º</th><th scope="col">Fecha</th><th scope="col">Concepto</th><th scope="col">Valor USD</th><th scope="col">Saldo USD</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<p class="hint">El precio final está cubierto con la reserva y la entrada.</p>'}
  ` }<div class="total-row"><span>${r.mode==='cash'?'Saldo a pagar de contado':'Total cuotas'}</span><b>${money(r.balance)}</b></div><div class="total-row"><span>Total a pagar por el inmueble</span><b>${money(r.net)}</b></div>
  <p class="reconciled"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg><span>${r.mode==='cash'?'Reserva + saldo de contado':'Reserva + entrada + cuotas'} = ${money(r.net)}. Saldo final: ${money(0)}.${r.roundingAdjustment?' La última cuota mensual se ajusta '+money(r.roundingAdjustment)+' por redondeo.':''}</span></p>
  ${r.closingAdjustments.length?'<div class="closing-note"><span class="meta-label">Ajuste automático de cierre</span>'+r.closingAdjustments.map(a=>'<p>'+esc(closingDescription(a))+'</p>').join('')+'</div>':''}
  ${s.notes?'<p class="notes"><span class="meta-label">Observaciones</span>'+esc(s.notes)+'</p>':''}
  <aside class="notary-information"><div><span class="meta-label">Notaría · Valor informativo</span><strong>${PaymentRevisions.notaryFee(r.net)===null?'Por confirmar':money(PaymentRevisions.notaryFee(r.net))}</strong></div><p>Incluye IVA. No se suma al precio del inmueble ni a las cuotas.${PaymentRevisions.notaryFee(r.net)===null?' El cuadro no define un monto para este valor de inmueble.':''}</p></aside>
  <div class="acceptance">El comprador acepta ${r.mode==='cash'?'el precio y las condiciones del pago de contado':'el pago detallado en el presente documento'} y se compromete con su puntual pago.<div class="signature">${esc(s.client||'Aceptado por el comprador')}<br>Cédula: ${esc(s.idNumber||'—')}<br>Firma de aceptación</div></div></div>
  <div class="doc-bottom"><img src="alpha-builders.png" alt="Alpha Builders · Cazadores de inversiones"><span>CRONOGRAMA DE PAGOS<br>VALORES EXPRESADOS EN USD</span></div></article>`;
}
function download(text,type,name){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function filename(ext){return (isCash()?'Cotización de contado':'Cronograma de pagos')+'.'+ext;}
function exportReady(){try{assertFinal();}catch(error){recommend(error);return false;}if(!result){recommend('Completa los datos antes de generar tu documento.');return false;}return true;}
function csvCell(v){let s=String(v??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
function csvMoney(c){return (c/100).toFixed(2).replace('.',',');}
$('form').addEventListener('input',e=>{if(e.target.id==='selectedScenario')return;read();refresh();$('stepError').hidden=true;});
$('form').addEventListener('change',e=>{read();if(e.target.dataset.field==='timing'||e.target.id==='selectedScenario')renderExtras();refresh();});
$('form').addEventListener('submit',e=>e.preventDefault());
$('newPlan').addEventListener('click',()=>{read();$('quoteKindFull').checked=true;$('newQuoteDialog').showModal();});
$('print').addEventListener('click',async()=>{
  read();refresh();if(!exportReady())return;
  const button=$('print'),snapshot=structuredClone(effectiveState()),computed=result;
  button.disabled=true;button.setAttribute('aria-busy','true');
  try{
    const [logo,watermark]=await Promise.all([logoRequest,watermarkRequest]);if(!logo||!watermark)throw Error('El logo no está disponible. Recarga la página para volver a generar el PDF.');
    const data=await PaymentPDF.generate(snapshot,computed,logo,watermark);
    if(pdfURL)URL.revokeObjectURL(pdfURL);
    pdfFile=new File([data],filename('pdf'),{type:'application/pdf'});pdfURL=URL.createObjectURL(pdfFile);
    $('openPdf').href=pdfURL;$('downloadPdf').href=pdfURL;$('downloadPdf').download=pdfFile.name;
    let canShare=false;try{canShare=!!navigator.canShare?.({files:[pdfFile]});}catch{}
    $('sharePdf').hidden=!canShare;
    $('pdfDialog').showModal();
  }catch(error){recommend(error.message||'Puedes intentar generar el PDF nuevamente.');}
  finally{button.disabled=!result;button.removeAttribute('aria-busy');}
});
$('closePdf').addEventListener('click',()=>$('pdfDialog').close());
$('pdfDialog').addEventListener('click',e=>{if(e.target!==$('pdfDialog'))return;const rect=e.target.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)e.target.close();});
$('sharePdf').addEventListener('click',async()=>{if(!pdfFile)return;try{await navigator.share({files:[pdfFile],title:'Cronograma de pagos'});}catch(error){if(error.name!=='AbortError')recommend('Puedes usar “Abrir PDF” o “Descargar PDF” para continuar con tu documento.',{step:null});}});
function normalizeImported(data){if(!data||typeof data!=='object'||Array.isArray(data)||!Array.isArray(data.extras)||data.extras.length>100)throw Error('Archivo de plan no válido.');const out={};for(const key of fields){if(data[key]===undefined&&['idNumber','fixedMonthly','selectedScenario','deliveryPaymentType','deliveryPayment'].includes(key)){out[key]=key==='selectedScenario'?'term':key==='fixedMonthly'?'0':key==='deliveryPaymentType'?'none':key==='deliveryPayment'?'0':'';continue;}if(typeof data[key]!=='string'&&typeof data[key]!=='number')throw Error('El archivo está incompleto.');if(String(data[key]).length>2000)throw Error('El archivo contiene datos demasiado largos.');out[key]=String(data[key]);}out.paymentMethod=data.paymentMethod==='cash'?'cash':'financed';out.cashReserve=String(data.cashReserve??0);out.cashReserveDate=String(data.cashReserveDate??'');out.cashDelivery=String(data.cashDelivery??data.delivery??'');if(!['term','fixed'].includes(out.selectedScenario))throw Error('El escenario del archivo no es válido.');out.extras=normalizeExtras(data.extras);out.fixedExtras=normalizeExtras(data.fixedExtras??[]);return out;}
function normalizeExtras(list){if(!Array.isArray(list)||list.length>100)throw Error('Cuotas extraordinarias no válidas.');return list.map(x=>{if(!x||typeof x!=='object')throw Error('Cuota extraordinaria no válida.');for(const k of ['amount','date','label'])if(!['string','number'].includes(typeof x[k])||String(x[k]).length>200)throw Error('Cuota extraordinaria no válida.');return {amount:x.amount,date:x.date,label:String(x.label),mode:'add',timing:'fixed'};});}
$('csv').addEventListener('click',()=>{read();refresh();if(!exportReady())return;const r=result,s=effectiveState();const rows=[[(isCash()?'COTIZACIÓN DE CONTADO':'CRONOGRAMA DE PAGOS')+' - ALPHA BUILDERS'],['Cliente',s.client],['Número de cédula',s.idNumber],['Representante legal',s.representative],['Proyecto',s.project],['Bien inmueble',s.unit],['Área útil aprox. m²',s.area],['Área balcón aprox. m²',s.balcony],['Bodegas',s.storage],['Parqueaderos',s.parking],['Entrega del proyecto',r.mode==='cash'?s.cashDelivery:s.delivery],['Forma elegida',r.mode==='cash'?'Pago de contado':r.mode==='fixed'?'Forma 2 - Cuota ingresada':'Forma 1 - Cuota según el plazo'],[],['Precio normal USD',csvMoney(r.price)],['Descuento USD',csvMoney(r.discount)],['Precio final USD',csvMoney(r.net)],['Entrada total USD',csvMoney(r.initial)],['Entrada total %',(r.initial/r.net*100).toFixed(2)],[],['N.º','Fecha','Concepto','Valor USD','Saldo USD']];let remaining=r.net;for(const row of (r.mode==='cash'?[]:[{date:s.reserveDate,cents:r.reserve,label:'Abono inicial (reserva)'},{date:s.entryDate,cents:r.entry,label:'Entrada adicional'}].filter(x=>x.cents))){remaining-=row.cents;rows.push(['',row.date,row.label,csvMoney(row.cents),csvMoney(remaining)]);}r.schedule.forEach((row,i)=>rows.push([i+1,row.date,row.label,csvMoney(row.cents),csvMoney(row.remaining)]));if(r.mode==='cash'){if(r.reserve)rows.push(['Reserva',s.cashReserveDate,'Abono inicial (reserva)',csvMoney(r.reserve),csvMoney(r.balance)]);rows.push(['',s.cashDelivery,'Saldo de contado',csvMoney(r.balance),csvMoney(0)]);}rows.push([],['Total cuotas USD',csvMoney(r.mode==='cash'?0:r.balance)],['Total a pagar USD',csvMoney(r.net)],['Observaciones',s.notes],['Notaría - informativo, incluye IVA; no incluido en cuotas',PaymentRevisions.notaryFee(r.net)===null?'Por confirmar':csvMoney(PaymentRevisions.notaryFee(r.net))]);download('\uFEFF'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n'),'text/csv;charset=utf-8',filename('csv'));toast('Cronograma exportado en CSV.');});
function priceOnly(){return PaymentEngine.calculate({...state,paymentMethod:'financed',mode:'term',reserve:0,entry:0,deliveryPaymentType:'none',deliveryPayment:0,extras:[],first:'2000-01-01',delivery:'2000-01-01'},{allowUnbalanced:true});}
function initialOnly(){return PaymentEngine.initialPayments(state,priceOnly().net);}
function renderInitial(){
  $('entryLabel').textContent=state.entryType==='percent'?'Entrada total':'Entrada adicional';
  try{const r=initialOnly();$('initialTotal').textContent=money(r.initial)+' · '+(r.initial/r.net*100).toFixed(2).replace('.',',')+'%';$('initialBreakdown').textContent='Abono inicial: '+money(r.reserve)+' + entrada adicional: '+money(r.entry);}
  catch(error){$('initialTotal').textContent=Number(state.price)===0?money(0)+' · 0,00%':'—';$('initialBreakdown').textContent=Number(state.price)===0?'Abono inicial: '+money(0)+' + entrada adicional: '+money(0):error.message;}
}
function renderDelivery(){
  const type=state.deliveryPaymentType||'none';$('deliveryPayment').disabled=type==='none';
  $('deliveryPaymentUnit').textContent=type==='percent'?'%':'USD';
  $('deliveryPayment').max=type==='percent'?'10':'';
  try{const net=priceOnly().net,configured=PaymentEngine.deliveryAmount(state,net);let final=configured;
    try{final=PaymentEngine.calculate(effectiveState(),{allowUnbalanced:true}).deliveryTotal;}catch{}
    $('deliveryPaymentTotal').textContent=type==='none'?'Sin pago a la entrega':money(configured)+' · '+(configured/net*100).toFixed(2).replace('.',',')+'%';
    $('deliveryPaymentHint').textContent=final!==configured?'Valor final con ajuste de cierre: '+money(final):'Este valor se descuenta antes de calcular las mensualidades. Si hay una mensualidad en la misma fecha de entrega, la reemplaza. Máximo: '+money(Math.floor(net/10))+' (10%).';
  }catch(error){$('deliveryPaymentTotal').textContent=type==='none'?'Sin pago a la entrega':Number(state.price)===0?money(0):'—';$('deliveryPaymentHint').textContent=error.message;}
}
function renderBudget(){
  const panel=$('paymentBudget');panel.hidden=isCash()||!calculationStarted;
  document.querySelector('.topbar').classList.toggle('with-budget',!isCash()&&calculationStarted);
  if(!calculationStarted||isCash())return;
  try{
    const price=priceOnly();$('budgetTarget').textContent=money(price.net);
    try{const initial=initialOnly();$('budgetInitial').textContent=money(initial.initial);$('budgetInitialPercent').textContent=(initial.initial/price.net*100).toFixed(2).replace('.',',')+'%';}catch{$('budgetInitial').textContent='—';$('budgetInitialPercent').textContent='Revisa la entrada';}
    try{const r=PaymentEngine.calculate(effectiveState(),{allowUnbalanced:true});
      const pending=state.selectedScenario==='fixed'?r.originalDifference:r.difference;
      $('budgetGapLabel').textContent=pending<0?'Sobrante':pending===0?'Por cubrir':'Faltante para extraordinarias';
      $('budgetGap').textContent=money(Math.abs(pending));
      $('budgetNote').textContent=!r.lastPaymentValid?'Última cuota excede el 10%':pending===0?'Total cubierto':'Pendiente de distribución · Máx. última '+money(r.lastPaymentLimit);
    }catch{$('budgetGapLabel').textContent='Faltante';$('budgetGap').textContent='—';$('budgetNote').textContent='Revisa los datos de las cuotas';}
  }catch{const zero=Number(state.price)===0?money(0):'—';$('budgetInitial').textContent=zero;$('budgetInitialPercent').textContent=Number(state.price)===0?'0,00%':'';$('budgetTarget').textContent=zero;$('budgetGap').textContent=zero;$('budgetNote').textContent='Ingresa un precio válido';}
}
function assertFinal(){
  propertyValidate();
  for(const key of ['client','project','unit'])if(!String(state[key]).trim())throw Error('Completa el nombre del cliente, el proyecto y el bien inmueble.');
  const final=PaymentEngine.calculate(effectiveState());PaymentEngine.assertBalanced(final);return final;
}
function additionDescription(row){
  const parts=[];if(row.regularOnDate)parts.push('mensualidad '+money(row.regularOnDate));if(row.extrasOnDate)parts.push('extraordinarias '+money(row.extrasOnDate));if(row.deliveryOnDate)parts.push('pago a la entrega '+money(row.deliveryOnDate));
  return parts.length?'Total en esta fecha: '+money(row.amountDueOnDate)+' ('+parts.join(' + ')+').':'Total en esta fecha: '+money(row.amountDueOnDate)+'.';
}
function closingDescription(a){return (a.change>0?'Se suman '+money(a.change):'Se descuentan '+money(-a.change))+' a '+(a.type==='monthly'?'la cuota mensual':a.label)+' del '+date(a.date)+'. Valor final: '+money(a.after)+'.';}
function renderScenarios(){
  const names={term:'Forma 1 · Según el plazo',fixed:'Forma 2 · Cuota ingresada'};
  const analyses={};
  for(const mode of ['term','fixed']){try{analyses[mode]={result:PaymentEngine.calculate(effectiveState(mode),{allowUnbalanced:true})};}catch(error){analyses[mode]={error:error.message};}}
  $('scenarioComparison').innerHTML=['term','fixed'].map(mode=>{
    const chosen=mode===state.selectedScenario,{result:r,error}=analyses[mode];
    return `<article class="scenario-card ${chosen?'chosen':''}"><div class="scenario-card-heading"><h3>${names[mode]}</h3>${chosen?'<span class="selected-tag">Elegido para el PDF</span>':''}</div>${r?`<div class="scenario-amount">${money(r.base)} <span>/ mes</span></div><dl><div><dt>Mensualidades</dt><dd>${r.count}</dd></div><div><dt>Total cuotas regulares</dt><dd>${money(r.monthlyTotal)}</dd></div><div><dt>Cuotas extraordinarias</dt><dd>${money(r.extraTotal-r.deliveryTotal)}</dd></div><div><dt>Pago a la entrega</dt><dd>${money(r.deliveryTotal)}</dd></div><div><dt>Reserva + entrada</dt><dd>${money(r.initial)}</dd></div><div><dt>Total a pagar hasta la entrega</dt><dd>${money(r.coveredTotal)}</dd></div>${mode==='fixed'?`<div><dt>Total con la cuota ingresada, antes del ajuste</dt><dd>${money(r.rawCoveredTotal)}</dd></div><div><dt>${r.originalDifference<0?'Sobrante antes del ajuste':'Faltante antes del ajuste'}</dt><dd>${money(Math.abs(r.originalDifference))}</dd></div><div><dt>${r.difference<0?'Sobrante final':'Faltante por cubrir'}</dt><dd>${money(Math.abs(r.difference))}</dd></div>`:''}</dl><p class="scenario-status ${r.fullyCovered?'balanced':'pending'}">${!r.lastPaymentValid?'Última cuota superior al 10% · máximo '+money(r.lastPaymentLimit):r.difference>0?'Falta cubrir '+money(r.difference):r.difference<0?'Exceso de '+money(-r.difference):r.mode==='fixed'&&r.originalDifference>0?'Faltante cubierto mediante ajuste de la última cuota':'Precio cubierto · Saldo cero'}</p>${r.closingAdjustments.length?'<div class="closing-note">'+r.closingAdjustments.map(a=>'<p>'+esc(closingDescription(a))+'</p>').join('')+'</div>':''}`:`<p class="scenario-status pending">${esc(error)}</p>`}<button type="button" class="button ${chosen?'primary':'secondary'}" data-select-scenario="${mode}" aria-pressed="${chosen}">${chosen?'Escenario seleccionado':'Elegir este escenario'}</button></article>`;
  }).join('');
  $('scenarioEditor').innerHTML=['term','fixed'].map(mode=>`<button type="button" class="button ${mode===state.selectedScenario?'primary':'secondary'}" data-select-scenario="${mode}" aria-pressed="${mode===state.selectedScenario}">${mode==='term'?'Forma 1':'Forma 2'}</button>`).join('');
  const {result:r,error}=analyses[state.selectedScenario]??{error:'Selecciona una forma de cálculo válida.'};
  $('coverageSummary').innerHTML=r?`<span class="meta-label">${(state.selectedScenario==='fixed'?r.originalDifference:r.difference)>0?'Faltante por distribuir':(state.selectedScenario==='fixed'?r.originalDifference:r.difference)<0?'Sobrante sin compensar':!r.lastPaymentValid?'Última cuota superior al límite':'Plan completo'}</span><strong>${money(Math.abs((state.selectedScenario==='fixed'?r.originalDifference:r.difference)))}</strong><p>Precio final ${money(r.net)} · Pagos finales ${money(r.coveredTotal)} · Máximo última cuota ${money(r.lastPaymentLimit)} (10%). ${(state.selectedScenario==='fixed'?r.originalDifference:r.difference)>0?'Distribuye el faltante en extraordinarias; la última cuota ya no puede aumentar más.':(state.selectedScenario==='fixed'?r.originalDifference:r.difference)<0?'Las extraordinarias no alcanzan para compensar el sobrante.':!r.lastPaymentValid?'Reduce la última cuota antes de continuar.':'Saldo cero.'}</p>${r.closingAdjustments.map(a=>'<p>'+esc(closingDescription(a))+'</p>').join('')}`:esc(error);
  $('differenceTools').hidden=state.selectedScenario!=='fixed';
  $('distributeExtra').disabled=!r||r.originalDifference<=0;
  $('extraParts').max=r?Math.min(100,r.dates.length,100-activeExtras().length):100;
}
function chooseScenario(mode){
  read();state.selectedScenario=mode;$('selectedScenario').value=mode;renderExtras();refresh();$('stepError').hidden=true;
}
$('form').addEventListener('click',e=>{const button=e.target.closest('[data-select-scenario]');if(button)chooseScenario(button.dataset.selectScenario);});
$('distributeExtra').addEventListener('click',()=>{
  read();try{const additions=PaymentEngine.distributeDifference({...effectiveState('fixed'),extras:[]},$('extraParts').value);beginExtraEdit('fixed',additions);}catch(error){recommend(error);}
});
function invalidatePdf(){
  if($('pdfDialog').open)$('pdfDialog').close();
  if(pdfURL)URL.revokeObjectURL(pdfURL);pdfURL=null;pdfFile=null;
  $('openPdf').removeAttribute('href');$('downloadPdf').removeAttribute('href');
}
function extraSummary(mode){
  const s=effectiveState(mode),count=s.extras.length;let total=s.extras.reduce((sum,x)=>sum+Math.round(Number(x.amount)*100),0);
  try{const r=PaymentEngine.calculate(s,{allowUnbalanced:true});total=r.extraTotal-r.deliveryTotal;}catch{}
  return count+' '+(count===1?'cuota extraordinaria':'cuotas extraordinarias')+' · '+money(total);
}
function renderRevisionControls(){
  $('chosenExtrasSummary').textContent=extraSummary(state.selectedScenario);
  $('savedExtrasSummary').textContent=activeExtras().length?'Distribución registrada: '+extraSummary(state.selectedScenario):'No hay cuotas extraordinarias registradas en este escenario.';
  $('editExtras').textContent=activeExtras().length?'Editar distribución':'Definir cuotas extraordinarias';
  $('editChosenExtras').textContent=activeExtras().length?'Editar distribución':'Definir extraordinarias';
  $('editFixedMonthly').textContent=Number(state.fixedMonthly)>0?'Editar cuota mensual':'Definir cuota mensual';
  $('finalEditFixed').hidden=state.selectedScenario!=='fixed';
  $('fixedMonthlyHint').textContent='Cuando cambies la cuota mensual, el saldo pendiente se mostrará en rojo y podrás distribuir las extraordinarias automáticamente.';
  $('extraParts').max='100';
  $('distributeExtra').disabled=Number(state.fixedMonthly)<=0;
  $('differenceTools').querySelector('p').textContent=activeExtras().length?'Puedes preparar una nueva distribución automática. Reemplazará la actual solo al aplicar los cambios.':'Puedes preparar una distribución automática y revisar sus fechas y valores antes de aplicarla.';
}
function extraCards(list){return `<div class="extra-table-head"><span>VALOR EXTRAORDINARIO (USD)</span><span>FECHA DEL PAGO</span></div>`+list.map((x,i)=>`<div class="extra-card extra-compact" data-index="${i}"><div class="extra-number">Cuota ${i+1}</div><div class="extra-two"><label><span class="sr-only">Valor cuota ${i+1}</span><input aria-label="Valor cuota extraordinaria ${i+1}" data-field="amount" type="number" min="0.01" step="0.01" inputmode="decimal" value="${esc(x.amount)}"></label><label><span class="sr-only">Fecha cuota ${i+1}</span><input aria-label="Fecha cuota extraordinaria ${i+1}" data-field="date" type="date" min="${esc(state.first)}" max="${esc(new Date(new Date(state.delivery+'T12:00:00Z').getTime()-86400000).toISOString().slice(0,10))}" value="${esc(x.date||state.first)}"></label></div><button type="button" class="remove-extra" data-remove-draft="${i}" aria-label="Eliminar cuota ${i+1}">×</button></div>`).join('');}
function readExtraDraft(){
  if(!extraEdit)return;
  extraEdit.list=[...$('extraDraftCards').querySelectorAll('.extra-card')].map((card,i)=>({label:'Cuota extraordinaria '+(i+1),amount:card.querySelector('[data-field="amount"]').value,date:card.querySelector('[data-field="date"]').value,timing:'fixed',mode:'add'}));
}
function extraTarget(mode){
  const baseline=PaymentEngine.calculate({...effectiveState(mode),extras:[]},{allowUnbalanced:true,applyClosing:false});
  return Math.max(0,baseline.difference);
}
function distributeCents(total,n){const base=Math.floor(total/n),rem=total%n;return Array.from({length:n},(_,i)=>base+(i<rem?1:0));}
function suggestedDates(n){const dates=PaymentEngine.months(state.first,state.delivery).filter(d=>d<state.delivery);if(!dates.length)throw Error('No hay fechas antes de la entrega para programar extraordinarias.');return Array.from({length:n},(_,i)=>dates[Math.min(dates.length-1,Math.floor((i+.5)*dates.length/n))]);}
function makeAutoExtras(n){const total=extraTarget('fixed');if(total<=0)throw Error('No existe un saldo positivo pendiente para extraordinarias.');if(n>total)throw Error('El número de cuotas supera los centavos disponibles.');const dates=suggestedDates(n),values=distributeCents(total,n);return values.map((c,i)=>({label:'Cuota extraordinaria '+(i+1),amount:(c/100).toFixed(2),date:dates[i],timing:'fixed',mode:'add'}));}
function rebalanceExtra(index){
  if(extraEdit.mode!=='fixed')return;
  const target=extraTarget('fixed');const list=extraEdit.list;
  if(!extraEdit.locked)extraEdit.locked=new Set();
  extraEdit.locked.add(index);
  let lockedTotal=0;for(const i of extraEdit.locked)lockedTotal+=Math.round(Number(list[i]?.amount||0)*100);
  if(lockedTotal>target){extraEdit.warning='Los valores fijados superan el saldo disponible. Reduce alguna cuota para continuar.';return;}
  // Preserve prior edits; distribute among later unlocked rows. If the last is edited, use earlier unlocked rows.
  const later=list.map((_,i)=>i).filter(i=>i>index&&!extraEdit.locked.has(i));
  const earlier=list.map((_,i)=>i).filter(i=>i<index&&!extraEdit.locked.has(i));
  const eligible=[...later,...earlier];
  if(!eligible.length){extraEdit.warning=lockedTotal===target?'Total cubierto.':'No quedan cuotas disponibles para redistribuir. Modifica otra cuota o restablece la distribución.';return;}
  const parts=distributeCents(target-lockedTotal,eligible.length);
  eligible.forEach((i,j)=>list[i].amount=(parts[j]/100).toFixed(2));
  extraEdit.warning='';
}
function draftScenario(){return {...effectiveState(extraEdit.mode),extras:extraEdit.list};}
function renderDraftCoverage(){
  if(!extraEdit)return;
  try{const r=PaymentEngine.calculate(draftScenario(),{allowUnbalanced:true,applyClosing:false});
    const assigned=extraEdit.list.reduce((s,x)=>s+Math.round(Number(x.amount||0)*100),0);
    const target=extraEdit.mode==='fixed'?extraTarget('fixed'):assigned;
    const remaining=target-assigned;
    $('draftCoverage').innerHTML=`<span>Saldo a distribuir <strong>${money(target)}</strong></span><span>Extraordinarias asignadas <strong>${money(assigned)}</strong></span><span class="budget-gap">${remaining<0?'Excedente':'Por distribuir'} <strong>${money(Math.abs(remaining))}</strong></span><small>${remaining===0?'Distribución completa':remaining>0?'Distribuye el saldo pendiente':'Reduce las cuotas extraordinarias'}</small>`;
    $('draftStatus').textContent=extraEdit.warning||(!r.lastPaymentValid?'Revisa el límite del último pago (10% del valor del inmueble).':remaining===0?'Las cuotas extraordinarias cubren exactamente el valor requerido.':'El total de extraordinarias debe igualar el saldo a distribuir.');
  }catch(error){$('draftCoverage').innerHTML='<span class="budget-gap">Saldo por distribuir <strong>—</strong></span>';$('draftStatus').textContent=error.message;}
}
function renderExtraDraft(){
  $('extraDraftCards').innerHTML=extraCards(extraEdit.list);$('draftParts').value=extraEdit.list.length;
  $('emptyDraft').hidden=extraEdit.list.length!==0;renderDraftCoverage();
}
function beginExtraEdit(mode=state.selectedScenario,proposal){
  read();extraEdit={mode,returnStep:currentStep,locked:new Set(),warning:'',list:proposal?structuredClone(proposal):structuredClone(effectiveState(mode).extras)};
  if(mode==='fixed'&&!extraEdit.list.length){try{extraEdit.list=makeAutoExtras(Math.max(1,Number($('extraParts').value)||1));}catch{}}
  $('extraEditScenario').textContent=mode==='fixed'?'Forma 2 · Cuota ingresada':'Forma 1 · Según el plazo';
  $('distributeDraft').hidden=mode!=='fixed';
  $('extraEditCurrent').textContent='Distribución actual: '+extraSummary(mode);
  $('extraEditError').hidden=true;renderExtraDraft();$('extrasDialog').showModal();$('extrasDialog').scrollTop=0;
}
function showEditError(id,error){$(id).textContent=error.message;$(id).hidden=true;recommend(error,{dialog:id==='fixedEditError'?'fixedDialog':'extrasDialog',field:id==='fixedEditError'?'newFixedMonthly':'draftParts'});}
function applyExtraDraft(){
  readExtraDraft();
  try{
    if(extraEdit.list.some(x=>x.date>=state.delivery))throw Error('Las cuotas extraordinarias deben tener una fecha anterior a la entrega.');
    if(extraEdit.mode==='fixed'&&extraTarget('fixed')!==extraEdit.list.reduce((s,x)=>s+Math.round(Number(x.amount||0)*100),0))throw Error('La suma de las cuotas extraordinarias debe cubrir exactamente el saldo pendiente.');
    PaymentEngine.calculate(draftScenario(),{allowUnbalanced:true});
    const mode=extraEdit.mode,returnStep=extraEdit.returnStep;
    state=PaymentRevisions.replaceExtras(state,mode,extraEdit.list);invalidatePdf();$('extrasDialog').close();populate();
    if(returnStep===6)showStep(result?6:4);
    toast(result?'Nueva distribución aplicada. El plan cubre el precio completo.':'Nueva distribución aplicada. Revisa el saldo y el límite de la última cuota antes del reporte.');
  }catch(error){showEditError('extraEditError',error);}
}
function beginFixedEdit(){
  read();$('fixedEditCurrent').textContent='Cuota actual: '+money(Math.round(Number(state.fixedMonthly)*100));
  $('newFixedMonthly').value=state.fixedMonthly;$('fixedEditError').hidden=true;
  $('fixedResetNotice').textContent='Al modificar la cuota mensual se recalcula automáticamente el saldo que deberás cubrir con extraordinarias. Puedes distribuirlo en partes iguales.';
  $('fixedDialog').showModal();$('newFixedMonthly').focus();$('newFixedMonthly').select();
}
function applyFixedEdit(){
  try{const updated=PaymentRevisions.changeFixedMonthly(state,$('newFixedMonthly').value);const switched=state.selectedScenario!=='fixed';state=updated.state;state.selectedScenario='fixed';if(updated.changed||switched)invalidatePdf();$('fixedDialog').close();populate();
    if(updated.changed&&state.selectedScenario==='fixed')showStep(4);
    toast(updated.changed?'Cuota actualizada. Define nuevamente las extraordinarias de la Forma 2.':'La cuota se mantiene. No se modificó la distribución.');
  }catch(error){showEditError('fixedEditError',error);}
}
function createNewQuote(){
  const kind=$('newQuoteForm').querySelector('input[name="quoteKind"]:checked')?.value;
  try{read();state=PaymentRevisions.newQuote(state,kind);invalidatePdf();calculationStarted=false;currentStep=0;result=null;$('newQuoteDialog').close();populate();showStep(kind==='property'?1:0);$(kind==='full'?'client':kind==='client'?'project':'discount').focus();toast(kind==='full'?'Nueva cotización lista.':kind==='client'?'Cliente conservado. Ingresa la nueva propiedad.':'Cliente y propiedad conservados. Ingresa las nuevas condiciones.');}
  catch(error){recommend(error);}
}
for(const id of ['editExtras','editChosenExtras','finalEditExtras'])$(id).addEventListener('click',()=>beginExtraEdit());
for(const id of ['editFixedMonthly','finalEditFixed'])$(id).addEventListener('click',beginFixedEdit);
$('extraEditForm').addEventListener('submit',e=>{e.preventDefault();applyExtraDraft();});
$('fixedEditForm').addEventListener('submit',e=>{e.preventDefault();applyFixedEdit();});
$('newQuoteForm').addEventListener('submit',e=>{e.preventDefault();createNewQuote();});
$('resizeDraft').addEventListener('click',()=>{readExtraDraft();try{const n=Number($('draftParts').value);extraEdit.list=extraEdit.mode==='fixed'?makeAutoExtras(n):PaymentRevisions.resizeExtras(extraEdit.list,n,state.delivery).map(x=>({...x,timing:'fixed',date:x.date===state.delivery?state.first:x.date}));extraEdit.locked=new Set();extraEdit.warning='';$('extraEditError').hidden=true;renderExtraDraft();}catch(error){showEditError('extraEditError',error);}});
$('extraDraftCards').addEventListener('change',e=>{const card=e.target.closest('.extra-card');if(!card)return;readExtraDraft();if(e.target.dataset.field==='amount'){rebalanceExtra(Number(card.dataset.index));renderExtraDraft();}else{renderDraftCoverage();}$('extraEditError').hidden=true;});
$('extraDraftCards').addEventListener('input',e=>{if(e.target.dataset.field==='amount'){readExtraDraft();renderDraftCoverage();}$('extraEditError').hidden=true;});
$('extraDraftCards').addEventListener('click',e=>{const button=e.target.closest('[data-remove-draft]');if(button){readExtraDraft();extraEdit.list.splice(Number(button.dataset.removeDraft),1);if(extraEdit.mode==='fixed'&&extraEdit.list.length)extraEdit.list=makeAutoExtras(extraEdit.list.length);extraEdit.locked=new Set();renderExtraDraft();}});
$('addDraftExtra').addEventListener('click',()=>{readExtraDraft();try{extraEdit.list=extraEdit.mode==='fixed'?makeAutoExtras(extraEdit.list.length+1):PaymentRevisions.resizeExtras(extraEdit.list,extraEdit.list.length+1,state.delivery).map(x=>({...x,timing:'fixed',date:x.date===state.delivery?state.first:x.date}));extraEdit.locked=new Set();renderExtraDraft();}catch(error){showEditError('extraEditError',error);}});
$('distributeDraft').addEventListener('click',()=>{try{extraEdit.list=makeAutoExtras(Number($('draftParts').value));extraEdit.locked=new Set();extraEdit.warning='';renderExtraDraft();}catch(error){showEditError('extraEditError',error);}});
$('extrasDialog').addEventListener('close',()=>{extraEdit=null;});
for(const id of ['newQuoteDialog','extrasDialog','fixedDialog']){
  $(id).addEventListener('click',e=>{const close=e.target.closest('[data-close-dialog]');if(close)$(id).close();});
}
function validateStep(){
  read();
  if(currentStep===0){for(const key of ['client','project','unit'])if(!String(state[key]).trim())throw Error('Completa el nombre del cliente, el proyecto y el bien inmueble.');propertyValidate();}
  if(currentStep===1)priceOnly();if(currentStep===2&&isCash())PaymentEngine.calculate(effectiveState());
  if(currentStep===2&&!isCash()){const {reserve,entry}=initialOnly();if(reserve&&!PaymentEngine.dateOK(state.reserveDate)||entry&&!PaymentEngine.dateOK(state.entryDate))throw Error('Completa las fechas del abono inicial y la entrada adicional.');if(reserve&&entry&&state.reserveDate>state.entryDate)throw Error('El abono inicial debe ser anterior o igual a la entrada adicional.');const delivery=PaymentEngine.deliveryAmount(state,priceOnly().net);if(reserve+entry+delivery>priceOnly().net)throw Error('La entrada total y el pago a la entrega superan el precio final.');}
  if(currentStep===3){PaymentEngine.calculate({...state,mode:'term',extras:[]},{allowUnbalanced:true});if(state.selectedScenario==='fixed')PaymentEngine.calculate(effectiveState(),{allowUnbalanced:true});}
  if(currentStep===4||currentStep===5)assertFinal();
}
function showStep(index,scroll=true){
  let target=Math.max(0,Math.min(6,index));
  if(isCash()&&target>2&&target<6)target=6;
  if(target===6){try{assertFinal();}catch(error){recommend(error);return false;}}
  currentStep=target;$('cashPaymentBlock').hidden=!isCash();$('financedPaymentBlock').hidden=isCash();formPages[2].querySelector('h2').innerHTML=isCash()?'<span class="step">03</span> Reserva y entrega':'<span class="step">03</span> Entrada y pago a la entrega';calculationStarted=calculationStarted||currentStep>=2;renderBudget();formPages.forEach((page,i)=>page.hidden=i!==currentStep);
  $('form').closest('.editor').hidden=currentStep===6;document.querySelector('.results').hidden=currentStep!==6;
  $('stepCaption').textContent=isCash()?'Contado · '+(currentStep===6?'Informe final':'Configuración'):'Paso '+(currentStep+1)+' de 7';$('stepName').textContent=isCash()&&currentStep===6?'Cotización final':stepNames[currentStep];$('navStep').textContent=isCash()?(currentStep===6?'4 / 4':(currentStep+1)+' / 4'):(currentStep+1)+' / 7';
  $('previousStep').disabled=currentStep===0;$('nextStep').hidden=currentStep===6;$('nextStep').textContent=isCash()?'Ver cotización final →':currentStep===5?'Ver cronograma →':'Continuar →';
  $('stepTabs').innerHTML=(isCash()?[0,1,2,6]:[0,1,2,3,4,5,6]).map(i=>{const name=isCash()&&i===6?'Cotización final':isCash()&&i===2?'Reserva y entrega':stepNames[i];const displayNumber=isCash()&&i===6?4:i+1;return `<button type="button" class="step-tab ${i===currentStep?'active':i<currentStep?'complete':''}" data-step="${i}" aria-label="Paso ${displayNumber}: ${esc(name)}" ${i===currentStep?'aria-current="step"':''}>${displayNumber}</button>`;}).join('');
  $('stepError').hidden=true;if(scroll)window.scrollTo({top:0,behavior:'smooth'});
}
$('nextStep').addEventListener('click',()=>{try{validateStep();refresh();showStep(isCash()&&currentStep===2?6:currentStep+1);}catch(error){recommend(error);}});
$('previousStep').addEventListener('click',()=>{read();refresh();showStep(isCash()&&currentStep===6?2:currentStep-1);});
$('stepTabs').addEventListener('click',e=>{const tab=e.target.closest('[data-step]');if(tab){read();refresh();showStep(Number(tab.dataset.step));}});
try{const saved=localStorage.getItem(storageKey);if(saved)state=normalizeImported(JSON.parse(saved));}catch{state=emptyPlan();}
populate();showStep(0,false);
