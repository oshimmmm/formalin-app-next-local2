"use client";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { DefaultSession } from "next-auth";
import { useEffect, useRef, useState } from "react";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isAdmin: boolean;
      username: string;
    } & DefaultSession["user"];
  }
}

type NavItem = { path: string; label: string };

export default function Header() {
  const { data: session } = useSession();
  const pathname = usePathname();

  // ▼ hooks は早期returnより前で呼ぶ
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Escキーで閉じる（未ログイン時は何もしない）
  useEffect(() => {
    if (!session?.user) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        detailsRef.current?.removeAttribute("open");
        setMenuOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [session?.user]);

  // 未ログイン時は描画しない
  if (!session?.user) return null;
  const user = session.user;

  // 共通リンク（常に表示）
  const commonLinks: NavItem[] = [
    { path: "/home", label: "ホーム" },
    { path: "/inbound", label: "入庫" },
    { path: "/outbound", label: "出庫" },
    { path: "/submission", label: "提出" },
    { path: "/reverse", label: "戻入" },
    { path: "/list", label: "ホルマリン一覧" },
    { path: "/inventory", label: "在庫確認" },
  ];

  // 管理者向けリンク
  const adminLinks: NavItem[] = [
    { path: "/biopsy", label: "生検用" },
    { path: "/lymph", label: "リンパ節用" },
    { path: "/bk", label: "BK" },
    { path: "/admin", label: "ホルマリン編集" },
    { path: "/user", label: "ユーザー" }, // ↓↓↓ ここから「その他」へ退避
    { path: "/backup", label: "バックアップ" },
    { path: "/archive", label: "データ削除" },
  ];

  // 「その他」へ入れる対象
  const overflowSet = new Set<string>(["/user", "/backup", "/archive"]);

  // 表示用に2分割
  const all = user.isAdmin ? [...commonLinks, ...adminLinks] : commonLinks;
  const primary = all.filter((l) => !overflowSet.has(l.path));
  const overflow = all.filter((l) => overflowSet.has(l.path));

  const baseLink =
    "inline-flex items-center rounded-full px-1.5 py-1.5 text-[15px] md:text-base font-medium transition-colors border";
  const activeCls = "bg-blue-500/15 text-blue-300 border-blue-400";
  const idleCls = "border-transparent hover:bg-white/10 hover:text-blue-200";

  const isOverflowActive = overflow.some((o) => o.path === pathname);

  return (
    <header className="bg-gray-800 text-white px-6 py-3 shadow-md fixed top-0 left-0 w-full z-50">
      <div className="flex justify-between items-center max-w-7xl mx-auto">
        {/* ナビゲーション */}
        <nav className="flex items-center gap-3">
          {primary.map((link) => {
            const active = pathname === link.path;
            return (
              <Link
                key={link.path}
                href={link.path}
                className={[baseLink, active ? activeCls : idleCls].join(" ")}
              >
                {link.label}
              </Link>
            );
          })}

          {/* 「その他」ドロップダウン（管理者かつ overflow がある場合） */}
          {user.isAdmin && overflow.length > 0 && (
            <>
              {/* 画面全体のオーバーレイ（開いているときだけ） */}
              {menuOpen && (
                <button
                  aria-label="メニューを閉じる"
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => {
                    detailsRef.current?.removeAttribute("open");
                    setMenuOpen(false);
                  }}
                />
              )}

              <details
                ref={detailsRef}
                className="relative group"
                onToggle={(e) =>
                  setMenuOpen((e.currentTarget as HTMLDetailsElement).open)
                }
              >
                {/* デフォルトの▶マーカーは下の<style jsx>で非表示 */}
                <summary
                  className={[
                    baseLink,
                    "cursor-pointer select-none list-none",
                    isOverflowActive ? activeCls : idleCls,
                  ].join(" ")}
                  aria-expanded={menuOpen}
                >
                  その他
                </summary>

                {/* ポップオーバー本体（z-50でオーバーレイよりも上に） */}
                <div
                  className="absolute right-0 mt-2 min-w-44 rounded-xl border border-white/10 bg-gray-900/95 shadow-lg ring-1 ring-black/5 p-2 backdrop-blur-sm z-50"
                  role="menu"
                  aria-label="その他メニュー"
                >
                  <ul className="grid gap-1">
                    {overflow.map((link) => {
                      const active = pathname === link.path;
                      return (
                        <li key={link.path}>
                          <Link
                            href={link.path}
                            className={[
                              "block rounded-lg px-3 py-2 text-[15px] md:text-base",
                              active
                                ? "bg-white/10 text-blue-200"
                                : "hover:bg-white/10 hover:text-blue-200",
                            ].join(" ")}
                            onClick={() => {
                              // 遷移時に閉じる
                              detailsRef.current?.removeAttribute("open");
                              setMenuOpen(false);
                            }}
                          >
                            {link.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </details>
            </>
          )}
        </nav>

        {/* ユーザー情報とログアウト */}
        <div className="flex items-center space-x-3 pl-4">
          <span className="text-sm font-medium">{user.username} さん</span>
          <button
            onClick={() =>
              signOut({ callbackUrl: "http://172.17.231.80:3003/login" })
            }
            className="bg-red-500 hover:bg-red-600 text-white text-xs font-semibold px-3 py-1.5 rounded"
          >
            ログアウト
          </button>
        </div>
      </div>

      {/* detailsのデフォルトマーカーを消す（cross-browser） */}
      <style jsx>{`
        details > summary {
          list-style: none;
        }
        details > summary::-webkit-details-marker {
          display: none;
        }
      `}</style>
    </header>
  );
}
