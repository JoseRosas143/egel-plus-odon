import type { ReactNode } from "react";

export type AppIconName = "home" | "book" | "notes" | "progress" | "profile" | "shield" | "save" | "pencil" | "bookmark" | "search" | "filter" | "chevron" | "tooth";
export function AppIcon({ name, size = 20 }: { name: AppIconName; size?: number }) {
  const paths: Record<AppIconName, ReactNode> = {
    home: <><path d="m3 10 9-7 9 7v10H3z" /><path d="M9 20v-7h6v7" /></>,
    book: <><path d="M12 5v16M12 5C9 2 4 3 2 4v15c3-1 7-1 10 2 3-3 7-3 10-2V4c-3-1-7-2-10 1Z" /></>,
    notes: <><path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h6" /></>,
    progress: <><path d="M4 20v-6m5 6V9m6 11V4m5 16V12" /></>,
    profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2" /></>,
    shield: <><path d="m12 2 9 4v7c0 4-5 7-9 9-4-2-9-5-9-9V6z" /><path d="m8 12 3 3 5-6" /></>,
    save: <><path d="M4 3h14l3 3v15H3V3zM7 3v6h10V3M7 21v-8h10v8" /></>,
    pencil: <><path d="m15 4 5 5M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15Z" /></>,
    bookmark: <path d="M6 21V3h12v18l-6-4z" />,
    search: <><circle cx="10.5" cy="10.5" r="7" /><path d="m16 16 5 5" /></>,
    filter: <path d="M3 4h18l-7 8v8l-4-2v-6Z" />,
    chevron: <path d="m6 9 6 6 6-6" />,
    tooth: <path d="M12 5C9 2 4 3 4 8c0 4 2 6 3 11 .4 2 2 2 2.5 0l1-5c.3-1.5 2.7-1.5 3 0l1 5c.5 2 2.1 2 2.5 0 1-5 3-7 3-11 0-5-5-6-8-3Zm-3 0c2 1 4 1 6 0" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
