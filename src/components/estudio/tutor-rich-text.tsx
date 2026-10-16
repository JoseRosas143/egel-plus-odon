"use client";
import { memo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import s from "./styles.module.css";

// No raw HTML, remote images, arbitrary links or trusted LaTeX commands.
export const TutorRichText = memo(function TutorRichText({ text }: { text: string }) {
  const normalized = text.replace(/\\\[([\s\S]*?)\\\]/g, (_match, formula: string) => "\n$$\n" + formula + "\n$$\n").replace(/\\\(([\s\S]*?)\\\)/g, (_match, formula: string) => "$" + formula + "$");
  return <div className={s.richText}><Markdown skipHtml remarkPlugins={[remarkGfm, remarkMath]}
    rehypePlugins={[[rehypeKatex, { trust: false, strict: "ignore", throwOnError: false, maxExpand: 100, maxSize: 10 }]]}
    components={{
      img: () => null,
      a: ({ children }) => <span>{children}</span>,
      table: ({ children }) => <div className={s.tableScroll} tabIndex={0} role="region" aria-label="Tabla del tutor"><table>{children}</table></div>,
    }}>{normalized.slice(0,30000)}</Markdown></div>;
});
