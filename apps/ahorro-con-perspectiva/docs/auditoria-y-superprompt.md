# Ahorro con perspectiva
## Auditoría y superprompt aplicado

Revisión del informe funcional y del código de la versión 4. Fecha de revisión del catálogo original: 7 de noviembre de 2026.

### Diagnóstico

El producto ya conectaba presupuesto, educación y ofertas bancarias. Su mayor oportunidad era explicar qué decisión cambia el ahorro y en cuánto. El informe también reproducía una hipótesis de rentabilidad del depósito sin aviso y un posible borrado de presupuesto tras una restauración fallida. Ambos problemas tienen más impacto que cualquier mejora estética.

| Prioridad | Hallazgo | Intervención |
|---|---|---|
| Crítica | La restauración podía sobrescribir una copia rechazada | Validación antes de asignar, bloqueo de escritura y descarga de rescate |
| Alta | Límites distintos al crear e importar | Límite común de 100 gastos y 30 ingresos |
| Alta | Tipo supuesto sobre el saldo líquido del depósito sin marca | Señal de incertidumbre cuando existe saldo líquido remunerado o vence el depósito |
| Alta | Ranking difícil de interpretar al salir | Métricas de abonado, devengado y salida con devolución bruta aproximada |
| Alta | Presupuesto educativo sin una práctica conectada | Experimento reversible con recorte flexible, subida y reparto del incremento |
| Media | Gráficos sin lectura cruzada suficiente | Cascada, barras, líneas, columnas y tablas de respaldo |
| Media | Copia parcial | Proyecto JSON v2 con comparador y laboratorio, compatible con v1 |
| Media | El ahorro cero podía ocultar un margen insuficiente | Aviso con importe que falta para el margen |
| Media | El manual enseñaba conceptos sueltos | Diez capítulos con una acción y un ejemplo calculado |
| Siguiente fase | Calendario, fiscalidad y condiciones bancarias aproximadas | Validación contractual y calendario de cobros como proyectos separados |

La aportación periódica y la rentabilidad bancaria deben leerse en euros distintos. Reducir 25 euros mensuales de forma sostenible libera 300 euros al año. Una prima puede aportar efectivo adicional, pero exige leer requisitos, abonos y compromisos. La vista de salida muestra una estimación bruta de devolución. El catálogo conserva su fecha original y necesita contraste antes de contratar.

### Diseño de la decisión

| Pregunta | Recurso |
|---|---|
| ¿A dónde va mi nómina? | Cascada con conciliación entre ingresos, gastos, ahorro y margen |
| ¿Qué partidas pesan más? | Barras con filtro de esenciales, flexibles y no mensuales |
| ¿Qué cambia un recorte o una subida? | Líneas de base, plan actual y experimento, con datos por mes |
| ¿Cuánto aportaría cada año? | Columnas agrupadas por escenario |
| ¿Cuánto tardaría y qué pasa con una avería? | Objetivo en euros y prueba de un gasto único |
| ¿Qué añade realmente una cuenta? | Beneficio ordenable y tabla con intereses, incentivos y tres métricas |
| ¿Cómo se construye el colchón? | Fichas planas y bloques en perspectiva opcionales |

### Superprompt

Trabaja como equipo de consultoría financiera, diseño editorial y desarrollo frontend. Usa el informe de la versión 4 como mapa de riesgos y confirma cada problema en el código. Entrega un manual de ahorro conectado al presupuesto y un laboratorio de decisiones que el usuario pueda utilizar con sus datos.

1. Conserva el sitio privado, el presupuesto base y los escenarios previos. Usa los motores existentes para ingresos, gastos, aportaciones, intereses e incentivos.
2. Prioriza integridad. Valida el proyecto completo antes de restaurarlo. Protege el original rechazado, permite descargarlo y exige una acción explícita de recuperación. Unifica los límites de creación y restauración. Acepta copias v1 y exporta v2 con los ajustes del laboratorio y el comparador.
3. Corrige el indicador de tipo supuesto del depósito. Separa efectivo abonado, estimación neta devengada y salida tras devolución bruta. Explica los límites de la retención simulada y conserva la fecha original del catálogo.
4. Construye un laboratorio sobre el presupuesto actual. Recorta únicamente partidas no esenciales activas y permite destinar una fracción de una subida neta al ahorro. Mantén el margen, señala déficit e incluye un objetivo y un imprevisto. El botón Aplicar debe poder deshacerse. Trata los ingresos variables como supuestos opcionales.
5. Diseña una cascada, barras, líneas y columnas con escala y unidades visibles. Incluye tablas para leer las cifras exactas, filtros de gastos, buscador de ofertas, horizonte y métrica bancaria. Usa perspectiva CSS solo para ilustrar hitos del colchón y deja disponible la lectura plana.
6. Escribe diez capítulos originales. Presupuesto, preahorro, sobres, provisiones, colchón, hábitos, subidas, cuentas, deuda y objetivos. Cada capítulo debe incluir una explicación, un ejemplo conectado al modelo, una acción y su alcance. Marca capítulos voluntariamente y guarda el progreso local.
7. Usa crema, verde bosque, amarillo como subrayado, Bricolage en grandes titulares e Inter para lectura. Comprueba que los datos y los controles funcionen en ancho estrecho.
8. Prueba la continuidad con copias existentes y escenarios adversos. Con 1.600 euros de ingresos, 1.130 de gastos y 70 de margen, el plan base debe ahorrar 400. Un recorte del 20 % sobre 100 euros de ocio y el ahorro del 50 % de una subida de 100 deben producir 470 euros al mes, 840 euros más al año y 120 de margen.
9. Conserva la audiencia privada. Publica el paquete validado y documenta la versión, el alcance de las pruebas y los límites que requieren trabajo posterior.

### Fuentes educativas

- [Finanzas para Todos · Cómo elaborar un presupuesto](https://www.finanzasparatodos.es/como-elaborar-un-presupuesto)
- [Finanzas para Todos · Herramientas de ahorro y objetivos](https://www.finanzasparatodos.es/herramientas/)
- [Banco de España · Gestión de finanzas personales](https://www.bde.es/f/webbe/INF/MenuHorizontal/AreasActuacion/conducta/ficheros/Sesion4Gestionfinanzaspersonales.pdf)
- [CFPB · Fondo de emergencia y automatización](https://www.consumerfinance.gov/an-essential-guide-to-building-an-emergency-fund/)
- [CFPB · Estrategias para reducir deuda](https://www.consumerfinance.gov/archive/blog/how-reduce-your-debt/)
- [Banco de España · TAE de un depósito](https://clientebancario.bde.es/pcb/es/menu-horizontal/podemosayudarte/tiposinteres/guia_textual/latae/tae_deposito.html)
