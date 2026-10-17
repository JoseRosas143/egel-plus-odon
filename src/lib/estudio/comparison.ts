import type { TutorMessage } from "@/lib/tutor/domain";

// Only the original independent analysis; never replace it with a coached follow-up.
export function initialLiterature(messages: readonly TutorMessage[]): TutorMessage | null {
  const candidates = messages.filter(message => message.id === "initial-v1-assistant" && message.role === "assistant" && message.text.trim());
  return candidates.length === 1 ? candidates[0] : null;
}
