import "./globals.css";

export const metadata = {
  title: "3drossa — The Ascent",
  description:
    "A demo of 3drossa: stations, travel, and a flight path you drag instead of type.",
};

export const viewport = { colorScheme: "dark", themeColor: "#0e1418" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
