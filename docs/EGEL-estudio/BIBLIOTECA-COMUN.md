# Biblioteca común del tutor

## Alcance y permisos

La biblioteca del curso es evidencia común para el tutor de todos los alumnos;
no un catálogo público de PDF descargables. Los archivos originales permanecen
en el equipo del propietario. Las copias comprimidas se alojan en el bucket
privado `egel-library-private`, sin políticas de lectura para alumnos o visitantes.
Las tablas `library_documents`, `library_document_parts`, `library_chunks` y la
función `search_tutor_library` son exclusivas del servidor. No hay un endpoint de
descarga, de firma de descargas o de búsqueda de texto completo para alumnos.

Los materiales personales futuros usan `visibility=personal` y un `owner_id`;
la búsqueda del servidor exige identidad verificada y filtra por propietario.
Notas, progreso, veredictos e historiales existentes no se modifican. La elección
del alumno no se introduce en la recuperación bibliográfica para forzar acuerdos.
La autorización de uso de las fuentes debe revisarse antes de su oferta comercial;
la ausencia de un botón de descarga no sustituye esa autorización.

## Archivos e integridad

La colección contiene 33 PDF originales y 30 archivos únicos. El manifiesto de
compresión conserva los alias de las tres copias duplicadas y las dos huellas
(original y copia comprimida). Se separan 24 fuentes bibliográficas, una guía de
reactivos y cinco páginas sueltas derivadas. La guía y esas páginas se archivan,
pero NO se usan como evidencia para calificar ni justificar su propia respuesta.
El archivo Lynn aún necesita revisión de sus metadatos editoriales.

El límite global de 50 MB y el tope de gasto de Supabase se conservan. Los PDF
grandes se guardan en partes de hasta 48 MiB, con tamaño, orden, desplazamiento
y SHA-256 en un manifiesto. No son libros recortados ni documentos de menor
calidad: se puede reconstruir exactamente el PDF de la copia comprimida, y se
debe comprobar su SHA-256 al hacerlo. No se sobrescriben objetos existentes.

Los scripts operativos mantienen PDF, texto, OCR, claves de importación y estado
de carga FUERA del repositorio. El puente de importación exige una clave aleatoria
de 256 bits, restringe los archivos al manifiesto fijo y caduca a las tres horas.
Al terminar la importación se despliega una versión cerrada que devuelve 404.
El puente no acepta SQL arbitrario ni administra cuentas ni genera descargas.

## Índice y límites honestos

La primera extracción es local y conserva página PDF (base 1), offsets de texto,
ordinal del fragmento y SHA-256. Graber usa pypdf como alternativa al fallo nativo
de otro parser. Los párrafos tienen solapamiento; no cruzan páginas. Los índices
de texto completo español/inglés son búsquedas léxicas, NO embeddings semánticos.
La recuperación no ejecuta instrucciones encontradas en libros o preguntas.

Las páginas escaneadas, vacías, escasas o con codificación dudosa se registran
como pendientes. Una portada o figura sin texto no implica necesariamente un
error. No se inventa contenido ni se declara una extracción como revisión médica.
El OCR se ejecuta localmente con Tesseract.js 7.0.0 a 200 dpi, conserva confianza
por página y no envía imágenes a Gemini/OpenAI. Las fórmulas, dosis, columnas y
tablas obtenidas por OCR requieren revisión visual antes de habilitar esa evidencia.

`retrieveLibraryEvidence` es un adaptador interno, no una API pública ni un tutor
conectado. Está apagado salvo configuración explícita de `EGEL_COMMON_LIBRARY_ENABLED`
y `SUPABASE_LIBRARY_SECRET_KEY` exclusivamente en el servidor. Autentica mediante
`getUser`, no acepta un propietario enviado por el cliente y no expone URLs de PDF.
Una búsqueda vacía o un error no se sustituyen por una respuesta inventada.

Esta fase NO activa generación común en producción ni reemplaza el piloto local
de Malamed. Siguen pendientes la integración del contexto con Gemini, selección
semántica, citas verificadas de todos los documentos, presupuesto/cuotas atómicas
por alumno e historiales persistentes en la nube. No ampliar el piloto de seis
llamadas locales ni consumir saldo de OpenAI por el mero hecho de alojar los PDF.

## Operación

- `extraer-biblioteca.py`: extracción aislada por documento y diagnóstico por página.
- `cargar-biblioteca.mjs`: manifiesto, carga inmutable por partes e inserción de texto.
- `library-import-template.ts.txt`: plantilla del puente temporal, nunca desplegar
  con los marcadores sin sustituir; no contiene claves reales.
- `ocr-biblioteca.mjs` y `renderizar-ocr.py`: OCR local reanudable de los escaneados.
- `pruebas-biblioteca-comun.mjs`: pruebas sin red ni IA del adaptador y permisos.

Los parámetros de las operaciones deben apuntar a carpetas privadas fuera de Git.
No copiar el archivo `operator-multipart.json` ni PDF/texto/OCR al repositorio.
