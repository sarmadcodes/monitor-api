import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "sarmad.tech — Infrastructure Monitor",
  description: "Real-time server and application monitoring",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
