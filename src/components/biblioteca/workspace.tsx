"use client";
import Image from "next/image";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import type { LibraryBook } from "@/lib/biblioteca/catalog";
import { AccessShell } from "@/components/acceso/shell";
import { StudentNav } from "@/components/acceso/student-nav";
import { AppIcon } from "@/components/acceso/app-icon";
import { StudyToast, type ToastMessage } from "@/components/estudio/study-toast";
import a from "@/components/acceso/styles.module.css";
import s from "./styles.module.css";

const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const editionLabel = (edition: string | null) => edition ? /^\d+$/.test(edition) ? `${edition}.ª ed.` : edition : "Edición sin confirmar";
const subscribeViewport = (notify: () => void) => { const media = window.matchMedia("(min-width:1024px)"); media.addEventListener("change", notify); return () => media.removeEventListener("change", notify); };
const desktopSnapshot = () => window.matchMedia("(min-width:1024px)").matches;
const serverSnapshot = () => true;
export function LibraryWorkspace({ books, localReading }: { books: LibraryBook[]; localReading: boolean }) {
  const [query, setQuery] = useState("");
  const desktop = useSyncExternalStore(subscribeViewport, desktopSnapshot, serverSnapshot);
  const [areas, setAreas] = useState<string[]>([]);
  const [kind, setKind] = useState("");
  const [matching, setMatching] = useState(false);
  const [sort, setSort] = useState("title");
  const [selectedId, setSelectedId] = useState("BIB-002");
  const [detailOpen, setDetailOpen] = useState(false);
  const [readerId, setReaderId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const sequence = useRef(0);
  const opening = useRef(false);
  const detailTitle = useRef<HTMLHeadingElement>(null);
  const dismissToast = useCallback(() => setToast(null), []);
  const options = [...new Set(books.map(b => b.area))].sort((x, y) => x.localeCompare(y, "es"));
  const filtered = books.filter(b => (!areas.length || areas.includes(b.area)) && (!kind || b.kind === kind)
    && (!matching || b.listMatch) && normalized([b.title, ...b.authors, b.area, b.id].join(" ")).includes(normalized(query)))
    .sort((x, y) => sort === "year" ? (y.year ?? 0) - (x.year ?? 0) || x.title.localeCompare(y.title, "es") : x.title.localeCompare(y.title, "es"));
  const selected = filtered.find(b => b.id === selectedId) ?? filtered[0];
  function reset() { setQuery(""); setAreas([]); setKind(""); setMatching(false); }
  function select(book: LibraryBook) {
    setSelectedId(book.id); setDetailOpen(true); setReaderId(null);
    requestAnimationFrame(() => detailTitle.current?.focus());
  }
  async function openPdf(book: LibraryBook) {
    if (opening.current) return;
    select(book); setLoadingId(book.id); opening.current = true;
    try {
      const result = await fetch(`/api/biblioteca/${book.id}`, { method: "HEAD", cache: "no-store", credentials: "same-origin" });
      if (!result.ok) throw new Error(result.status === 401 ? "Tu sesión terminó. Inicia sesión antes de abrir el PDF." : "No se pudo abrir el PDF. La biblioteca local debe estar configurada y el archivo debe coincidir con el catálogo.");
      setReaderId(book.id);
    } catch (error) {
      setToast({ id: ++sequence.current, text: error instanceof Error ? error.message : "No se pudo abrir el PDF.", tone: "error" });
    } finally { setLoadingId(null); opening.current = false; }
  }
  return <AccessShell wide study action={<StudentNav current="biblioteca" />}>
    <div className={s.library}>
      <aside className={s.filters} aria-label="Filtros de biblioteca"><details key={desktop ? "desktop" : "mobile"} open={desktop}>
        <summary><AppIcon name="filter" size={18} />Filtros<AppIcon name="chevron" size={14} /></summary>
        <div className={s.filterContent}><button className={s.clear} type="button" onClick={reset}>Limpiar todo</button>
          <fieldset><legend>Áreas</legend>{options.map(area => <label key={area}><input type="checkbox" checked={areas.includes(area)} onChange={() => setAreas(old => old.includes(area) ? old.filter(v => v !== area) : [...old, area])} /><span>{area}</span><small>{books.filter(b => b.area === area).length}</small></label>)}</fieldset>
          <fieldset><legend>Tipo de fuente</legend>{["Libro", "Documento"].map(value => <label key={value}><input type="checkbox" checked={kind === value} onChange={() => setKind(kind === value ? "" : value)} /><span>{value}</span><small>{books.filter(b => b.kind === value).length}</small></label>)}</fieldset>
          <div className={s.filterNote}><AppIcon name="book" size={20} /><p><strong>Tus fuentes, a la vista</strong>Consulta la edición y procedencia antes de estudiar. El tutor sigue en preparación.</p></div>
        </div></details></aside>
      <section className={s.catalog} aria-labelledby="library-title">
        <h1 id="library-title">Biblioteca</h1><p className={s.subtitle}>Tu biblioteca de estudio, con ediciones y fuentes a la vista.</p>
        <div className={s.searchRow}><label className={s.search}><AppIcon name="search" size={18} /><span className={s.srOnly}>Buscar libro, autor o tema</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar libro, autor o tema…" type="search" /></label>
          <label className={s.sort}><span className={s.srOnly}>Ordenar fuentes</span><select value={sort} onChange={event => setSort(event.target.value)}><option value="title">Título A–Z</option><option value="year">Más recientes</option></select></label></div>
        <div className={s.catalogTabs} role="group" aria-label="Colección de fuentes"><button type="button" aria-pressed={!matching} onClick={() => setMatching(false)}><AppIcon name="book" size={16} />Todas</button><button type="button" aria-pressed={matching} onClick={() => setMatching(true)}>Edición coincidente</button><span role="status">{filtered.length} fuentes</span></div>
        {matching ? <p className={s.matchNote}>Coincidencia bibliográfica con la lista proporcionada al proyecto; no implica revisión académica ni tutor habilitado.</p> : null}
        <div className={s.books}>{filtered.map(book => <article key={book.id} className={`${s.book} ${selected?.id === book.id ? s.selectedBook : ""}`}>
          <button type="button" className={s.coverButton} aria-label={`Ver detalles de ${book.title}`} onClick={() => select(book)}><Image src={`/biblioteca/covers/${book.id}.jpg`} alt={`Primera página del PDF: ${book.title}`} width={130} height={175} sizes="130px" /></button>
          <h2>{book.title}</h2><p>{editionLabel(book.edition)}{book.year ? ` · ${book.year}` : ""}</p><p className={s.authors}>{book.authors.join(", ") || "Autor sin confirmar"}</p>
          <div className={s.bookActions}><button type="button" onClick={() => void openPdf(book)} disabled={!localReading || loadingId !== null}><AppIcon name="book" size={13} />Abrir PDF</button><button type="button" onClick={() => select(book)}>Detalles</button></div>
        </article>)}</div>
        {!filtered.length ? <div className={s.noResults}><AppIcon name="search" size={28} /><h2>No encontramos fuentes con esos filtros</h2><button type="button" className={a.button} onClick={reset}>Limpiar filtros</button></div> : null}
      </section>
      {selected ? <aside className={`${s.detail} ${detailOpen ? s.detailOpen : ""}`} aria-label="Detalle de la fuente">
        <button type="button" className={s.closeDetail} onClick={() => { setDetailOpen(false); setReaderId(null); }}>Volver al catálogo</button>
        <div className={s.detailHero}><Image src={`/biblioteca/covers/${selected.id}.jpg`} alt={`Primera página de ${selected.title}`} width={112} height={155} sizes="112px" priority />
          <div><div className={s.badges}><span>{localReading ? "Lectura local" : "Lectura pendiente"}</span><span>Tutor pendiente</span></div><h2 ref={detailTitle} tabIndex={-1}>{selected.title}</h2><p>{selected.authors.join(", ") || "Autor sin confirmar"}</p><p>{selected.edition ? `Edición ${selected.edition}` : "Edición sin confirmar"}{selected.year ? ` · ${selected.year}` : ""}</p><p>{selected.pages.toLocaleString("es-MX")} páginas del PDF</p></div></div>
        <p className={s.sourceNote}>{selected.comparison}</p>
        <div className={s.detailActions}><button className={a.button} type="button" disabled={!localReading || loadingId !== null} onClick={() => void openPdf(selected)}><AppIcon name="book" size={16} />{loadingId === selected.id ? "Verificando PDF…" : "Abrir PDF"}</button><button className={`${a.button} ${a.secondary}`} type="button" onClick={() => setReaderId(null)}>Ver portada</button></div>
        {!localReading ? <p className={s.matchNote}>Los PDF no están disponibles en este servidor. El catálogo se conserva; no se han publicado los libros.</p> : null}
        <section className={s.preview} aria-label="Vista previa del libro"><div><h3>{readerId === selected.id ? "Lector del PDF original" : "Primera página del PDF"}</h3>{readerId === selected.id ? <a href={`/api/biblioteca/${selected.id}`} target="_blank" rel="noopener noreferrer">Abrir aparte</a> : null}</div>
          {readerId === selected.id ? <iframe title={`Lector de ${selected.title}`} src={`/api/biblioteca/${selected.id}#view=FitH`} /> : <Image src={`/biblioteca/covers/${selected.id}.jpg`} alt={`Vista de la primera página del PDF ${selected.title}`} width={330} height={450} sizes="330px" loading="eager" />}
        </section><p className={s.readingNote}>{readerId === selected.id ? "Si tu navegador no muestra el PDF incrustado, usa Abrir aparte. " : ""}Esta versión abre el PDF original. Los resaltados privados del lector todavía no están implementados.</p>
      </aside> : null}
    </div>
    <StudyToast key={toast?.id ?? 0} message={toast} onDismiss={dismissToast} />
  </AccessShell>;
}
