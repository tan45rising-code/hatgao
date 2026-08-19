import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hat Gao — Order Online",
  description: "Order directly from Hat Gao Vietnamese Restaurant, Nicosia.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
