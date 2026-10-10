'use strict';
const $=id=>document.getElementById(id);
const fields=['client','idNumber','representative','project','unit','area','balcony','storage','parking','price','discount','discountType','reserve','reserveDate','entry','entryType','entryDate','deliveryPaymentType','deliveryPayment','first','delivery','selectedScenario','fixedMonthly','notes'];
const storageKey='alpha-builders-payment-plan-v2';
function emptyPlan(){return {client:'',idNumber:'',representative:'',project:'',unit:'',area:0,balcony:0,storage:0,parking:0,price:0,discount:0,discountType:'percent',reserve:0,reserveDate:'',entry:0,entryType:'usd',entryDate:'',first:'',delivery:'',notes:'',deliveryPaymentType:'none',deliveryPayment:0,selectedScenario:'term',fixedMonthly:0,fixedExtras:[],extras:[]};}
let state=emptyPlan(),result=null,timer,currentStep=0,calculationStarted=false,pdfURL=null,pdfFile=null;
const stepNames=['Cliente y propiedad','Precio','Entrada y entrega','Plazo y escenarios','Cuotas extraordinarias','Observaciones','Cronograma'];
const formPages=[...document.querySelectorAll('#form > .form-section')];
const logoRequest=fetch('alpha-builders-pdf.jpg').then(response=>{if(!response.ok)throw Error('No se pudo cargar el logo.');return response.arrayBuffer();}).then(buffer=>new Uint8Array(buffer)).catch(()=>null);
const watermarkRequest=fetch('alpha-builders-watermark.jpg').then(response=>{if(!response.ok)throw Error('No se pudo cargar la marca de agua.');return response.arrayBuffer();}).then(buffer=>new Uint8Array(buffer)).catch(()=>null);
const money=c=>new Intl.NumberFormat('es-EC',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(c/100);
const qty=v=>new Intl.NumberFormat('es-EC',{maximumFractionDigits:2}).format(Number(v)||0);
const date=s=>PaymentEngine.dateOK(s)?new Intl.DateTimeFormat('es-EC',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(s+'T12:00:00Z')):'—';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(timer);timer=setTimeout(()=>$('toast').hidden=true,3500);}
function activeExtras(){return state.selectedScenario==='fixed'?state.fixedExtras:state.extras;}
function effectiveState(mode=state.selectedScenario){return {...state,mode,extras:mode==='fixed'?state.fixedExtras:state.extras};}
function read(){
  const previousMode=state.selectedScenario;
  const edited=[...$('extras').querySelectorAll('.extra-card')].map(card=>({amount:card.querySelector('[data-field="amount"]').value,date:card.querySelector('[data-field="date"]').value,timing:card.querySelector('[data-field="timing"]').value,label:card.querySelector('[data-field="label"]').value,mode:card.querySelector('[data-field="mode"]').value}));
  for(const key of fields)state[key]=$(key).value;
  if(previousMode==='fixed')state.fixedExtras=edited;else state.extras=edited;
  for(const list of [state.extras,state.fixedExtras])for(const x of list)if(x.timing==='delivery')x.date=state.delivery;
  return state;
}
function populate(){for(const key of fields)$(key).value=state[key]??'';renderExtras();refresh();}
function renderExtras(){
  $('extras').innerHTML=activeExtras().map((x,i)=>`<div class="extra-card" data-index="${i}"><div class="extra-head"><span>CUOTA EXTRAORDINARIA ${String(i+1).padStart(2,'0')}</span><button type="button" class="remove-extra" data-remove="${i}" aria-label="Eliminar cuota extraordinaria ${i+1}">×</button></div><div class="fields"><label class="full">Concepto<input data-field="label" value="${esc(x.label)}" placeholder="Ej. Pago a la entrega" maxlength="100"></label><label>Valor USD<input data-field="amount" type="number" min="0.01" step="0.01" value="${esc(x.amount)}"></label><label>Vencimiento<select data-field="timing"><option value="delivery" ${x.timing==='delivery'?'selected':''}>A la entrega</option><option value="fixed" ${x.timing!=='delivery'?'selected':''}>Fecha específica</option></select></label><label class="full">Fecha<input data-field="date" type="date" value="${esc(x.timing==='delivery'?state.delivery:x.date)}" ${x.timing==='delivery'?'disabled':''}></label><label class="full">Cómo se aplica<select data-field="mode"><option value="add" ${x.mode==='add'?'selected':''}>Se suma a la mensualidad</option><option value="replace" ${x.mode==='replace'?'selected':''}>Reemplaza esa mensualidad</option></select></label></div></div>`).join('');
  $('extraCount').textContent=activeExtras().length;
}
function propertyValidate(){for(const key of ['area','balcony','storage','parking']){const n=Number(state[key]);if(!Number.isFinite(n)||n<0||n>1e7)throw Error('Las áreas y cantidades de la propiedad deben ser mayores o iguales a cero.');if(['storage','parking'].includes(key)&&!Number.isInteger(n))throw Error('Las bodegas y parqueaderos deben ser cantidades enteras.');}}
function refresh(){
  for(const card of $('extras').querySelectorAll('.extra-card'))if(card.querySelector('[data-field="timing"]').value==='delivery')card.querySelector('[data-field="date"]').value=state.delivery;
  try{propertyValidate();result=PaymentEngine.calculate(effectiveState());$('errors').hidden=true;$('miniNet').textContent=money(result.net);renderPreview();}catch(e){result=null;$('errors').hidden=false;$('errors').innerHTML='<strong>Revisa los datos del plan</strong>'+esc(e.message);$('preview').innerHTML='<div class="invalid-placeholder">Completa o corrige los datos para calcular tu cronograma.</div>';$('miniNet').textContent='—';}
  // Price feedback must remain useful even while a later section is incomplete.
  try{$('miniNet').textContent=money(priceOnly().net);}catch{$('miniNet').textContent=Number(state.price)===0?money(0):'—';}
  renderScenarios();renderInitial();renderDelivery();renderBudget();
  $('print').disabled=!result;$('csv').disabled=!result;
  if(currentStep===6&&!result){const message=$('errors').textContent;showStep(4,false);$('stepError').textContent=message;$('stepError').hidden=false;}
  try{localStorage.setItem(storageKey,JSON.stringify(state));$('autosave').textContent='Borrador guardado en este navegador';}catch{$('autosave').textContent='Usa “Guardar plan” para conservar tus datos';}
}
function renderPreview(){const r=result,s=effectiveState();
  const discountLabel=qty(r.discount/r.price*100)+'%';
  const initials=[...(r.reserve?[{label:'Abono inicial (reserva)',date:s.reserveDate,cents:r.reserve}]:[]),...(r.entry?[{label:'Entrada adicional',date:s.entryDate,cents:r.entry}]:[])];
  const rows=r.schedule.map((row,i)=>`<tr class="${row.type==='extra'?'extra-row':''}"><td>${String(i+1).padStart(2,'0')}</td><td>${esc(date(row.date))}</td><td>${row.type==='extra'?'<span class="extra-label">'+esc(row.label)+'</span>'+(row.mode==='add'?'<span class="date-due">Total en esta fecha: '+money(row.amountDueOnDate)+'</span>':''):'Mensual'}</td><td data-label="Valor USD">${money(row.cents)}</td><td data-label="Saldo USD">${money(row.remaining)}</td></tr>`).join('');
  $('preview').innerHTML=`<article class="document"><div class="document-body"><div class="doc-heading"><div><p class="doc-project">${esc(s.project||'PROYECTO')}</p><h2>Cronograma de pagos</h2></div><div class="doc-ref">BIEN INMUEBLE<span class="ref-code">${esc(s.unit||'—')}</span>Entrega · ${esc(date(s.delivery))}</div></div>
  <div class="doc-client"><div><span class="meta-label">Cliente</span><span class="meta-value">${esc(s.client||'Nombre del cliente')}</span></div><div><span class="meta-label">Número de cédula</span><span class="meta-value">${esc(s.idNumber||'—')}</span></div><div><span class="meta-label">Representante legal</span><span class="meta-value">${esc(s.representative||'—')}</span></div></div>
  <div class="property-strip"><div><span class="meta-label">Área útil aprox.</span><span class="meta-value">${qty(s.area)} m²</span></div><div><span class="meta-label">Balcón aprox.</span><span class="meta-value">${qty(s.balcony)} m²</span></div><div><span class="meta-label">Bodegas</span><span class="meta-value">${qty(s.storage)} unidades</span></div><div><span class="meta-label">Parqueaderos</span><span class="meta-value">${qty(s.parking)} unidades</span></div></div>
  <div class="net-card"><div class="net-top"><div><span class="meta-label">PRECIO FINAL DEL INMUEBLE</span><div class="net-price">${money(r.net)}</div></div><span class="net-tag">USD</span></div><div class="price-breakdown"><div>Precio normal de venta<b>${money(r.price)}</b></div><div>${esc(discountLabel)}<b>− ${money(r.discount)}</b></div></div></div>
  <div class="summary-grid"><div class="summary-item"><span class="meta-label">Entrada Total</span><div class="summary-value">${money(r.initial)}</div><div class="summary-note">${(r.initial/r.net*100).toFixed(2).replace('.',',')}% del precio final</div></div><div class="summary-item"><span class="meta-label">Cuota Mensual</span><div class="summary-value">${money(r.base)}</div><div class="summary-note">${r.count} mensualidades${r.adjustment?' · ajuste en la última':''}</div></div><div class="summary-item"><span class="meta-label">Cuotas Extraordinarias</span><div class="summary-value">${money(r.extraTotal-r.deliveryTotal)}</div><div class="summary-note">${s.extras.length} pagos extraordinarios</div></div><div class="summary-item"><span class="meta-label">Valor Final a la Entrega</span><div class="summary-value">${money(r.deliveryTotal)}</div><div class="summary-note">${r.deliveryConfigured?esc(date(s.delivery)):'Sin pago a la entrega'}</div></div></div>
  <div class="payment-heading"><h3>${r.mode==='fixed'?'Forma 2 · Cuota ingresada':'Forma 1 · Cuota según el plazo'}</h3><span class="pill">Sin intereses</span></div><table class="initial-table"><tbody>${initials.map(x=>`<tr><td>${esc(x.label)}</td><td>${esc(date(x.date))}</td><td>${money(x.cents)}</td></tr>`).join('')}<tr class="initial-total"><td>Entrada total (${(r.initial/r.net*100).toFixed(2).replace('.',',')}%)</td><td></td><td>${money(r.initial)}</td></tr><tr><td>Saldo durante la construcción</td><td></td><td>${money(r.balance)}</td></tr></tbody></table>
  <div class="schedule-heading"><h3>Detalle de las cuotas</h3><span>${r.schedule.length} pagos · ${esc(date(s.first))} a ${esc(date(s.delivery))}</span></div>
  ${r.schedule.length?`<div class="table-container" tabindex="0" aria-label="Tabla de cuotas, desplázate para ver todos los pagos"><table class="schedule-table"><thead><tr><th scope="col">N.º</th><th scope="col">Fecha</th><th scope="col">Concepto</th><th scope="col">Valor USD</th><th scope="col">Saldo USD</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<p class="hint">El precio final está cubierto con la reserva y la entrada.</p>'}
  <div class="total-row"><span>Total cuotas</span><b>${money(r.balance)}</b></div><div class="total-row"><span>Total a pagar por el inmueble</span><b>${money(r.net)}</b></div>
  <p class="reconciled"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg><span>Reserva + entrada + cuotas = ${money(r.net)}. Saldo final: ${money(0)}.${r.roundingAdjustment?' La última cuota mensual se ajusta '+money(r.roundingAdjustment)+' por redondeo.':''}</span></p>
  ${r.closingAdjustments.length?'<div class="closing-note"><span class="meta-label">Ajuste automático de cierre</span>'+r.closingAdjustments.map(a=>'<p>'+esc(closingDescription(a))+'</p>').join('')+'</div>':''}
  ${s.notes?'<p class="notes"><span class="meta-label">Observaciones</span>'+esc(s.notes)+'</p>':''}
  <div class="acceptance">El comprador acepta el pago detallado en el presente documento y se compromete con su puntual pago.<div class="signature">${esc(s.client||'Aceptado por el comprador')}<br>Cédula: ${esc(s.idNumber||'—')}<br>Firma de aceptación</div></div></div>
  <div class="doc-bottom"><img src="alpha-builders.png" alt="Alpha Builders · Cazadores de inversiones"><span>CRONOGRAMA DE PAGOS<br>VALORES EXPRESADOS EN USD</span></div></article>`;
}
function download(text,type,name){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function filename(ext){return 'Cronograma de pagos.'+ext;}
function exportReady(){try{assertFinal();}catch(error){toast(error.message);return false;}if(!result){toast('Corrige los datos antes de exportar.');return false;}if(!state.client.trim()||!state.project.trim()||!state.unit.trim()){toast('Completa cliente, proyecto y bien inmueble antes de exportar.');return false;}return true;}
function csvCell(v){let s=String(v??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
function csvMoney(c){return (c/100).toFixed(2).replace('.',',');}
$('form').addEventListener('input',e=>{if(e.target.id==='selectedScenario')return;read();refresh();$('stepError').hidden=true;});
$('form').addEventListener('change',e=>{read();if(e.target.dataset.field==='timing'||e.target.id==='selectedScenario')renderExtras();refresh();});
$('form').addEventListener('submit',e=>e.preventDefault());
$('extras').addEventListener('click',e=>{const button=e.target.closest('[data-remove]');if(button){read();activeExtras().splice(Number(button.dataset.remove),1);renderExtras();refresh();}});
$('addExtra').addEventListener('click',()=>{read();if(activeExtras().length>=100){toast('Se permiten hasta 100 cuotas extraordinarias.');return;}activeExtras().push({amount:'',date:state.delivery,timing:'delivery',label:'Pago a la entrega',mode:'add'});renderExtras();refresh();$('extras').lastElementChild.querySelector('[data-field="amount"]').focus();});
$('newPlan').addEventListener('click',()=>{if(!confirm('¿Crear un nuevo plan? Guarda el actual si deseas conservarlo.'))return;calculationStarted=false;state=emptyPlan();populate();showStep(0);$('client').focus();toast('Nuevo plan listo para completar.');});
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
  }catch(error){toast(error.message||'No se pudo generar el PDF. Intenta de nuevo.');}
  finally{button.disabled=!result;button.removeAttribute('aria-busy');}
});
$('closePdf').addEventListener('click',()=>$('pdfDialog').close());
$('pdfDialog').addEventListener('click',e=>{if(e.target!==$('pdfDialog'))return;const rect=e.target.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)e.target.close();});
$('sharePdf').addEventListener('click',async()=>{if(!pdfFile)return;try{await navigator.share({files:[pdfFile],title:'Cronograma de pagos'});}catch(error){if(error.name!=='AbortError')toast('Puedes usar “Abrir PDF” o “Descargar PDF”.');}});
$('save').addEventListener('click',()=>{read();download(JSON.stringify({format:'alpha-payment-plan',version:1,data:state},null,2),'application/json',filename('json'));toast('Plan descargado. Puedes recuperarlo con “Abrir plan”.');});
$('open').addEventListener('click',()=>$('file').click());
function normalizeImported(data){if(!data||typeof data!=='object'||Array.isArray(data)||!Array.isArray(data.extras)||data.extras.length>100)throw Error('Archivo de plan no válido.');const out={};for(const key of fields){if(data[key]===undefined&&['idNumber','fixedMonthly','selectedScenario','deliveryPaymentType','deliveryPayment'].includes(key)){out[key]=key==='selectedScenario'?'term':key==='fixedMonthly'?'0':key==='deliveryPaymentType'?'none':key==='deliveryPayment'?'0':'';continue;}if(typeof data[key]!=='string'&&typeof data[key]!=='number')throw Error('El archivo está incompleto.');if(String(data[key]).length>2000)throw Error('El archivo contiene datos demasiado largos.');out[key]=String(data[key]);}if(!['term','fixed'].includes(out.selectedScenario))throw Error('El escenario del archivo no es válido.');out.extras=normalizeExtras(data.extras);out.fixedExtras=normalizeExtras(data.fixedExtras??[]);return out;}
function normalizeExtras(list){if(!Array.isArray(list)||list.length>100)throw Error('Cuotas extraordinarias no válidas.');return list.map(x=>{if(!x||typeof x!=='object')throw Error('Cuota extraordinaria no válida.');for(const k of ['amount','date','label','mode'])if(!['string','number'].includes(typeof x[k])||String(x[k]).length>200)throw Error('Cuota extraordinaria no válida.');return {amount:x.amount,date:x.date,label:String(x.label),mode:x.mode,timing:x.timing==='delivery'?'delivery':'fixed'};});}
$('file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>200000)throw Error('El archivo es demasiado grande.');const parsed=JSON.parse(await file.text());if(parsed.format!=='alpha-payment-plan'||parsed.version!==1)throw Error('Selecciona un plan guardado desde esta aplicación.');const imported=normalizeImported(parsed.data);if(!confirm('¿Abrir este plan y reemplazar el borrador actual?'))return;state=imported;populate();toast('Plan recuperado.');}catch(error){toast(error.message||'No se pudo abrir el archivo.');}finally{e.target.value='';}});
$('csv').addEventListener('click',()=>{read();refresh();if(!exportReady())return;const r=result,s=effectiveState();const rows=[['CRONOGRAMA DE PAGOS - ALPHA BUILDERS'],['Cliente',s.client],['Número de cédula',s.idNumber],['Representante legal',s.representative],['Proyecto',s.project],['Bien inmueble',s.unit],['Área útil aprox. m²',s.area],['Área balcón aprox. m²',s.balcony],['Bodegas',s.storage],['Parqueaderos',s.parking],['Entrega del proyecto',s.delivery],['Forma elegida',r.mode==='fixed'?'Forma 2 - Cuota ingresada':'Forma 1 - Cuota según el plazo'],[],['Precio normal USD',csvMoney(r.price)],['Descuento USD',csvMoney(r.discount)],['Precio final USD',csvMoney(r.net)],['Entrada total USD',csvMoney(r.initial)],['Entrada total %',(r.initial/r.net*100).toFixed(2)],[],['N.º','Fecha','Concepto','Valor USD','Saldo USD']];let remaining=r.net;for(const row of [{date:s.reserveDate,cents:r.reserve,label:'Abono inicial (reserva)'},{date:s.entryDate,cents:r.entry,label:'Entrada adicional'}].filter(x=>x.cents)){remaining-=row.cents;rows.push(['',row.date,row.label,csvMoney(row.cents),csvMoney(remaining)]);}r.schedule.forEach((row,i)=>rows.push([i+1,row.date,row.label,csvMoney(row.cents),csvMoney(row.remaining)]));rows.push([],['Total cuotas USD',csvMoney(r.balance)],['Total a pagar USD',csvMoney(r.net)],['Observaciones',s.notes]);download('\uFEFF'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n'),'text/csv;charset=utf-8',filename('csv'));toast('Cronograma exportado en CSV.');});
function priceOnly(){return PaymentEngine.calculate({...state,mode:'term',reserve:0,entry:0,deliveryPaymentType:'none',deliveryPayment:0,extras:[],first:'2000-01-01',delivery:'2000-01-01'},{allowUnbalanced:true});}
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
  const panel=$('paymentBudget');panel.hidden=!calculationStarted;
  document.querySelector('.topbar').classList.toggle('with-budget',calculationStarted);
  if(!calculationStarted)return;
  try{
    const price=priceOnly();$('budgetTarget').textContent=money(price.net);
    try{const initial=initialOnly();$('budgetInitial').textContent=money(initial.initial);$('budgetInitialPercent').textContent=(initial.initial/price.net*100).toFixed(2).replace('.',',')+'%';}catch{$('budgetInitial').textContent='—';$('budgetInitialPercent').textContent='Revisa la entrada';}
    try{const r=PaymentEngine.calculate(effectiveState(),{allowUnbalanced:true});
      $('budgetGapLabel').textContent=r.difference<0?'Sobrante':'Faltante';
      $('budgetGap').textContent=money(Math.abs(r.difference));
      $('budgetNote').textContent=!r.lastPaymentValid?'Última cuota excede el 10%':r.difference===0?'Total cubierto':'Máx. última: '+money(r.lastPaymentLimit);
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
    return `<article class="scenario-card ${chosen?'chosen':''}"><div class="scenario-card-heading"><h3>${names[mode]}</h3>${chosen?'<span class="selected-tag">Elegido para el PDF</span>':''}</div>${r?`<div class="scenario-amount">${money(r.base)} <span>/ mes</span></div><dl><div><dt>Mensualidades</dt><dd>${r.count}</dd></div><div><dt>Total cuotas regulares</dt><dd>${money(r.monthlyTotal)}</dd></div><div><dt>Cuotas extraordinarias</dt><dd>${money(r.extraTotal-r.deliveryTotal)}</dd></div><div><dt>Pago a la entrega</dt><dd>${money(r.deliveryTotal)}</dd></div><div><dt>Reserva + entrada</dt><dd>${money(r.initial)}</dd></div><div><dt>Total a pagar hasta la entrega</dt><dd>${money(r.coveredTotal)}</dd></div></dl><p class="scenario-status ${r.fullyCovered?'balanced':'pending'}">${!r.lastPaymentValid?'Última cuota superior al 10% · máximo '+money(r.lastPaymentLimit):r.difference>0?'Falta cubrir '+money(r.difference):r.difference<0?'Exceso de '+money(-r.difference):'Precio cubierto · Saldo cero'}</p>${r.closingAdjustments.length?'<div class="closing-note">'+r.closingAdjustments.map(a=>'<p>'+esc(closingDescription(a))+'</p>').join('')+'</div>':''}`:`<p class="scenario-status pending">${esc(error)}</p>`}<button type="button" class="button ${chosen?'primary':'secondary'}" data-select-scenario="${mode}" aria-pressed="${chosen}">${chosen?'Escenario seleccionado':'Elegir este escenario'}</button></article>`;
  }).join('');
  $('scenarioEditor').innerHTML=['term','fixed'].map(mode=>`<button type="button" class="button ${mode===state.selectedScenario?'primary':'secondary'}" data-select-scenario="${mode}" aria-pressed="${mode===state.selectedScenario}">${mode==='term'?'Forma 1':'Forma 2'}</button>`).join('');
  const {result:r,error}=analyses[state.selectedScenario]??{error:'Selecciona una forma de cálculo válida.'};
  $('coverageSummary').innerHTML=r?`<span class="meta-label">${r.difference>0?'Faltante por distribuir':r.difference<0?'Sobrante sin compensar':!r.lastPaymentValid?'Última cuota superior al límite':'Plan completo'}</span><strong>${money(Math.abs(r.difference))}</strong><p>Precio final ${money(r.net)} · Pagos finales ${money(r.coveredTotal)} · Máximo última cuota ${money(r.lastPaymentLimit)} (10%). ${r.difference>0?'Distribuye el faltante en extraordinarias; la última cuota ya no puede aumentar más.':r.difference<0?'Las extraordinarias no alcanzan para compensar el sobrante.':!r.lastPaymentValid?'Reduce la última cuota antes de continuar.':'Saldo cero.'}</p>${r.closingAdjustments.map(a=>'<p>'+esc(closingDescription(a))+'</p>').join('')}`:esc(error);
  $('differenceTools').hidden=state.selectedScenario!=='fixed';
  $('distributeExtra').disabled=!r||r.originalDifference<=0;
  $('extraParts').max=r?Math.min(100,r.dates.length,100-activeExtras().length):100;
  for(const card of $('extras').querySelectorAll('.extra-card')){
    card.querySelector('.extra-adjustment')?.remove();
    const adjusted=r?.schedule.find(row=>row.type==='extra'&&row.sourceIndex===Number(card.dataset.index));
    if(adjusted&&(adjusted.mode==='add'||adjusted.closingChange)){const note=document.createElement('p');note.className='extra-adjustment';note.textContent=(adjusted.mode==='add'?additionDescription(adjusted):'')+(adjusted.closingChange?' Valor final de la extraordinaria: '+money(adjusted.cents)+' · ajuste '+money(adjusted.closingChange):'');card.append(note);}
  }
}
function chooseScenario(mode){
  read();state.selectedScenario=mode;$('selectedScenario').value=mode;renderExtras();refresh();$('stepError').hidden=true;
}
$('form').addEventListener('click',e=>{const button=e.target.closest('[data-select-scenario]');if(button)chooseScenario(button.dataset.selectScenario);});
$('distributeExtra').addEventListener('click',()=>{
  read();try{const additions=PaymentEngine.distributeDifference(effectiveState('fixed'),$('extraParts').value);state.fixedExtras.push(...additions);renderExtras();refresh();toast(result?'Diferencia distribuida. El plan cubre el precio completo.':'Diferencia distribuida. Revisa el límite de la última cuota antes de continuar.');}catch(error){toast(error.message);}
});
function validateStep(){
  read();
  if(currentStep===0){for(const key of ['client','project','unit'])if(!String(state[key]).trim())throw Error('Completa el nombre del cliente, el proyecto y el bien inmueble.');propertyValidate();}
  if(currentStep===1)priceOnly();
  if(currentStep===2){const {reserve,entry}=initialOnly();if(reserve&&!PaymentEngine.dateOK(state.reserveDate)||entry&&!PaymentEngine.dateOK(state.entryDate))throw Error('Completa las fechas del abono inicial y la entrada adicional.');if(reserve&&entry&&state.reserveDate>state.entryDate)throw Error('El abono inicial debe ser anterior o igual a la entrada adicional.');const delivery=PaymentEngine.deliveryAmount(state,priceOnly().net);if(reserve+entry+delivery>priceOnly().net)throw Error('La entrada total y el pago a la entrega superan el precio final.');}
  if(currentStep===3){PaymentEngine.calculate({...state,mode:'term',extras:[]},{allowUnbalanced:true});if(state.selectedScenario==='fixed')PaymentEngine.calculate(effectiveState(),{allowUnbalanced:true});}
  if(currentStep===4||currentStep===5)assertFinal();
}
function showStep(index,scroll=true){
  const target=Math.max(0,Math.min(6,index));
  if(target===6){try{assertFinal();}catch(error){$('stepError').textContent=error.message;$('stepError').hidden=false;return false;}}
  currentStep=target;calculationStarted=calculationStarted||currentStep>=2;renderBudget();formPages.forEach((page,i)=>page.hidden=i!==currentStep);
  $('form').closest('.editor').hidden=currentStep===6;document.querySelector('.results').hidden=currentStep!==6;
  $('stepCaption').textContent='Paso '+(currentStep+1)+' de 7';$('stepName').textContent=stepNames[currentStep];$('navStep').textContent=(currentStep+1)+' / 7';
  $('previousStep').disabled=currentStep===0;$('nextStep').hidden=currentStep===6;$('nextStep').textContent=currentStep===5?'Ver cronograma →':'Continuar →';
  $('stepTabs').innerHTML=stepNames.map((name,i)=>`<button type="button" class="step-tab ${i===currentStep?'active':i<currentStep?'complete':''}" data-step="${i}" aria-label="Paso ${i+1}: ${esc(name)}" ${i===currentStep?'aria-current="step"':''}>${i+1}</button>`).join('');
  $('stepError').hidden=true;if(scroll)window.scrollTo({top:0,behavior:'smooth'});
}
$('nextStep').addEventListener('click',()=>{try{validateStep();refresh();showStep(currentStep+1);}catch(error){$('stepError').textContent=error.message;$('stepError').hidden=false;}});
$('previousStep').addEventListener('click',()=>{read();refresh();showStep(currentStep-1);});
$('stepTabs').addEventListener('click',e=>{const tab=e.target.closest('[data-step]');if(tab){read();refresh();showStep(Number(tab.dataset.step));}});
try{const saved=localStorage.getItem(storageKey);if(saved)state=normalizeImported(JSON.parse(saved));}catch{state=emptyPlan();}
populate();showStep(0,false);
