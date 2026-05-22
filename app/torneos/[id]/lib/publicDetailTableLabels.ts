/** Subtotales: tras hoyos 1–9 y 10–18 (es) vs bloque final tras los 18 (en). */
export type DetailTotalsPlacement = "inline-after-nines" | "trailing-after-18";

/** Etiquetas de la tabla hoyo por hoyo (torneo público / favoritos). */
export type PublicDetailTableLabels = {
  holesCol: string;
  parRow: string;
  firstNineTitle: string;
  firstNineSub: string;
  secondNineTitle: string;
  secondNineSub: string;
  totalTitle: string;
  totalSub: string;
  gross: string;
  toPar: string;
  pos: string;
  noCapture: string;
  /** Encabezado al expandir detalle (nombre completo vs nombre abreviado en tabla). */
  detailExpandedCategoryLabel: string;
  detailExpandedClubLabel: string;
  detailCloseButton: string;
  detailCloseAria: string;
  detailToggleOpenAria: string;
  detailToggleCloseAria: string;
  detailTotalsPlacement: DetailTotalsPlacement;
  auditStrokeIndex: string;
  auditStrokesReceived: string;
  auditNetStrokes: string;
  auditStablefordPoints: string;
};

type Pub = {
  detailHolesCol: string;
  detailParRow: string;
  detailFirstNineTitle: string;
  detailFirstNineSub: string;
  detailSecondNineTitle: string;
  detailSecondNineSub: string;
  detailTotalTitle: string;
  detailTotalSub: string;
  detailGross: string;
  detailToPar: string;
  detailPos: string;
  detailNoCapture: string;
  detailExpandedCategoryLabel: string;
  detailExpandedClubLabel: string;
  detailCloseButton: string;
  detailCloseAria: string;
  detailToggleOpenAria: string;
  detailToggleCloseAria: string;
  detailTotalsPlacement: DetailTotalsPlacement;
  detailAuditStrokeIndex: string;
  detailAuditStrokesReceived: string;
  detailAuditNetStrokes: string;
  detailAuditStablefordPoints: string;
};

export function detailLabelsFromPublicTournament(pub: Pub): PublicDetailTableLabels {
  return {
    holesCol: pub.detailHolesCol,
    parRow: pub.detailParRow,
    firstNineTitle: pub.detailFirstNineTitle,
    firstNineSub: pub.detailFirstNineSub,
    secondNineTitle: pub.detailSecondNineTitle,
    secondNineSub: pub.detailSecondNineSub,
    totalTitle: pub.detailTotalTitle,
    totalSub: pub.detailTotalSub,
    gross: pub.detailGross,
    toPar: pub.detailToPar,
    pos: pub.detailPos,
    noCapture: pub.detailNoCapture,
    detailExpandedCategoryLabel: pub.detailExpandedCategoryLabel,
    detailExpandedClubLabel: pub.detailExpandedClubLabel,
    detailCloseButton: pub.detailCloseButton,
    detailCloseAria: pub.detailCloseAria,
    detailToggleOpenAria: pub.detailToggleOpenAria,
    detailToggleCloseAria: pub.detailToggleCloseAria,
    detailTotalsPlacement: pub.detailTotalsPlacement,
    auditStrokeIndex: pub.detailAuditStrokeIndex,
    auditStrokesReceived: pub.detailAuditStrokesReceived,
    auditNetStrokes: pub.detailAuditNetStrokes,
    auditStablefordPoints: pub.detailAuditStablefordPoints,
  };
}
