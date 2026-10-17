export type OpinionReference = { id: "S1" | "S2"; label: string; href: string };
export type SavedOpinion = {
  mode: "saved-pilot"; model: "gpt-6.1-sol"; generatedAt: string; text: string;
  references: OpinionReference[];
};
export type OpinionHistory = {
  ok: true; enabled: boolean; covered: boolean; requiresAnswer: boolean; analysis: SavedOpinion | null;
};
