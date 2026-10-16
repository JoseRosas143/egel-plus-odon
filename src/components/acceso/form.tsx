"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { errorMessage, validateCredentials } from "@/lib/acceso/domain";
import { AccessShell } from "./shell";
import styles from "./styles.module.css";

function getNoticeFromUrl(): string {
  if (typeof window === "undefined") return "";

  const code = new URL(window.location.href).searchParams.get("aviso");

  if (code === "confirmacion") {
    return "No se pudo completar el enlace. Si tu correo ya quedó confirmado, ingresa con tu contraseña. Abre los enlaces nuevos en el mismo navegador donde te registraste.";
  }

  if (code === "sesion") {
    return "Inicia sesión para acceder a tu cuenta.";
  }

  if (code === "salida") {
    return "Sesión cerrada en este navegador.";
  }

  return "";
}

/**
 * El aviso depende de la URL del navegador.
 *
 * useSyncExternalStore permite obtener ese valor en cliente sin hacer
 * setState() dentro de useEffect y sin provocar un mismatch de hidratación.
 *
 * La URL no necesita observarse continuamente en esta pantalla, por lo que
 * la suscripción no registra listeners.
 */
function subscribeToNotice() {
  return () => {};
}

function useUrlNotice() {
  return useSyncExternalStore(
    subscribeToNotice,
    getNoticeFromUrl,
    () => "",
  );
}

function PasswordField({
  repeat = false,
  register = false,
}: {
  repeat?: boolean;
  register?: boolean;
}) {
  const [show, setShow] = useState(false);
  const id = repeat ? "confirm_password" : "password";

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {repeat ? "Repite tu contraseña" : "Contraseña"}
      </label>

      <div className={styles.password}>
        <input
          className={styles.input}
          id={id}
          name={id}
          type={show ? "text" : "password"}
          autoComplete={register ? "new-password" : "current-password"}
          required
          maxLength={256}
          minLength={register ? 10 : 1}
          aria-describedby={
            register && !repeat ? "password-hint" : undefined
          }
        />

        <button
          className={styles.reveal}
          type="button"
          aria-pressed={show}
          aria-controls={id}
          aria-label={`${show ? "Ocultar" : "Mostrar"} ${
            repeat ? "confirmación de contraseña" : "contraseña"
          }`}
          onClick={() => setShow((current) => !current)}
        >
          {show ? "Ocultar" : "Mostrar"}
        </button>
      </div>

      {register && !repeat ? (
        <p id="password-hint" className={styles.hint}>
          Al menos 10 caracteres. Utiliza una frase única que puedas recordar.
        </p>
      ) : null}
    </div>
  );
}

export function AccessForm({
  mode,
}: {
  mode: "login" | "registro";
}) {
  const router = useRouter();
  const register = mode === "registro";

  const urlNotice = useUrlNotice();

  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");
  const [hideUrlNotice, setHideUrlNotice] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  const errorRef = useRef<HTMLParagraphElement>(null);

  const notice = hideUrlNotice ? "" : urlNotice;

  useEffect(() => {
    if (failure) {
      errorRef.current?.focus();
    }
  }, [failure]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (pending) return;

    const form = event.currentTarget;
    const fields = new FormData(form);

    const body = register
      ? {
          display_name: fields.get("display_name"),
          email: fields.get("email"),
          password: fields.get("password"),
          confirm_password: fields.get("confirm_password"),
        }
      : {
          email: fields.get("email"),
          password: fields.get("password"),
        };

    const validation = validateCredentials(body, register);

    if (!validation.ok) {
      setFailure(validation.message);
      return;
    }

    setPending(true);
    setFailure("");
    setHideUrlNotice(true);

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        setFailure(
          result.error === "INVALID_INPUT" &&
            typeof result.message === "string"
            ? result.message
            : errorMessage(result.error ?? "AUTH_UNAVAILABLE"),
        );
        return;
      }

      if (result.state === "SIGNED_IN") {
        /**
         * La API ya estableció la sesión/cookie.
         * Navegamos con Next y refrescamos el árbol del servidor para que
         * /cuenta lea la sesión recién creada.
         */
        router.replace("/cuenta");
        router.refresh();
        return;
      }

      if (register && result.state === "CHECK_EMAIL") {
        setCheckEmail(true);
        form.reset();
        return;
      }

      setFailure(errorMessage("AUTH_UNAVAILABLE"));
    } catch {
      setFailure(errorMessage("AUTH_UNAVAILABLE"));
    } finally {
      for (const name of ["password", "confirm_password"]) {
        const input = form.elements.namedItem(name);

        if (input instanceof HTMLInputElement) {
          input.value = "";
        }
      }

      setPending(false);
    }
  }

  return (
    <AccessShell>
      <h1 className={styles.title}>
        {checkEmail
          ? "Revisa tu correo"
          : register
            ? "Crea tu cuenta"
            : "Inicia sesión"}
      </h1>

      <p className={styles.subtitle}>
        {checkEmail
          ? "Si la dirección puede registrarse, recibirás instrucciones para confirmar el acceso."
          : register
            ? "Un espacio personal para tu preparación."
            : "Accede a tu perfil de estudiante."}
      </p>

      {notice ? (
        <p role="status" className={styles.notice}>
          {notice}
        </p>
      ) : null}

      {failure ? (
        <p
          role="alert"
          tabIndex={-1}
          ref={errorRef}
          className={styles.error}
        >
          {failure}
        </p>
      ) : null}

      {checkEmail ? (
        <>
          <p className={styles.notice}>
            Abre el enlace en este mismo navegador, con el servidor encendido.
            Revisa también spam. No repitas el registro si el correo tarda.
          </p>

          <p className={styles.links}>
            <a href="/login">
              Ya confirmé mi correo: iniciar sesión
            </a>
          </p>
        </>
      ) : (
        <form
          className={styles.form}
          onSubmit={submit}
          aria-busy={pending}
        >
          <fieldset
            className={styles.fields}
            disabled={pending}
          >
            {register ? (
              <div className={styles.field}>
                <label
                  className={styles.label}
                  htmlFor="display_name"
                >
                  Nombre visible
                </label>

                <input
                  className={styles.input}
                  id="display_name"
                  name="display_name"
                  autoComplete="name"
                  required
                  maxLength={100}
                />
              </div>
            ) : null}

            <div className={styles.field}>
              <label
                className={styles.label}
                htmlFor="email"
              >
                Correo electrónico
              </label>

              <input
                className={styles.input}
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                autoCapitalize="none"
                spellCheck={false}
              />
            </div>

            <PasswordField register={register} />

            {register ? (
              <PasswordField repeat register />
            ) : null}

            <button
              className={styles.button}
              type="submit"
            >
              {pending
                ? "Procesando..."
                : register
                  ? "Crear cuenta"
                  : "Entrar"}
            </button>
          </fieldset>
        </form>
      )}

      {!checkEmail ? (
        <p className={styles.links}>
          {register
            ? "¿Ya tienes cuenta? "
            : "¿Aún no tienes cuenta? "}

          <a href={register ? "/login" : "/registro"}>
            {register
              ? "Iniciar sesión"
              : "Crear cuenta"}
          </a>
        </p>
      ) : null}
    </AccessShell>
  );
}