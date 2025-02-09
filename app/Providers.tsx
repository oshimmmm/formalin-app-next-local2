// app/providers.tsx 
"use client"; 

import { SessionProvider } from "next-auth/react"; 
import Header from "./components/Header"; 
import { useSession } from "next-auth/react"; 
import React from "react"; 

export default function Providers({ 
  children, 
  }: { 
  children: React.ReactNode; 
  }) { 
  
  return ( 
    // NextAuthのセッション管理 
    <SessionProvider> 
      <LayoutWithHeader> 
        {children} 
      </LayoutWithHeader> 
    </SessionProvider> 
  ); 
  } 
/** 
* Headerの表示を制御したい場合は、サブコンポーネントでuseSession()を呼ぶ 
*/ 
function LayoutWithHeader({ children }: { children: React.ReactNode }) { 
  // NextAuthのuseSession() でログイン状態を取得 
  const { data: session, status } = useSession(); 
  console.log("LayoutWithHeader -> session:", session, "status:", status); 
  
  return ( 
    <> 
      {/* 
      ログイン済み(session?.user が存在)ならヘッダーを表示するイメージ 
      ※ 要件に合わせて自由に調整 
      */} 
      {session?.user && ( 
        <div className="fixed top-0 left-0 w-full z-50 h-16 hide-on-print"> 
          <Header /> 
        </div> 
      )}

      <main>{children}</main> 
    </> 
  ); 
};