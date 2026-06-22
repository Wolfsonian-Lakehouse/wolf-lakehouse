import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Wolfsonian-FIU Lakehouse",
  description: "Wolfsonian-FIU Museum & Library Collection Data Explorer",
};

import Chatbot from "../components/Chatbot";
import { DuckDBProvider } from "@/providers/DuckDBProvider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <DuckDBProvider>
          {children}
          <Chatbot />
        </DuckDBProvider>
      </body>
    </html>
  );
}
