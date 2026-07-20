#!/bin/bash
# Doble clic (o correr en Terminal) para generar y abrir el proyecto de Xcode.
# Requiere Homebrew. Si no lo tienes, instálalo desde https://brew.sh
set -e
cd "$(dirname "$0")"

echo "==> Verificando XcodeGen…"
if ! command -v xcodegen >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    echo "==> Instalando XcodeGen con Homebrew…"
    brew install xcodegen
  else
    echo "ERROR: Falta Homebrew. Instálalo desde https://brew.sh y vuelve a correr esto."
    exit 1
  fi
fi

echo "==> Generando GolfTorneoWatch.xcodeproj…"
xcodegen generate

echo "==> Abriendo en Xcode…"
open GolfTorneoWatch.xcodeproj

echo "Listo. En Xcode elige un simulador de Apple Watch y presiona ▶︎ (Run)."
