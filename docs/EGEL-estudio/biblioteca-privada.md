# Biblioteca personal y auditoría asistida

Requisito confirmado por el propietario el 16 de octubre de 2026. Pendiente de implementación; el catálogo v2.5 NO ofrece todavía subida de archivos personales.

## Separación obligatoria

- Biblioteca del curso: fuentes compartidas, revisadas por el operador.
- Mis libros: archivos privados por alumno. Nunca se publican bajo `public/`, nunca se agregan automáticamente a las fuentes del curso.
- El catálogo actual contiene metadatos bibliográficos del curso; no hay colecciones personales simuladas.

## Flujo previsto

1. El alumno elige un PDF y confirma que puede usarlo. Se muestran límites de tamaño y política de tratamiento antes de enviarlo.
2. Subida autenticada a almacenamiento privado; validar tipo real, tamaño, integridad y archivos malformados. Cuarentena antes del procesamiento. No confiar en nombre ni tipo declarado por el navegador.
3. Extraer identidad (título, autores, editorial, edición, año e identificadores), con páginas y nivel de incertidumbre. Revisar legibilidad/OCR e integridad; no inferir que un PDF está completo por poder abrirlo.
4. Auditoría de IA contra una versión identificada de la lista recomendada, nunca contra la memoria del modelo. Resultados separados: obra/edición coincidente, edición distinta, no encontrada o no verificable. Una diferencia de edición NO implica libro inútil ni una coincidencia implica aprobación clínica.
5. Informe con fuentes, páginas, modelo, fecha y argumentos verificables. Corrección manual y reauditoría conservan historial.
6. El alumno decide si lo incorpora a SU tutor, dentro de las políticas de derechos y calidad. Etiquetar claramente fuentes personales frente a fuentes del curso; no convertir la IA en una clave oficial de examen.

## Privacidad, gasto y criterios de aceptación

- Autorización por propietario en cada lectura, descarga, índice y conversación; políticas RLS/Storage por `auth.uid()`. Las credenciales de servicio y rutas internas nunca llegan al navegador.
- Probar aislamiento con dos alumnos: uno no puede listar, leer, descargar ni consultar los archivos o embeddings del otro, ni con un identificador ajeno conocido.
- URLs temporales con caducidad, sin enlaces públicos permanentes; eliminar archivo e índice cuando el propietario lo solicite, según la política de retención.
- Explicar el tratamiento del proveedor seleccionado. No enviar automáticamente documentos privados al nivel gratuito de Gemini sin consentimiento informado; sus condiciones pueden diferir del servicio de pago.
- Cuotas y presupuestos por alumno y proyecto, registro de consumo, sin reintentos que puedan duplicar cobros tras resultados desconocidos.
- Documentos y resultados de OCR son datos no confiables: ignorar instrucciones incrustadas, no ejecutar contenido activo y no permitir que alteren reglas, permisos o claves de respuestas.
- Auditorías reales solamente: estados en cola/procesando/error/completado, sin insignias de recomendado ni tutor habilitado antes de cumplir las verificaciones.

La autorización del piloto actual abarca un libro del propietario y hasta US$1 en OpenAI. No constituye autorización general para procesar libros de futuros alumnos ni activar facturación en Google.
