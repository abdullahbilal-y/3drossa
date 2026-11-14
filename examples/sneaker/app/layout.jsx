import "@fontsource-variable/inter";
import "./globals.css";

export const metadata = {
  title: "Kestrel Daily — a 3drossa sample",
  description:
    "A product page built with 3drossa: the shoe stands still, the camera walks around it, and the colourway changes as you scroll.",
};

export const viewport = { colorScheme: "light", themeColor: "#ebe9e4" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
