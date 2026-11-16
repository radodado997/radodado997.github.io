// Tłumaczenie kodów błędów zwracanych przez funkcje PostgreSQL (RAISE EXCEPTION).
const MESSAGES: Record<string, string> = {
  not_authenticated: "Musisz być zalogowany.",
  room_not_found: "Nie znaleziono pokoju.",
  room_already_started: "Losowanie już wystartowało, ta akcja jest niedostępna.",
  room_not_started: "Losowanie jeszcze nie wystartowało.",
  forbidden_not_admin: "Tylko administrator pokoju może to zrobić.",
  forbidden_not_member: "Nie jesteś członkiem tego pokoju.",
  identity_unavailable: "Ta osoba została już wybrana przez kogoś innego.",
  already_claimed: "Masz już wybraną tożsamość w tym pokoju.",
  no_identity: "Najpierw wybierz swoją tożsamość.",
  duplicate_name: "Osoba o takim imieniu jest już w pokoju.",
  need_at_least_3_participants: "Potrzeba co najmniej 3 osób.",
  participant_not_removable: "Nie można usunąć tej osoby (wybrała już tożsamość).",
  no_valid_target: "Nie udało się wylosować. Spróbuj ponownie.",
};

export function messageFor(
  error: { message?: string; code?: string } | null | undefined,
): string {
  if (!error) return "";
  const key = (error.message ?? "").trim();
  if (key in MESSAGES) return MESSAGES[key];
  if (error.code === "42501") return "Brak uprawnień.";
  if (error.code === "23505") return "Taki wpis już istnieje.";
  if (error.code === "23514") return "Budżet musi mieścić się w zakresie 0–100 000 zł.";
  return "Wystąpił błąd. Spróbuj ponownie.";
}
