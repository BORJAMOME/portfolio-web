SELECT COUNT(*) FILTER (WHERE importe IS NULL) AS importes_nulos, COALESCE(MAX(importe), 0) AS maximo FROM fact_pedidos;
