---
titulo: Handicap WHS, GHIN y comite de handicap
modulo: handicap-whs
actualizado: 2026-09-20
tags: [modulo, golf-torneo]
---

# Handicap WHS, GHIN y comite de handicap

## Que resuelve
Convierte el indice de handicap (HI) de cada socio en los golpes de ventaja que recibe en el torneo: HI -> Course Handicap con slope/rating/par de la salida asignada -> Playing Handicap con el porcentaje de la formula de competencia (en CCQ casi siempre 80%).
Ademas da al Comite de Handicap la evidencia para detectar indices inflados: historial GHIN del socio (rondas hoyo por hoyo, escenarios de indice, promedio por hoyo, soft/hard cap) y un voto anonimo de cada miembro presente para bajarle golpes al handicap de torneo o vetar su participacion.
El comite trabaja SIEMPRE en golpes enteros sobre el handicap de torneo (HP). Nunca modifica el HI del jugador (`fix(comite): votar y mostrar solo handicap de torneo, no el indice H`, commit fe49930).

## Mapa de archivos
| Ruta | Que hace | Lineas |
| --- | --- | --- |
| lib/handicap/whs.ts | Formulas CH/PH del sistema (PH desde CH entero), validacion de tee, pick por genero | 129 |
| lib/ghin-report/handicapMath.ts | Formulas CH exacto / HP con % sobre decimal, redondeos, golpes por hoyo | 147 |
| lib/handicap/resolveTournamentEntryHandicap.ts | Resolucion de salida + allowance + tope de HI por inscrito; `resolveOfficialHcp80` | 510 |
| lib/handicap/loadTournamentHandicapContext.ts | Carga tee_sets, reglas de salida, % por categoria, course_tee_sets, fallback matchplay | 183 |
| lib/handicap/recomputeTournamentHandicaps.ts | Recalcula y persiste course_handicap/playing_handicap/handicap_calc_meta | 104 |
| lib/matchplay/usgaAllowances.ts | Tabla USGA de allowances por formato (match play / stroke play) | 180 |
| app/api/handicap/preview/route.ts | POST preview de CH/PH sin persistir (alta/edicion de jugador) | 152 |
| app/(backoffice)/comite-handicap/page.tsx | Pantalla del comite: roster, voto, agregados, presencia, roles, historial | 2121 |
| app/(backoffice)/comite-handicap/actions.ts | Server actions: votar, aplicar ajuste, trim, presencia, roles, archivar/reset | 1354 |
| lib/handicap-committee/constants.ts | Rango de ajuste, promedio recortado (`trimmedAverage`), base HP sin acumular | 262 |
| lib/handicap-committee/access.ts | isAdmin / isCommitteeMember / alcance (global, club, torneo) | 117 |
| lib/handicap-committee/eligibleVoters.ts | Votantes que cuentan: rol handicap_committee AND presencia marcada | 74 |
| app/(backoffice)/comite-handicap/AdminAggregateTable.tsx | Tabla admin: ajuste redondeado, HP final, aplicar individual/bloque | 584 |
| app/(backoffice)/comite-handicap/HandicapCommitteeVoter.tsx | UI de voto por jugador (slider -1..-5, abstencion, veto) | 1248 |
| lib/handicap-committee/loadSelectionRows.ts | Pantalla de seleccion: HI, min HI 365d, delta, rondas 12m, H torneo, sugerencias | 670 |
| lib/ghin-report/loadGhinReport.ts | Reporte GHIN en vivo: escenarios, caps, hoyo por hoyo, veredicto | 846 |
| lib/ghin-report/ccqCourse.ts | Constantes del campo CCQ: CR/slope por tee, stroke index, par, corte de tee | 57 |
| lib/ghin-report/whsCaps.ts | Soft cap / hard cap contra Low HI de 365 dias y evaluabilidad | 117 |
| app/(backoffice)/handicap-report/[playerId]/page.tsx | Visor pantalla completa del reporte GHIN con boton Cerrar | 137 |
| app/(backoffice)/comite-handicap/adminActions.ts | Flags en bloque, sugerencias, dry-run y carga de Hole-by-Hole GHIN | 350 |
| lib/handicap-committee/parseHoleByHoleXlsx.ts | Parser del export USGA Hole by Hole (forward-fill, fechas ambiguas) | 274 |
| lib/handicap-committee/ghinImportDryRun.ts | Clasifica filas exact/new/date_conflict + sanity check post-carga | 197 |
| lib/player-files/handicapReportUrl.ts | Stream inline del expediente (bucket privado, RLS del usuario) | 107 |
| app/(backoffice)/players/handicap-files/actions.ts | Carga masiva de expedientes; liga por GHIN en el nombre del archivo | 261 |
| lib/handicap/whsDifferential.ts | Diferencial WHS y HI de transicion (solo Mini App /captura/mis-rondas) | 97 |

## Tablas de Supabase
| Tabla | Para que se usa | En migraciones? |
| --- | --- | --- |
| tournament_handicap_committees | 1 fila por torneo: status, expected_members, trim_high/low, disqualify_threshold, abstentions_in_average | 20260525120000_handicap_committee.sql (+ 20260526150000, 20260812211059) |
| handicap_committee_votes | Voto individual y privado: adjustment, abstained, disqualify_vote | 20260525120000_handicap_committee.sql (+ 20260526140000) |
| handicap_committee_vote_summary | Vista agregada anonima (n_votes, avg, min, max, mediana) | 20260525120000_handicap_committee.sql |
| handicap_committee_member_presence | Presencia por sesion; sin ella el voto no cuenta | 20260525120000_handicap_committee.sql |
| handicap_committee_vote_sessions | Cabecera de cada votacion archivada (parametros + conteos) | 20260526160000_committee_vote_sessions.sql |
| handicap_committee_vote_snapshots | Snapshot anonimo por jugador de la votacion archivada | 20260526160000_committee_vote_sessions.sql |
| player_files | Expediente del jugador (reporte GHIN HTML/PDF, capturas) | 20260527020000_player_files_and_committee_flag.sql |
| storage bucket `player-files` | Binario privado del expediente, solo por signed URL | 20260527020000_player_files_and_committee_flag.sql |
| ghin_rounds | Toda ronda GHIN del club con hoyo por hoyo, tee, CR/SR, hi_at_play, differential | 20260812140908_create_ghin_historical_tables.sql |
| ghin_index_revisions | Revisiones mensuales de HI por GHIN (base de min HI / caps) | 20260812140908_create_ghin_historical_tables.sql |
| ghin_competition_rounds | Rondas de competencia (CH/CA/ECH/EA) importadas aparte | 20260812140908_create_ghin_historical_tables.sql |
| ghin_import_log | Auditoria de cargas: dry_run / applied / rejected / error + report_json | 20260812202303_ghin_import_log.sql |
| v_ghin_player_activity | Conteos de rondas (anio, 3 anios, 12m) y diferencial promedio del anio | 20260812141303_create_ghin_metric_views.sql |
| v_ghin_competition_summary | Resumen de rondas de competencia por GHIN | 20260812141303_create_ghin_metric_views.sql |
| tournament_entries | Columnas de handicap: course_handicap, playing_handicap, override(+reason/at/by), handicap_calc_meta, tee_set_id_override, flagged_for_committee | tabla base no (creada en Supabase); columnas en 20260525170000_matchplay_whs_handicap.sql y 20260527020000 |
| tournament_matchplay_rules | handicap_allowance_pct y whs_slope/CR/par por genero (fallback global del torneo) | 20260525170000_matchplay_whs_handicap.sql |
| category_competition_rules | handicap_percentage por categoria (el % real que se aplica) | no (creada en Supabase) |
| category_tee_rules | Que salida le toca a cada categoria por edad/genero/rango de HI | no (creada en Supabase) |
| tee_sets / course_tee_sets | Salidas del torneo y del campo con slope/CR/par por genero | no (creada en Supabase) |
| players | handicap_index, handicap_torneo, ghin_number | no (creada en Supabase) |

## Reglas de negocio
1. Course Handicap: `CH = redondeo(HI x Slope/113 + (CourseRating - Par))`, redondeo half-up (`Math.floor(n+0.5)`) — lib/handicap/whs.ts:83 y lib/handicap/whs.ts:53.
2. Playing Handicap del sistema: `PH = redondeo(CH_entero x allowance% / 100)` — lib/handicap/whs.ts:93. El allowance NUNCA se aplica al HI directo.
3. Handicap de torneo "oficial 80%" (columnas de inscritos y seleccion del comite): `HP = redondeo(CH_entero x 0.80)`, el % sobre el CH YA REDONDEADO — lib/ghin-report/handicapMath.ts y lib/handicap/resolveTournamentEntryHandicap.ts:398. Validacion del comite: HI 25.6 en Blancas (70.7/127/72) -> CH_exacto 27.47 -> CH 27 -> HP 22. **Cambiado el 2026-09-20:** antes el % se aplicaba al CH decimal y el "H torneo" que veian inscritos y el comite difería un golpe del que se jugaba en 21 de los 70 del Calcuta 2026. Nadie cambio de handicap: `playing_handicap` siempre se calculo con el CH entero.
4. Reglas 2 y 3 son ahora la MISMA aritmetica: redondear el CH half-up (el .5 sube, por debajo baja) y aplicar el % a ese entero, redondeando otra vez half-up. Es el metodo de las Rules of Handicapping 6.1. La unica diferencia que queda es el porcentaje: `resolveOfficialHcp80` fuerza 80% aunque la categoria tenga otro % — lib/handicap/resolveTournamentEntryHandicap.ts:412.
5. Orden de resolucion de salida por inscrito: (a) `tee_set_id_override` del comite, (b) `category_tee_rules` via `assignTeeSetWithMeta`, (c) fallback `tournament_matchplay_rules` (whs_* por genero), (d) por HI contra `TEE_HI_CUTOFF` — lib/handicap/resolveTournamentEntryHandicap.ts:245, :311, :352, :366.
6. Match de salida del torneo contra `course_tee_sets`: primero por code con alias (AZUL/BLU, BLANC/WHT, DORAD/GLD, NEGRA/BLK), luego por nombre normalizado (sin acentos ni parentesis), luego por color — lib/handicap/resolveTournamentEntryHandicap.ts:87 y :109.
7. Tee por HI cuando no hay regla: HI <= 6.9 -> Azules, si no Blancas — lib/ghin-report/ccqCourse.ts:42 y lib/handicap/resolveTournamentEntryHandicap.ts:169.
8. Tope "maximo a jugar": si la regla de categoria hace match `extrapolated` y el HI rebasa `handicap_max` (o queda bajo `handicap_min`), el calculo usa el limite, no el HI real; queda registrado en `meta.hi_cap_applied` / `hi_cap_source` y `source = "category_tee_whs_capped"` — lib/handicap/resolveTournamentEntryHandicap.ts:328 y :481 (commit f98eaf7).
9. HI efectivo del inscrito: `tournament_entries.handicap_index` manda; si es null, `players.handicap_torneo`; si no, `players.handicap_index`; si nada, 0 — lib/matchplay/entryHi.ts:2.
10. `playing_handicap_override` corta el calculo: devuelve CH = override y PH = round(override), con `meta.source = "override"` — lib/handicap/resolveTournamentEntryHandicap.ts:444. `recomputeTournamentHandicaps` conserva el override al persistir — lib/handicap/recomputeTournamentHandicaps.ts:86.
11. Allowance por categoria: sale de `category_competition_rules.handicap_percentage` con `is_active = true`; si no hay, `tournament_matchplay_rules.handicap_allowance_pct`; si no, 100 — lib/handicap/loadTournamentHandicapContext.ts:68 y lib/handicap/resolveTournamentEntryHandicap.ts:236.
12. Allowances USGA por formato (Rules of Handicapping 6.1): individual 100% match / 95% stroke; four-ball 90/85; bola baja+alta 90/80 (CCQ usa 80); foursomes 50/50 combinado; greensome y chapman 60% del bajo + 40% del alto; scramble 2 35% del bajo + 15% del alto — lib/matchplay/usgaAllowances.ts:29 y :155.
13. Tee valido para WHS solo si slope 55-155, course rating 50-90 y par 60-80 — lib/handicap/whs.ts:57. Genero F usa tee de damas, M el de caballeros, con fallback cruzado — lib/handicap/whs.ts:118.
14. Golpes por hoyo: PH < 18 -> 1 golpe donde stroke index <= PH; PH >= 18 -> `floor(PH/18)` en todos + 1 extra en los `PH mod 18` de stroke index mas bajo — lib/ghin-report/handicapMath.ts:111.
15. Campo CCQ (par 72): Negras 73.2/138, Azules 72.7/136, Blancas 70.7/127, Doradas 67.0/125 (caballeros) — lib/ghin-report/ccqCourse.ts:15. Stroke index y par por hoyo cableados en :23 y :28.
16. Voto del comite: entero de -1 a -5 golpes al HP (nunca positivo, nunca 0); `clampAdjustment` convierte 0 o valor invalido en -1 — lib/handicap-committee/constants.ts:2 y :15. Abstencion y veto ("no permitir jugar") son campos independientes del ajuste — supabase/migrations/20260526140000_committee_disqualify_vote.sql:6.
17. Para votar hace falta: rol `handicap_committee` (torneo, club o global) + comite en status `open` + fila `handicap_committee_member_presence.is_present = true`. Un director o admin sin ese rol entra a la pantalla pero su voto no cuenta — app/(backoffice)/comite-handicap/actions.ts:132, :149, :160 y lib/handicap-committee/access.ts:96.
18. Votantes elegibles para promedio/trim = rol handicap_committee INTERSECCION presentes; los demas votos se cuentan como descartados y se muestran con el motivo (`no_role` / `not_present`) — lib/handicap-committee/eligibleVoters.ts:59 y app/(backoffice)/comite-handicap/page.tsx:704.
19. Promedio recortado: se ordenan los ajustes, se tiran `trim_low` mas bajos (mas castigadores) y `trim_high` mas altos; NO se reduce el recorte si hay pocos votos. Si no sobrevive ninguno, `trimAnnulled = true` y avg = 0 (HP sin cambio), distinto de "nadie propuso ajuste" (avg null) — lib/handicap-committee/constants.ts:153 y :241.
20. Abstenciones fuera del promedio por default; con `abstentions_in_average = true` suman al denominador como 0, lo que suaviza el ajuste — supabase/migrations/20260812211059:4 y lib/handicap-committee/constants.ts:164.
21. Minimo de votos numericos para que el trim deje algo vivo = `trim_low + trim_high + 1` — lib/handicap-committee/constants.ts:48.
22. Umbral de descalificacion: `disqualify_threshold` (0-50). 0 = desactivado (solo se muestra el conteo). Con umbral > 0, `n_vetos_validos >= umbral` marca al jugador como no autorizado (informativo, no bloquea nada en BD) — supabase/migrations/20260526150000:5 y app/(backoffice)/comite-handicap/page.tsx:1068.
23. `expected_members` (quorum esperado, default 10 en constants.ts:5; CCQ forzado a 10 en 20260813023432) es solo indicativo: NO entra a ninguna formula.
24. Aplicar el ajuste: `golpes = Math.round(avg_recortado)` y `HP_nuevo = max(0, HP_base + golpes)`. `HP_base` deshace un ajuste previo del comite leyendo el texto de `playing_handicap_override_reason` (`"Comite: -N al handicap de torneo"`), para que reaplicar no acumule — app/(backoffice)/comite-handicap/actions.ts:342, :348 y lib/handicap-committee/constants.ts:25, :36.
25. Al aplicar se escribe `playing_handicap`, `playing_handicap_override`, `..._override_reason`, `..._at`, `..._by` con service_role — app/(backoffice)/comite-handicap/actions.ts:424. Existe version en bloque con `entry_ids` + `adj_<id>` por inscrito; las que no traen ajuste se ignoran — actions.ts:502 y :524.
26. El boton Aplicar se desactiva si el ajuste es 0 o si es igual al ya aplicado, y el ajuste default de una fila ya aplicada es 0 — app/(backoffice)/comite-handicap/AdminAggregateTable.tsx:67 y :85 (commit d0a48a2).
27. Reset de votacion: requiere escribir literalmente `REINICIAR`, ser admin y tener `SUPABASE_SERVICE_ROLE_KEY`. Arma sesion + snapshots en TS y llama la RPC `fn_archive_and_reset_handicap_committee_votes(committee, actor, session, snapshots)`, que valida al actor con `fn_user_can_read_ghin`, ignora `tournament_id`/`archived_by` del payload, inserta y BORRA los votos vivos en una transaccion; devuelve NULL si no habia votos — actions.ts:593, :866 y supabase/migrations/20260813000615_harden_archive_committee_rpc.sql:29.
28. `session_no` = max anterior + 1; nombre default `Sesion N` — actions.ts:789.
29. Roster del comite: `syncTournamentCommitteeRoster` pone `flagged_for_committee = true` a toda inscripcion activa (status distinto de cancelled/withdrawn) y lo quita a las bajas, cada vez que se abre la pantalla o el loader de seleccion — lib/handicap-committee/syncEntryCommitteeRoster.ts:31 y page.tsx:295.
30. El comite solo aplica a torneos que AUN NO empiezan y que no son jugada diaria (`kind = daily_round` o `is_private`) — lib/handicap-committee/openCommitteesForUser.ts:22 y :29.
31. Reporte GHIN — HI oficial WHS: promedio de los 8 mejores diferenciales de las ultimas 20 rondas de `ghin_rounds`, TRUNCADO a 1 decimal (no redondeado) — lib/ghin-report/loadGhinReport.ts:96 y lib/ghin-report/handicapMath.ts:21.
32. `f_ghin_escenario(ghin, n, ventana)`: promedio (redondeado a 1 decimal) de los `n` mejores diferenciales; ventana `anio` = desde el 1 de enero, cualquier otro valor = ultimos 3 anios. Devuelve `n_usado`, `universo` y `es_historico` (true si la muestra se fue antes del anio en curso) — supabase/migrations/20260812141303:32. El reporte pinta escenarios de 8, 10, 15 y 20 — loadGhinReport.ts:568.
33. `f_ghin_min_index(ghin, desde, hasta)`: minimo HI en la ventana UNION la ultima revision anterior a `desde` (carry-in). Es el Low HI de los caps y el HI del torneo cuando el jugador no esta inscrito — supabase/migrations/20260812141303:58 y loadGhinReport.ts:430.
34. `f_ghin_holes_avg(ghin, min_rondas=10)`: promedio de golpes por hoyo (2 decimales) sobre el anio en curso si hay >= min_rondas, si no sobre 3 anios; ademas promedio de las 10 rondas de mejor diferencial — supabase/migrations/20260812141303:80.
35. Soft cap = LowHI + 3.0, Hard cap = LowHI + 5.0, ventana de 365 dias. Si `f_ghin_min_index` devuelve null el cap es `not_evaluable` y se muestra `players.handicap_index` como provisional; con menos de 365 dias de historia el cap es `partial` (no definitivo) — lib/ghin-report/whsCaps.ts:8, :76, :94.
36. Ancla de los caps: el corte de datos de `ghin_index_revisions` (no `new Date()`), para no medir contra dias sin dataset — loadGhinReport.ts:513.
37. HI del torneo en el reporte: inscripcion -> `f_ghin_min_index` en la ventana del Calcuta 2026 (2026-05-01 a 2026-08-01) -> `players.handicap_index` marcando `minIndexFallbackUsed` — loadGhinReport.ts:428 y lib/ghin-report/ccqCourse.ts:36.
38. Para inscritos, CH/HP guardados en la inscripcion son la fuente de verdad del reporte; recalcular desde el CH entero cambia un golpe — loadGhinReport.ts:460 (commit c28aa99).
39. Veredicto del reporte: `sin_datos` si hay menos de 10 rondas incluso retrocediendo 3 anios; `revisar` si algun escenario con muestra suficiente difiere mas de 1.0 golpe del HI del torneo; si no `normal` — loadGhinReport.ts:772.
40. Seleccion de candidatos: `delta HI = HI vigente de players - min HI` (min de `ghin_index_revisions` en 365d, con fallback a `min(hi_at_play)` de `ghin_rounds`). Sugerencias automaticas con umbrales delta >= 1.0, rondas 12m <= 10, caida de diferencial de las ultimas 8 vs historico >= 2.0, varianza de diferencial >= 9.0 — lib/handicap-committee/loadSelectionRows.ts:81, :557, :612 y :640.
41. Importacion Hole-by-Hole: solo `.xlsx`; se detecta la fila de encabezados buscando GHIN + Date en las primeras 15 filas; forward-fill de GHIN y nombre (el portal agrupa); fechas M/D/Y por default y se marcan como ambiguas cuando dia y mes son <= 12 — lib/handicap-committee/parseHoleByHoleXlsx.ts:154, :227, :105.
42. Dry-run obligatorio: cada fila se clasifica `exact` (ghin+fecha+tee+score ya existe), `date_conflict` (mismo ghin+tee+score con otra fecha, riesgo de volteo dia/mes) o `new`. Al aplicar solo se insertan las `new`, en lotes de 200, y todo queda en `ghin_import_log` — lib/handicap-committee/ghinImportDryRun.ts:80 y app/(backoffice)/comite-handicap/adminActions.ts:266.
43. `ghin_rounds` tiene UNIQUE (ghin_number, date_played, tee_name, total_score); ahi vive la deduplicacion real — supabase/migrations/20260812140908:39.
44. Expedientes: se ligan por el numero GHIN extraido del nombre del archivo (4-10 digitos, exacto o como prefijo); si no hay GHIN, no hay jugador con ese GHIN o hay mas de uno, la fila se rechaza. Maximo 80 archivos por lote y 15 MB por archivo; ruta `players/{ghin}/handicap-{ts}.{ext}` — lib/player-files/ghinFromFilename.ts:2 y app/(backoffice)/players/handicap-files/actions.ts:12, :151, :180.
45. Quien ve un expediente: `fn_user_can_view_player_files` = super_admin, comite global, comite o director de cualquier torneo donde el jugador este inscrito, o club_admin/comite del club del jugador. La misma funcion protege el objeto en Storage — supabase/migrations/20260527020000:66 y :150 (endurecida con search_path en 20260527030000).
46. Quien lee GHIN: `fn_user_can_read_ghin` (super_admin, club_admin, tournament_director, handicap_committee, entries_operator; viewer solo en alcance global). Escritura de tablas GHIN solo `service_role` — supabase/migrations/20260812145036:6 y :83.
47. `/api/handicap/preview` valida acceso al torneo, acepta `hi` con coma decimal y devuelve CH, PH, allowance y el cap aplicado sin escribir nada — app/api/handicap/preview/route.ts:45 y :53.
48. Mini App del socio (`/captura/mis-rondas`): HI estimado con las reglas WHS de transicion (3 scores -> mejor -2.0; 4 -> mejor -1.0; 5 -> mejor; 6 -> 2 mejores -1.0; 7-8 -> 2; 9-11 -> 3; 12-14 -> 4; 15-16 -> 5; 17-18 -> 6; 19 -> 7; 20+ -> 8), solo con tarjetas cerradas de 18 hoyos — lib/handicap/whsDifferential.ts:58 y app/captura/mis-rondas/page.tsx:66.
49. **Resolvedor canonico del PH.** `effectivePlayingHandicapForEntry` (lib/handicap/resolveTournamentEntryHandicap.ts:492) es la UNICA definicion del "handicap de torneo que se juega": `playing_handicap_override` -> `playing_handicap` guardado -> WHS en vivo con el contexto del torneo -> null. Delegan en ella `entryTournamentPh` (subasta, lib/matchplay/auctionTeamPh.ts:15), `effectivePhForMatchEntry` (match play, captura y tarjetas, lib/matchplay/resolveEntryPhForMatch.ts:29) y el reporte de handicaps. No escribas un cuarto orden de prioridad.
50. **El valor que viaja en `handicapByPlayerId` ya es PH, no HI.** Lo arman igual la vista publica (app/torneos/[id]/page.tsx:839) y el orden del tee sheet (lib/tee-sheet/leaderboardOrderForPairing.ts:277): override -> PH guardado -> HI solo si no hay ninguno. Todo lo que lo consume (`perHoleCompetitionBreakdown`, `segmentStrokeTotal`, `PublicLeaderboardDetailTable`) lo trata como PH resuelto y NO le vuelve a aplicar el % de la categoria.


## Flujos
### 1. Handicap de torneo de un inscrito
1. `loadTournamentHandicapContext` (lib/handicap/loadTournamentHandicapContext.ts:16) carga `tee_sets` del torneo, `category_tee_rules`, `category_competition_rules` activas, `course_tee_sets` del campo y el fallback de `tournament_matchplay_rules`.
2. `resolveWhsTeeForEntry` elige salida (override -> regla de categoria -> fallback -> por HI) y allowance, y aplica el tope de HI si el match fue `extrapolated` (resolveTournamentEntryHandicap.ts:222).
3. `computeWhsHandicap` calcula CH y PH (lib/handicap/whs.ts:96).
4. `recomputeTournamentHandicaps` persiste `course_handicap`, `playing_handicap` (o el override) y `handicap_calc_meta` en `tournament_entries` (recomputeTournamentHandicaps.ts:91).
5. Disparadores del recalculo: cambio de HI inline (entries/actions.ts:1307), cambio de salida (entries/actions.ts:2340), guardar jugador con HI nuevo (players/actions.ts:190), configuracion WHS de matchplay (matchplay/handicapActions.ts:133), boton en reportes (reports/actions.ts:25) y **antes de imprimir tarjetas** (lib/matchplay/loadPrintableMpScorecards.ts:992, commit 2956a2f).

### 2. Sesion del comite
1. Admin activa el comite (`enableHandicapCommittee`, actions.ts:45) y marca presencias (`setHandicapCommitteeMemberPresence`, actions.ts:943).
2. Opcional: en `/comite-handicap/seleccion` se revisan delta HI, rondas 12m y H torneo, y se marcan jugadores con `saveCommitteeFlagsBulk` (adminActions.ts:25). `syncTournamentCommitteeRoster` ya deja marcado a todo el roster activo.
3. Cada miembro abre el reporte GHIN del jugador (`/handicap-report/[playerId]`, loadGhinReport.ts:327) y vota en `HandicapCommitteeVoter`: ajuste -1..-5, abstencion o veto (`saveHandicapCommitteeVote`, actions.ts:123).
4. La pantalla agrega los votos de los elegibles, aplica `trimmedAverage` y muestra chips barajados para preservar el anonimato (page.tsx:1033 y :1052).
5. El admin ajusta el redondeo si quiere y aplica con `applyHandicapCommitteeSuggestion` / `...Bulk`, que escriben el override del HP (actions.ts:358 y :448).
6. Cierre: `setHandicapCommitteeStatus` a `closed` (actions.ts:82), o `resetHandicapCommitteeVotesAction` para archivar la sesion y limpiar votos via RPC (actions.ts:577).

### 3. Actualizacion mensual del dataset GHIN
1. Exportar del USGA Admin Portal los 7 reportes (guia en lib/handicap-committee/monthlyDbUpdateGuide.ts:35; el Hole by Hole debe traer >= 10,000 filas).
2. En `/comite-handicap/ghin-datos`, `dryRunGhinHoleByHoleUpload` parsea, clasifica y registra un `ghin_import_log` en estado `dry_run` (adminActions.ts:138).
3. Revisar `date_conflict`, fechas ambiguas y el sanity check (`pctDayGt12 < 5%` sugiere volteo dia/mes en ese genero — ghinImportDryRun.ts:158).
4. `applyGhinHoleByHoleUpload` con `confirm = true` inserta solo las filas `new` y cierra el log en `applied` (adminActions.ts:240).
5. Los GHIN de `players` se pueblan con `scripts/import-ghin-from-excel.mjs` (torneo Mixto) o `scripts/import-ghin-system-players.mjs` (una hoja por club); ambos corren en vista previa y solo escriben con `--apply`.

## Invariantes y trampas
- El comite ajusta HP, no HI. Si vuelves a hacer que el voto toque `handicap_index`, rompes categorias, salidas y el propio calculo WHS (commits 4543ad8 y fe49930).
- No apliques el ajuste dos veces: `parseCommitteeAppliedHpAdjustment` depende del formato EXACTO del texto `"Comite: -N al handicap de torneo"` (con acento) en `playing_handicap_override_reason`. Si cambias ese texto, el sistema pierde la memoria del ajuste previo y el siguiente Aplicar acumula golpes (constants.ts:29).
- Aplicar el ajuste deja un `playing_handicap_override`. Mientras exista, `recomputeTournamentHandicaps` no vuelve a calcular ese inscrito: para volver al WHS puro hay que limpiar el override (matchplay/handicapActions.ts:181).
- Los dos caminos de PH (reglas 2 y 3) ya estan unificados en el CH entero (2026-09-20). Si vuelves a aplicar el % al CH decimal, el numero que ve el comite deja de ser el que se juega, se imprime y se subasta. El redondeo es half-up en los DOS pasos: CH primero, PH despues.
- `handicap_committee_votes` tiene RLS de "solo mis votos": ni el admin puede leerla con el cliente de sesion. Todo lo agregado (page.tsx:676, actions.ts:235) usa `tryCreateAdminClient()`. Sin `SUPABASE_SERVICE_ROLE_KEY` no hay resultados ni aplicacion de ajustes, y varias actions abortan con ese mensaje.
- `handicap_committee_vote_sessions` y `..._snapshots` tienen RLS habilitado y NINGUNA policy (20260526160000:43). Solo `service_role` las lee; si cambias el cliente del historial (page.tsx:1104) se ve vacio.
- `fn_archive_and_reset_handicap_committee_votes` es la unica ruta valida para reiniciar: borrar votos "a mano" pierde el snapshot. Solo tiene EXECUTE `service_role` y valida al actor internamente porque con service_role `auth.uid()` es null (20260813000615:26).
- `revalidatePath()` dentro de la action del reset rompe `useActionState` y deja `isPending` colgado para siempre; por eso esa action no redirige ni revalida (commit fc703a9, comentario en actions.ts:572).
- El trim no se auto-reduce. Con `trim_low = trim_high = 1` y solo 2 votos, el resultado es `trimAnnulled` con ajuste 0, no un promedio de los 2 (constants.ts:195).
- `Math.round(-1.5)` en JS es -1: los promedios en .5 redondean al ajuste MENOS castigador (actions.ts:348 y AdminAggregateTable.tsx:49).
- Solo cuentan los votos de miembros con rol Y presencia. Un director que "vota" no aparece en el promedio; la UI lo lista como descartado para que no se crea que su voto entro (page.tsx:704, commit 984e504).
- `expected_members` es decoracion: no valida quorum. Nada impide aplicar ajustes con 2 votantes.
- Historial de indices arranca 2026-05-01: `f_ghin_min_index` puede salir 0.3-0.8 mas alto o null y se cae a `players.handicap_index` (`minIndexFallbackUsed`). Los soft/hard cap NO son evaluables hasta cumplir 365 dias de revisiones; no los presentes como numeros validos (loadGhinReport.ts:426, lib/ghin-report/types.ts:114). Un loader anterior descartaba HI min y delta por esta regla y dejaba la tabla de seleccion vacia (commit d9a787c).
- Fechas del Excel de GHIN: si el export sale con dia y mes intercambiados, el dry-run lo detecta como `date_conflict`/`pctDayGt12` bajo. Insertar ignorando esa senal duplica rondas con fecha equivocada y contamina todos los escenarios.
- `loadGhinReport` usa el cliente de SESION a proposito, para que la RLS de las tablas GHIN aplique. No lo cambies a service_role (comentario en handicap-report/[playerId]/page.tsx:46).
- El expediente se sirve por `/api/players/[playerId]/handicap-report` en streaming inline porque las signed URL de Supabase mandan `Content-Disposition: attachment` para HTML y el movil lo descargaba en vez de abrirlo (lib/player-files/handicapReportUrl.ts:64, commits bdca598 y 35d55d9).
- Imprimir tarjetas dispara `recomputeTournamentHandicaps` del torneo completo (loadPrintableMpScorecards.ts:992). Si el HI cambio y hay override de comite, el override gana; si no hay override, la tarjeta sale con el PH nuevo. Ahi es donde queda "congelado" el handicap que se juega (commit 2956a2f). Desde 2026-09-20 `phForPrintableCard` ya NO antepone el WHS en vivo al PH guardado: delega en el resolvedor canonico (regla 49). Puede hacerlo porque el recompute corre justo antes y deja el guardado fresco; asi la tarjeta impresa nunca sale con un golpe distinto al del marcador o la hoja de subasta.
- `attachGhinToPlayerIfMissing` escribe `players.ghin_number` solo si estaba null, y `lookupGhinByPlayerName` devuelve null ante empate de puntaje para no ligar el GHIN de otro socio (lib/ghin-report/lookupGhinByPlayerName.ts:91).

- **No le apliques el % de la categoria a un PH ya resuelto.** `perHoleCompetitionBreakdown` y `segmentStrokeTotal` recibian el PH de `handicapByPlayerId` y lo pasaban por `playingHandicap(hi, pct)`, o sea 80% del 80%: el desglose hoyo por hoyo repartia menos golpes de los que descontaba el total en la misma pantalla, y los desempates comparaban con un PH bajo. Corregido el 2026-09-20 usando `effectivePlayingHandicapForScoring`. La firma dice `resolvedPlayingHandicap` justamente para que no vuelva a pasar.
- **`lib/leaderboard/handicapStrokes.ts::playingHandicap` es la formula legacy** (HI x %, sin slope ni course rating) y solo sirve de ultimo recurso cuando no hay PH guardado. En el Calcuta 2026 daba otro numero para 43 de 70 inscritos, hasta 8 golpes de diferencia. Si la estas llamando con un valor que ya es PH, el bug es tuyo.
- **`formatEntryHandicapCard` lee override -> PH guardado.** Antes leia solo `playing_handicap` y el override unicamente pintaba la etiqueta "(manual)"; hoy los dos valores se escriben juntos (regla 25 y recomputeTournamentHandicaps.ts:86), pero si algun dia se separan el carnet mostraria un golpe que nadie mas usa.

## Deuda y preguntas abiertas
- `f_ghin_hi_competencia(p_ghin, p_n, p_anios)` se invoca en lib/ghin-report/loadGhinReport.ts:151 pero NO existe en `supabase/migrations`: fue creada directo en Supabase. Igual `category_competition_rules`, `category_tee_rules`, `tee_sets`, `course_tee_sets` y `players`.
- `scripts/recompute-handicaps-once.mjs` (284 lineas) reimplementa a mano `roundHalfUp`, `normalizeTeeName` y el WHS de `lib/handicap/*`. Es un fork que se desincroniza en silencio; `scripts/recompute-handicaps-once.ts` (71) es la version correcta que importa la libreria.
- Ambos scripts de recompute tienen un `tournamentId` y una lista de `player_id` cableados como default (scripts/recompute-handicaps-once.ts:22 y :44).
- `lib/handicap-committee/loadSelectionRows.ts:586` deja un `console.log` de diagnostico que imprime una fila completa de jugador, con dos numeros GHIN cableados como muestra preferida. Es fuga de datos personales a los logs de Vercel (commit 5bc2181, nunca se quito).
- `lib/handicap/whsDifferential.ts` documenta que no aplica ESC / net double bogey y que el HI oficial "es fase 4". El HI que ve el socio en la Mini App no es el HI GHIN.
- Dos implementaciones de golpes por hoyo: `lib/ghin-report/handicapMath.ts:111` (array por stroke index) y `lib/leaderboard/handicapStrokes.ts:34` (por hoyo, con fallback `strokeIndex = holeNumber` cuando el campo no trae indices, que reparte mal).
- `app/(backoffice)/comite-handicap/page.tsx` (2121 lineas) hace carga, calculo y render en un solo archivo; incluye un fallback por si faltan las columnas `flagged_*` (page.tsx:316, commit f40f7a6) que ya deberia sobrar porque la migracion 20260527020000 esta aplicada.
- `v_ghin_competition_summary` y `ghin_competition_rounds` existen y tienen RLS, pero no se ve carga desde la UI: la importacion de rondas de competencia parece manual o por script externo. ATENCION SIN VERIFICAR: no encontre en el repo el importador de `ghin_competition_rounds`.
- La guia mensual (`monthlyDbUpdateGuide.ts`) y el prompt de Claude (`claudePromptTemplate.ts`) son copias congeladas de notas de Obsidian; se desincronizan sin aviso (ver cabeceras de ambos archivos).
- El umbral de veto no bloquea nada: marca `disqualified` en la UI pero no impide inscripcion, pareo ni captura. Falta definir quien ejecuta la descalificacion.

## Relacionado
[[arquitectura]] · [[datos-y-seguridad]] · [[torneos-setup]] · [[matchplay]] · [[resultados-cortes-premios]] · [[calcuta-subasta]] · [[captura-scores]] · [[telegram]]
