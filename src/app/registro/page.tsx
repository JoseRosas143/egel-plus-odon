import type { Metadata } from "next";
import { AccessForm } from "@/components/acceso/form";
export const metadata: Metadata = { title: "Crear cuenta | EGEL Plus ODON", robots: { index: false, follow: false } };
export default function SignupPage() { return <AccessForm mode="registro" />; }
