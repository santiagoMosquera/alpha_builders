(function(root){
  'use strict';
  const lib=typeof module!=='undefined'&&module.exports?require('./pdf-lib.min.js'):root.PDFLib;
  const revisions=typeof module!=='undefined'&&module.exports?require('./revisions.js'):root.PaymentRevisions;
  const W=595.28,H=841.89,M=38,R=W-M;
  const latin=s=>String(s??'').replace(/\u00a0|\u202f/g,' ').replace(/[–—−]/g,'-').replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^\x20-\xff\n]/g,'?');
  const usd=n=>'$ '+new Intl.NumberFormat('es-EC',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n/100);
  const fmtDate=s=>s?new Intl.DateTimeFormat('es-EC',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(s+'T12:00:00Z')):'-';
  async function generate(s,r,logo,watermarkLogo){
    const total=r.initial+r.schedule.reduce((sum,row)=>sum+row.cents,0);
    if(total!==r.net)throw Error('El plan debe cubrir exactamente el precio final antes de generar el PDF.');
    const last=[...r.schedule].reverse().find(row=>row.cents>0);
    if(r.mode!=='cash'&&last&&last.cents>Math.floor(r.net/10))throw Error('La última cuota no puede superar el 10% del precio final de la propiedad.');
    const {PDFDocument,StandardFonts,rgb}=lib,pdf=await PDFDocument.create();
    const font=await pdf.embedFont(StandardFonts.Helvetica),boldFont=await pdf.embedFont(StandardFonts.HelveticaBold);
    const image=logo?await pdf.embedJpg(logo):null;let active=null,y=0;
    const watermark=watermarkLogo?await pdf.embedJpg(watermarkLogo):image;
    pdf.setTitle((r.mode==='cash'?'Cotización de contado':'Cronograma de pagos')+' - '+s.client);pdf.setAuthor('Alpha Builders');pdf.setCreator('Alpha Builders · Cronograma de pagos');
    const width=(v,size,bold=false)=>(bold?boldFont:font).widthOfTextAtSize(latin(v),size);
    function wrap(s,max,size){const lines=[];for(const paragraph of latin(s).split('\n')){let line='';for(const word of paragraph.split(/\s+/)){if(width(line+(line?' ':'')+word,size)<=max){line+=(line?' ':'')+word;continue;}if(line)lines.push(line);line='';for(const char of word){if(width(line+char,size)>max){lines.push(line);line='';}line+=char;}}lines.push(line);}return lines;}
    const text=(v,x,top,size=10,bold=false,gray=.12)=>active.drawText(latin(v),{x,y:H-top,size,font:bold?boldFont:font,color:rgb(gray,gray,gray)});
    const right=(v,x,top,size=10,bold=false)=>text(v,x-width(v,size,bold),top,size,bold);
    const line=top=>active.drawLine({start:{x:M,y:H-top},end:{x:R,y:H-top},thickness:.5,color:rgb(.83,.83,.83)});
    const box=(top,height,shade)=>active.drawRectangle({x:M,y:H-top-height,width:R-M,height,color:rgb(shade,shade,shade)});
    const footer=()=>{line(795);text(r.mode==='cash'?'ALPHA BUILDERS · COTIZACIÓN DE CONTADO':'ALPHA BUILDERS · CRONOGRAMA DE PAGOS',M,813,7,false,.5);right('Página '+pdf.getPageCount(),R,813,7);};
    function page(){if(active)footer();active=pdf.addPage([W,H]);if(watermark){const w=430,h=w*watermark.height/watermark.width;active.drawImage(watermark,{x:(W-w)/2,y:(H-h)/2,width:w,height:h,opacity:.085});}if(image)active.drawImage(image,{x:M,y:H-76.5,width:175,height:52.5});else text('ALPHA BUILDERS',M,55,15,true);right(String(s.project).slice(0,38),R,45,11,true);right('Bien inmueble: '+String(s.unit).slice(0,35),R,62,9);line(86);y=110;}
    function ensure(height){if(y+height>772)page();}
    function paragraph(v,size=10,bold=false,max=R-M){for(const l of wrap(v,max,size)){ensure(size+5);text(l,M,y,size,bold);y+=size+5;}}
    function pair(label,value,size=10,bold=false){ensure(21);text(label,M,y,size,bold);right(value,R,y,size,bold);y+=20;}
    function paymentSummary(){
      const cells=[['Entrada Total',r.initial,(r.initial/r.net*100).toFixed(2).replace('.',',')+'% del precio final'],['Cuota Mensual',r.base,r.count+' mensualidades'],['Cuotas Extraordinarias',r.extraTotal-r.deliveryTotal,s.extras.length+' pagos extraordinarios'],['Valor Final a la Entrega',r.deliveryTotal,r.deliveryConfigured?fmtDate(s.delivery):'Sin pago a la entrega']];
      ensure(50);const cellWidth=(R-M)/4;box(y-10,44,.96);
      cells.forEach(([label,value,note],i)=>{const x=M+i*cellWidth+8;const labels=wrap(label,cellWidth-16,8);labels.forEach((l,j)=>text(l,x,y+j*9,8,true));const valueText=usd(value);const valueSize=Math.min(13,(cellWidth-16)/width(valueText,1));text(valueText,x,y+20,valueSize,true);text(note,x,y+32,7,false,.45);});y+=47;
    }
    function tableHead(){ensure(28);box(y-11,22,.94);text('N.º',M+7,y+3,8,true);text('Fecha',M+38,y+3,8,true);text('Concepto',M+141,y+3,8,true);right('Valor USD',R-118,y+3,8,true);right('Saldo USD',R-8,y+3,8,true);y+=22;}
    page();paragraph(r.mode==='cash'?'COTIZACIÓN DE CONTADO':'CRONOGRAMA DE PAGOS',20,true);y+=4;
    paragraph('Cliente: '+s.client,10,true);if(s.idNumber)paragraph('Número de cédula: '+s.idNumber);if(s.representative)paragraph('Representante legal: '+s.representative);
    if(String(s.project).length>38||String(s.unit).length>35)paragraph('Proyecto: '+s.project+' · Bien inmueble: '+s.unit,9);
    paragraph('Área útil aprox.: '+(s.area||0)+' m²   |   Balcón aprox.: '+(s.balcony||0)+' m²',9);
    paragraph('Bodegas: '+(s.storage||0)+'   |   Parqueaderos: '+(s.parking||0),9);
    if(r.mode==='cash'?s.cashDelivery:s.delivery)paragraph('Entrega del proyecto: '+fmtDate(r.mode==='cash'?s.cashDelivery:s.delivery),9);y+=9;line(y-3);y+=14;
    pair('Precio normal de venta',usd(r.price));if(r.discount>0)pair(new Intl.NumberFormat('es-EC',{maximumFractionDigits:2}).format(r.discount/r.price*100)+'%',usd(r.discount));
    ensure(42);box(y-13,34,.94);text('PRECIO FINAL',M+10,y+8,11,true);right(usd(r.net),R-10,y+8,18,true);y+=45;
    paragraph('DETALLE DE LA FORMA DE PAGO',11,true);y+=3;
    paragraph(r.mode==='cash'?'Pago de contado: reserva opcional y pago único del saldo, sin mensualidades ni extraordinarias.':r.mode==='fixed'?'Forma 2: cuota mensual ingresada.':'Forma 1: cuota mensual calculada según el plazo.',9);
    if(r.mode==='cash'){if(r.reserve)pair('Reserva · '+fmtDate(s.cashReserveDate),usd(r.reserve));pair('SALDO DE CONTADO · '+fmtDate(s.cashDelivery),usd(r.balance),12,true);pair('TOTAL DEL INMUEBLE',usd(r.net),12,true);paragraph('Reserva + saldo de contado = precio final. Saldo pendiente luego de los pagos: '+usd(0)+'.',9);}else{
    if(r.reserve)pair('Abono inicial (reserva) · '+fmtDate(s.reserveDate),usd(r.reserve));
    if(r.entry)pair('Entrada adicional · '+fmtDate(s.entryDate),usd(r.entry));
    y+=4;paymentSummary();
    paragraph('Saldo por cuotas: '+usd(r.balance)+'. Sin intereses. Primera cuota: '+fmtDate(s.first)+'.',9);y+=10;
    if(r.schedule.length){tableHead();for(let i=0;i<r.schedule.length;i++){const row=r.schedule[i];const labels=wrap(row.label+(row.mode==='add'?' · adicional':''),181,8);const h=Math.max(17,labels.length*10+7);if(y+h>770){page();paragraph('DETALLE DE CUOTAS · CONTINUACIÓN',11,true);y+=8;tableHead();}if(row.type==='extra')box(y-10,h,.955);text(i+1,M+7,y+2,8);text(fmtDate(row.date),M+38,y+2,8);labels.forEach((l,j)=>text(l,M+141,y+2+j*10,8,row.type==='extra'));right(usd(row.cents),R-118,y+2,9);right(usd(row.remaining),R-8,y+2,9);y+=h;line(y-9);}}
    y+=14;ensure(65);pair('TOTAL CUOTAS',usd(r.balance),11,true);pair('TOTAL A PAGAR POR EL INMUEBLE',usd(r.net),12,true);paragraph('Saldo final: '+usd(0)+'. Reserva + entrada + cuotas = precio final.',9);
    if(r.roundingAdjustment)paragraph('La última cuota mensual incluye un ajuste de '+usd(r.roundingAdjustment)+' por redondeo.',8);
    if(r.closingAdjustments?.length){y+=8;paragraph('AJUSTE AUTOMÁTICO DE CIERRE',9,true);for(const a of r.closingAdjustments)paragraph((a.change>0?'Se suman '+usd(a.change):'Se descuentan '+usd(-a.change))+' a '+(a.type==='monthly'?'la cuota mensual':a.label)+' del '+fmtDate(a.date)+'. Valor final: '+usd(a.after)+'.',8);}
    }
    if(s.notes){y+=12;paragraph('OBSERVACIONES',10,true);paragraph(s.notes,9);}
    const acceptance=r.mode==='cash'?'El comprador acepta el precio final y las condiciones de pago de contado indicadas en esta cotización.':'El comprador acepta el pago detallado en el presente documento y se compromete con su puntual pago.';
    const signatureHeight=wrap(acceptance,R-M,9).length*14+36+15+wrap(s.client,230,9).length*14+wrap('Cédula: '+(s.idNumber||'-'),230,9).length*14+13;
    y+=16;ensure(signatureHeight);paragraph(acceptance,9);y+=36;active.drawLine({start:{x:M,y:H-y},end:{x:M+230,y:H-y},thickness:.6,color:rgb(.4,.4,.4)});y+=15;paragraph(s.client,9,false,230);paragraph('Cédula: '+(s.idNumber||'-'),9,false,230);paragraph('Firma de aceptación',8,false,230);const fee=revisions.notaryFee(r.net);text('NOTARÍA · INFORMATIVO · INCLUYE IVA · NO INCLUIDO EN CUOTAS',M,782,7,false,.45);right(fee===null?'Por confirmar':usd(fee),R,782,9,true);footer();
    return pdf.save();
  }
  const api={generate};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PaymentPDF=api;
})(typeof globalThis!=='undefined'?globalThis:this);
