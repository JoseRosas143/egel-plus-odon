# EGEL Plus ODON - Conexion Supabase v1

Este paquete se AGREGA a la aplicacion Next.js existente. No es otra aplicacion,
no requiere repetir create-next-app y no trae package.json ni node_modules.

## Incluye
- Cliente de navegador y cliente de servidor con @supabase/ssr.
- Proxy para renovacion de cookies en las rutas previstas de autenticacion.
- Validacion de entorno que rechaza otro proyecto o claves administrativas.
- GET /api/health/supabase, disponible solamente con NODE_ENV=development.
- Comprobacion local y pruebas unitarias que no hacen peticiones externas.

## Lo que no hace todavia
No crea cuentas, tablas, politicas RLS ni migraciones. No incluye pantalla de
login, banco de preguntas, PDFs, agentes IA ni aislamiento multiusuario probado.
El proxy solo renueva sesiones: NO autoriza por si solo el acceso a una pagina.
Cada ruta privada futura debera verificar identidad y la base debera aplicar RLS.
La pantalla inicial de Next.js no cambia en esta entrega.

## Archivos existentes preservados
No se sustituye .env.local, .gitignore, package.json, package-lock.json,
next.config.ts, tsconfig.json, src/app/page.tsx, src/app/layout.tsx ni globals.css.
El instalador crea respaldos fuera del repositorio antes de sustituir archivos
permitidos. Si hay un middleware o proxy ajeno, se detiene para no mezclar reglas.

## Probar en tu computadora
Desde la raiz de egel-plus-odon:

    node scripts/egel/comprobar.mjs
    node scripts/egel/pruebas.mjs
    npx.cmd --no-install tsc --noEmit
    npm.cmd run lint
    npm.cmd run build
    npm.cmd run dev

No es necesario reinstalar Supabase. Las pruebas unitarias requieren el paquete
typescript de desarrollo que usa Next.js. No escriben archivos del proyecto ni
hacen llamadas a Supabase. tsc/lint/build son las comprobaciones de integracion
con TUS dependencias; las pruebas unitarias no las sustituyen.

Abre http://localhost:3000/api/health/supabase (o el puerto de tu terminal).
Resultado esperado, NO obtenido aun desde tu computadora:

    {"ok":true,"service":"supabase-auth","status":200}

En produccion el diagnostico devuelve 404 por diseno. Una respuesta 200 al
servicio Auth no prueba una sesion iniciada, tablas existentes ni RLS correcto.

## Uso posterior
Client Component:

    import { createClient } from '@/lib/supabase/client';
    const supabase = createClient();

Server Component / Server Action / Route Handler:

    import { createClient } from '@/lib/supabase/server';
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    // Comprobar error y data?.claims antes de cualquier dato privado.

No cachear clientes, cookies ni datos de alumnos con "use cache" global.
Conservar el flujo de cookies del Proxy. Al crear rutas distintas de /estudio,
/cuenta, /auth, /login, /registro o /api/estudiante, revisar el matcher.
Los handlers/acciones con cambios de sesion deben responder sin cache compartida.
No almacenar roles de autorizacion en user_metadata modificable por el alumno.

## GitHub
Publica solo codigo. No incluir .env.local, PDF, ZIP de materiales, datos de
alumnos, tokens ni claves administrativas. El instalador NO hace commit/push.
Si aun no publicaste la base Next.js, estos archivos solos no sustituyen a
package.json y al resto del proyecto: primero debe versionarse el proyecto local.

## Fuentes tecnicas consultadas (15 de octubre de 2026)
- Supabase SSR: https://supabase.com/docs/guides/auth/server-side/creating-a-client
- Supabase API keys: https://supabase.com/docs/guides/api/api-keys
- Next.js Proxy: https://nextjs.org/docs/app/api-reference/file-conventions/proxy
- Next.js connection: https://nextjs.org/docs/app/api-reference/functions/connection
- Changelog: https://supabase.com/changelog

## Limites de la verificacion de esta entrega
Se probaron el instalador en directorios desechables, casos de configuracion,
el diagnostico con respuestas simuladas y la sintaxis TypeScript.
No se ejecutaron el build con Next 16.4.2 ni una sesion Auth real en este entorno;
no habia dependencias Next/Supabase instaladas y la descarga de red no estuvo
disponible. Las versiones de tu proyecto no se modifican para eludir esa prueba.
