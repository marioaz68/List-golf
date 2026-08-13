/**
 * Otros roles operativos = cualquier `roles.code` distinto de
 * handicap_committee (la lista vive en la tabla, no se cablea).
 * Solo-comité: tiene handicap_committee y ninguno de esos otros.
 */
export function isCommitteeOnlyUser(roleCodes: string[]): boolean {
  const codes = [
    ...new Set(roleCodes.map((c) => String(c).trim()).filter(Boolean)),
  ];
  return (
    codes.includes("handicap_committee") &&
    codes.every((c) => c === "handicap_committee")
  );
}
