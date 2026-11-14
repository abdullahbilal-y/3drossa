import "@fontsource-variable/inter-tight";
import "./globals.css";

export const metadata = {
  title: "Northline — the biggest thing in the sky · a 3drossa sample",
  description:
    "A scroll-driven airliner page built with 3drossa: the A380 flies in from the horizon, passes the camera, then climbs away.",
};

export const viewport = { colorScheme: "light", themeColor: "#cfdceb" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
