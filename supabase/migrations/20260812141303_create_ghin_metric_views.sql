-- Vistas y funciones métricas GHIN (ya aplicadas en producción como 20260812141303).
-- Archivo reconstruido desde el esquema vivo para que el repo coincida
-- con supabase_migrations.schema_migrations.

CREATE OR REPLACE VIEW public.v_ghin_player_activity AS
 SELECT ghin_number,
    max(golfer_name) AS golfer_name,
    max(gender) AS gender,
    count(*) AS rondas_total,
    count(*) FILTER (WHERE date_played >= date_trunc('year'::text, CURRENT_DATE::timestamp with time zone)) AS rondas_anio_actual,
    count(*) FILTER (WHERE date_played >= (CURRENT_DATE - '3 years'::interval)) AS rondas_3_anios,
    count(*) FILTER (WHERE date_played >= (CURRENT_DATE - '1 year'::interval)) AS rondas_12_meses,
    min(date_played) AS primera_ronda,
    max(date_played) AS ultima_ronda,
    round(avg(differential) FILTER (WHERE date_played >= date_trunc('year'::text, CURRENT_DATE::timestamp with time zone)), 1) AS dif_prom_anio
   FROM ghin_rounds r
  GROUP BY ghin_number;

CREATE OR REPLACE VIEW public.v_ghin_competition_summary AS
 SELECT ghin_number,
    max(golfer_name) AS golfer_name,
    count(*) AS rondas_comp,
    count(*) FILTER (WHERE score_type ~~ 'C%H'::text) AS en_casa,
    count(*) FILTER (WHERE score_type ~~ 'C%A'::text) AS fuera,
    count(DISTINCT course_played) AS campos_distintos,
    round(avg(differential), 1) AS dif_prom,
    min(date_played) AS primera,
    max(date_played) AS ultima
   FROM ghin_competition_rounds
  GROUP BY ghin_number;

CREATE OR REPLACE FUNCTION public.f_ghin_escenario(p_ghin text, p_n integer, p_ventana text DEFAULT 'anio'::text)
 RETURNS TABLE(n_solicitado integer, n_usado integer, indice numeric, desde date, hasta date, es_historico boolean, universo integer)
 LANGUAGE sql
 STABLE
AS $function$
  with base as (
    select r.differential, r.date_played
    from ghin_rounds r
    where r.ghin_number = p_ghin
      and r.differential is not null
      and case when p_ventana = 'anio'
               then r.date_played >= date_trunc('year', current_date)
               else r.date_played >= current_date - interval '3 years' end
  ),
  mejores as (select * from base order by differential asc limit p_n)
  select
    p_n,
    (select count(*)::int from mejores),
    round(avg(differential), 1),
    min(date_played), max(date_played),
    (min(date_played) < date_trunc('year', current_date)),
    (select count(*)::int from base)
  from mejores
  having count(*) > 0;
$function$;

CREATE OR REPLACE FUNCTION public.f_ghin_min_index(p_ghin text, p_desde date, p_hasta date)
 RETURNS numeric
 LANGUAGE sql
 STABLE
AS $function$
  select min(hi) from (
    select handicap_index as hi
      from ghin_index_revisions
     where ghin_number = p_ghin
       and revision_date between p_desde and p_hasta
    union all
    select hi from (
      select handicap_index as hi
        from ghin_index_revisions
       where ghin_number = p_ghin
         and revision_date <= p_desde
       order by revision_date desc
       limit 1
    ) carry
  ) t;
$function$;

CREATE OR REPLACE FUNCTION public.f_ghin_holes_avg(p_ghin text, p_min_rondas integer DEFAULT 10)
 RETURNS TABLE(hoyo integer, promedio numeric, promedio_mejores10 numeric, n_rondas integer, desde date, hasta date, es_historico boolean)
 LANGUAGE sql
 STABLE
AS $function$
  with sel as (
    select case
      when (select count(*) from ghin_rounds
             where ghin_number = p_ghin
               and date_played >= date_trunc('year', current_date)) >= p_min_rondas
      then date_trunc('year', current_date)::date
      else (current_date - interval '3 years')::date end as corte
  ),
  rs as (
    select r.* from ghin_rounds r, sel
    where r.ghin_number = p_ghin and r.date_played >= sel.corte
  ),
  b10 as (select id from rs where differential is not null order by differential asc limit 10),
  unrolled as (
    select h.hoyo, h.golpes, rs.id
    from rs cross join lateral (values
      (1,rs.h1),(2,rs.h2),(3,rs.h3),(4,rs.h4),(5,rs.h5),(6,rs.h6),
      (7,rs.h7),(8,rs.h8),(9,rs.h9),(10,rs.h10),(11,rs.h11),(12,rs.h12),
      (13,rs.h13),(14,rs.h14),(15,rs.h15),(16,rs.h16),(17,rs.h17),(18,rs.h18)
    ) as h(hoyo, golpes)
  )
  select
    u.hoyo,
    round(avg(u.golpes), 2),
    round(avg(u.golpes) filter (where u.id in (select id from b10)), 2),
    (select count(*)::int from rs),
    (select min(date_played) from rs),
    (select max(date_played) from rs),
    (select min(date_played) from rs) < date_trunc('year', current_date)
  from unrolled u
  where u.golpes is not null
  group by u.hoyo
  order by u.hoyo;
$function$;
