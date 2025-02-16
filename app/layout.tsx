import "./globals.css";
import Providers from "./Providers";

export const metadata = { title: "Formalin Management" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        {/* 
          layout.tsx はサーバーコンポーネント。
          ここで Client Component である Providers.tsx を呼び出し、
          その内部で SessionProvider と FormalinProvider をラップする
        */}
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
