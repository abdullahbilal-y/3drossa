import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

export const metadata = {
  title: "Seven years to Saturn — a 3drossa sample",
  description:
    "Cassini's voyage to Saturn, built with 3drossa: NASA's model flies a path you can drag, past planets keyed to the same scroll.",
};

export const viewport = { colorScheme: "dark", themeColor: "#04060b" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
