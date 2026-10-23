import type { Metadata } from "next";
import { Roboto, Roboto_Slab } from "next/font/google";
import "./globals.css";

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-body",
  display: "swap",
});

const robotoSlab = Roboto_Slab({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-heading",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Centro de Diagnóstico y Mejora Continua",
  description:
    "Correlación de Graylog y Redmine con diagnóstico asistido por IA.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`${roboto.variable} ${robotoSlab.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
