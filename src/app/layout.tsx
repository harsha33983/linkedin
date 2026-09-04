import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LinkedGrow AI — LinkedIn Content Operating System",
  description:
    "Your ideas. Your voice. AI that gets better at sounding like you over time.",
  keywords: [
    "LinkedIn",
    "content creation",
    "AI writing",
    "personal branding",
    "voice AI",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
