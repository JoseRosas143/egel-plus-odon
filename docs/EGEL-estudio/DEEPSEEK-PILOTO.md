# DeepSeek: piloto local con presupuesto

## Estado y alcance

Adaptador opcional de servidor con AI SDK `7.0.143` y proveedor DeepSeek
`3.0.67`. No sustituye Gemini/OpenAI ni está conectado a las rutas del alumno.
No habilitar este registro de archivos en Vercel: varias instancias no comparten
disco. No se modificaron notas, respuestas, historial ni veredictos personales.
La clave `DEEPSEEK_API_KEY` permanece en `.env.local`, sin `NEXT_PUBLIC_`.
Una clave sola no habilita llamadas. No copiarla a conversaciones, archivos de
entrada, Git ni capturas. Ninguna prueba automatizada utiliza esa clave real.

El skill de AI SDK guió la configuración explícita de razonamiento, límite de
salida, salida JSON y `maxRetries: 0`; no hay herramientas, búsqueda, carga de
archivos, bucles de agentes ni cambio de proveedor en caso de fallo.

## Presupuesto y límites honestos

- Máximo US$1 para este conjunto de pruebas, descontando el gasto previo que
  el operador debe conciliar de Gemini/OpenAI antes de inicializar. El operador
  no debe asumir cero: este registro no consulta facturas de otros proveedores.
- Un micro-USD = US$0.000001. Tope fijo `1000000`; máximo 10 llamadas nuevas.
- Reserva persistente por llamada: `604916` micro-USD (US$0.604916), calculada
  con 2 millones de tokens de entrada como cota conservadora superior al
  contexto documentado de 1M, más 4096 tokens de salida, a tarifa pico.
  No se utiliza una conversión aproximada de caracteres a tokens para prometer
  un límite de cobro. Esto puede bloquear una llamada que probablemente sería
  barata si el saldo disponible no cubre la reserva; es intencional.
- Al recibir consumo válido, la reserva se ajusta a una estimación superior
  basada en tokens reales reportados: entrada US$0.30/M, salida US$1.20/M.
  Se ignoran descuentos de caché/horario. La salida incluye el razonamiento;
  no se suma dos veces. No es un recibo ni una garantía de facturación.
- Tarifas consultadas el 18 de octubre de 2026. Se bloquean generaciones nuevas
  a partir del 25 de octubre de 2026 hasta revisar tarifas y código. El alias
  puede cambiar de versión. Un modelo inesperado no libera la reserva.
- Resultado desconocido, proceso interrumpido, error HTTP o consumo incompleto:
  conservar la reserva y bloquear todas las llamadas nuevas. Un bloqueo de
  proceso no se elimina automáticamente. Conciliar con el proveedor antes de
  reparar el registro; no borrar el presupuesto para recuperar cupo.
- JSON/citas inválidos con consumo conocido: cobrar la estimación, retener la
  respuesta y no repetir esa solicitud automáticamente.
- Petición idéntica, fuentes y versión de prompt idénticas: reutilizar el
  borrador local completado. Cambiar la versión/pregunta/fuentes produce otra
  solicitud. No es un caché público ni comparte notas entre alumnos.

Estos controles protegen las llamadas que pasan por ESTE piloto y con las
tarifas revisadas. No son un límite global del proveedor ni protegen llamadas
hechas fuera del piloto, cambios de precio o manipulación manual del registro.
Antes de un piloto multialumno faltan un registro transaccional centralizado,
cuotas por usuario y periodo, conciliación real y autenticación del flujo nuevo.

Fuentes de implementación:
- https://api-docs.deepseek.com/quick_start/pricing/
- https://api-docs.deepseek.com/api/create-chat-completion/
- Documentación instalada en `node_modules/ai/docs` y
  `node_modules/@ai-sdk/deepseek/docs/30-deepseek.mdx`.

## Fuentes y respuestas

La entrada es un paquete JSON revisado por el operador, fuera de Git:
`question` contiene `id`, `version`, `stem` y tres `options` (`letter`, `text`);
`evidence` contiene entre 1 y 6 fragmentos con `documentId` (SHA-256 del PDF),
`title`, `pdfPage` base 1, `ordinal`, `text`, `textSha256` y `reviewed: true`.
Se comprueba SHA-256 del texto y tamaño. No se aceptan respuestas del alumno,
propietarios, claves o modelos enviados dentro de ese paquete.

La marca `reviewed` exige revisión humana previa, pero no la demuestra. Un hash
solo detecta alteraciones: no acredita derechos de uso, que el texto pertenece
al libro ni su relevancia clínica. El operador debe contrastar las páginas
originales y comprobar autorización de procesamiento por el proveedor antes
de transmitirlas. No enviar datos personales, pacientes ni libros completos.
No se conectó automáticamente el OCR ni la recuperación común a este piloto.

El modelo devuelve `state`, `answer`, `markdown` y citas `S1..S6`. Las páginas y
títulos se toman del paquete, nunca de números inventados por el modelo. Esto
valida la estructura, NO que una afirmación esté respaldada. Todos los resultados
tienen `pending_human_review`, incluidas abstenciones. El razonamiento interno
del modelo, la clave y el cuerpo crudo del proveedor no se guardan en el registro.
No se publica una clave oficial ni se modifica el veredicto del estudiante.

## Uso seguro

Desde la raíz del proyecto, sin cargar claves ni hacer red:

```powershell
node scripts/egel/deepseek-piloto.mjs --help
node scripts/egel/deepseek-piloto.mjs --plan=C:\ruta\privada\paquete.json
node --test scripts/egel/pruebas-deepseek.mjs
```

El registro real se ubicará en
`C:\dev\egel-plus-odon-datos-privados\deepseek-piloto\budget.json`.
No se inicializa por abrir la app, construirla o ejecutar tests. El comando de
inicialización exige `--prior-spend-micro-usd=N` y falla si ya existe el registro.
El valor N es gasto previo conciliado, no un marcador para copiar sin revisar.

La ejecución real requiere cargar `.env.local` con Node y los dos argumentos
explícitos `--execute=RUTA` y `--confirm-source-sharing`. No ejecutar hasta
confirmar gasto restante, fuentes autorizadas, calidad y privacidad. El comando
solo deja un borrador privado en el registro; no publica nada en Supabase.
El cargador local transpila exclusivamente dos módulos de este repositorio;
no ejecuta código de paquetes JSON ni rutas elegidas por el usuario.

La importación de explicaciones producidas en un chat normal es otro paso:
necesita validador, correspondencia con el banco, revisión de citas y aprobación
humana. No se importan por el hecho de tener formato JSON.

## Preparación offline del lote 027–036

`preparar-piloto-deepseek.mjs` prepara candidatos sin red, claves, aprobación ni
generación. Recibe `--manifest`, `--index-root`, `--questions` y `--output`. El
último debe estar fuera del repositorio. La instantánea de preguntas debe proceder
del banco real; se copian exclusivamente ID, versión, enunciado y opciones.

El plan de revisión sigue una estructura derivada de documentos para alumnado
de odontología: interpretación, comparación de alternativas, límites y riesgos.
El skill de diseño educativo médico guió esos criterios; no son una clave, una
distribución oficial del examen ni una validación clínica. La búsqueda es léxica,
con exclusión de índices y rangos de capítulos seleccionados, no una búsqueda
semántica. El paquete de 034 exige como candidata la página PDF 64 de Malamed;
una página requerida ausente se informa, no se sustituye silenciosamente.

Se conservan hashes, página PDF, origen nativo/OCR y confianza del OCR en un
manifiesto de revisión. Las páginas OCR acotadas se mantienen completas para no
separar tablas y notas al pie. La integridad se comprueba, pero sigue faltando
la revisión de lectura, cifras, columnas, pertinencia y derechos de uso.

TODOS los fragmentos salen con `reviewed: false`; el adaptador de generación
los rechaza. La herramienta no transforma una revisión por IA en aprobación
humana. No activa evidencia OCR en Supabase ni modifica historiales.

Los archivos se crean de forma exclusiva. Repetir exactamente la misma
preparación reutiliza archivos idénticos; si alguno es distinto se detiene sin
sobrescribirlo. Para cambiar la selección se usa otra carpeta y se conserva la
anterior. No eliminar esos antecedentes para presentar una revisión como hecha.

`estimateOpenAIReceipt` calcula solo el equivalente a tarifa estándar de un
recibo compatible, diferenciando entrada normal, escritura/lectura de caché y
salida. Un recibo no acredita el cobro y no permite reconstruir gastos ajenos.
Los intentos Gemini sin tokens o factura se conservan como gasto desconocido,
no como cero. La confirmación de cuenta es necesaria antes de inicializar el
presupuesto real; no se generó una conciliación ficticia.

## Transcripción trazable y segunda revisión del 034

`scripts/egel/lib/pilot-transcription.mjs` prepara reemplazos explícitos de
fragmentos, sin red. Exige el hash anterior y un localizador/reasonamiento por
cambio; rechaza nuevas páginas, duplicados, metadatos privados y texto alterado.
Conserva pregunta, hashes anteriores/nuevos y las páginas omitidas. No hace una
sustitución global de cifras. La transcripción devuelve siempre `reviewed: false`,
incluso si el material anterior estaba aprobado: la aprobación humana se registra
por separado antes de ejecutar. No modifica PDF, OCR original ni índice común.

La inspección de dos páginas del 034 mostró que la diferencia sospechada no era
solo OCR: la tabla y el texto impreso del mismo libro difieren. Se conservaron
ambas lecturas en transcripciones acotadas fuera del repositorio, aprobadas
expresamente por el usuario. No se añade una pauta clínica vigente ni una clave.

El prompt `literature-draft-v2` pide separar datos, supuestos y discrepancias
tabla/texto. El cambio de prompt/fuentes genera otra huella, sin sustituir el
primer resultado ni reiniciar el gasto. Una instrucción en el prompt no garantiza
que el modelo la obedezca: la segunda llamada aún requirió edición para identificar
el volumen supuesto y retirar una caracterización de seguridad no demostrada.
La edición y la salida original se conservan por separado, pendientes de revisión;
ningún resultado pasó a la base compartida ni a la app.

Pruebas offline de trazabilidad: `scripts/egel/pruebas-transcripcion-piloto.mjs`.
Las cifras de esos tests son sintéticas, no evidencia médica. La verificación
incluye 454 pruebas, TypeScript, lint y compilación; no hubo cambios de interfaz
ni una nueva prueba visual de frontend en esta fase.

## Aprobación editorial y preparación de la base compartida

Tras la aprobación expresa del usuario se sella una preparación local con
`preparar-base-editorial.mjs --input=RUTA_JSON --output=RUTA_JSON`. No carga
credenciales, no genera texto ni hace peticiones de red. Entrada y salida deben
estar fuera del repositorio; una salida distinta nunca se sobrescribe.

`lib/editorial-base.mjs` exige aprobación humana vinculada al hash exacto del
Markdown, pregunta, fuentes y procedencia. Una modificación invalida esa
aprobación. Conserva que el borrador proviene de DeepSeek y que el contenido
final es una revisión editorial, sin hacerlo pasar por Gemini o por salida pura
de un modelo. Las fuentes se tipan como transcripciones, no como fragmentos ya
existentes en `library_chunks`. No se incorpora la elección de ningún alumno.

La aprobación registrada es para PREPARAR, no para publicar ni para certificar
validez clínica. El Markdown aprobado se conserva íntegro como documento de
revisión, incluido su encabezado histórico de pendiente; no se sirve a alumnos.
El artefacto resultante no es una fila publicable del esquema actual y declara
`cloudCompatible: false` y `publicationState: local-only-not-published`.

La comprobación remota de solo lectura del 034 confirmó: pregunta sin cambios,
cero bases publicadas para ese reactivo, restricción actual del modelo a Gemini,
y cero fragmentos de Malamed en el índice, con evidencia deshabilitada. Por eso
no se insertó contenido ni se relajaron las comprobaciones de fuentes/permisos.
Falta registrar las transcripciones revisadas, soportar la procedencia editorial
en el esquema y lector, asociar un revisor autenticado y volver a validar RLS y
frescura antes de publicar. No inventar esa identidad desde una aprobación en chat.

Pruebas: `pruebas-base-editorial.mjs` cubre sellado, invalidación, aislamiento de
datos, procedencia y archivos inmutables. El conjunto completo pasó 462 pruebas.

## Integración del esquema y lector (fase posterior)

La migración `20261019004132_reviewed_transcriptions_and_editorial_bases.sql`
fue aplicada al proyecto Egel y su nombre local coincide con el historial remoto.
No carga fragmentos ni explicaciones y no aprueba ni publica contenido. Las
secciones previas describen hitos anteriores, no el estado actual del esquema.
El paquete preparado sigue siendo una aprobación local para preparación: no se
convierte automáticamente en una publicación ni se reescribe su sello anterior.

- `library_reviewed_transcriptions` mantiene texto, localizador, motivo de edición,
  huella del documento y aprobación separados del OCR original. Solo el backend
  tiene acceso. La aprobación exige revisor existente, nota y hash esperado.
- Editar el texto/localizador/origen reinicia la revisión. Revocar un fragmento
  oculta las explicaciones que lo usan. Cambios en metadatos del documento o
  del reactivo invalidan su lectura; restaurar exactamente la instantánea
  aprobada restaura esa coincidencia. Para retirada permanente se usa revocación.
- No se habilita `library_documents.evidence_enabled` para todo Malamed. Un
  fragmento aprobado permite solo su texto y página exactos, nunca el resto del
  OCR. Los fragmentos nativos siguen exigiendo evidencia del documento habilitada.
- Solo se aceptan las parejas Gemini / `literature-base-v1` y DeepSeek editorial /
  `literature-editorial-v1`. La segunda exige procedencia y hashes del documento
  editorial, aprobación, prompt de generación y borrador. Un cambio reinicia la
  revisión de la explicación. Se conserva el algoritmo de hash legado de Gemini.
- El lector usa el cliente de sesión, no credenciales administrativas. RLS sigue
  exigiendo respuesta propia guardada para esa versión. Si coexisten dos bases
  válidas, prioriza la editorial. Datos ambiguos o inválidos fallan sin generar
  otra respuesta. No se alteran notas, veredictos ni historiales privados previos.
- El bloqueo de publicación se adquiere antes del bloqueo de fila para evitar
  el orden opuesto entre dos publicaciones de la misma variante. PGlite prueba
  la lógica y RLS secuencialmente; no sustituye una prueba concurrente multisesión.

Verificación: 485 pruebas, incluyendo 18 pruebas en PostgreSQL aislado con
PGlite 0.5.10 (dependencia de desarrollo), TypeScript, lint y build correctos.
La API real también se ejecuta con cliente de sesión simulado; no es una prueba
visual autenticada ni de un despliegue nuevo. No hubo cambios de interfaz.
La comprobación remota confirmó RLS activo, ausencia de permisos de lectura o
aprobación para alumnos/visitantes, cero transcripciones y cero publicaciones.

La auditoría de producción npm no encontró vulnerabilidades. Se conservan cinco
avisos previos del árbol de herramientas de desarrollo; no se aplicó una
actualización forzada. El asesor de seguridad de Supabase mantiene el aviso
previo de [protección contra contraseñas filtradas desactivada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection),
sin nuevos avisos de seguridad. El asesor de rendimiento informa 15 políticas
antiguas con [llamadas de auth por fila](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan),
la estrategia de conexiones de Auth y [índices todavía sin uso](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index),
incluidos los dos recién creados en la tabla vacía. No se eliminaron índices ni
se cambiaron políticas de perfiles, preferencias o apuntes fuera de este alcance.

Siguiente operación: registrar el 034 y sus transcripciones como borradores,
asociar la revisión con una identidad verificada, comprobar el contenido de
publicación y autorizar su salida. El 034 aún NO está publicado ni se desplegó
el lector nuevo. No hubo consultas de IA adicionales, commit ni push.

## Registro del primer borrador y asociación de cuenta

El usuario proporcionó el correo de acceso para vincular su revisión. Se comprobó
una única cuenta existente, correo confirmado, perfil presente y ausencia de
baja, anonimato o bloqueo. No se cambiaron contraseñas, metadatos de Auth,
sesiones ni permisos. Correo, UUID y recibos operativos se guardan solo fuera
de Git, nunca en el texto compartido ni en fixtures del repositorio.

`lib/editorial-registration.mjs` produce un plan SQL de operador, sin conexión
ni credenciales. Revalida el paquete sellado y los hashes de la aprobación de
fuentes. El bloque de registro es atómico: se detiene ante cuenta no válida,
pregunta cambiada, fuente retirada, ambigüedad o edición concurrente. No hay
`upsert`, sobrescritura ni llamada a `publish_reviewed_tutor_base`. El orden de
bloqueos es consistente y repetir el mismo plan no duplica datos. Las pruebas
locales también comprueban rollback de un conflicto tardío y texto SQL/fórmulas
tratado como datos, no como instrucciones ejecutables.

Se registraron las dos transcripciones exactas previamente aprobadas y se vinculó
esa revisión con la cuenta indicada. Como el esquema exige fuentes aprobadas
incluso para admitir un borrador, se registró su aprobación específica; no se
habilitó todo Malamed como evidencia. La explicación editorial quedó `draft`.
Su `reviewer_id` y `reviewed_at` de publicación siguen vacíos; la asociación de
preparación está en procedencia privada y en un recibo local. El texto coincide
con la versión aprobada y sus fuentes pasan la comprobación de integridad.

Verificación remota adicional: una transacción de diagnóstico con rol
`authenticated` y contexto de la cuenta indicada devuelve cero filas para el
borrador; se hizo rollback del contexto. No es una sesión de navegador ni una
prueba de un despliegue nuevo. Total publicado: cero. Se mantienen 2 llamadas
DeepSeek de pruebas; este registro no consume IA. Pasaron 493 pruebas,
TypeScript y lint. No se modificó código de la interfaz en esta operación.

Queda pendiente la autorización de publicación y el despliegue del lector. No
se hizo commit ni push. Una aprobación del contenido para preparación no se
interpreta como autorización para publicar o desplegar.

## Publicación autorizada: únicamente el 034

Después del registro anterior, el usuario autorizó expresamente publicar solo
el 034 y mantener el despliegue separado. Se preservaron los recibos históricos
de preparación y se creó un recibo nuevo de autorización fuera del repositorio.

Se comprobó nuevamente la cuenta revisora y el hash exacto del borrador. En una
sola operación atómica se sustituyeron únicamente el título y el aviso obsoleto
de pendiente de revisión. Todo el texto desde la primera sección de contenido
se conservó idéntico, incluidas fórmulas, discrepancias, supuestos, referencias
y límites clínicos. Los hashes del original, del contenido conservado y de la
autorización quedaron registrados en procedencia privada. El original local no
se alteró. La publicación pasó por `publish_reviewed_tutor_base`, con validación
de versión del reactivo, fuentes y hash; no se actualizó el estado directamente.

Comprobación remota: existe una sola base publicada, correspondiente al 034, y
sus dos fuentes siguen válidas. El diagnóstico transaccional RLS permite una
fila a la cuenta indicada, que ya tenía una respuesta propia guardada, y cero
filas sin identidad. El rol anónimo no puede seleccionar el cuerpo; el alumno
no puede seleccionar procedencia ni pruebas de fuentes privadas. No se crearon
ni cambiaron respuestas, notas o veredictos del alumno. Estos diagnósticos no
equivalen a una sesión de navegador ni a validación del despliegue.

Se repitieron las 493 pruebas locales: todas pasan. Esta operación no cambió
código de la app ni consumió IA. El recibo de publicación y el SQL acotado están
fuera de Git. El lector actualizado sigue pendiente de despliegue: publicar el
registro no despliega el frontend. Sin commit ni push en esta fase.

## Validación previa al commit y push autorizados

El usuario autorizó después el commit y push directo a `main` para desplegar
el lector. La comparación remota previa confirmó cero commits de diferencia
en ambos sentidos. Se prepara únicamente código, migraciones, pruebas y
documentación relacionados; PDF, transcripciones, recibos, claves, respaldos y
archivos temporales quedan fuera. El favicon conserva su hash previo.

La revisión corrigió un rótulo de Comparar que atribuía a Gemini una base
editorial compartida; ahora distingue «base revisada» del historial Gemini.
Una prueba adicional conserva ambos casos. Resultado: 494 pruebas sin fallos,
TypeScript, lint y build correctos; auditoría npm de producción sin hallazgos.
La revisión de claves y datos operativos privados en los archivos previstos no
encontró coincidencias. El lector usa la sesión existente y no requiere nuevas
variables, claves de modelos o clave administrativa en Vercel.

Comprobación visual local del build con Playwright ya disponible en el equipo,
sin instalar dependencias: 1440×900 y 390×844, portada con contenido, sin
desbordamiento horizontal, overlay ni errores de consola; navegación a login
y redirección de Estudio sin sesión correctas. Capturas privadas fuera de Git.
No se probó todavía el recorrido del tutor con sesión real en producción.

El asesor de seguridad mantiene la advertencia previa de protección contra
contraseñas filtradas desactivada. No se cambió configuración de Auth ni se
llamó a modelos. Commit/push y estado del despliegue se verifican por separado
después de esta validación, sin asumir que un push equivale a un despliegue.
