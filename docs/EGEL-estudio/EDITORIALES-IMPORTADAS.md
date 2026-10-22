# Preparación privada de editoriales importadas

## Estado al 22 de octubre de 2026

El usuario aprobó contenido y permisos de fuentes para 001, 003 y 006, y después autorizó aplicar la migración y publicar únicamente esos tres. Se aplicó `20261022061805_imported_reviewed_editorials.sql` al proyecto EGEL y se publicaron las tres bases en `tutor_imported_editorials`, cada una con tres referencias. No se cambiaron 034–036, respuestas, notas, favoritos o veredictos; no se distribuyeron libros/artículos completos ni se llamó a modelos.

**Pendiente: verificar el despliegue del lector actualizado.** La migración y los datos ya están en Supabase. Esta entrega incluye el lector y sus etiquetas; el usuario autorizó su commit y push a `main`. La publicación en base de datos o el push no confirman que el sitio desplegado ya pueda mostrar este formato: debe comprobarse después en una sesión autenticada.

Los recibos de revisión, autorización y huellas están fuera del repositorio. La confirmación de permisos procede del usuario; no representa una comprobación jurídica independiente ni certificación clínica.

Este adaptador convierte los borradores revisados de 001, 003 y 006 en preparaciones locales con procedencia `imported-chat-editorial`. No inventa una llamada a DeepSeek, Gemini u OpenAI; tampoco modifica el lector del alumno, registra fuentes ni publica en Supabase.

## Separación de estados

- El JSON de origen continúa siendo un exportador de chat sin modelo verificado.
- El permiso inicial cubría preparar los textos existentes. Los recibos posteriores autorizan compartir y publicar exactamente 001, 003 y 006; no cubren revisiones futuras ni certificación clínica.
- Los cotejos de fuentes se conservan con su alcance, no como aprobación integral o permiso comercial.
- La clave elegida por el usuario no se copia al contenido común. El texto original, sus límites y sus propuestas se conservan sin reescribirlos para coincidir con una preferencia.
- 002, 004, 005, 007, 008, 009 y 010 no entran en este piloto. 034–036 tampoco pueden ser sustituidos por él.

## Entrada

Crear un manifiesto fuera del repositorio, con esta estructura. Las huellas SHA256 se calculan sobre los bytes reales de cada archivo; las rutas se resuelven desde el manifiesto.

```json
{
  "schema": "egel-imported-editorial-manifest-v1",
  "draftImportManifest": {"path": "ruta-al-manifiesto-original.json", "sha256": "HUELLA_SHA256"},
  "reviewPacket": {"path": "PAQUETE-REVISION.json", "sha256": "HUELLA_SHA256"},
  "decision": {"path": "DECISION-USUARIO-001.json", "sha256": "HUELLA_SHA256"},
  "numbers": ["001", "003", "006"]
}
```

Las huellas protegen integridad, no autentican una decisión ni certifican una fuente. El operador debe revisar el manifiesto y la procedencia de los recibos. Se vuelve a cargar y validar el lote de importación completo, sus archivos y el snapshot; se comparan enunciado, opciones, versión, texto, referencias y los vínculos de la solicitud original de preparación.

## Uso

Desde la raíz del proyecto:

```powershell
node scripts/egel/preparar-editoriales-importadas.mjs --manifest=C:\ruta-privada\manifest.json --plan
node scripts/egel/preparar-editoriales-importadas.mjs --manifest=C:\ruta-privada\manifest.json --execute --output=C:\otra-carpeta-privada-existente
node --test scripts/egel/pruebas-editoriales-importadas.mjs
```

El modo plan no escribe. El modo execute reserva una carpeta por huella; escribe con creación exclusiva y un marcador final. Una ejecución idéntica reutiliza el resultado; un destino incompleto, alterado o redirigido hace que se detenga sin repararlo. No se admiten salidas dentro del repositorio ni de las carpetas de entrada.

## Costura de previsualización

`importedEditorialPreview()` ofrece un contrato privado de texto y referencias para un futuro visor del operador. Verifica otra vez la huella de preparación y la versión/contenido de la pregunta. Con `answerSaved=false` devuelve `answer-required` sin revelar texto o referencias. Con `true` devuelve `pending-human-review`, nunca `shared-reviewed`, una calificación ni un estado publicado. El valor booleano debe venir del servidor en cualquier futura conexión: la función pura no autentica usuarios.

Esta previsualización privada no está conectada al panel del alumno ni se acepta directamente como una fila publicada. La integración descrita más abajo exige recibos separados, publicación explícita y el contrato de lectura publicado; no se rebaja la validación de las bases anteriores.

## Visor del operador, solo en este equipo

```powershell
node scripts/egel/visor-editorial.mjs --manifest=C:\dev\egel-json-audit-20261018\integracion-editorial-001\manifest.json --port=4317
```

Abrir el enlace privado que muestra el proceso. La aplicación de estudio normal sigue siendo independiente; este visor no está disponible en Vercel ni desde un teléfono en la red local. Ctrl+C lo cierra. El enlace caduca en una hora y cambia en cada arranque; no compartirlo.

- Tres paneles en escritorio y pestañas en pantallas pequeñas: Reactivo, Explicación y Fuentes.
- «Abrir explicación» muestra el texto existente para revisión del operador; no simula que el alumno haya guardado una respuesta. No guarda decisiones, notas ni aprobaciones.
- El registro de fuentes es de consulta: muestra los cotejos heredados y sus límites, no registra ni aprueba fuentes en Supabase.
- El servidor escucha exclusivamente en `127.0.0.1`, comprueba Host/Origin y rechaza peticiones reenviadas o de otros sitios. Se requiere el enlace de acceso para recibir una cookie HttpOnly/SameSite Strict. El fragmento del enlace se elimina de la barra tras abrirlo.
- Cada lectura vuelve a validar el manifiesto y las entradas. Un cambio bloquea la respuesta; reiniciar requiere revisar de nuevo el contexto. No hay copia alternativa, generación automática ni acceso a `.env.local`.
- Se reutiliza el renderizador seguro del Tutor, con tablas y fórmulas. No se ejecuta código de los JSON ni se permiten HTML activo, imágenes o enlaces arbitrarios en el texto.

Verificaciones reproducibles:

```powershell
node --test scripts/egel/pruebas-visor-editorial.mjs scripts/egel/pruebas-editoriales-importadas.mjs scripts/egel/pruebas-importacion-borradores.mjs scripts/egel/pruebas-bases-compartidas.mjs
```

Este aislamiento es apropiado para revisión local, no sustituye una autenticación y autorización de operadores para un despliegue compartido. No ejecutar detrás de un proxy, túnel o servicio público.

Archivos del visor: `scripts/egel/visor-editorial.mjs` (arranque), `scripts/egel/lib/editorial-preview-server.mjs` (acceso local y lecturas), `scripts/egel/lib/editorial-preview-renderer.mjs` (renderizador compartido), `scripts/egel/editorial-preview/index.html`, `viewer.js`, `viewer.css` (interfaz) y `scripts/egel/pruebas-visor-editorial.mjs` (pruebas). Esta documentación también se actualizó. Los archivos de origen, recibos, capturas y datos clínicos siguen fuera del repositorio.

## Publicación y lectura compartida

El registro publicado conserva procedencia `imported-chat-editorial`, proveedor/modelo desconocidos, huellas del texto y de los recibos, alcances de fuente y permisos confirmados por el usuario. No reutiliza contratos DeepSeek/Gemini ni modifica su esquema o restricciones. Las fuentes son metadatos y enlaces, no archivos completos; la aprobación del usuario no se amplía a otras obras o páginas.

La nueva tabla tiene RLS, auditoría backend-only y lectura limitada a columnas públicas del contenido publicado. El cliente de sesión del alumno solo puede leerlo después de su propia respuesta guardada a esa versión. Los borradores, contenidos retirados o expirados y los que ya no coinciden con la pregunta actual quedan ocultos. Editar texto, fuentes o procedencia elimina la revisión. Las tres publicaciones actuales tienen revisión con vencimiento el 20 de enero de 2027; debe renovarse o retirarse explícitamente, no generarse otra respuesta automáticamente.

`publish_imported_editorial` se ejecutó mediante SQL de operador autorizado, no desde el cliente del alumno. Es `SECURITY INVOKER` y exige poder verificar una cuenta activa en `auth.users`; el rol de servicio de este proyecto no tiene lectura de esa tabla y por tanto falla de forma segura en esa comprobación. **No conceder lectura de `auth.users` para convertir este flujo en un RPC público.** La función privada de RLS devuelve solo un booleano y comprueba identidad no anónima, respuesta propia y snapshot.

El lector nuevo usa `src/lib/tutor/imported-base.ts` desde la API de Tutor con el cliente de sesión, nunca con clave administrativa. Las vistas Literatura y Comparar muestran «editorial revisada» y aclaran que el modelo de origen no está verificado. Las citas conservan R2/R3/R4, enlaces y alcance del cotejo, sin inventar páginas PDF.

Para esta entrega se autorizó commit/push. Antes de publicar el código: revisar el diff y los archivos pendientes y mantener credenciales/recibos privados fuera del repo. Después, comprobar el flujo real en la web autenticada. No hay variables nuevas en Vercel. No se agregan claves, PDF, contenido clínico privado o correos de revisores al repositorio.

## Verificación de publicación

- 225 pruebas offline aprobadas, incluyendo PostgreSQL en memoria, API real con dependencias aisladas, integridad de recibos, reversión atómica, RLS, expiración y compatibilidad de las bases anteriores.
- TypeScript, lint y build aprobados.
- Consultas RLS en el proyecto: la cuenta revisora solo ve 003, el único de los tres con respuesta propia guardada; una identidad sin intentos y una identidad anónima ven cero. Sin insertar respuestas de prueba en producción.
- Huellas de las bases 034–036 iguales antes y después; conteos de respuestas y notas sin cambios (7 y 4).
- Prueba visual aislada de los componentes reales con datos publicados del 003, a 1440×1000 y 390×844; apertura de fuentes en Literatura y Comparar, sin desbordamiento de página, errores de consola ni solicitudes externas. No fue una sesión del sitio desplegado.
- Browser no disponible y CLI de Playwright no presente en caché: se utilizó Playwright incluido con Edge instalado, sin dependencias nuevas.
- Aviso de seguridad previo de Supabase: protección de contraseñas filtradas desactivada. La nueva migración no añadió avisos; no se cambió la configuración de Auth dentro de esta tarea.

Archivos de esta integración: migración `20261022061805_imported_reviewed_editorials.sql`, `scripts/egel/lib/imported-editorial-publication.mjs`, `scripts/egel/pruebas-publicacion-importada.mjs`, lector `src/lib/tutor/imported-base.ts`, contrato `src/lib/tutor/domain.ts`, API `src/app/api/estudio/tutor/route.ts`, etiquetas de `tutor-panel.tsx` y `comparison-panel.tsx`, y pruebas actualizadas en `pruebas-bases-compartidas.mjs`.
