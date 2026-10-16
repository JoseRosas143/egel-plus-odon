export const tutorCommands = [
  { command: "/caso", label: "Caso práctico" },
  { command: "/profundizar", label: "Profundizar en el tema" },
  { command: "/investigar", label: "Investigar selección" },
] as const;
export type TutorCommand = typeof tutorCommands[number]["command"];

// Prepares a user-editable request, not an AI response. No provider is called.
export function prepareTutorRequest(command: TutorCommand, position: number, draft: string, selection = ""): string {
  let request: string;
  const context = "Reactivo " + String(position).padStart(3, "0") + ".";
  const evidence = "Utiliza la bibliografía disponible, cita las fuentes y señala cualquier información que no puedas sustentar. No presentes tu conclusión como una clave oficial del examen.";
  if (command === "/caso") {
    request = "Caso práctico\n" + context + " Prepara un caso clínico de práctica relacionado con su tema, con preguntas para razonar. Permíteme responder antes de mostrar la explicación. " + evidence;
  } else if (command === "/profundizar") {
    request = "Profundizar en el tema\n" + context + " Explica los conceptos del tema, cómo distinguir las opciones y qué puntos conviene repasar. " + evidence;
  } else {
    if (!selection.trim()) throw new Error("Selecciona texto de una respuesta del tutor y vuelve a pulsar Investigar selección.");
    if (selection.length > 1000) throw new Error("Selecciona un fragmento de hasta 1,000 caracteres para investigarlo.");
    request = "Investigar selección\n" + context + "\nFragmento seleccionado de una respuesta del tutor:\n«" + selection.trim() + "»\nInvestiga esta afirmación: explica su significado, contrasta su fundamento y comprueba sus referencias. " + evidence;
  }
  const existing = draft.trim().toLowerCase() === command ? "" : draft;
  const combined = !existing.trim() ? request : existing.endsWith(request) ? existing : existing + "\n\n" + request;
  if (combined.length > 4000) throw new Error("La solicitud no cabe junto con tu borrador. Conserva tu texto y acórtalo antes de añadir el comando.");
  return combined;
}
