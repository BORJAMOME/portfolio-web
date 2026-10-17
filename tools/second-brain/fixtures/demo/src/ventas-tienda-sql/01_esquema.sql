CREATE TABLE dim_producto (id INT PRIMARY KEY, nombre TEXT, categoria TEXT);
CREATE TABLE dim_cliente (id INT PRIMARY KEY, ciudad TEXT);
CREATE TABLE fact_pedidos (id INT PRIMARY KEY, producto_id INT REFERENCES dim_producto(id), cliente_id INT REFERENCES dim_cliente(id), fecha DATE, importe NUMERIC);
