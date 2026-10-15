import { validateProfilePatch } from "../estudiante/domain";

export type AuthMode = "login" | "registro" | "salir";
export type Credentials = { email: string; password: string };
export type Registration = Credentials & { display_name: string };
export type AuthFailure = { code?: string; status?: number };
export type AuthOutcome = { error: AuthFailure | null; signedIn: boolean };
export type SessionUser = { id: string; email: string | null };
export type SessionOutcome = { error: AuthFailure | null; user: SessionUser | null };
export type AuthAdapter = {
  login: (credentials: Credentials) => Promise<AuthOutcome>;
  signup: (data: Registration, redirectTo: string) => Promise<AuthOutcome>;
  logout: () => Promise<{ error: AuthFailure | null }>;
  session: () => Promise<SessionOutcome>;
  exchange: (code: string, flowId?: string) => Promise<AuthOutcome>;
  respond: (response: Response) => Response;
};
export type CreateAuthAdapter = () => AuthAdapter;
export type InputResult<T> = { ok: true; value: T } | { ok: false; message: string };

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
export function validateCredentials(value: unknown, signup = false): InputResult<Credentials | Registration> {
  const allowed = signup ? ["email", "password", "confirm_password", "display_name"] : ["email", "password"];
  if (!record(value) || Object.keys(value).some((key) => !allowed.includes(key))) {
    return { ok: false, message: "Campos de acceso no permitidos." };
  }
  if (typeof value.email !== "string" || value.email.length > 254) {
    return { ok: false, message: "Escribe un correo v\u00e1lido." };
  }
  const email = value.email.trim();
  if (!/^[^\s@\u0000-\u001f]+@[^\s@\u0000-\u001f]+\.[^\s@\u0000-\u001f]+$/.test(email)) {
    return { ok: false, message: "Escribe un correo v\u00e1lido." };
  }
  // Do not trim or normalize a password. Let Supabase enforce its own policy too.
  if (typeof value.password !== "string" || value.password.length < 1 || value.password.length > 256) {
    return { ok: false, message: "Escribe una contrase\u00f1a v\u00e1lida." };
  }
  if (!signup) return { ok: true, value: { email, password: value.password } };
  if ([...value.password].length < 10) {
    return { ok: false, message: "Utiliza al menos 10 caracteres para la contrase\u00f1a." };
  }
  if (value.password !== value.confirm_password) {
    return { ok: false, message: "Las contrase\u00f1as no coinciden." };
  }
  const name = validateProfilePatch({ display_name: value.display_name });
  if (!name.ok || !name.value.display_name) {
    return { ok: false, message: "Escribe un nombre de entre 1 y 100 caracteres." };
  }
  return { ok: true, value: { email, password: value.password, display_name: name.value.display_name } };
}

export function errorMessage(code: string): string {
  const messages: Record<string, string> = {
    CREDENTIALS_REJECTED: "No fue posible iniciar sesi\u00f3n. Revisa el correo y la contrase\u00f1a.",
    EMAIL_NOT_CONFIRMED: "Confirma primero tu correo y vuelve a iniciar sesi\u00f3n.",
    EMAIL_DELIVERY_RESTRICTED: "El servicio de correo no permite enviar a esta direcci\u00f3n. El administrador debe revisar el remitente y SMTP de Supabase.",
    TOO_MANY_ATTEMPTS: "Se alcanz\u00f3 el l\u00edmite de intentos o de correos. Espera antes de volver a probar.",
    SIGNUP_DISABLED: "El registro no est\u00e1 habilitado en este proyecto.",
    PASSWORD_REJECTED: "Supabase no acept\u00f3 esa contrase\u00f1a. Usa una frase larga, distinta y dif\u00edcil de adivinar.",
    CAPTCHA_REQUIRED: "Este proyecto requiere CAPTCHA. Hay que conectar ese control antes de continuar.",
    AUTH_REQUIRED: "Tu sesi\u00f3n termin\u00f3. Vuelve a ingresar.",
    AUTH_UNAVAILABLE: "No fue posible contactar con el servicio de acceso. Intenta de nuevo m\u00e1s tarde.",
    STUDENT_DATA_MISSING: "La sesi\u00f3n existe, pero falta el perfil. No vuelvas a registrarte; reporta el problema.",
    DATABASE_UNAVAILABLE: "No fue posible guardar o recuperar los datos. Tus cambios no est\u00e1n confirmados.",
    ORIGIN_NOT_ALLOWED: "La solicitud no procede del origen permitido. Abre la aplicaci\u00f3n en su direcci\u00f3n habitual.",
  };
  return Object.prototype.hasOwnProperty.call(messages, code) ? messages[code] : "La operaci\u00f3n no se complet\u00f3. Intenta de nuevo o comunica el error.";
}

export function classifyAuthError(error: AuthFailure): { code: string; status: number } {
  if (error.status === 429 || ["over_request_rate_limit", "over_email_send_rate_limit"].includes(error.code ?? "")) {
    return { code: "TOO_MANY_ATTEMPTS", status: 429 };
  }
  const codes: Record<string, { code: string; status: number }> = {
    invalid_credentials: { code: "CREDENTIALS_REJECTED", status: 401 },
    email_not_confirmed: { code: "EMAIL_NOT_CONFIRMED", status: 403 },
    email_address_not_authorized: { code: "EMAIL_DELIVERY_RESTRICTED", status: 503 },
    signup_disabled: { code: "SIGNUP_DISABLED", status: 403 },
    weak_password: { code: "PASSWORD_REJECTED", status: 400 },
    validation_failed: { code: "CREDENTIALS_REJECTED", status: 400 },
    captcha_failed: { code: "CAPTCHA_REQUIRED", status: 403 },
  };
  return Object.prototype.hasOwnProperty.call(codes, error.code ?? "")
    ? codes[error.code!] : { code: "AUTH_UNAVAILABLE", status: 503 };
}
