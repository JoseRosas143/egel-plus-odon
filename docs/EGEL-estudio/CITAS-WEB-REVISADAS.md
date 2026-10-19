# Complementos web revisados

Las explicaciones con `literature-editorial-web-v1` conservan los PDF originales y añaden referencias web **editoriales**, que no se presentan como contenido consultado por el modelo.

- La primera URL habilitada es exactamente `https://www.cun.es/diccionario-medico/terminos/lipotimia`. No se admiten variantes con parámetros, credenciales, fragmentos ni otros dominios. No hay búsquedas o descargas automáticas desde el servidor.
- El operador registra título, entidad, resumen acotado, alcance, fecha de verificación y caducidad (máximo 90 días). El registro nace como borrador y requiere aprobación humana sobre su huella exacta.
- El texto y los datos de revisión permanecen en una tabla backend-only con RLS y sin permisos de alumno. Solo llegan al lector el título, entidad, URL y fecha de verificación. Nunca se inventa una identidad de libro o una página PDF para una página web.
- Cambiar el contenido o metadatos restablece la aprobación. La revocación o caducidad oculta la explicación dependiente hasta una revisión nueva. No afecta apuntes, respuestas ni veredictos personales.
- El alumno debe haber guardado su propia respuesta para esa versión del reactivo. Las explicaciones siguen siendo propuestas de estudio, no claves oficiales ni calificaciones.
- Las versiones anteriores (`literature-base-v1` y `literature-editorial-v1`) mantienen su formato y sus huellas. Los lectores antiguos no solicitan la nueva variante. Desplegar el lector compatible antes de publicar contenido web.

## Operación

`scripts/egel/lib/web-editorial-registration.mjs` genera un plan SQL atómico de **registro como borrador**, sin conectarse ni publicar. Exige aprobación del cuerpo, fuentes PDF y complemento web por separado. La publicación se realiza después con `publish_reviewed_tutor_base`, sobre la huella exacta del borrador y un revisor identificado.

No se habilita un proveedor nuevo, no se añaden variables de entorno y leer estas explicaciones no genera llamadas de IA.

## Validación

Las pruebas PostgreSQL/PGlite cubren registro atómico, idempotencia, aprobación, revocación, caducidad y permisos por alumno. Las pruebas del lector rechazan URLs ajenas, referencias web disfrazadas de PDF y variantes incompatibles. Las pruebas de interfaz se realizan con el componente real en un montaje local aislado, sin autenticar alumnos ni escribir datos personales; eso no sustituye una comprobación autenticada posterior en producción.
