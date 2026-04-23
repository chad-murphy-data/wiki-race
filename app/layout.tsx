import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wiki Race",
  description: "Multiplayer Wikipedia racing for team onsites.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
