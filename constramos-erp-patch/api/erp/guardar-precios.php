<?php
/**
 * Alta / actualizacion de listas de precios de venta en el ERP (salesprices).
 *
 * Solo precios de venta (Lista N1/N2/N3). NO escribe costos APU simulados.
 *
 * POST JSON:
 *   empresa: "constramos" | "rogmai" | "merque"  (default constramos)
 *   dry_run: bool opcional — solo reporta, no escribe
 *
 * Mapeo Constramos: codigo / codigo_constramos → stockid
 *   precio_venta_1 → salestype N1
 *   precio_venta_2 → salestype N2
 *   precio_venta_3 → salestype N3
 *
 * Compatible con PHP 5.6.
 */
require __DIR__ . '/_erp.php';
$vendor = require_login();

if (empty($vendor['es_admin'])) {
  erp_err(new RuntimeException('Solo administradores pueden subir listas de precios al ERP.', 403));
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  erp_err(new RuntimeException('Usa POST.', 405));
}

$body = body_json();
$empresa = strtolower(trim((string)(isset($body['empresa']) ? $body['empresa'] : 'constramos')));
if (!in_array($empresa, array('constramos', 'rogmai', 'merque'), true)) {
  erp_err(new RuntimeException('empresa debe ser constramos, rogmai o merque.', 400));
}
$dryRun = !empty($body['dry_run']);

$curr = defined('ERP_PRICE_CURR') ? ERP_PRICE_CURR : 'MXN';

/**
 * Resuelve typeabbrev de Lista 1/2/3.
 * Prioridad: constantes de config → coincidencia por nombre en salestypes → fallback N1/N2/N3.
 */
function erp_resolve_price_lists(PDO $pdo) {
  $cfg = array(
    1 => defined('ERP_SALESTYPE_N1') ? (string)ERP_SALESTYPE_N1 : '',
    2 => defined('ERP_SALESTYPE_N2') ? (string)ERP_SALESTYPE_N2 : '',
    3 => defined('ERP_SALESTYPE_N3') ? (string)ERP_SALESTYPE_N3 : '',
  );
  if ($cfg[1] !== '' && $cfg[2] !== '' && $cfg[3] !== '') {
    return array(
      1 => array('typeabbrev' => $cfg[1], 'label' => 'Lista 1 (config)'),
      2 => array('typeabbrev' => $cfg[2], 'label' => 'Lista 2 (config)'),
      3 => array('typeabbrev' => $cfg[3], 'label' => 'Lista 3 (config)'),
    );
  }

  $rows = array();
  try {
    $st = $pdo->query('SELECT typeabbrev, sales_type FROM salestypes ORDER BY typeabbrev');
    $rows = $st ? $st->fetchAll() : array();
  } catch (Exception $e) {
    $rows = array();
  }

  $found = array();
  foreach ($rows as $r) {
    $abbr = trim((string)$r['typeabbrev']);
    $name = strtoupper(trim((string)$r['sales_type']));
    $abbrU = strtoupper($abbr);
    if ($abbr === '') continue;
    $n = 0;
    if (preg_match('/\bN\s*1\b|\bLISTA\s*1\b|\bNIVEL\s*1\b|^L1$|^01$|^1$/', $abbrU . ' ' . $name)) $n = 1;
    elseif (preg_match('/\bN\s*2\b|\bLISTA\s*2\b|\bNIVEL\s*2\b|^L2$|^02$|^2$/', $abbrU . ' ' . $name)) $n = 2;
    elseif (preg_match('/\bN\s*3\b|\bLISTA\s*3\b|\bNIVEL\s*3\b|^L3$|^03$|^3$/', $abbrU . ' ' . $name)) $n = 3;
    if ($n && empty($found[$n])) {
      $found[$n] = array('typeabbrev' => $abbr, 'label' => (string)$r['sales_type']);
    }
  }

  $fallback = array(1 => 'N1', 2 => 'N2', 3 => 'N3');
  $out = array();
  for ($i = 1; $i <= 3; $i++) {
    if (!empty($cfg[$i])) {
      $out[$i] = array('typeabbrev' => $cfg[$i], 'label' => 'Lista ' . $i . ' (config)');
    } elseif (!empty($found[$i])) {
      $out[$i] = $found[$i];
    } else {
      $out[$i] = array('typeabbrev' => $fallback[$i], 'label' => 'Lista ' . $i . ' (fallback)');
    }
  }
  return $out;
}

function erp_ensure_salestype(PDO $pdo, $typeabbrev, $label) {
  $st = $pdo->prepare('SELECT typeabbrev FROM salestypes WHERE typeabbrev = ? LIMIT 1');
  $st->execute(array($typeabbrev));
  if ($st->fetchColumn()) return false;
  $ins = $pdo->prepare('INSERT INTO salestypes (typeabbrev, sales_type) VALUES (?, ?)');
  $ins->execute(array($typeabbrev, $label !== '' ? $label : ('Lista ' . $typeabbrev)));
  return true;
}

function erp_upsert_price(PDO $pdo, $typeabbrev, $stockid, $curr, $price) {
  $sel = $pdo->prepare(
    'SELECT price FROM salesprices
     WHERE typeabbrev = ? AND stockid = ? AND currabrev = ? AND debtorno = ?
     LIMIT 1'
  );
  $sel->execute(array($typeabbrev, $stockid, $curr, ''));
  $prev = $sel->fetchColumn();
  if ($prev !== false) {
    if ((float)$prev === (float)$price) {
      return 'same';
    }
    $upd = $pdo->prepare(
      'UPDATE salesprices SET price = ?
       WHERE typeabbrev = ? AND stockid = ? AND currabrev = ? AND debtorno = ?'
    );
    $upd->execute(array($price, $typeabbrev, $stockid, $curr, ''));
    return 'updated';
  }
  $ins = $pdo->prepare(
    'INSERT INTO salesprices (typeabbrev, stockid, currabrev, debtorno, price)
     VALUES (?, ?, ?, ?, ?)'
  );
  $ins->execute(array($typeabbrev, $stockid, $curr, '', $price));
  return 'inserted';
}

try {
  $pdoCot = db();
  $pdoErp = erp_erp_db();

  $lists = erp_resolve_price_lists($pdoErp);
  $createdTypes = array();
  if (!$dryRun) {
    for ($i = 1; $i <= 3; $i++) {
      if (erp_ensure_salestype($pdoErp, $lists[$i]['typeabbrev'], 'Lista ' . $i . ' · volumen N' . $i)) {
        $createdTypes[] = $lists[$i]['typeabbrev'];
      }
    }
  }

  $codeCol = 'codigo';
  if ($empresa === 'merque') $codeCol = 'codigo_merque';
  if ($empresa === 'rogmai') $codeCol = 'codigo_rogmai';

  $st = $pdoCot->query(
    'SELECT id, numero, codigo, codigo_constramos, codigo_merque, codigo_rogmai, nombre,
            precio_venta_1, precio_venta_2, precio_venta_3
     FROM cot_conceptos
     WHERE activo = 1
     ORDER BY numero'
  );
  $rows = $st ? $st->fetchAll() : array();

  $stats = array(
    'inserted' => 0,
    'updated' => 0,
    'same' => 0,
    'skipped_no_code' => 0,
    'skipped_no_stock' => 0,
    'skipped_zero' => 0,
    'errors' => 0,
  );
  $detail = array();
  $stkCheck = $pdoErp->prepare('SELECT stockid FROM stockmaster WHERE stockid = ? LIMIT 1');

  foreach ($rows as $r) {
    $code = '';
    if ($empresa === 'constramos') {
      $code = trim((string)(isset($r['codigo']) ? $r['codigo'] : ''));
      if ($code === '' && !empty($r['codigo_constramos'])) {
        $code = trim((string)$r['codigo_constramos']);
      }
    } else {
      $code = trim((string)(isset($r[$codeCol]) ? $r[$codeCol] : ''));
    }
    if ($code === '') {
      $stats['skipped_no_code']++;
      continue;
    }

    $stkCheck->execute(array($code));
    if (!$stkCheck->fetchColumn()) {
      $stats['skipped_no_stock']++;
      if (count($detail) < 40) {
        $detail[] = array(
          'codigo' => $code,
          'nombre' => (string)$r['nombre'],
          'status' => 'sin_stockmaster',
        );
      }
      continue;
    }

    for ($nivel = 1; $nivel <= 3; $nivel++) {
      $precio = (float)$r['precio_venta_' . $nivel];
      if ($precio <= 0) {
        $stats['skipped_zero']++;
        continue;
      }
      $typeabbrev = $lists[$nivel]['typeabbrev'];
      try {
        if ($dryRun) {
          $stats['same']++;
          continue;
        }
        $res = erp_upsert_price($pdoErp, $typeabbrev, $code, $curr, round($precio, 4));
        if ($res === 'inserted') $stats['inserted']++;
        elseif ($res === 'updated') $stats['updated']++;
        else $stats['same']++;
      } catch (Exception $e) {
        $stats['errors']++;
        if (count($detail) < 40) {
          $detail[] = array(
            'codigo' => $code,
            'lista' => $typeabbrev,
            'status' => 'error',
            'error' => $e->getMessage(),
          );
        }
      }
    }
  }

  erp_ok(array(
    'empresa' => $empresa,
    'dry_run' => $dryRun,
    'database' => erp_erp_db_name(),
    'currency' => $curr,
    'listas' => $lists,
    'salestypes_creados' => $createdTypes,
    'stats' => $stats,
    'detail' => $detail,
    'mensaje' => $dryRun
      ? 'Simulacion OK (sin escritura).'
      : ('Listas subidas: +' . $stats['inserted'] . ' altas, ' . $stats['updated'] . ' actualizadas.'),
  ));
} catch (Exception $e) {
  erp_err($e);
}
