"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { errorMessage, validateCredentials } from "@/lib/acceso/domain";
import { AccessShell } from "./shell";
import styles from "./styles.module.css";

function PasswordField({ repeat = false, register = false }: { repeat?: boolean; register?: boolean }) {
  const [show, setShow] = useState(false);
  const id = repeat ? "confirm_password" : "password";
  return <div className={styles.field}>
    <label className={styles.label} htmlFor={id}>{repeat ? "Repite tu contrase\u00f1a" : "Contrase\u00f1a"}</label>
    <div className={styles.password}>
      <input className={styles.input} id={id} name={id} type={show ? "text" : "password"}
        autoComplete={register ? "new-password" : "current-password"} required maxLength={256}
        minLength={register ? 10 : 1} aria-describedby={register && !repeat ? "password-hint" : undefined} />
      <button className={styles.reveal} type="button" aria-pressed={show} aria-controls={id}
        aria-label={`${show ? "Ocultar" : "Mostrar"} ${repeat ? "confirmaci\u00f3n de contrase\u00f1a" : "contrase\u00f1a"}`}
        onClick={() => setShow(!show)}>{show ? "Ocultar" : "Mostrar"}</button>
    </div>
    {register && !repeat ? <p id="password-hint" className={styles.hint}>Al menos 10 caracteres. Utiliza una frase &uacute;nica que puedas recordar.</p> : null}
  </div>;
}

export function AccessForm({ mode }: { mode: "login" | "registro" }) {
  const register = mode === "registro";
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const [checkEmail, setCheckEmail] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const code = new URL(window.location.href).searchParams.get("aviso");
    if (code === "confirmacion") setNotice("No se pudo completar el enlace. Si tu correo ya qued\u00f3 confirmado, ingresa con tu contrase\u00f1a. Abre los enlaces nuevos en el mismo navegador donde te registraste.");
    else if (code === "sesion") setNotice("Inicia sesi\u00f3n para acceder a tu cuenta.");
    else if (code === "salida") setNotice("Sesi\u00f3n cerrada en este navegador.");
  }, []);
  useEffect(() => { if (failure) errorRef.current?.focus(); }, [failure]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const body = register ? {
      display_name: fields.get("display_name"), email: fields.get("email"),
      password: fields.get("password"), confirm_password: fields.get("confirm_password"),
    } : { email: fields.get("email"), password: fields.get("password") };
    const validation = validateCredentials(body, register);
    if (!validation.ok) { setFailure(validation.message); return; }
    setPending(true); setFailure(""); setNotice("");
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        setFailure(result.error === "INVALID_INPUT" && typeof result.message === "string"
          ? result.message : errorMessage(result.error ?? "AUTH_UNAVAILABLE"));
        return;
      }
      if (result.state === "SIGNED_IN") {
        // Full navigation avoids stale RSC prefetches with pre-login cookies.
        window.location.assign("/cuenta");
      } else if (register && result.state === "CHECK_EMAIL") {
        setCheckEmail(true); form.reset();
      } else setFailure(errorMessage("AUTH_UNAVAILABLE"));
    } catch { setFailure(errorMessage("AUTH_UNAVAILABLE")); }
    finally {
      for (const name of ["password", "confirm_password"]) {
        const input = form.elements.namedItem(name);
        if (input instanceof HTMLInputElement) input.value = "";
      }
      setPending(false);
    }
  }
  return <AccessShell>
    <h1 className={styles.title}>{checkEmail ? "Revisa tu correo" : register ? "Crea tu cuenta" : "Inicia sesi\u00f3n"}</h1>
    <p className={styles.subtitle}>{checkEmail
      ? "Si la direcci\u00f3n puede registrarse, recibir\u00e1s instrucciones para confirmar el acceso."
      : register ? "Un espacio personal para tu preparaci\u00f3n." : "Accede a tu perfil de estudiante."}</p>
    {notice ? <p role="status" className={styles.notice}>{notice}</p> : null}
    {failure ? <p role="alert" tabIndex={-1} ref={errorRef} className={styles.error}>{failure}</p> : null}
    {checkEmail ? <>
      <p className={styles.notice}>Abre el enlace en este mismo navegador, con el servidor encendido. Revisa tambi&eacute;n spam. No repitas el registro si el correo tarda.</p>
      <p className={styles.links}><a href="/login">Ya confirm&eacute; mi correo: iniciar sesi&oacute;n</a></p>
    </> : <form className={styles.form} onSubmit={submit} aria-busy={pending}>
      <fieldset className={styles.fields} disabled={pending}>
        {register ? <div className={styles.field}>
          <label className={styles.label} htmlFor="display_name">Nombre visible</label>
          <input className={styles.input} id="display_name" name="display_name" autoComplete="name" required maxLength={100} />
        </div> : null}
        <div className={styles.field}>
          <label className={styles.label} htmlFor="email">Correo electr&oacute;nico</label>
          <input className={styles.input} id="email" name="email" type="email" autoComplete="email" required maxLength={254} autoCapitalize="none" spellCheck={false} />
        </div>
        <PasswordField register={register} />
        {register ? <PasswordField repeat register /> : null}
        <button className={styles.button} type="submit">{pending ? "Procesando..." : register ? "Crear cuenta" : "Entrar"}</button>
      </fieldset>
    </form>}
    {!checkEmail ? <p className={styles.links}>{register ? "\u00bfYa tienes cuenta? " : "\u00bfA\u00fan no tienes cuenta? "}<a href={register ? "/login" : "/registro"}>{register ? "Iniciar sesi\u00f3n" : "Crear cuenta"}</a></p> : null}
  </AccessShell>;
}
