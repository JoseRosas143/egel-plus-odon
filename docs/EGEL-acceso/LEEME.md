# EGEL Acceso v1

Paquete incremental para la aplicacion Next.js existente. Requiere EGEL_Conexion_v1 y EGEL_Perfiles_v1. No cambia la portada, dependencias, configuracion, secretos, esquema de Supabase ni datos academicos.

## Funciones implementadas

- `/login`: formulario de correo y contrasena.
- `/registro`: nombre visible, correo, contrasena y confirmacion.
- `/auth/callback`: intercambio del codigo PKCE; destino fijo `/cuenta`.
- `/cuenta`: renderizado privado tras `getUser()`, perfil y preferencias reales, guardar nombre/zona y meta/fecha, cierre de sesion de este navegador.
- POST `/api/auth/login`, `/api/auth/registro`, `/api/auth/salir`: JSON con origen comprobado, cuerpo limitado y errores depurados.
- GET `/api/auth/sesion`: identidad verificada sin tokens.

## Antes del primer registro

En el proyecto Egel `zbfgcfajiwhfhewkstvi`, ir a **Authentication > URL Configuration**. Agregar a **Redirect URLs**:

```
http://localhost:3000/auth/callback
```

Conservar otras URLs existentes. Si se utiliza otro puerto, agregar exactamente la URL de ese puerto y navegar siempre con el mismo host. Para produccion se necesitara la direccion HTTPS definitiva; no utilizar comodines amplios por comodidad.

No modificar ni desactivar la confirmacion de correo. El callback utiliza la plantilla de confirmacion normal de Supabase (enlace ConfirmationURL). Si antes se personalizo para enviar un token_hash directamente, no reemplazar a ciegas la plantilla: revisar ese flujo antes del registro.

Para la primera prueba, usar el correo de la cuenta administradora de Supabase. Sin SMTP propio, el servicio de pruebas limita el envio a miembros del equipo del proyecto. La configuracion SMTP y la lista actual de redirecciones no se pudieron consultar ni modificar con las acciones del conector disponibles en esta sesion. No se enviaron correos para probarlas.

Usar un navegador normal (Chrome/Edge) tanto para el registro como para abrir el enlace del correo. No mezclar el navegador integrado de VS Code con otro navegador: el verificador PKCE debe estar en el mismo contexto. Mantener el servidor local encendido. Si el enlace confirma el correo pero no crea sesion en ese navegador, volver a `/login` e ingresar con la contrasena, sin repetir el registro.

## Prueba de aceptacion local

1. Instalar el paquete fuera del repo con `node instalar.mjs "C:\dev\egel-plus-odon"`.
2. Dentro del repo, ejecutar `node --test scripts/egel/pruebas-acceso.mjs` y `npm.cmd exec tsc -- --noEmit`. Detenerse ante errores.
3. Ejecutar `npm.cmd run dev` y abrir `/login`. Abrir `/cuenta` sin sesion debe enviar a login.
4. Registrarse una vez, confirmar correo e ingresar. La cuenta debe mostrar su nombre, no datos de otro alumno.
5. Cambiar nombre o meta y guardar. Recargar y comprobar que persisten.
6. Abrir `/api/estudiante/perfil`: debe devolver `ok: true` y el perfil propio.
7. Cerrar sesion. Esa API debe volver a responder 401 `AUTH_REQUIRED`.
8. Antes de publicar, completar build, renovar una sesion real y probar dos navegadores/cuentas distintas. Las pruebas SQL previas no sustituyen este ultimo paso.

## Seguridad y alcance

No se usa service_role ni una clave secreta. Los clientes Auth son por solicitud; tokens se guardan por el SDK en cookies, nunca en el JSON de la API ni en logs creados por este paquete. No se aceptan IDs de usuario, roles ni destinos de redireccion enviados por el formulario. Los cambios de perfil siguen las API/RLS del paquete anterior. Cerrar sesion usa scope local; los access tokens emitidos previamente pueden seguir validos hasta expirar, segun el comportamiento de Supabase.

Rutas de datos y Auth devuelven cache privada/no-store. `/cuenta` espera una solicitud real dentro de Suspense; no se desactiva Cache Components ni se cachean los perfiles.

Este es un bloque de piloto: faltan recuperacion de contrasena, CAPTCHA/control de abuso de produccion, configuracion SMTP para alumnos externos, dominio final, pruebas E2E reales, roles administrativos y los modulos de estudio. No se afirma que la aplicacion completa este lista para publicacion. WhatsApp sigue siendo la unica exclusion funcional acordada, no estos pendientes.

## Desinstalacion sin afectar datos

El instalador solo agrega archivos ausentes y anota las rutas creadas en un registro fuera del repositorio. Para revertir codigo, revisar ese registro y retirar solo los archivos que este paquete agrego, comprobando primero que no tengan cambios posteriores. No borrar tablas, cuentas ni los paquetes anteriores. No hay SQL nuevo que revertir.

## Referencias de implementacion

- https://supabase.com/docs/guides/auth/server-side/creating-a-client
- https://supabase.com/docs/guides/auth/sessions/pkce-flow
- https://supabase.com/docs/guides/auth/redirect-urls
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/auth/signout
- https://nextjs.org/docs/app/api-reference/functions/connection

Las referencias explican APIs; no son evidencia de haber ejecutado sesiones reales con las dependencias del usuario.
