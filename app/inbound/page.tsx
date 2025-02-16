// app/inbound/page.tsx (Server Component by default)

import InboundClient from "./InboundClient";



export default function InboundServerPage() {
  // ここはサーバーコンポーネントのため、useSession() を呼ぶとエラーになる
  // 代わりにクライアントコンポーネントを返すだけ
  return <InboundClient />;
}
