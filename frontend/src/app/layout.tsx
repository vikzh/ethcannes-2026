import type { Metadata } from "next";
import "@rainbow-me/rainbowkit/styles.css";
import { Web3Provider } from "@/components/web3-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wallet Console",
  description: "Dashboard-style wallet UI with Ethereum connection",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full font-sans">
        <Web3Provider>{children}</Web3Provider>
      </body>
    </html>
  );
}
