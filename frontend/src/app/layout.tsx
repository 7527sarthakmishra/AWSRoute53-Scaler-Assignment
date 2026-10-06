import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Route 53 Management Console",
  description: "A functional AWS Route 53 experience clone.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
