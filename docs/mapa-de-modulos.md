---
titulo: Mapa de módulos
tags: [hub, golf-torneo]
actualizado: 2026-08-27
---

# Mapa de módulos — List Golf

14 documentos, 2,538 líneas, ~1,380 referencias `archivo:línea`.
Generados el 2026-08-27 leyendo el código. **Abre solo el que necesites.**

## Por fase del torneo

### Cimientos
| Doc | Qué contiene |
|---|---|
| [[arquitectura]] | Grupos de rutas, clientes de Supabase, roles/permisos, i18n, Tailwind 4, deploy staging/main. |
| [[datos-y-seguridad]] | Esquema por dominio, roles en 3 alcances, RLS con helpers `SECURITY DEFINER`, tokens sin sesión. |

### Antes del torneo
| Doc | Qué contiene |
|---|---|
| [[torneos-setup]] | Alta de torneo desde plantilla, convocatoria, categorías, salidas, tarjeta del campo, inscripciones hasta el cierre. |
| [[tee-sheet-salidas]] | Genera y congela salidas: bloques de sesión, shotgun A/B, tee times por índice denso, foursomes de match play. |
| [[calcuta-subasta]] | Rifa de turnos en servidor, captura de posturas, proyección en salón, siembra del cuadro por postura. |
| [[handicap-whs]] | HI a golpes de juego (WHS 80%) y comité que vota bajarle golpes al HP con evidencia GHIN. |

### Durante el torneo
| Doc | Qué contiene |
|---|---|
| [[captura-scores]] | Captura en campo (PWA por Telegram) y en mesa: testigos, celdas rojas, firmas, cierre de tarjeta **por ronda**. |
| [[matchplay]] | Cuadro de eliminación, scoring Bola Baja + Alta con ventajas WHS, avance de ganadores, consolaciones, Ryder. |
| [[distancias-gps]] | Yardas GPS al green, calibración satelital del campo, bandera del día, registro de golpes con castigos. |
| [[ritmo-juego]] | Ritmo derivado de scores capturados + GPS, mapa Leaflet de grupos y marshals, alertas y cron cada 5 min. |
| [[telegram]] | Bot único: avisos de salida, tarjeta de captura, kit, ritmo, alertas al comité. WhatsApp es stub. |
| [[fb-restaurante]] | POS del club: pedidos desde el campo, mesa QR y domicilio, inventario, cuentas, cobro Stripe. |
| [[mobile-watch]] | App Expo (GPS de fondo para ritmo) + **dos** apps de Apple Watch que detectan swings. |

### Resultados
| Doc | Qué contiene |
|---|---|
| [[resultados-cortes-premios]] | Clasificación (gross/neto/Stableford), cortes por categoría con cupo exacto, desempate por retrocesión, premios. |

---

## Índice inverso — "mi problema es…"

| Síntoma | Ve a |
|---|---|
| Un jugador capturó en la categoría equivocada | [[captura-scores]] — `rounds` tiene **una fila por categoría** |
| La tarjeta dice "cerrada" y no debería | [[captura-scores]] — el cierre se evalúa **por ronda**, nunca global |
| Se sobrescribió la salida de otro partido al avanzar el cuadro | [[tee-sheet-salidas]] — `position_no` ≠ `group_no` |
| Desapareció la consolación del cuadro | [[matchplay]] — `autoPublishBracket` borra **todos** los brackets del torneo |
| Semifinales sin marcador en vivo | [[matchplay]] — PostgREST corta en 1,000 filas; hay que paginar |
| Las ventajas salen al doble o al 90% en vez del 80% | [[resultados-cortes-premios]] y [[handicap-whs]] — doble aplicación del % de handicap |
| Todo aparece en rojo en ritmo | [[ritmo-juego]] — casi siempre es atraso de **captura**, no de juego |
| Las bolas del mapa desaparecen al refrescar | [[ritmo-juego]] — dependencias del `useEffect` de Leaflet |
| Las yardas no cuadran | [[distancias-gps]] — dos constantes distintas de metros por grado |
| Llegaron 6 notificaciones iguales | [[telegram]] — la idempotencia del cron es aparente |
| Un pedido se cobró dos veces | [[fb-restaurante]] — el webhook de Stripe no guarda `event.id` |
| El inscrito quedó sin número de jugador | [[torneos-setup]] — `addEntry` no asigna `player_number` |
| El clon del torneo quedó sin CH/PH | [[torneos-setup]] — `tee_sets` no se clona |
| "Error al guardar: NEXT_REDIRECT" | [[arquitectura]] — `redirect()` dentro de `try/catch` |
| El botón se queda cargando para siempre | [[arquitectura]] — `revalidatePath` rompe `useActionState` |
| Falta una tabla o columna en `migrations/` | [[datos-y-seguridad]] — el esquema núcleo **no está versionado** |

---

## Cómo se usan estos docs

1. **Lee el doc antes del código.** Para eso existen.
2. **`⚠️ SIN VERIFICAR` es sospecha, no hecho.** Hay 32 marcas de estas. Confírmalas antes de apoyarte en ellas.
3. **Si cambia una regla, actualiza el doc en el mismo turno.** Un doc que miente es peor que ninguno.
4. Cada doc cierra con *Deuda y preguntas abiertas*. Lo consolidado y priorizado está en
   [[pendientes\|Pendientes y riesgos]].

Volver al hub: [[index\|Índice maestro]]
