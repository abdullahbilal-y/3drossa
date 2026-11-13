import "@fontsource-variable/fraunces";
import "@fontsource-variable/inter";
import "./globals.css";

export const metadata = {
  title: "Halden Field Automatic — a 3drossa sample",
  description:
    "A product page built with 3drossa: the watch stands still and the camera walks around it as you scroll.",
};

export const viewport = { colorScheme: "light", themeColor: "#ece6dc" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
