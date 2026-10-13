# Cronograma de pagos · Alpha Builders

Aplicación web en HTML, CSS y JavaScript. Incluye el código fuente de la versión publicada con diseño responsive a todo el ancho de la pantalla, siete pasos y campo de número de cédula.

## Ejecutar en tu computadora

1. Descomprime el ZIP.
2. Abre una terminal dentro de la carpeta `cronograma-de-pagos`.
3. Ejecuta con Python 3:

```bash
python3 -m http.server 8000 --directory dist
```

En Windows también puedes usar:

```bash
py -m http.server 8000 --directory dist
```

4. Abre `http://localhost:8000` en tu navegador.

Usa un servidor HTTP; abrir `index.html` directamente puede impedir la carga del logo para generar el PDF.

## Publicar

Puedes alojar el contenido completo de `dist/` en cualquier hosting estático. `index.html` debe quedar en la raíz del sitio. No requiere compilación ni instalación de paquetes. Usa HTTPS para disponer de la opción de compartir archivos cuando el teléfono la admita.

## Archivos principales

- `dist/index.html`: estructura, campos y siete pasos.
- `dist/app.js`: formularios, navegación, guardado del borrador, importación y exportación.
- `dist/engine.js`: cálculos y validación de pagos.
- `dist/style.css`: estilos generales.
- `dist/wizard.css`: diseño responsive a todo el ancho y presentación móvil.
- `dist/pdf.js`: generación del cronograma PDF.
- `dist/pdf-lib.min.js`: biblioteca PDF incluida.
- `dist/alpha-builders.png`: logo de la aplicación.
- `dist/alpha-builders-pdf.jpg`: versión del logo de cabecera para el PDF.
- `dist/alpha-builders-watermark.jpg`: logo proporcionado para la marca de agua.
- `validate.cjs`: comprobaciones de los cálculos.
- `validate-pdf.cjs`: comprobaciones de generación de PDF.
- `validate-scenarios.cjs`: pruebas de ambos escenarios, reparto de diferencias y bloqueo del paso final.
- `pdf-lib-LICENSE.md`: licencia de la biblioteca PDF.

## Funciones

Datos del cliente, cédula y representante legal; proyecto y bien inmueble; áreas, bodegas y parqueaderos; precio y descuento por monto o porcentaje; reserva y entrada; primera cuota y entrega; cuotas extraordinarias; observaciones; cronograma, exportación CSV y PDF.

El archivo PDF se descarga como `Cronograma de pagos.pdf`. En iPhone, abre el PDF y usa Compartir > Imprimir.

Los valores se calculan sin intereses. El abono inicial (reserva) y la entrada adicional se detallan por separado. Si la entrada se ingresa como porcentaje, representa el total de ambos sobre el precio final; la entrada adicional se calcula restando el abono inicial. Si se ingresa en USD, el monto es adicional al abono inicial. La fecha de entrega determina el número de mensualidades; las cuotas extraordinarias se restan del saldo antes de distribuirlo. Pueden sumarse a una mensualidad o reemplazarla en su fecha exacta. La última mensualidad ajusta los centavos para cerrar el total.

El borrador se guarda en el navegador del dispositivo. Para conservar otros planes o trasladarlos entre dispositivos, usa Guardar plan y Abrir plan. Los archivos antiguos guardados antes de incorporar la cédula son compatibles.

## Verificar cálculos y PDF

Con Node.js instalado, desde la carpeta raíz:

```bash
node validate.cjs
node validate-pdf.cjs
node validate-scenarios.cjs
node validate-revisions.cjs
```

No requiere npm install. La biblioteca PDF ya está incluida.

## Comparar dos escenarios de pago

En el paso 4 se comparan ambas formas y se elige una sola para el PDF final:

- Forma 1: el saldo, luego de reserva, entrada y extraordinarias, se divide en las fechas mensuales disponibles hasta la entrega. La última cuota ajusta el redondeo.
- Forma 2: se ingresa la cuota mensual fija y se calcula el total que se pagaría hasta la entrega. El valor ingresado es la cuota mensual base. Si queda un faltante, la última cuota recibe el ajuste de cierre hasta un máximo del 10% del precio final; el resto queda pendiente para distribuir en extraordinarias.

Cada escenario conserva sus propias extraordinarias. En el paso 5 puedes usar Editar distribución para volver a ingresarlas o Proponer distribución para preparar valores y fechas automáticamente. Las propuestas se revisan y se guardan al pulsar Aplicar cambios. Reemplazar una mensualidad elimina esa mensualidad de los pagos regulares.

Reserva + entrada + cuotas regulares + extraordinarias deben igualar exactamente el precio final descontado. El faltante se suma automáticamente a la última cuota programada, mensual o extraordinaria, sin superar el 10% del precio final después del descuento. Si no cabe todo, el resto debe cubrirse con extraordinarias. La última cuota que tenga un valor positivo debe cumplir este límite, incluso si hay extraordinarias posteriores reducidas a cero. El sobrante se descuenta únicamente de las extraordinarias en orden inverso de fecha: primero la última, luego las anteriores. Una extraordinaria puede llegar a cero, pero no queda negativa. Si queda un faltante, las extraordinarias no alcanzan para compensar el sobrante o la última cuota supera el 10%, se bloquean el paso final y las exportaciones. El PDF incluye únicamente el escenario elegido. Los planes antiguos se recuperan con Forma 1.

## Ajuste automático de cierre

El ajuste se recalcula a partir de los valores ingresados cada vez que cambian los datos; no se acumula sobre un ajuste anterior. Los campos conservan el valor ingresado, mientras que los resúmenes y el PDF muestran el valor final y el detalle del ajuste. Cuotas extraordinarias en una misma fecha se compensan desde la última ingresada. Puedes seguir repartiendo un faltante en varias extraordinarias antes del ajuste automático final.

## Total y faltante visibles

Desde el paso 3, la parte superior derecha muestra de forma fija el precio final a cubrir y el faltante en rojo del escenario elegido, después del ajuste automático. El indicador sigue visible al regresar a pasos anteriores. Si hay un excedente, se muestra como sobrante. El descuento solo aparece en el PDF cuando su importe es mayor que cero.

## Entrada total

La cabecera fija muestra el total de entrada en USD y como porcentaje del precio final, incluyendo el abono inicial. El paso 3 muestra el desglose. Ejemplo: propiedad de USD 100.000, entrada del 30% y abono inicial de USD 1.000: entrada total USD 30.000 y entrada adicional USD 29.000. El abono inicial no puede superar la entrada total seleccionada por porcentaje. El PDF y el CSV incluyen el total y su porcentaje.

## Pago a la entrega antes de la cuota mensual

En el paso 3 puedes elegir Sin pago a la entrega, Monto USD o Porcentaje del precio final. Se configura antes de mostrar las mensualidades y es común a los dos escenarios. El valor se descuenta del saldo antes de calcular la cuota en Forma 1; en Forma 2 forma parte de los pagos proyectados y del cálculo del faltante. Si existe una mensualidad en la fecha exacta de entrega, este pago la reemplaza. El monto se limita al 10% del precio final. El ajuste automático de cierre sigue aplicándose a la última cuota, hasta ese límite. Los planes antiguos conservan sus extraordinarias y el nuevo campo queda desactivado; evita repetir en este campo un pago que ya tengas en extraordinarias.

## Inicio sin datos de ejemplo

Al abrir la aplicación por primera vez y al crear un nuevo plan, los importes, áreas y cantidades están en cero. Los datos del cliente, propiedad y fechas quedan vacíos, sin cuotas extraordinarias y sin pago a la entrega. El escenario de ejemplo y su botón se retiraron. Esta versión inicia un nuevo borrador sin cargar automáticamente datos de la versión anterior; los nuevos borradores conservan el guardado automático. Los planes descargados siguen disponibles mediante Abrir plan.

El campo de reducción del precio se identifica con %. En el resumen y PDF se muestra únicamente el porcentaje aplicado, sin la palabra descuento. Si se ingresa un monto USD, se muestra su porcentaje equivalente sobre el precio de venta.

## Marca de agua en el PDF

El PDF descargado incluye el logo Alpha Builders centrado como marca de agua de fondo en todas las páginas, con opacidad del 8,5%. La imagen se inserta antes que el contenido para mantener legibles los datos y las cuotas. Se usa el archivo de logo proporcionado, conservando el logo de cabecera.

## Firma y descarga para Excel

La firma del PDF y de la vista previa incluye el nombre completo y la cédula del cliente debajo de la línea de firma. Se preservan los ceros iniciales de la cédula. El botón de exportación se llama Descargar Excel y conserva el archivo CSV compatible con Excel.
## Resumen final de cuatro campos

La vista previa y el PDF muestran Entrada Total, Cuota Mensual, Cuotas Extraordinarias y Valor Final a la Entrega. Las extraordinarias manuales se totalizan por separado del pago configurado a la entrega. En teléfono, el resumen se presenta en dos filas de dos campos.

Se suma a la mensualidad mantiene el pago regular en la misma fecha y agrega la extraordinaria. El formulario muestra el total de esa fecha y su desglose; el cronograma conserva ambos pagos con sus importes separados, sin duplicarlos. Ejemplo verificado: mensualidad USD 5.000 más extraordinaria USD 10.000 corresponde a USD 15.000 en esa fecha. Reemplaza la mensualidad elimina el pago regular de esa fecha. Las pruebas cubren ambos escenarios y varias extraordinarias en la misma fecha.

## Editar la misma proforma y reutilizar datos

Los pasos 4 y 5 muestran la cantidad y el total de extraordinarias registradas. Editar distribución abre un formulario aparte para volver a ingresar las cuotas, aumentar o disminuir su cantidad, incluso a cero. La distribución actual se conserva hasta Aplicar cambios. Cancelar o cerrar el formulario conserva el plan anterior. Proponer distribución permite revisar una propuesta automática para Forma 2 antes de aplicarla.

En Forma 2, la cuota mensual se define y edita mediante su botón junto al valor. Al aplicar una cuota diferente se eliminan únicamente las extraordinarias de Forma 2 y se recalcula el faltante; las extraordinarias de Forma 1 se conservan. Si el valor es el mismo o se cancela, la distribución no se borra. El reporte final también ofrece Editar extraordinarias y, en Forma 2, Editar cuota mensual. Las descargas se bloquean cuando el plan no cubre el precio o la última cuota excede el 10%.

Nueva cotización abre un modal con tres opciones: Nueva cotización completa limpia todo; Mantener cliente conserva nombre, cédula y representante y limpia propiedad y condiciones; Mantener cliente y propiedad conserva también proyecto, unidad, áreas, bodegas, parqueaderos, precio normal y fecha de entrega. Esta última limpia descuento, reserva, entrada, pago a la entrega, primera cuota, cuota fija, extraordinarias de ambos escenarios y observaciones. El borrador anterior se reemplaza solo al crear la nueva cotización. Usa Guardar plan antes si deseas conservar una copia.

`dist/revisions.js` contiene las operaciones de reinicio y edición. `validate-revisions.cjs` prueba los botones y formularios reales de la aplicación mediante un adaptador DOM, sin instalar dependencias. Las verificaciones funcionales se ejecutaron en Node; la apariencia en navegador móvil no pudo comprobarse en este entorno.
