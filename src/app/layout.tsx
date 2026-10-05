import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/ui/navbar";
import SmoothScrolling from "@/components/ui/smooth-scrolling";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "TalentGraph AI | ADA — Evidence-Driven Hiring",
  description: "Hire the engineer, not the resume. Verify technical claims against GitHub commits.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} font-sans h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col font-sans bg-black text-white selection:bg-red-500/20 selection:text-red-400">
        <SmoothScrolling>
          <Navbar />
          {children}
        </SmoothScrolling>
      </body>
    </html>
  );
}
