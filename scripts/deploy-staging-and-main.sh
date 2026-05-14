#!/usr/bin/env bash
# Despliega en Vercel: producción (rama main) y preview/staging (rama staging).
# Requisitos: `npx vercel login`, proyecto enlazado (`vercel link`) y variables de entorno en Vercel.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Hay cambios sin commitear. Haz commit o stash antes de desplegar." >&2
  exit 1
fi

git fetch origin

echo "==> Producción (main) → vercel --prod"
git checkout main
git pull origin main
npx vercel deploy --prod --yes

echo "==> Staging (rama staging) → deploy preview (dominio staging si está ligado a la rama)"
git checkout staging
git pull origin staging
npx vercel deploy --yes

echo "==> Vuelta a main"
git checkout main

echo "Listo. Revisa URLs en el dashboard de Vercel (Deployments)."
