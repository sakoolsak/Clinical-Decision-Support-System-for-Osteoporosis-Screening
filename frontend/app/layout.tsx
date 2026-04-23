import "./globals.css";
import { ReactNode } from "react";

export const metadata = {
  title: "Clinical Decision Support System for Osteoporosis Screening",
  description: "Clinical Decision Support System for Osteoporosis Screening"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
