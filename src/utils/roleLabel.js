// A role as people say it — "Team manager", "Entrenador principal" — rather
// than the database's snake_case. Unknown roles fall back to a readable form
// of the key so a newly added role never shows up blank.
export function roleLabel(role, t) {
  if (!role) return '';
  const camel = role.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  const fallback = role.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  return t ? t(`roles.${camel}`, fallback) : fallback;
}
