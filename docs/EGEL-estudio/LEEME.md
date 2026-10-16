# EGEL Estudio v1

Requiere Conexion v1, Perfiles v1, Acceso v1 y el ajuste de estilos ya instalados.
No modifica esos archivos. No cambia la portada ni la cuenta; abre /estudio directamente.

## Incluye

- /estudio: banco de practica, orden original, navegacion anterior/siguiente/aleatoria e ir a numero.
- Guardar eleccion sin calificacion; cada intento pertenece a su alumno.
- Apuntes generales, por opcion, veredicto personal, favoritos y resaltados del enunciado.
- /mis-apuntes: lectura paginada y enlace al editor de cada reactivo.
- Dialogo de comandos de navegacion y notas. Los comandos IA siguen pendientes.
- Recordatorio del ultimo reactivo visitado; se actualiza mediante POST explicito.
- Versiones de reactivo y revision de notas: un guardado con revision antigua devuelve 409, no sobrescribe silenciosamente otra pestana.

## Carga inicial

Inicia sesion con la cuenta de desarrollo que ya probaste. En /estudio selecciona
`datos/reactivos_469_staging.json` del ZIP, FUERA del repo, y pulsa Importar 469 reactivos.
La copia es identica a Fase0 v1.1. El servidor y la funcion SQL limitan la importacion
al operador habilitado y al SHA-256 exacto de ese archivo. No se aceptan otros archivos.
No copies datos/, PDF, ZIP ni .env.local al repositorio publico.

La primera importacion es atomica: banco y 469 preguntas en una transaccion. Repetir
el mismo archivo despues de una importacion completa devuelve already_imported,
no genera duplicados ni reemplaza notas. Esta ruta no permite editar las preguntas.
No hay service_role en el codigo. No se solicita una nueva clave.

## Separacion academica

La guia es solo procedencia de los ejercicios. evidence_eligible=false y scoreable=false.
No hay clave clinica, calificacion ni explicaciones de IA en este paquete. El veredicto
personal es un apunte del alumno, no una respuesta validada ni oficial.
Las incidencias editoriales se conservan; el contenido no se corrige silenciosamente.
El resaltado conserva posiciones UTF-16 sobre el texto exacto de la version del reactivo.

## API

GET /api/estudio/reactivo (opcional ?numero=1)
GET /api/estudio/apuntes?page=0
POST /api/estudio/guardar
POST /api/estudio/respuesta
POST /api/estudio/posicion
POST /api/estudio/importar

GET no modifica progreso. Las escrituras requieren sesion, mismo Origin, JSON limitado,
campos permitidos y validacion. La identidad proviene de getUser(), nunca del formulario.
Todas las respuestas son private/no-store. RLS separa notas, intentos y posiciones.
El banco comun solo se lee con sesion no anonima. Importar no otorga acceso a notas ajenas.

## Migracion

20261016011221_egel_question_bank_and_private_notes.sql YA APLICADA en Egel.
Incluye tambien 20261016011957_egel_deny_direct_import_permission_access.sql, ya aplicada.
La copia es para versionado; no la ejecutes de nuevo en el panel. La asignacion puntual
del operador de importacion no se exporta con datos de tu cuenta.

## Comprobacion local

node --test scripts/egel/pruebas-estudio.mjs
npm.cmd exec tsc -- --noEmit
npm.cmd run dev

Recuerda guardar apuntes antes de navegar. No se guardan borradores en localStorage.
Una sesion caducada no borra el texto visible: copia tus cambios antes de volver a /login.
La recuperacion de contrasena, pruebas reales de dos cuentas, build de produccion,
tutores RAG y el resto del alcance continuan pendientes.
