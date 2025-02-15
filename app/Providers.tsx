// app/Providers.tsx
"use client";

import { SessionProvider } from "next-auth/react";
import Header from "./components/Header";
import { useSession } from "next-auth/react";
import React from "react";

// 追加: FormalinProvider を読み込む
import { FormalinProvider } from "./Providers/FormalinProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    // NextAuthのセッション管理
    <SessionProvider>
      {/* ホルマリン管理コンテキスト */}
      <FormalinProvider>
        <LayoutWithHeader>
          {children}
        </LayoutWithHeader>
      </FormalinProvider>
    </SessionProvider>
  );
}

/** 
 * Headerの表示を制御したい場合は、サブコンポーネントでuseSession()を呼ぶ 
 */
function LayoutWithHeader({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  console.log("LayoutWithHeader -> session:", session, "status:", status);

  return (
    <>
      {session?.user && (
        <div className="fixed top-0 left-0 w-full z-50 h-16 hide-on-print">
          <Header />
        </div>
      )}
      <main>{children}</main>
    </>
  );
}
