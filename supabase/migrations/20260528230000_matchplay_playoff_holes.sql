-- Permite hoyos de desempate (19..27) en match play "Bola Baja + Bola Alta".
-- Los hoyos 19-27 son la repetición física de los hoyos 1-9 cuando el partido
-- termina empatado al hoyo 18. Se mantienen las ventajas (stroke index) de los
-- hoyos 1-9 y se aplica muerte súbita: en cuanto una pareja gana al menos
-- un punto, el partido termina.

alter table public.private_hole_scores
  drop constraint if exists private_hole_scores_hole_number_check;

alter table public.private_hole_scores
  add constraint private_hole_scores_hole_number_check
  check (hole_number between 1 and 27);
