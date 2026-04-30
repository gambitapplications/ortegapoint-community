import "./globals.css";

export const metadata = {
  title: "Ortega Point Community",
  description: "Private workspace"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
