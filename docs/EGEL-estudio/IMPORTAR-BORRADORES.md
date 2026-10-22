# Importación privada de borradores — primera etapa

Herramienta local de operador, fuera de la aplicación y sin conexión a Supabase o proveedores de IA. No crea una explicación compartida, no habilita fuentes web y no sustituye ningún contenido publicado.

## Contrato

Acepta los bloques `egel_borradores_explicaciones` versión `1.0`, modo `literatura` y estado `pendiente_validacion`. Las abstenciones con `respuesta_propuesta: null` son registros completos. No se deduce el modelo ni se cambia el modo a segunda opinión por el origen del chat.

El manifiesto de entrada contiene exactamente `schema`, `bankSnapshot`, `files` y `protectedQuestionIds`:

```json
{
  "schema": "egel-draft-import-manifest-v1",
  "bankSnapshot": {"path": "bank.snapshot.json", "sha256": "HUELLA_SHA256_DE_64_CARACTERES"},
  "files": [{"path": "egel_bloque_001-010_pendiente_validacion.json", "sha256": "HUELLA_SHA256_DE_64_CARACTERES"}],
  "protectedQuestionIds": ["EGEL-2026-034", "EGEL-2026-035", "EGEL-2026-036"]
}
```

Las huellas del ejemplo son marcadores, no valores válidos. Las rutas relativas se resuelven respecto al manifiesto. Manifiesto, originales, snapshot y salida deben estar fuera del repositorio. La carpeta de salida debe existir y no puede contener las fuentes ni quedar dentro de su carpeta. Los archivos originales nunca se reescriben.

## Operación

```powershell
node scripts/egel/importar-borradores.mjs --manifest=C:\ruta-privada\manifest.json --plan
node scripts/egel/importar-borradores.mjs --manifest=C:\ruta-privada\manifest.json --execute --output=C:\otra-carpeta-privada
```

El plan no crea carpetas ni lotes. La ejecución guarda originales byte por byte, snapshot, entradas normalizadas, resumen y huellas. `complete.json`, escrito al final, marca un lote completo. Repetir el mismo manifiesto reutiliza un lote íntegro; un lote incompleto o modificado provoca un error sin sobrescribirlo. Los datos originales no se guardan en Git. Los permisos se heredan del directorio del operador; no se promete cifrado o aislamiento por cuenta del sistema operativo.

## Controles

- Identidad y versión solo se vinculan si coinciden enunciado y A/B/C tras normalizar NFC y espacios. No se eliminan signos, unidades o etiquetas para forzar coincidencias. Si no coincide, se conserva el candidato sin asignar un vínculo definitivo.
- La vinculación es al snapshot archivado. No demuestra que la pregunta siga igual en línea: cualquier publicación futura requiere cotejar la versión y contenido actuales.
- 034–036 están protegidos de forma predeterminada, incluso si la lista adicional de protección está vacía. El operador puede añadir más IDs, nunca quitar esas protecciones.
- Las páginas numéricas, listas y rangos se representan sin inventar páginas impresas. Los localizadores y URL permanecen no verificados, y nunca se descargan automáticamente.
- Se bloquean propuestas con evidencia declarada insuficiente, títulos ausentes, referencias desconocidas y contenido activo para una revisión separada. Las referencias solo mencionadas conservan ese estado, no se promueven a contrastadas.
- Todos los registros conservan `humanApproved: false`, `publicationAllowed: false`, revisión clínica y de fuentes sin realizar. Estar en la cola de revisión no significa estar listo para publicar.
- El formato `egel-private-quarantine-v1` es deliberadamente distinto del preparador editorial y de las filas compartidas; no puede usarse como aprobación o publicación.

No se modifican preguntas, respuestas, apuntes, favoritos ni veredictos personales. Esta etapa no añade pantallas ni despliegues. La revisión clínica/bibliográfica y la integración de un panel privado de administración quedan fuera de este importador.
