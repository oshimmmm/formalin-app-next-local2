import "./globals.css";
import { FormalinProvider } from "./Providers/FormalinProvider";

export const metadata = { title: "Formalin Management" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <FormalinProvider>
          {children}
        </FormalinProvider>
      </body>
    </html>
  );
}
