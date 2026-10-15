/** Datos personales del alumno; no contiene claves, roles ni datos academicos. */
export type Profile = {
  user_id: string;
  display_name: string;
  timezone: string;
  created_at: string;
  updated_at: string;
};
export type StudyPreferences = {
  user_id: string;
  daily_goal_minutes: number;
  exam_date: string | null;
  preferred_mode: "sequential" | "random" | "review";
  theme: "system" | "light" | "dark";
  created_at: string;
  updated_at: string;
};
export type ProfilePatch = Partial<Pick<Profile, "display_name" | "timezone">>;
export type PreferencesPatch = Partial<Pick<StudyPreferences,
  "daily_goal_minutes" | "exam_date" | "preferred_mode" | "theme">>;
export type Validation<T> = { ok: true; value: T } | { ok: false; message: string };
export type DbResult<T> = { data: T | null; failed: boolean };
export type StudentRepository = {
  profile: {
    read: () => Promise<DbResult<Profile>>;
    update: (patch: ProfilePatch) => Promise<DbResult<Profile>>;
  };
  preferences: {
    read: () => Promise<DbResult<StudyPreferences>>;
    update: (patch: PreferencesPatch) => Promise<DbResult<StudyPreferences>>;
  };
};
export type AuthResult =
  | { ok: true; repository: StudentRepository }
  | { ok: false; status: 401 | 503; code: "AUTH_REQUIRED" | "AUTH_UNAVAILABLE" };
export type Authenticate = () => Promise<AuthResult>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function hasOwn(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}
function validateKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return isRecord(value) && Object.keys(value).length > 0
    && Object.keys(value).every((key) => keys.includes(key));
}
export function validateProfilePatch(value: unknown): Validation<ProfilePatch> {
  if (!validateKeys(value, ["display_name", "timezone"])) {
    return { ok: false, message: "Envia solo display_name y/o timezone." };
  }
  const out: ProfilePatch = {};
  if (hasOwn(value, "display_name")) {
    if (typeof value.display_name !== "string") return { ok: false, message: "Nombre no valido." };
    const name = value.display_name.trim();
    if ([...name].length < 1 || [...name].length > 100 || /[\u0000-\u001f\u007f]/.test(name)) {
      return { ok: false, message: "El nombre debe tener entre 1 y 100 caracteres, sin caracteres de control." };
    }
    out.display_name = name;
  }
  if (hasOwn(value, "timezone")) {
    if (typeof value.timezone !== "string" || value.timezone.length > 80 || !value.timezone.trim()) {
      return { ok: false, message: "Zona horaria no valida." };
    }
    const timezone = value.timezone.trim();
    try { new Intl.DateTimeFormat("es-MX", { timeZone: timezone }).format(0); }
    catch { return { ok: false, message: "Usa una zona horaria reconocida, como America/Mexico_City." }; }
    out.timezone = timezone;
  }
  return { ok: true, value: out };
}
function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1900 || year > 2200) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
export function validatePreferencesPatch(value: unknown): Validation<PreferencesPatch> {
  if (!validateKeys(value, ["daily_goal_minutes", "exam_date", "preferred_mode", "theme"])) {
    return { ok: false, message: "Envia solo preferencias permitidas; no identificadores ni roles." };
  }
  const out: PreferencesPatch = {};
  if (hasOwn(value, "daily_goal_minutes")) {
    const n = value.daily_goal_minutes;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 5 || n > 240) {
      return { ok: false, message: "La meta debe ser un entero de 5 a 240 minutos." };
    }
    out.daily_goal_minutes = n;
  }
  if (hasOwn(value, "exam_date")) {
    if (value.exam_date !== null && !validDate(value.exam_date)) return { ok: false, message: "Fecha no valida; usa AAAA-MM-DD o null." };
    out.exam_date = value.exam_date;
  }
  if (hasOwn(value, "preferred_mode")) {
    if (value.preferred_mode !== "sequential" && value.preferred_mode !== "random" && value.preferred_mode !== "review") {
      return { ok: false, message: "Modo no valido." };
    }
    out.preferred_mode = value.preferred_mode;
  }
  if (hasOwn(value, "theme")) {
    if (value.theme !== "system" && value.theme !== "light" && value.theme !== "dark") {
      return { ok: false, message: "Tema no valido." };
    }
    out.theme = value.theme;
  }
  return { ok: true, value: out };
}
