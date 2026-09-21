---
titulo: F&B - restaurante, pedidos y cobros
modulo: fb-restaurante
actualizado: 2026-08-27
tags: [modulo, golf-torneo]
---

# F&B - restaurante, pedidos y cobros

## Que resuelve
El jugador en el hoyo 7 quiere una cerveza y no quiere caminar al club. El caddie pide un sandwich. El socio en la mesa 3 quiere pedir sin esperar al mesero. El residente del fraccionamiento quiere que le lleven la comida a su casa. Este modulo convierte todo eso en comandas que llegan a la cocina del Hoyo 6 o a un carrito bar, con la ubicacion GPS del cliente para que el carrito lo encuentre, y cierra el cobro (efectivo, cargo a socio o tarjeta via Stripe) sin que nadie apunte en papel. Es casi un POS de restaurante pegado al sistema de torneos.

## Mapa de archivos
| Ruta | Que hace | Lineas |
|---|---|---|
| lib/fb/orderActions.ts | Server actions de toda la maquina de estados del pedido + pedido manual en nombre del cliente | 410 |
| lib/fb/stripePayments.ts | Crea Checkout (prepago / cierre de cuenta) y aplica el `checkout.session.completed` | 390 |
| lib/fb/stockMovements.ts | Decremento y reversion idempotente de inventario | 154 |
| lib/fb/tableActions.ts | POS de mesa: comanda del mesero, aprobar/rechazar QR, cobrar mesa con propina | 279 |
| app/api/captura/fb-order/route.ts | POST crea pedido desde la PWA/Mini App (precios, auto-redireccion, prepago) + GET cuenta | 472 |
| lib/fb/loadOrders.ts | Carga pedidos para cocina/carrito con cliente, grupo, GPS en vivo y ETA | 431 |
| app/captura/menu/MenuClient.tsx | Vista cliente: venue, menu, favoritos, carrito, confirmar/aceptar/disputar | 1219 |
| app/(backoffice)/fb-admin/FbAdminClient.tsx | Editor de venues, categorias e items del menu | 1029 |
| app/(backoffice)/fb-mesero/[tableCode]/MesaCliente.tsx | Pantalla POS de una mesa (comanda, propina, split, socio) | 712 |
| lib/fb/userScope.ts | Que venues ve cada usuario (`allowedVenueIds`, `isOwner`) | 63 |
| app/api/mesa/order/route.ts | Endpoint publico del QR de mesa (anti-abuso incluido) | 201 |
| app/api/stripe/webhook/route.ts | Verifica firma y despacha a `fulfillStripeCheckoutSession` | 57 |
| app/(backoffice)/fb-cocina/CocinaClient.tsx | Kanban de cocina; define las transiciones que existen en UI | 406 |
| app/captura/carrito/CarritoOperadorClient.tsx | Mini App del operador del carrito bar (cola + stock) | 716 |
| app/(backoffice)/fb-cuentas/page.tsx + CuentasClient.tsx | Caja: cuentas abiertas por cliente y cierre de cobro | 246 + 543 |
| app/(backoffice)/fb-reportes/page.tsx | Corte por rango de fechas (solo owner) | 248 |
| app/api/fb-reportes/export/route.ts | Exporta el corte a .xlsx con ExcelJS | 227 |
| app/(backoffice)/fb-disputas/page.tsx + DisputasClient.tsx | Comite resuelve disputas (cargar o cancelar) | 252 + 348 |
| app/(backoffice)/fb-inventario/page.tsx + InventarioClient.tsx | Manager: stock por venue con alertas | 149 + 485 |
| app/api/captura/cart-stock/route.ts | GET/POST del stock del carrito (set/inc/dec/remove) | ~160 |
| app/api/captura/fb-favorites/route.ts | Favoritos = historial + pinned - hidden | 221 |
| app/(backoffice)/fb-fraccionamiento/page.tsx | Alta/edicion de residentes (`players.is_resident`) | 46 |
| app/restaurante/page.tsx | Pagina publica del negocio (requisito de Stripe) | 243 |
| lib/fb/actions.ts | CRUD de menu + subida de fotos al bucket | 344 |
| lib/fb/queries.ts, lib/fb/types.ts, lib/fb/icons.ts | Lecturas, tipos/`formatPrice`, emojis por keyword | 132/164/258 |

## Tablas de Supabase
| Tabla | Para que se usa | En migraciones? |
|---|---|---|
| fb_venues | Puntos de venta: `h6` restaurante, `cart_front`, `cart_back`, `cart_fracc` | 20260605140000_fb_module.sql (+ cart_fracc en 20260610120000) |
| fb_categories | Categorias del menu | 20260605140000_fb_module.sql |
| fb_menu_items | Catalogo; `available_venue_ids` decide donde se sirve; `display_emoji` | 20260605140000 + 20260605240000_fb_display_emoji.sql |
| fb_orders | Pedido: estado, cliente, venue, totales, pagos, disputa, stock | 20260605140000 + 10 migraciones ALTER |
| fb_order_items | Lineas con snapshot de nombre y precio unitario | 20260605140000_fb_module.sql |
| fb_venue_stock | Inventario por venue (sin fila = infinito) | 20260607300000_fb_venue_stock.sql |
| fb_user_venues | Scope de venues por usuario; `is_owner` = ve todo + reportes | 20260607260000_fb_user_venues.sql |
| fb_tables | Mesas del restaurante; `code` unico por venue; seed de 14 mesas | 20260608100000_fb_tables_house_accounts.sql |
| fb_house_accounts | Cuentas de socio para cargar la cuenta de mesa | 20260608100000_fb_tables_house_accounts.sql |
| fb_favorite_actions | `pinned` / `hidden` manuales del cliente sobre el menu | 20260607200000_fb_favorite_actions.sql |
| fb_deposit_accounts | Cuentas destino del cobro (banco/Stripe/efectivo), una `is_default` | 20260610130000_fb_deposit_accounts.sql |
| fb_business_profile | Singleton con los datos publicos de /restaurante | 20260610170000_fb_business_profile.sql |
| players (`is_resident`, `address`) | Cliente del fraccionamiento y domicilio de entrega | 20260610140000_players_resident_fields.sql |
| storage bucket `fb-menu-photos` | Fotos del menu, path `{item_id}.{ext}`, publico | 20260605260000_fb_menu_photos_bucket.sql |

Nada de F&B usa RLS para lectura/escritura real: todas las rutas y actions usan `createAdminClient()` (service_role). Las unicas policies abiertas son SELECT de menu/venues/categorias/mesas/cuentas de socio (supabase/migrations/20260605140000_fb_module.sql:180-198, 20260608100000_fb_tables_house_accounts.sql:38-40).

## Reglas de negocio
1. Todo precio se guarda en CENTAVOS enteros; la UI divide entre 100 y muestra sin decimales con `formatPrice` (lib/fb/types.ts:127-133). `upsertMenuItem` rechaza precios no enteros o negativos (lib/fb/actions.ts:152-158).
2. El servidor NUNCA confia en el precio que manda el cliente: relee `price_cents` de `fb_menu_items` y recalcula el total (app/api/captura/fb-order/route.ts:250-304, lib/fb/tableActions.ts:70-116, app/api/mesa/order/route.ts:111-161).
3. Un item solo se puede pedir si su `available_venue_ids` incluye el venue elegido por el cliente; si no, error 400 (app/api/captura/fb-order/route.ts:296-301).
4. Estados validos de `fb_orders.status`: `pending_payment`, `pending`, `accepted`, `preparing`, `ready`, `awaiting_cart_pickup`, `on_the_way`, `pending_acceptance`, `delivered`, `paid`, `disputed`, `cancelled` (lib/fb/types.ts:77-89; CHECK final en supabase/migrations/20260610160000_fb_stripe_payments.sql:10-25).
5. `delivery_type` = `pickup` (recoger en Hoyo 6), `on_course` (carrito al hoyo), `dine_in` (mesa), `home` (domicilio en el fraccionamiento) (lib/fb/types.ts:48; CHECK en 20260610120000_fb_fraccionamiento_delivery.sql:23-25).
6. PREPAGO OBLIGATORIO: `pickup` y `home` nacen en `pending_payment` y solo entran a cocina cuando Stripe confirma; `on_course` y `dine_in` van a cuenta y se cobran despues (lib/fb/prepayRequired.ts:4-6, app/api/captura/fb-order/route.ts:315-328).
7. "Entregado" lo declara el restaurante pero NO cobra: `markOrderDelivered` escribe `pending_acceptance`, no `delivered` (lib/fb/orderActions.ts:96-98). Solo el cliente pasa a `delivered` desde su Mini App (lib/fb/orderActions.ts:103-110).
8. El cliente solo puede aceptar/disputar SU pedido y solo si esta en `pending_acceptance`; si no, 403 o 409 (app/api/captura/fb-order/accept/route.ts:74-89).
9. La "cuenta abierta" del cliente suma unicamente pedidos `delivered` del torneo actual: en proceso, `pending_acceptance` y `disputed` no suman (app/api/captura/fb-order/route.ts:451-462).
10. El decremento de inventario ocurre exactamente una vez por pedido, controlado por `fb_orders.stock_decremented_at`: si ya tiene valor, `applyStockDecrement` no hace nada (lib/fb/stockMovements.ts:68-70) y siempre lo estampa al final aunque haya descontado 0 lineas (lib/fb/stockMovements.ts:102-106).
11. Item sin fila en `fb_venue_stock` para ese venue = stock infinito, no se descuenta (lib/fb/stockMovements.ts:87). Borrar la fila desde `cart-stock` con `action:"remove"` devuelve el item a infinito (app/api/captura/cart-stock/route.ts:112-121).
12. El stock nunca baja de 0 (`Math.max(0, ...)`, lib/fb/stockMovements.ts:88) ni sube por reversion si no habia fila (lib/fb/stockMovements.ts:138). Cancelar devuelve el stock y pone `stock_decremented_at = null` (lib/fb/stockMovements.ts:148-151, orderActions.ts:362-375).
13. AUTO-REDIRECCION POR INVENTARIO: si el venue es carrito y CUALQUIER item pedido tiene fila con `qty_available < qty`, TODO el pedido se manda al restaurante `h6`: `venue_id = h6`, `source_venue_id = carrito original`. Es transparente para el cliente (app/api/captura/fb-order/route.ts:196-248). La validacion de menu sigue usando el venue elegido por el cliente, no el efectivo (linea 293-301).
14. Pedido desde QR de mesa: nace `pending` con `requires_waiter_approval = true`, `source_channel = 'qr_table'`, `delivery_type = 'dine_in'`, sin cliente identificado mas que `diner_name` (app/api/mesa/order/route.ts:171-184). Limites anti-abuso: 30 items, $5,000 (500000 centavos) y 10 pedidos por aprobar por mesa (app/api/mesa/order/route.ts:19-21, 68-81, 163-168).
15. Comanda del mesero: nace directamente en `accepted` con `accepted_at` y `served_by_user_id`; cada envio a cocina es UNA fila nueva de `fb_orders` con el mismo `table_id` (lib/fb/tableActions.ts:121-140).
16. Aprobar/rechazar QR solo aplica si la fila sigue con `requires_waiter_approval = true` (guarda `.eq(...)` en lib/fb/tableActions.ts:176 y 199), asi dos meseros no la mueven dos veces.
17. Cobrar mesa (`payTableOrders`): marca `paid` TODAS las ordenes de la mesa que no esten `paid`/`cancelled`; la propina completa se guarda en la PRIMERA orden para no duplicarla, y `split_count` es solo display (no cambia totales) (lib/fb/tableActions.ts:209-278; comentario del schema en 20260608100000:90-91). Reparto por persona = `Math.ceil((subtotal+propina)/N)`, propina default 15% (app/(backoffice)/fb-mesero/[tableCode]/MesaCliente.tsx:485-498).
18. `house_account_id` solo se registra como etiqueta del cobro; `credit_limit_cents` existe en la tabla y en el tipo pero NADIE lo valida (lib/fb/tableActions.ts:246, lib/fb/types.ts:72).
19. Cierre de cuenta masivo: `markAllPaidForClient` solo mueve pedidos `delivered` del torneo indicado para ese entry/caddie (lib/fb/orderActions.ts:154-181). `unmarkOrderPaid` regresa a `delivered` y limpia `paid_*` pero NO revierte inventario (lib/fb/orderActions.ts:144-150).
20. Disputas: el cliente rechaza -> `disputed` con `disputed_reason`. El comite aprueba -> `delivered` (se cobra) o reembolsa -> `cancelled` + reversion de stock; ambos escriben `dispute_resolution` y `dispute_resolved_at` (lib/fb/orderActions.ts:380-410).
21. Stripe prepago: Checkout `mode: payment`, moneda `mxn`, una line_item por linea del pedido, `metadata.payment_kind = 'prepay'`, y solo si el pedido esta en `pending_payment` (lib/fb/stripePayments.ts:98-101, 114-158). Al confirmar, el pedido pasa a `pending` (entra a cocina) y guarda `paid_method = 'tarjeta_stripe'` (lib/fb/stripePayments.ts:276-301).
22. Stripe cierre de cuenta: `payment_kind = 'settle'` (un pedido `delivered`) o `settle_account` (todos los `delivered` del cliente en un solo line_item con el total sumado). Al confirmar cada pedido pasa `delivered -> paid` y se descuenta inventario (lib/fb/stripePayments.ts:102-107, 173-254, 336-358).
23. El webhook es idempotente por estado, no por event id: en `prepay` si ya esta `pending` responde ok sin tocar nada (lib/fb/stripePayments.ts:286-288); en `settle` salta los que ya estan `paid` (linea 343) y falla 500 si alguno no esta `delivered` (linea 344-346). Los UPDATE llevan `.eq("status", <esperado>)` para evitar carreras.
24. `stripe_checkout_session_id` tiene indice unico parcial; se escribe en el pedido (o en todos los del grupo) al crear la sesion (20260610160000:31-33, lib/fb/stripePayments.ts:164-167 y 248-251).
25. Si falta `STRIPE_SECRET_KEY`, `getStripe()` regresa null y el checkout responde error explicativo en lugar de romper (lib/stripe/server.ts:6-13, lib/fb/stripePayments.ts:79-84). Si falta `STRIPE_WEBHOOK_SECRET` el webhook responde 500 (app/api/stripe/webhook/route.ts:21-26). URLs de retorno se construyen con `NEXT_PUBLIC_APP_URL` o el fallback `https://www.listgolf.club` (lib/stripe/server.ts:19-24).
26. Se precarga `customer_email` con el correo del jugador para que Stripe Link no ofrezca una cuenta ajena guardada en el celular (lib/fb/stripePayments.ts:34-58; commit 7fc6db3).
27. Scope por venue: `super_admin`, `club_admin`, `tournament_director` y `restaurante` (manager) ven TODO y cuentan como owner; `mesero`/`cocinero`/`operador_carrito` ven solo los venues de `fb_user_venues`; sin filas = no ven nada (lib/fb/userScope.ts:26-62).
28. Reportes y exportacion son solo para owner: `/fb-reportes` redirige a `/fb-cocina` (app/(backoffice)/fb-reportes/page.tsx:90-92) y el export responde 403 (app/api/fb-reportes/export/route.ts:49-51). El rango se calcula en horario de Mexico fijo UTC-6 (`T00:00:00-06:00` a `T23:59:59-06:00`) y se ordena si vienen invertidos (page.tsx:78-96, export/route.ts:56-60).
29. Clasificacion del corte: `paid` = cobrado, `cancelled` = cancelado, `disputed` = en disputa, TODO lo demas = por cobrar (app/api/fb-reportes/export/route.ts:104-117).
30. Favoritos del cliente: maximo 8; historial de los ultimos 180 dias excluyendo `cancelled` y `disputed`; los `pinned` entran aunque nunca se hayan pedido (`times = 0`), los `hidden` se eliminan del set; orden = pinned primero, luego frecuencia desc, desempate por mas reciente (app/api/captura/fb-favorites/route.ts:22, 74-85, 137-151, 210-215). Un item tiene un solo action: pin borra hidden y viceversa (toggle/route.ts:76-93 + indices unicos en 20260607200000:29-36).
31. Emoji del item en cascada: foto `image_url` > `display_emoji` manual > `iconForMenuItem()` por keyword (primer match gana) > emoji de categoria > 🍽️ (lib/fb/icons.ts:1-13, 245-258).
32. Fotos del menu: maximo 4 MB, solo jpeg/png/webp/heic, path determinista `{item_id}.{ext}` que sobreescribe la anterior, y URL publica con `?t=<timestamp>` para romper cache (lib/fb/actions.ts:206-263).
33. Borrado de menu: `deleteMenuItem` se niega si el item aparece en `fb_order_items` historicos; hay que desactivarlo (lib/fb/actions.ts:324-339). Venues y categorias solo se desactivan (lib/fb/actions.ts:65-76, 118-129).
34. Pedido a domicilio: exige `delivery_address`; al crearlo se guarda ese domicilio en `players.address` y se marca `is_resident = true`, por eso el cliente aparece solo en `/fb-fraccionamiento` (app/api/captura/fb-order/route.ts:85-93, 374-392).
35. AJUSTE COPA RESERVA (regla de precio del club): la botella de vino reserva cuesta ~$500 al restaurante y se vende en $1,350 (mark-up x2.7); la copa se calculo como botella/4 = $337.50 redondeado a $350, pero el club decidio que no maneja premium fuerte y la copa quedo en **$200** con descripcion "precio club". La botella se mantuvo en $1,350 (supabase/migrations/20260605200000_fb_seed_ajustes_precios.sql:27-49 y 20260605210000_fb_ajuste_copa_reserva.sql:5-8). Ojo: la copa de vino de mesa normal es otra cosa, a $120.
36. Los seeds del menu son idempotentes por el indice unico `(category_id, name)` con `ON CONFLICT DO NOTHING`, para no pisar los cambios manuales del restaurante (supabase/migrations/20260605160000_fb_seed_mucho_menu.sql:4-15).
37. Bebidas transportables (refrescos, cervezas, destilados de 1 oz, snacks) van en los 3 venues; cocteles, vinos, cafe y te SOLO en `h6` por preparacion/temperatura (supabase/migrations/20260605180000_fb_seed_bebidas_snacks.sql:5-12). La migracion de fraccionamiento agrego `cart_fracc` a todo item que ya estaba en `h6` (20260610120000:56-68).
38. Cocina carga pedidos activos (`pending, accepted, preparing, ready, on_the_way`) o, si se pide `includeRecentCompleted`, TODOS los status pero solo de las ultimas 4 horas (lib/fb/loadOrders.ts:56-62, 114-120). Auto-refresh cada 10 s via `/api/fb-admin/orders` (app/api/fb-admin/orders/route.ts:17-27).
39. Estado de una mesa: `pending_approval` si hay algo del QR sin aprobar, si no `open` si hay pedidos en `pending..delivered`, si no `free` (lib/fb/loadTables.ts:29-36, 111-117). `/api/mesero/state` refresca el grid cada 15 s.
40. Clientes cercanos al carrito: pings de `ritmo_positions`, radio default 300 m, maximo 8 clientes, ping del cliente de <=30 min y del carrito de <=15 min, distancia por haversine (lib/fb/nearbyClients.ts:35-49, 61-79).
41. Al confirmar un pedido desde la Mini App se manda un ping GPS best-effort a `/api/captura/position` para que ritmo tenga la ubicacion real de quien pide; si el navegador niega permiso el pedido igual se crea (app/captura/menu/MenuClient.tsx:239-262, 271; commit 7d098fc).
42. Solo una `fb_deposit_accounts.is_default = true` a la vez: indice unico parcial en BD y `clearOtherDefaults()` antes de marcar (20260610130000:45-47, lib/fb/depositAccountActions.ts:43-54).
43. `fb_business_profile` es singleton: se lee con `limit(1)` y se guarda con update-si-existe / insert-si-no; `/restaurante` cae a `DEFAULT_BUSINESS_PROFILE` si la tabla esta vacia (lib/fb/businessProfileActions.ts:42-90, app/restaurante/page.tsx:45-47, lib/fb/businessProfile.ts:31-44).

## Flujos
### 1. Pedido del jugador en el campo (carrito bar)
1. Cliente abre `/captura/menu?me=<entry_id>` (o `?caddie=`, o `?u=<telegram_user_id>` que se resuelve a `player_id` en app/captura/menu/page.tsx:45-81).
2. `GET /api/captura/fb-menu?venue_id=` devuelve venues activos + menu agrupado filtrado por venue; `GET /api/captura/fb-favorites` pinta "Tus favoritos".
3. Confirmar -> ping GPS + `POST /api/captura/fb-order`: resuelve torneo/grupo, calcula `current_hole_at_order` con `smoothedHoleForGroup`, evalua auto-redireccion por stock, revalida precios, inserta `fb_orders` (`pending`) + `fb_order_items` (rollback manual si fallan las lineas, linea 358-369).
4. Cocina (`/fb-cocina`) o el operador (`/captura/carrito?venue=cart_front`) avanza `pending -> accepted -> preparing -> ready -> on_the_way` con las actions de lib/fb/orderActions.ts.
5. "Entregado" del staff -> `pending_acceptance`. El cliente ve el banner amarillo y acepta -> `delivered` + `applyStockDecrement`, o disputa -> `disputed`.
6. Al final de la ronda, caja (`/fb-cuentas`) cobra: `markOrderPaid` o `markAllPaidForClient` -> `paid`. Alternativa del cliente: `POST /api/captura/fb-order/checkout {pay_account:true}` y paga con tarjeta.

### 2. Prepago con tarjeta (pickup o domicilio)
1. `POST /api/captura/fb-order` con `delivery_type` `pickup`/`home` -> pedido en `pending_payment`, respuesta `needs_payment: true`.
2. El cliente es enviado a `POST /api/captura/fb-order/checkout {order_id}` -> `createCheckoutForOrder` valida propiedad y estado, crea la sesion, guarda `stripe_checkout_session_id` y redirige a Stripe.
3. Stripe cobra y llama `POST /api/stripe/webhook`; se verifica la firma con `STRIPE_WEBHOOK_SECRET` y se ignoran sesiones con `payment_status != 'paid'`.
4. `fulfillStripeCheckoutSession` pasa el pedido a `pending` (ya entra a cocina), guarda `paid_at`/`paid_method`/`stripe_payment_intent_id` y notifica al cliente por Telegram y al staff si hay `FB_STAFF_TELEGRAM_CHAT_ID` o `TELEGRAM_COMMITTEE_CHAT_ID` (lib/fb/notifyFbPayment.ts:90-107).
5. El navegador vuelve a `/captura/menu/pago-exitoso` (o `pago-cancelado`), que son paginas informativas: NO confirman nada, la verdad la escribe el webhook.

### 3. Mesa con QR
1. `/fb-admin/mesas-qr` imprime un QR por mesa apuntando a `<NEXT_PUBLIC_APP_URL>/mesa/<code>` (app/(backoffice)/fb-admin/mesas-qr/MesasQrClient.tsx:153).
2. El comensal abre `/mesa/[tableCode]` (publica, sin login), escribe su nombre y manda `POST /api/mesa/order` -> pedido `pending` con `requires_waiter_approval = true`.
3. El mesero lo ve en `/fb-mesero` (mesa en estado `pending_approval`) y en `/fb-mesero/[tableCode]` aprueba (`accepted`) o rechaza (`cancelled`).
4. La cocina prepara; el mesero puede seguir agregando comandas con `createWaiterOrder`.
5. Cobrar: `payTableOrders` marca todas las ordenes de la mesa como `paid` con propina, metodo, `house_account_id` y `split_count`, y aplica `applyStockDecrement` a cada una.

## Invariantes y trampas
- `stock_decremented_at` es la UNICA garantia contra doble descuento, y se estampa desde tres caminos (`clientAcceptDelivery`, `markOrderPaid`, `payTableOrders`, `fulfillStripeCheckoutSession`). Si agregas otro camino a `paid`/`delivered`, llama `applyStockDecrement`; si agregas otro camino a `cancelled`, llama `revertStockDecrement`. `markAllPaidForClient` NO lo llama (asume que ya se descontó al aceptar) y `unmarkOrderPaid` tampoco revierte.
- El CHECK de `status` esta `NOT VALID` desde supabase/migrations/20260607280000_fix_fb_orders_status_check.sql (la migracion de `paid` fallo con "is violated by some row"). Hay o hubo filas con status legacy fuera de la lista. Antes de correr `VALIDATE CONSTRAINT` revisa `SELECT DISTINCT status FROM fb_orders`. Igual con `fb_orders_delivery_type_check` y `fb_orders_has_client`.
- `fb_orders_has_client` acepta entry_id O caddie_id O table_id O player_id. Cualquier codigo nuevo que asuma "siempre hay entry_id" se rompe con pedidos de mesa (`diner_name`) y de residente.
- `fb_tables.code` es unico POR VENUE, pero `/api/mesa/order` busca la mesa con `.eq("code", code).maybeSingle()` (app/api/mesa/order/route.ts:51-56): si algun dia existen dos venues con la mesa "M1", ese `maybeSingle()` revienta. `/mesa/[tableCode]` y `/fb-mesero/[tableCode]` toman `[0]` del array, o sea la mesa "equivocada" silenciosamente.
- `/api/mesa/order` y `/api/captura/cart-stock` son PUBLICAS sin token (comentario explicito en app/api/captura/cart-stock/route.ts:5-7). Cualquiera con el venue_id puede alterar el inventario de un carrito. No lo empeores exponiendo mas escrituras sin auth.
- El webhook de Stripe no guarda el `event.id`: la idempotencia depende del status esperado. Un webhook duplicado en `settle` cuando el pedido ya esta `paid` se salta bien, pero un webhook que llega DESPUES de que caja ya cobro en efectivo (pedido ya `paid`) tambien se salta y el cliente queda cobrado dos veces sin rastro en la BD. Un webhook tardio sobre un pedido cancelado responde 500 y Stripe lo reintenta indefinidamente.
- `createCheckoutForAccount` escribe el MISMO `stripe_checkout_session_id` en todos los pedidos del grupo, pero el indice unico es parcial sobre esa columna: dos pedidos con la misma sesion violan el indice unico (20260610160000:31-33). ATENCION SIN VERIFICAR: no encontre manejo de ese error en lib/fb/stripePayments.ts:248-251, asi que el pago de cuenta con mas de un pedido podria fallar al guardar la sesion (el update se ignora sin `.select()`, el usuario igual llega a Stripe y el webhook resuelve por metadata).
- `markOrderDelivered` NO deja el pedido en `delivered`: deja `pending_acceptance`. Si "arreglas" eso, el cliente pierde la posibilidad de disputar y todo entra directo a su cuenta.
- Los reportes cortan por `created_at` con offset FIJO `-06:00`. Mexico ya no aplica horario de verano, pero cualquier cambio de zona rompe el corte del dia.
- La propina de una mesa vive solo en la primera orden (`tip_cents`); sumar `tip_cents` por orden esta bien, pero atribuir propina "por comanda" es incorrecto. Los reportes de app/api/fb-reportes/export/route.ts no incluyen `tip_cents` en los totales.
- `awaiting_cart_pickup` existe en el schema, en los labels, y la Mini App del carrito lo prioriza con beep (app/captura/carrito/CarritoOperadorClient.tsx:92-102, 395-416), pero NINGUNA pantalla llama `markOrderAwaitingCartPickup` (lib/fb/orderActions.ts:82-86). El flujo de "el restaurante preparo lo que el carrito no tenia y el carrito pasa a recogerlo" esta a medias: la redireccion ocurre, el aviso al carrito no.
- El pedido redirigido guarda `source_venue_id`, pero cocina/carrito filtran por `venue_id`: el carrito original deja de ver ese pedido en su cola.
- `revalidatePath("/fb-carrito-bar")` en lib/fb/orderActions.ts:59 apunta a una ruta que no existe (la Mini App es `/captura/carrito`). Inofensivo pero engañoso.

## Deuda y preguntas abiertas
- No hay NINGUNA pantalla que escriba `fb_user_venues`, `fb_tables` ni `fb_house_accounts`: solo se leen. `/fb-mesero` dice "pide al comite que te agregue al venue desde /fb-admin → permisos por venue" (app/(backoffice)/fb-mesero/page.tsx:49) y `/fb-admin/mesas-qr` dice "agrega mesas desde Supabase" (page.tsx:83). Hoy se administran a mano en Supabase.
- `credit_limit_cents` de `fb_house_accounts` no se valida en ningun lado: se puede cargar cualquier monto a un socio.
- lib/fb/stockPhotos.ts esta desactivado a proposito (devuelve null siempre) y no se importa en ningun lugar: codigo muerto conservado "por si acaso".
- El menu se valida contra el venue elegido por el cliente y no contra `available_venue_ids` del venue efectivo tras la redireccion: si un item del carrito no existe en `h6`, el restaurante recibe una comanda de algo que quizas no prepara.
- Duplicacion de la logica "revalidar precios + insertar orden + rollback": esta escrita 4 veces (app/api/captura/fb-order/route.ts, lib/fb/orderActions.ts:createOrderForClient, lib/fb/tableActions.ts:createWaiterOrder, app/api/mesa/order/route.ts). Cambiar una regla de precios obliga a tocar las cuatro.
- No hay transaccion real: orden e items se insertan en dos llamadas con borrado manual de la orden si falla la segunda.
- `/fb-cuentas` agrupa por entry/caddie y no contempla `player_id` (residentes) ni `table_id`; esos consumos no aparecen como cuenta abierta ahi.
- `fb_venues.hole_range_start/end` se muestra al operador pero no restringe a que hoyos puede pedir el cliente.
- ATENCION SIN VERIFICAR: no hay ningun refund/void hacia Stripe. `unmarkOrderPaid` y `committeeRefundDispute` solo cambian el status en la BD; el reembolso prometido en la politica publica de `/restaurante` tendria que hacerse a mano en el dashboard de Stripe.
- ATENCION SIN VERIFICAR: `fb_deposit_accounts` (y `stripe_account_id`) no se usa en el flujo de cobro real; parece solo catalogo informativo para el club.

## Relacionado
[[arquitectura]] · [[datos-y-seguridad]] · [[telegram]] · [[ritmo-juego]] · [[distancias-gps]] · [[captura-scores]] · [[torneos-setup]]
