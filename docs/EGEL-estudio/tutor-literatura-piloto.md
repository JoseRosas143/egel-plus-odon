# Literatura: piloto local con Gemini

Al confirmar **Guardar respuesta**, primero se registra la elección con el API existente. Solo después se solicita Literatura. No se califica, no se modifica el veredicto personal y no se guardan apuntes automáticamente.

## Alcance habilitado

- Gemini `gemini-3.8-flash`, sin llamadas a OpenAI ni cambios de facturación.
- Reactivo 034. BIB-002: Malamed, 5.ª edición española (2006), solo PDF original 61–70 / impresas 55–64. No es el libro completo ni la edición recomendada en la lista.
- Otras preguntas: respuesta guardada, aviso de falta de cobertura, cero generación.
- Seguimientos tras guardar respuesta, comandos preparados editables, Markdown, tablas GFM, fórmulas LaTeX `$...$` y `$$...$$` (también delimitadores de barra inversa).
- Segunda opinión y Comparar siguen pendientes; no se simulan dictámenes.

## Citas

La aplicación solo transforma anotaciones `file_citation` del store autorizado y del nombre exacto del fragmento. Las páginas del fragmento deben ser enteros 1–10: se suman 60 para el PDF original y 54 para la numeración impresa. Una página 70 o un nombre alterado no se interpreta como página del fragmento. No se deducen páginas del texto del modelo. Las anotaciones identifican páginas recuperadas, no certifican que toda la conclusión sea correcta. Revisarlas es necesario. La aplicación no muestra conclusiones sin ninguna cita mapeable.

Los botones de fuentes abren el PDF autenticado en la página correspondiente mediante `#page`. La compatibilidad del visor nativo debe verificarse en el navegador del alumno; no hay aún lector PDF.js ni resaltados privados de libros.

## Persistencia y límites

Este paso es un **piloto local**, no un servicio distribuido listo para hosting. El historial se guarda fuera del repositorio en `EGEL_TUTOR_DATA_DIR`, bajo claves SHA-256 de usuario autenticado, reactivo y versión. El usuario no puede enviar otro identificador de propietario. No se escribe en localStorage ni en las notas existentes. El equipo local y su disco deben estar protegidos; los permisos POSIX no sustituyen ACL de Windows.

El despliegue Vercel queda deshabilitado por diseño. Para hosting debe migrarse historial, idempotencia y cuota a almacenamiento transaccional privado con RLS y pruebas de dos usuarios antes de habilitarlo.

Hasta **6 generaciones totales** para este nuevo piloto, no por reinicio ni por alumno. Antes de cada generación se verifica por GET que solo el fragmento autorizado está activo en el store. No se suben nuevos libros. La cuota se reserva en disco antes de contactar al modelo; errores también consumen reserva. Un bloqueo exclusivo evita carreras entre procesos locales. Los archivos se reemplazan de forma atómica.

El análisis inicial tiene una clave estable por alumno/reactivo/versión: guardar otra elección reutiliza el análisis independiente ya generado. Los seguimientos llevan UUID. Fallos de red o un cierre sin confirmación no se reintentan automáticamente: quedan como inciertos y bloquean nuevas generaciones de esa conversación. El botón explícito Reintentar análisis permite otro intento, manteniendo el historial de fallos y la cuota; si el resultado anterior es incierto pide confirmación porque podría haberse procesado. Los rechazos explícitos 429/503 indican saturación; no se reintentan solos. Un bloqueo dejado por una caída requiere revisión manual del proceso y de los resultados antes de retirarlo. No borrar archivos de cuota para reiniciar el gasto.

`GEMINI_FREE_ONLY=true` documenta el modo autorizado y es obligatorio, pero **no prueba el plan de facturación de Google**: el administrador debe mantener el proyecto en Free. La aplicación no activa facturación. Ninguna autorización de este piloto permite consumir los US$10 de OpenAI ni subir libros privados de futuros alumnos sin consentimiento.

## Configuración del servidor local

Además de la clave secreta `GEMINI_API_KEY` ya existente, configurar solo en el servidor: `EGEL_TUTOR_ENABLED=true`, `GEMINI_FREE_ONLY=true`, `GEMINI_FILE_SEARCH_STORE` con el store autorizado del piloto y `EGEL_TUTOR_DATA_DIR` con ruta privada fuera del repo. No publicar estos datos ni las claves; no incluir `.env` ni conversaciones en paquetes. No funciona sin esa configuración y sesión válida.

## Seguridad y pruebas

API protegida por `getUser()` (rechaza sesiones anónimas), comprobación de mismo origen en POST, cuerpo acotado, claves estrictas y versión del reactivo validada contra la base. El enunciado y opciones se leen del banco: el cliente no puede reemplazarlos. Se exige una respuesta registrada antes de generar. Respuestas privadas sin caché y errores redactados. No se envían selección inicial ni notas privadas a Gemini: el análisis es independiente.

Markdown no ejecuta HTML ni código. Se omiten imágenes remotas y enlaces escritos por el modelo; solo la aplicación construye enlaces de citas. KaTeX tiene `trust:false`, expansiones y tamaño acotados; los errores de fórmula no deben romper el chat. Las tablas y fórmulas amplias desplazan dentro de su propio contenedor.
