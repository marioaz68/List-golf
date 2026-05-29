"use client";

import { useActionState, useMemo, useState } from "react";
import SubmitButton from "@/components/ui/SubmitButton";
import {
  createRoundFormAction,
  roundFormInitialState,
  type RoundFormState,
} from "./actions";

type CategoryOption = {
  id: string;
  label: string;
};

const fieldClass =
  "h-8 w-full rounded-md border border-gray-300 bg-gray-100 px-2 text-[11px] leading-normal text-black";
const labelClass =
  "text-[10px] font-semibold uppercase tracking-[0.04em] leading-none text-gray-700";
const fieldWrapClass = "grid gap-1 min-w-[150px]";
const newRoundGridClass =
  "grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[90px_145px_110px_130px_115px_115px_auto] xl:items-end";

function buildTimeOptions(startHour = 6, endHour = 18, stepMinutes = 5) {
  const options: string[] = [];
  for (let hh = startHour; hh <= endHour; hh++) {
    for (let mm = 0; mm < 60; mm += stepMinutes) {
      options.push(
        String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0")
      );
    }
  }
  return options;
}

export default function CreateRoundDayForm({
  tournamentId,
  categories,
}: {
  tournamentId: string;
  categories: CategoryOption[];
}) {
  const [state, formAction, isPending] = useActionState<
    RoundFormState,
    FormData
  >(createRoundFormAction, roundFormInitialState);
  const [clientError, setClientError] = useState<string | null>(null);

  const timeOptions = useMemo(() => buildTimeOptions(), []);
  const soleCategoryId = categories.length === 1 ? categories[0]?.id : null;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const fd = new FormData(e.currentTarget);
    if (fd.getAll("category_ids").filter(Boolean).length === 0) {
      e.preventDefault();
      setClientError("Selecciona al menos una categoría.");
      return;
    }
    setClientError(null);
  }

  return (
    <form
      action={formAction}
      onSubmit={handleSubmit}
      className={newRoundGridClass}
    >
      <input type="hidden" name="tournament_id" value={tournamentId} />

      {clientError ? (
        <div
          className="col-span-full rounded border border-red-300 bg-red-50 px-2 py-1.5 text-[11px] leading-snug text-red-800"
          role="alert"
        >
          {clientError}
        </div>
      ) : null}

      {state.ok === false ? (
        <div
          className="col-span-full rounded border border-red-300 bg-red-50 px-2 py-1.5 text-[11px] leading-snug text-red-800"
          role="alert"
        >
          {state.message}
        </div>
      ) : null}

      <div className={fieldWrapClass}>
        <label className={labelClass} htmlFor="round_date">
          Fecha / día
        </label>
        <input
          id="round_date"
          name="round_date"
          type="date"
          className={fieldClass}
          required
          disabled={isPending}
        />
      </div>

      <div className={fieldWrapClass}>
        <label className={labelClass} htmlFor="round_no">
          Ronda
        </label>
        <input
          id="round_no"
          name="round_no"
          type="number"
          min="1"
          placeholder="Ej. 1"
          className={fieldClass}
          required
          disabled={isPending}
        />
      </div>

      <div className={fieldWrapClass}>
        <label className={labelClass} htmlFor="wave">
          Turno
        </label>
        <select
          id="wave"
          name="wave"
          defaultValue="AM"
          className={fieldClass}
          required
          disabled={isPending}
        >
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>

      <div className={fieldWrapClass}>
        <label className={labelClass} htmlFor="start_type">
          Tipo salida
        </label>
        <select
          id="start_type"
          name="start_type"
          defaultValue="tee_time"
          className={fieldClass}
          disabled={isPending}
        >
          <option value="tee_time">Tee time</option>
          <option value="shotgun">Shotgun</option>
        </select>
      </div>

      <div className={fieldWrapClass}>
        <label className={labelClass} htmlFor="start_time">
          Hora inicio
        </label>
        <select
          id="start_time"
          name="start_time"
          defaultValue="07:30"
          className={fieldClass}
          disabled={isPending}
        >
          <option value="">Sin hora</option>
          {timeOptions.map((time) => (
            <option key={time} value={time}>
              {time}
            </option>
          ))}
        </select>
      </div>

      <div className={fieldWrapClass}>
        <label className={labelClass} htmlFor="interval_minutes">
          Intervalo
        </label>
        <select
          id="interval_minutes"
          name="interval_minutes"
          defaultValue="8"
          className={fieldClass}
          disabled={isPending}
        >
          <option value="">Sin intervalo</option>
          <option value="7">7 min</option>
          <option value="8">8 min</option>
          <option value="9">9 min</option>
          <option value="10">10 min</option>
          <option value="12">12 min</option>
        </select>
      </div>

      <div className={fieldWrapClass}>
        <label className={labelClass} htmlFor="group_size">
          Grupo
        </label>
        <select
          id="group_size"
          name="group_size"
          defaultValue="4"
          className={fieldClass}
          disabled={isPending}
        >
          <option value="3">3 jug.</option>
          <option value="4">4 jug.</option>
        </select>
      </div>

      <div className="col-span-full">
        <label className={labelClass}>Categorías que juegan ese día</label>
        <p className="mt-0.5 text-[10px] leading-snug text-gray-500">
          Marca una o más. Con una sola categoría en el torneo ya viene
          seleccionada. Si el calendario de abajo ya tiene esa fecha, ronda y
          turno, no vuelvas a crearla aquí (edítala en la tabla).
        </p>
        <div className="mt-1 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
          {categories.map((c) => (
            <label
              key={c.id}
              className="flex cursor-pointer items-center gap-2 rounded border border-gray-300 bg-gray-100 px-2 py-1 text-[11px] text-black"
            >
              <input
                type="checkbox"
                name="category_ids"
                value={c.id}
                defaultChecked={c.id === soleCategoryId}
                className="h-3 w-3"
                disabled={isPending}
              />
              <span>{c.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-end">
        <SubmitButton pendingText="Creando..." disabled={categories.length === 0}>
          Crear ronda(s)
        </SubmitButton>
      </div>
    </form>
  );
}
