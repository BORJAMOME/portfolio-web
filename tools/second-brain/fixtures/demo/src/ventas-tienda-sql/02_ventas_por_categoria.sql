WITH ventas AS (
  SELECT p.categoria, DATE_TRUNC('month', f.fecha) AS mes, SUM(f.importe) AS ingresos
  FROM fact_pedidos f
  INNER JOIN dim_producto p ON p.id = f.producto_id
  GROUP BY p.categoria, DATE_TRUNC('month', f.fecha)
)
SELECT categoria, mes, ingresos,
       LAG(ingresos) OVER (PARTITION BY categoria ORDER BY mes) AS mes_anterior,
       RANK() OVER (PARTITION BY mes ORDER BY ingresos DESC) AS puesto
FROM ventas;
