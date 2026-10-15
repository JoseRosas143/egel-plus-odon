# EGEL - Perfiles y preferencias, primera base de datos

## Estado de entrega

La migracion remota `20261015221317_egel_student_profiles_and_preferences` ya esta
aplicada al proyecto Egel `zbfgcfajiwhfhewkstvi`. La copia SQL incluida usa la version
consultada en `supabase_migrations.schema_migrations`; no es una nueva migracion a
repetir. El instalador local solo copia archivos, no conecta ni ejecuta SQL.

Tablas creadas: `public.profiles` y `public.study_preferences`. RLS habilitada en
ambas, con politicas SELECT/UPDATE del propietario. No hay autorizacion basada en
un campo role editable. El rol authenticated solo puede modificar las columnas
permitidas; no puede reasignar user_id ni insertar o eliminar directamente perfiles.
Las preferencias se crean por trigger, junto al perfil, despues de INSERT en auth.users.

## Rutas

| Metodo y ruta | Funcion |
|---|---|
| GET /api/estudiante/perfil | Perfil del usuario autenticado |
| PATCH /api/estudiante/perfil | Cambiar nombre visible y/o zona horaria |
| GET /api/estudiante/preferencias | Preferencias del usuario autenticado |
| PATCH /api/estudiante/preferencias | Meta, fecha, modo o tema visual |

Todos los endpoints verifican la identidad con `getUser()` por solicitud y usan el
cliente SSR existente, nunca service_role. Las consultas se restringen ademas por
`user_id`. No hay estado de usuario global ni cache compartida. Las rutas esperan
`connection()` para ejecutarse por solicitud con Cache Components activado.

### Cambios permitidos

Perfil: `display_name` (1-100 caracteres, sin controles) y `timezone` reconocida.
Preferencias: `daily_goal_minutes` entero 5-240, `exam_date` fecha YYYY-MM-DD valida
o null, `preferred_mode` sequential/random/review, `theme` system/light/dark.
Los temas/modos son preferencias guardadas; no activan todavia una UI o simulacro.

PATCH requiere Origin igual al origen de la peticion, JSON y cuerpo maximo 4096
bytes. No se confia en X-Forwarded-Host. Antes de publicar tras un reverse proxy,
verificar que la URL efectiva refleje correctamente el dominio publico; ajustar una
allowlist de origen del servidor si fuera necesario, sin aceptar origen arbitrario.

Ejemplo futuro dentro del navegador de la aplicacion y despues del login:

```js
await fetch('/api/estudiante/preferencias', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ daily_goal_minutes: 30 }),
});
```

Respuestas: 200 exito; 401 AUTH_REQUIRED sin identidad valida; 403
ORIGIN_NOT_ALLOWED; 400 INVALID_INPUT/INVALID_JSON; 413 BODY_TOO_LARGE; 415
JSON_REQUIRED; 409 STUDENT_DATA_MISSING; 503 cuando Auth/DB no responde.
No se reenvia el texto interno de errores, tokens ni contrasenas.

## Comprobacion local inmediata

Sin login, `GET /api/estudiante/perfil` debe devolver
`{"ok":false,"error":"AUTH_REQUIRED"}` con HTTP 401. Es la barrera de acceso,
no una nueva prueba de conectividad ni un login completo. La pagina de inicio no
cambia. No es necesario reinstalar dependencias ni reemplazar next.config.ts.

## Alcance comprobado y limites

Se probaron en la base remota 30 aserciones con dos identidades sinteticas mediante
SET LOCAL ROLE y claims dentro de BEGIN/ROLLBACK. Se comprobaron triggers, lectura
propia, denegacion cruzada, columnas inmutables, rechazo anon y restricciones de
valores. Consulta posterior: cero usuarios, perfiles y preferencias. No se enviaron
correos ni se dejaron cuentas de prueba.

El analizador de seguridad de Supabase devolvio cero avisos en esa comprobacion.
Esto no certifica la plataforma completa: no cubre tablas aun no creadas, archivos,
cache futura de IA, interfaz, registro por correo ni todos los casos de produccion.

Las 58 pruebas locales del paquete simulan SDK/framework y prueban validadores,
respuestas privadas, limites HTTP, filtros por identidad y delegacion de rutas.
TypeScript estricto de los tres modulos puros se comprobo por separado.
Faltan build con las dependencias exactas del usuario y pruebas reales de login,
cookies, refresco, logout y dos navegadores. No se ejecuto una prueba visual porque
este paquete no modifica interfaz. Los archivos anteriores y el banco quedan intactos.

## Decisiones

- Administracion del contenido se implementara aparte; nadie elige su propio rol.
- No hay acceso anonimo al perfil o sus preferencias.
- Una funcion interna SECURITY DEFINER se usa solo como trigger de auth.users, no RPC.
  Se mantiene en egel_private sin acceso de anon/authenticated y con search_path vacio.
- No se habilita la guia de reactivos como evidencia ni se importan PDF aqui.
- El unico modulo funcional fuera del alcance del proyecto sigue siendo WhatsApp.

## Referencias tecnicas consultadas

- https://supabase.com/docs/guides/auth/managing-user-data
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/auth/server-side/creating-a-client
- https://supabase.com/docs/guides/auth/server-side/advanced-guide
- https://nextjs.org/docs/app/api-reference/functions/connection
