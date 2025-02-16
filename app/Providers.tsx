"use client";

import { SessionProvider } from "next-auth/react";
import { FormalinProvider } from "./Providers/FormalinProvider"; // ← 実在するパスに合わせる
import Header from "./components/Header";
import React from "react";
import { useSession } from "next-auth/react";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <FormalinProvider>
        <LayoutWithHeader>
          {children}
        </LayoutWithHeader>
      </FormalinProvider>
    </SessionProvider>
  );
}

function LayoutWithHeader({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const showHeader = !!session?.user; // ユーザーがいれば表示

  return (
    <>
      {showHeader && (
        <div className="fixed top-0 left-0 w-full z-50 h-16 hide-on-print">
          <Header />
        </div>
      )}
      <main className="pt-16">
        {children}
      </main>
    </>
  );
}
