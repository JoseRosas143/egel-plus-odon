import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  metadataBase: new URL("https://egelplusodon.jraprende.online"),
  alternates: { canonical: "/" },
  title: "EGEL Plus ODON · Estudia con intención | J R Aprende",
  description: "Organiza tu preparación para el EGEL Plus ODON. Practica reactivos, conserva tus apuntes y favoritos, consulta el catálogo bibliográfico y sigue tu meta personal. Plataforma independiente de CENEVAL.",
  openGraph: { url: "/", title: "EGEL Plus ODON · No solo contestes. Aprende a resolver.", description: "Reactivos, bibliografía y tus propias conclusiones en un solo espacio de estudio. Conoce las funciones disponibles y el piloto de tutores.", locale: "es_MX", type: "website", siteName: "EGEL Plus ODON · J R Aprende" },
  twitter: { card: "summary", title: "EGEL Plus ODON · Estudia con intención", description: "Tu preparación en un solo lugar. Una plataforma independiente de J R Aprende." },
};

export default function Home() { return <LandingPage />; }
