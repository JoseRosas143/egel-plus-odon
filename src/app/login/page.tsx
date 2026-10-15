import type { Metadata } from "next";
import { AccessForm } from "@/components/acceso/form";
export const metadata: Metadata = { title: "Iniciar sesi\u00f3n | EGEL Plus ODON", robots: { index: false, follow: false } };
export default function LoginPage() { return <AccessForm mode="login" />; }
