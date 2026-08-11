import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:5173";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  const baseUrl = `${protocol}://${host}`;
  const title = "Clínica Visão | Acompanhamento diário";
  const description = "Painel de evolução diária e próximos passos clínicos.";
  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: `${baseUrl}/og.png`, width: 1792, height: 938, alt: "Clínica Visão" }] },
    twitter: { card: "summary_large_image", title, description, images: [`${baseUrl}/og.png`] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
