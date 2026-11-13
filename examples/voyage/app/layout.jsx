import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

export const metadata = {
  title: "Lantern — seven years to Saturn · a 3drossa sample",
  description:
    "A scroll-driven voyage built with 3drossa: the probe flies a path you can drag, past planets keyed to the same scroll.",
};

export const viewport = { colorScheme: "dark", themeColor: "#04060b" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
