// app/layout.tsx 
import { Metadata } from "next"; 
import "./globals.css"; 
import Providers from "./Providers"; 

export const metadata: Metadata = { 
  title: "Formalin Management App", 
};

export default function RootLayout({ 
  children, 
  }: { 
  children: React.ReactNode; 
  }) { 

  return ( 
    <html lang="ja"> 
      <body className="pt-16"> 
        {/* 
        layout.tsx はサーバーコンポーネント 
        ここで Provider を呼び出すときは client component が必要 
        */} 
        <Providers> 
          {children} 
        </Providers> 
      </body> 
    </html> 
  ); 
};