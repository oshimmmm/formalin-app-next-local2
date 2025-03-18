"use client";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { DefaultSession } from "next-auth";

// next-auth の型拡張（password削除、idを追加）
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isAdmin: boolean;
      username: string;
      // password: string; <-- 基本的にsessionにpasswordは含めない
    } & DefaultSession["user"];
  }
}

export default function Header() {
  const { data: session } = useSession();
  const pathname = usePathname();

  // ログインしていない場合はヘッダー非表示
  if (!session?.user) return null;

  // NextAuth session.user の構造
  const user = session.user;

  // 一般ユーザーが見るリンク
  const commonLinks = [
    { path: "/home", label: "ホーム" },
    { path: "/inbound", label: "入庫" },
    { path: "/outbound", label: "出庫" },
    { path: "/submission", label: "提出" },
    { path: "/reverse", label: "戻入" },
    { path: "/list", label: "ホルマリン一覧" },
  ];

  // 管理者ユーザーのみ表示したいリンクを追加
  const adminLinks = [
    ...commonLinks,
    { path: "/admin", label: "ホルマリン編集" },
    { path: "/user", label: "ユーザー管理" },
    { path: "/backup", label: "バックアップ" },
    { path: "/archive", label: "アーカイブ" },
  ];

  // 管理者なら adminLinks、それ以外なら commonLinks
  const linksToDisplay = user.isAdmin ? adminLinks : commonLinks;

  return (
    <header className="bg-gray-800 text-white px-6 py-4 shadow-md fixed top-0 left-0 w-full z-50">
      <div className="flex justify-between items-center max-w-7xl mx-auto">
        {/* ナビゲーション */}
        <nav className="flex space-x-6">
          {linksToDisplay.map((link) => (
            <Link
              href={link.path}
              key={link.path}
              className={`text-lg font-medium ${
                pathname === link.path
                  ? "text-blue-400 underline"
                  : "hover:text-blue-300"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        {/* ユーザー情報とログアウト */}
        <div className="flex items-center space-x-4">
          <span className="text-sm font-medium">
            {user.username} さん
          </span>
          <button
            onClick={() => signOut({ callbackUrl: "http://172.17.231.80:3003/login" })}
            className="bg-red-500 hover:bg-red-600 text-white text-sm font-medium px-4 py-2 rounded"
          >
            ログアウト
          </button>
        </div>
      </div>
    </header>
  );
}
