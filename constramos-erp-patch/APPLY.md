# Patch: Run · Alta de listas de precios al ERP

Cursor está abierto en `golf-torneo`; estos archivos hay que copiarlos al Cotizador Constramos.

## Destino

```
…/Cotizador Constramos/proyecto/
```

## Copiar

```bash
SRC="…/golf-torneo/constramos-erp-patch"
DST="…/Cotizador Constramos/proyecto"

cp "$SRC/api/erp/guardar-precios.php" "$DST/deploy-erp/api/erp/guardar-precios.php"
cp "$SRC/app/Productos.jsx" "$DST/app-cotizador/app/Productos.jsx"
```

## Config opcional (`deploy-erp/api/config.php`)

```php
define('ERP_SALESTYPE_N1', 'N1');  // o el typeabbrev real en salestypes
define('ERP_SALESTYPE_N2', 'N2');
define('ERP_SALESTYPE_N3', 'N3');
define('ERP_PRICE_CURR', 'MXN');
```

Si no defines las constantes, el endpoint intenta detectar listas por nombre (`Lista 1`, `N1`, etc.) y si no hay, crea `N1`/`N2`/`N3` en `salestypes`.

## Uso en el cotizador

1. Login admin → **Configuración → Precios de productos**
2. **Simular** (dry run) o **▶ Run · Subir listas al ERP**
3. Solo precios de venta; no sube costos APU

## Mejor (evitar este patch)

Abre la carpeta **Cotizador Constramos** como workspace en Cursor y pide aplicar el mismo cambio ahí.
