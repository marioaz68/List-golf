-- Migración: consolidar polígonos OB per-hoyo a hole_number = 0
-- Fecha: 2026-06-16
-- USAR CON PRECAUCIÓN: revisar el SELECT de inspección antes de ejecutar

-- 1) Inspección: listar OB por hoyo
-- SELECT id, course_id, hole_number, kind, sort_order FROM course_hole_polygons
-- WHERE course_id = '<<COURSE_ID>>' AND kind = 'ob' ORDER BY hole_number, sort_order;

-- 2) Respaldo rápido en tabla de backup (si NO existe ya)
CREATE TABLE IF NOT EXISTS course_hole_polygons_ob_backup AS
SELECT now() AS backed_at, *
FROM course_hole_polygons
WHERE course_id = '<<COURSE_ID>>' AND kind = 'ob';

-- 3) Consolidar: copiar todos los polígonos OB de hoyos 1..18 a hole_number = 0
BEGIN;

WITH sel AS (
  SELECT geojson, hole_number, sort_order
  FROM course_hole_polygons
  WHERE course_id = '<<COURSE_ID>>' AND kind = 'ob' AND hole_number BETWEEN 1 AND 18
  ORDER BY hole_number, sort_order
),
numbered AS (
  SELECT geojson, row_number() OVER (ORDER BY hole_number, sort_order) - 1 AS new_sort
  FROM sel
)
INSERT INTO course_hole_polygons (course_id, hole_number, kind, sort_order, geojson, updated_at)
SELECT '<<COURSE_ID>>', 0, 'ob', new_sort, geojson, now()
FROM numbered;

-- 4) Borrar los polígonos OB antiguos por hoyo
DELETE FROM course_hole_polygons
WHERE course_id = '<<COURSE_ID>>' AND kind = 'ob' AND hole_number BETWEEN 1 AND 18;

COMMIT;

-- 5) Verificación final
-- SELECT id, course_id, hole_number, kind, sort_order FROM course_hole_polygons
-- WHERE course_id = '<<COURSE_ID>>' AND kind = 'ob' ORDER BY hole_number, sort_order;
