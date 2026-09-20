import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SAY — одежда из Беларуси",
  description: "Современная одежда с доставкой Европочтой по Беларуси.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
