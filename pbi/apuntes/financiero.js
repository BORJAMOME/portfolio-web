/* Informes financieros: Cuenta de PyG, Balance Financiero e Informes Financieros (NamasData) */
var NOTES = window.NOTES || (window.NOTES = []);
var EXAM = window.EXAM || (window.EXAM = []);
(function(){
var PG = "Construcción de una cuenta de Pérdidas y Ganancias (NamasData)";
var BF = "Balance Financiero (NamasData)";
var IF = "Informes Financieros (NamasData)";
NOTES.push(
/* ---------------- PyG ---------------- */
{t:"financiero", s:PG + " · I. Fundamentos", h:`
<p><b>Modelo:</b> tabla de hechos PyG con el importe de ventas y gastos, y dimensiones Calendario, Departamentos, <b>Escenario</b> (real o presupuesto), Organizaciones y Cuentas. Con fechas, tener siempre una columna de número de mes para ordenar.</p>
<ol>
<li><b>Ordenar cuentas</b> según las necesidades analíticas (columna de orden).</li>
<li><b>Cálculos base:</b> <code>Importe = SUM(PyG[Importe])</code> y ocultar la columna.</li>
<li><b>Clasificar las cuentas</b> en gasto o ingreso (Grupos de datos sobre la columna Cuenta).</li>
<li><b>Signo de las cuentas:</b> columna condicional <i>Signo</i> (1 o −1) en la dimensión.</li>
<li><b>Medida que sume ingresos y reste gastos</b> con un iterador:
<pre><code>Importe Según Signo = SUMX ( PyG, PyG[Importe] * RELATED ( Cuentas[Signo] ) )</code></pre></li>
<li><b>Signo del informe:</b> a veces se quieren todas las cifras en positivo aunque resten; otra medida aplica el signo de presentación.</li>
<li><b>Agrupaciones y tabla de encabezados:</b> tabla ENCABEZADOS (Ingresos, Ventas netas, Margen, Beneficio neto…) con su orden; ocultar el encabezado de Cuentas y usar solo el de Encabezados.</li>
<li><b>Totales generales correctos:</b> medida con variables que detecta si hay filtro sobre Cuenta o Encabezado (<code>ISFILTERED</code>) y devuelve el detalle o el total según el caso.</li>
<li><b>Subtotales personalizados:</b> «Mostrar elementos sin datos» en Encabezado, porque Power BI oculta los registros sin datos en PyG.</li>
<li><b>Totales acumulados:</b> columna <i>TipoCálculo</i> en Encabezados (1 = valor directo, 2 = acumulado) y medida que acumula según el orden del encabezado.</li>
<li><b>Ajustar acumulados</b> y corregir errores puntuales.</li>
<li><b>Importe total:</b> columna <i>Detalle</i> (1 si debe mostrar el detalle de cuentas, 0 si no) para no enseñar líneas de cuentas en Beneficio neto o Ventas netas; ocultar el subtotal de fila (Formato → Subtotales de fila → nivel Encabezado → desactivar) y el total inferior.</li>
</ol>
<p>Un cambio de estructura de la PyG (por ejemplo, separar Ventas intercompañía y comerciales bajo Ventas brutas con un <i>Subencabezado</i>) obliga a revisar duplicidades de filas.</p>
`},
{t:"financiero", s:PG + " · II. De presupuesto a realidad", h:`
<ol start="13">
<li><b>Real frente a presupuesto:</b> separar con medidas el escenario 1 (real) y el 2 (presupuesto), que antes se sumaban, y una medida de variación.</li>
<li><b>Cascada estándar</b> que muestra cómo se pasa del presupuesto inicial al resultado real, ordenando las medidas.</li>
<li><b>Personalizar encabezados de la cascada</b> con <code>SWITCH</code> y <code>SELECTEDVALUE</code>: nueva tabla con los encabezados a mostrar, unida a la de encabezados (orden).</li>
<li><b>Ajuste de medidas:</b> ordenar la columna Encabezado por Orden; no incluir Beneficio neto como barra porque el <b>Total</b> de la cascada ya es el beneficio neto.</li>
<li><b>Gráfico de cascada:</b> mostrar en negativo los conceptos que restan y omitir encabezados redundantes (Ingresos y Ventas netas con el mismo valor). Medida renombrada a <i>Beneficio neto cascada</i>.</li>
</ol>
`},
/* ---------------- Balance ---------------- */
{t:"financiero", s:BF, h:`
<h4>Tablas</h4>
<p>Dimensión de cuentas, tipo de asiento (apertura, diario, cierre), calendario, dimensión de balance y diario (hechos).</p>
<ul>
<li><b>dCuentas:</b> a partir del identificador y la descripción, extraer los 4 primeros dígitos, añadir el id de empresa, combinar columnas con separador para el código y crear <i>Subcontable</i> = código + descripción.</li>
<li><b>Dimensión Balance</b> (balance abreviado de PYME): Activo (no corriente con 8 partidas, corriente) y Pasivo (patrimonio neto, pasivo no corriente, pasivo corriente). Niveles 1 a 4 con columnas <i>OrdenNivel</i> y <b>Ordenar por columna</b> en cada nivel; jerarquía <b>BS Jerarquía</b>.</li>
</ul>
<h4>Sumas y saldos</h4>
<p>Comprobación de que todo cuadra: <b>Total Debe − Total Haber = 0</b>. Medidas Debe, Haber y Saldo (decimal con separador de miles) en una tabla <b>Medidas financieras</b>, y <b>Saldo acumulado</b> para la foto a una fecha (fin de año, trimestre o mes).</p>
<h4>Libro mayor y detalle de asiento</h4>
<p>Página <b>Libro mayor</b> (año, fecha, IdAsiento, subcuenta, descripción, debe, haber, saldo) con <b>obtención de detalles</b> por subcuenta (aparece el botón Atrás) y una etiqueta que explica lo que se ve. Página <b>Detalle asiento</b> con obtención de detalles por IdAsiento. Ocultar todas las páginas menos Sumas y saldos.</p>
<pre><code>IdAsiento = SELECTCOLUMNS (
    fDiario,
    "IdAsiento", fDiario[IdAsiento],
    "Concepto", fDiario[Concepto],
    "sCPGC", fDiario[sCPGC],
    "Documento", fDiario[Documento],
    "IdEmpresa", fDiario[IdEmpresa]
)</code></pre>
<h4>Balance de situación</h4>
<ul>
<li><b>Vertical:</b> medida BS sobre la jerarquía; para bajar del cuarto nivel se añade Subcontable a filas.</li>
<li><b>Horizontal:</b> medidas Activo y Pasivo (el pasivo sin signo negativo) y BS = Activo − Pasivo.</li>
<li><b>Balance del año anterior</b>, comprobando cuándo empiezan los datos para no comparar contra periodos vacíos; activo del año anterior.</li>
<li>Visualización del balance y <b>KPI financieros</b>: activo no corriente, activo corriente, pasivo corriente, patrimonio neto y porcentaje sobre el BS.</li>
<li>Tip: si salen partidas en blanco, revisarlo y corregirlo en el Excel de origen.</li>
</ul>
`},
/* ---------------- Informes Financieros ---------------- */
{t:"financiero", s:IF + " · 01-04. Modelo", h:`
<h4>Qué debe responder el informe</h4>
<ol>
<li>Estructura del balance: económica (activo) y financiera (pasivo).</li>
<li>Cuenta de PyG: ventas y consumos, margen bruto, resultado de explotación, resultado financiero, impuestos, resultado neto, EBITDA, frente a presupuesto y proyectada.</li>
<li>Liquidez (corto plazo) y solvencia (largo plazo); fondo de maniobra frente a NOF.</li>
<li>Rentabilidad financiera (ROE) y económica (ROA).</li>
<li>Cash flow: FEAE, FEAI, FEAF y flujo libre de caja.</li>
</ol>
<p><b>Datos necesarios:</b> libro diario, ajustes de resultado, presupuestos por empresa, maestro de empresas, de cuentas contables, de la jerarquía de informes (Balance, PyG, Cash Flow), de partners y calendario. Se planifica con un <b>bus dimensional</b>.</p>
<h4>Dimensiones (Power Query)</h4>
<ul>
<li>Cargar dimBalance, dimPyG y dimCF; parámetro <b>Ruta</b> y origen como <code>Ruta &amp; "archivo.xlsx"</code>; grupos de consultas.</li>
<li>dimEmpresas y dimOrígenes con <b>Especificar datos</b>; dimPartners combinando id empresa e id partner.</li>
<li>Diarios y presupuestos de las tres empresas (Debe y Haber como <b>decimal fijo</b>); <b>DiariosAnexados</b> con columna de origen y el <b>diario de ajustes</b> anexado.</li>
<li><b>Cuentas sin clasificar</b> (grupo Check List): referenciar los diarios, extraer los 4 primeros dígitos, quitar duplicados (129) y combinación <b>anti izquierda</b> contra dimBalance para ver qué cuentas no están en el Plan General Contable. Soluciones: añadirlas a la dimensión (vale para una empresa) o una tabla de <b>reclasificación de cuentas 4D</b> (Especificar datos) que asigna a cada una su cuenta del PGC. Si la consulta queda vacía, todo está clasificado; si aparece una nueva, se añade.</li>
<li><b>dimCuentasContables:</b> valores únicos de cuenta, nombre e id empresa; claves combinadas; Cuenta4D con la reclasificación prevaleciendo (columna condicional); nombre desde dimBalance.</li>
<li>Parámetros <b>Ejercicio inicial</b> y <b>final</b> calculados desde las fechas de los asientos (para el calendario y para identificar el asiento de apertura del primer año). Calendario desde código M guardado.</li>
</ul>
<h4>Hechos</h4>
<ul>
<li><b>FactDiario:</b> clave id empresa + cuenta para traer la Cuenta4D, año, id de asiento (empresa + año + asiento), id partner condicional (null si no hay). Tipos de asiento: quedarse con 0 (apertura, solo del ejercicio inicial) y 1 (normales); quitar 2 y 3; filtrar la combinación «0_SI» de forma que solo quede la apertura inicial. Índice <b>id Apunte</b>.</li>
<li><b>DimApuntes</b> (dimensión degenerada) duplicando FactDiario con id apunte, id asiento, apunte, tipo y concepto; quitar esas columnas de los hechos.</li>
<li><b>FactPresupuesto</b> (solo PyG) anexando los presupuestos y trayendo la Cuenta4D.</li>
<li>Deshabilitar la carga de las consultas intermedias y añadir una tabla con la <b>fecha de última actualización</b>.</li>
</ul>
<h4>Relaciones</h4>
<p>Modelo en <b>constelación</b> (dos estrellas: diario y presupuesto). Borrar las relaciones autodetectadas y crearlas según el bus dimensional; FactDiario se relaciona con dimBalance, dimCF y dimPyG por <b>Cuenta4D</b>. Una pestaña de diagrama por estrella («Agregar tablas relacionadas»), calendario marcado como tabla de fechas, columnas numéricas en «No resumir».</p>
`},
{t:"financiero", s:IF + " · 05-08. Medidas, check list y detalle", h:`
<ul>
<li><b>Ordenar columnas:</b> en dimBalance Nivel1-4 por OrdenNivel1-4; dimPyG Nivel1-3; dimCF Nivel1-2.</li>
<li>Tabla de medidas (Introducir datos) con <b>Debe</b>, <b>Haber</b>, <b>Saldo</b> y <b>Saldo acumulado</b>, formato euro con dos decimales, en carpeta <i>Saldos</i>.</li>
<li><b>Balance de sumas y saldos</b> (07) con el saldo acumulado a la fecha.</li>
<li><b>Balance evolución</b> (10): parámetro de campo para ver en la matriz el valor de las partidas y el % vertical en cada momento temporal.</li>
<li><b>Check List</b>: página que controla cuentas sin correspondencia a 4 dígitos en el PGC y <b>asientos descuadrados</b> (filtro Saldo «no es 0»; editar interacciones para que el gráfico de origen no filtre al otro).</li>
<li><b>Libro mayor</b> con saldo acumulado en la ficha de una cuenta y <b>detalle de asiento</b> con medida del asiento seleccionado (quitar «mantener todos los filtros» en la obtención de detalles).</li>
</ul>
`},
{t:"financiero", s:IF + " · 09-13. Balance y PyG", h:`
<h4>Balance</h4>
<ul>
<li>Medida de balance, <b>análisis vertical</b> (% sobre el total del balance) y <b>horizontal</b> (variación frente al periodo previo).</li>
<li><b>Saldo del balance justo antes del inicio del periodo seleccionado</b>, % de variación horizontal, medidas para situaciones atípicas y % vertical del balance previo.</li>
<li>Formato condicional en la variación y filtro de origen = Contabilidad.</li>
<li>Gráficos: columna condicional con nombres resumidos para que se lean las etiquetas; gráfico temporal del balance.</li>
</ul>
<h4>Cuenta de PyG</h4>
<ul>
<li>Medidas para los grupos <b>6 y 7</b> (gastos e ingresos), % vertical y análisis horizontal.</li>
<li>Gráfico de líneas, acumulado anual hasta la fecha y KPI: <b>EBITDA</b> (beneficio antes de intereses, impuestos, depreciaciones y amortizaciones) y <b>BAI</b> (beneficio antes de impuestos).</li>
<li>Página de evolución de la PyG con segmentador de origen y <b>parámetros</b> para elegir la medida del gráfico.</li>
<li><b>PyG frente a presupuesto:</b> presupuesto, % vertical del presupuesto, desviación real − presupuesto y % de desviación, con parámetro de campo.</li>
<li><b>PyG proyectada</b> (cuando la empresa trabaja con presupuestos): tabla con la <b>fecha de cierre contable</b>; hasta esa fecha se usa el real y después el presupuesto, comprobando que coinciden hasta el cierre.</li>
</ul>
`},
{t:"financiero", s:IF + " · 14-15. Cash flow y ratios", h:`
<p><b>Cash flow:</b> informe de los flujos de entrada y salida de tesorería, construido duplicando la hoja de Balance y usando dimCF.</p>
<table class="dxtbl"><thead><tr><th>Ratio</th><th>Cálculo</th></tr></thead><tbody>
<tr><td>Test ácido</td><td>(Activo corriente − existencias − ANCMV) / Pasivo corriente</td></tr>
<tr><td>Solvencia</td><td>Relación entre activo y pasivo exigible (incluye pasivo no corriente)</td></tr>
<tr><td>Fondo de maniobra (FM)</td><td>(Patrimonio neto + Pasivo no corriente) − Activo no corriente</td></tr>
<tr><td>NOF</td><td>Existencias + Deudores comerciales − Acreedores comerciales</td></tr>
<tr><td>ROE (rentabilidad financiera)</td><td>Resultado neto / Patrimonio neto (medio, con el balance previo), en %</td></tr>
<tr><td>ROA (rentabilidad económica)</td><td>Resultado de explotación / Activo total, en %</td></tr>
<tr><td>Free cash flow</td><td>FEAE (explotación) + FEAI (inversión)</td></tr>
</tbody></table>
<p>Las partidas se localizan por su código en los niveles de la dimensión de balance (por ejemplo ANCMV, activo no corriente mantenido para la venta, código 7). Se construyen también los ratios del año anterior para comparar.</p>
`},
{t:"financiero", s:IF + " · Extra: conexión a ERP (Odoo y Sage 200)", h:`
<h4>Odoo</h4>
<ol>
<li>Cargar las tablas exportadas y crear el parámetro <b>Ruta</b>.</li>
<li>dimEmpresa (id y nombre), dimPartner (id y name).</li>
<li>Subcuentas contables (code, name, id) con columna combinada y Cuenta 4D (4 primeros caracteres).</li>
<li>account_move (estado publicado o borrador; carga deshabilitada) combinada con <b>account_move_line</b> (name, debit, credit, account_id, move_id, ref, date, company_id, partner_id) para quedarse con los asientos publicados; traer la subcuenta de 6 dígitos y extraer la cuenta 4D; Concepto = name + ref.</li>
</ol>
<h4>Sage 200</h4>
<ul>
<li>Tablas y campos a importar frente a los del modelo financiero (los derivados se construyen en Power Query).</li>
<li>Debe y Haber a partir de <i>CargoAbono</i> e <i>ImporteAsiento</i> con columnas condicionales (decimal fijo).</li>
<li>Claves id empresa + subcuenta y ejercicio + empresa + asiento; cuenta 4D como entero.</li>
<li><b>Número de periodo</b>: 0 apertura, 1-12 meses, 98 regularización de PyG y 99 cierre de balance. Quitar 98 y 99 y dejar solo la apertura del año inicial.</li>
</ul>
`}
);
EXAM.push(
{k:"Financiero", t:"financiero", s:BF, q:"¿Cómo compruebas en Power BI que la contabilidad cuadra?", a:"Con un informe de sumas y saldos: Total Debe − Total Haber debe ser 0."},
{k:"Financiero", t:"financiero", s:IF, q:"¿Cómo detectas cuentas contables del diario que no están en el Plan General Contable?", a:"Extrayendo los 4 primeros dígitos, quitando duplicados y haciendo una combinación anti izquierda contra la dimensión de balance; lo que queda está sin clasificar."},
{k:"Financiero", t:"financiero", s:PG, q:"¿Cómo haces que una medida de PyG sume ingresos y reste gastos?", a:"Con una columna Signo (1 o −1) en la dimensión de cuentas y SUMX(PyG, PyG[Importe] * RELATED(Cuentas[Signo]))."},
{k:"Financiero", t:"financiero", s:IF, q:"En Sage 200, ¿qué significan los periodos 0, 98 y 99?", a:"0 es el asiento de apertura, 98 la regularización de la PyG y 99 el cierre de balance; 1 a 12 son los meses."}
);
})();
