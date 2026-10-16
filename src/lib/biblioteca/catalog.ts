import data from "./catalog.json";
export type LibraryBook = { id: string; title: string; authors: string[]; edition: string | null; year: number | null; pages: number; area: string; kind: string; listMatch: boolean; comparison: string };
// Only public bibliographic fields are passed to client components. Never local paths or hashes.
export const libraryBooks: LibraryBook[] = data.map(({ id, title, authors, edition, year, pages, area, kind, listMatch, comparison }) => ({ id, title, authors, edition, year, pages, area, kind, listMatch, comparison }));
