# 職場PCの更新と、元に戻す操作

**Dockerのビルド・業務操作と、Windows PowerShell 5.1での更新・復旧テストは成功しました。** [自動検証の結果](https://github.com/oshimmmm/formalin-app-next-local2/actions/runs/39872422384)

今回は Node.js / Next.js とアプリの更新です。毎日17:30のUSBバックアップの設定、DBの構造、保存データは変更しません。

## 先に知っておくこと

| 操作 | 起こること |
| --- | --- |
| 開発PCでcommit・push | GitHubに更新ファイルが載る。職場のアプリはまだ切り替わらない |
| 職場PCでgit pull | 職場PCのファイルが更新される。稼働中のアプリはまだ切り替わらない |
| 更新スクリプトを実行 | 動いている旧アプリを保存し、新版をビルドしてからアプリだけ切り替える |
| 復旧スクリプトを実行 | 保存した旧アプリに戻す。DBを過去の状態には戻さない |

**今回の更新では、手動の `docker compose up --build` の代わりに、以下の更新スクリプトを使ってください。** 普通のビルド操作だけでは、復旧用の旧イメージが残ることを保証できません。

## 更新する：職場のサーバーPCで実行

17:30のバックアップが終わった後、利用者の入力を止めて作業します。USBを挿し、いつも使っている本番フォルダーをVS Codeで開き、「ターミナル」→「新しいターミナル」でPowerShellを開きます。

### 1. 作業場所とUSBバックアップを確認

```powershell
git branch --show-current
git status --short
Get-Content 'D:\formalin_backup_dir\backup_log.txt' -Tail 1
```

- ブランチが `master` であること。
- `git status --short` が何も表示しないこと。
- バックアップログが直近の17:30のもので、`exit=0`、`size` が0以外であること。

合わない場合は、その場で止めて確認してください。`git reset --hard` は使いません。

### 2. GitHubから更新ファイルを取得

```powershell
git pull --ff-only origin master
```

エラーが出たら次へ進みません。この操作だけでは、動いているアプリは変わりません。

### 3. 旧アプリを保存してから更新

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\update-production.ps1
```

USBのダンプを検査し、現在のDockerイメージ、復旧情報、ダンプのコピーをPC内の `.deployment-backups` に保存してからビルドします。保存やビルドに失敗した段階では、現在のアプリを止めません。

`Update complete: ... login page HTTP 200.` が表示されたら、いつものURLでログインし、既存の在庫と履歴を確認します。普段利用する別の職場PCからも確認してください。

ビルドで失敗して `App replacement was not started` と表示された場合は、旧アプリがそのまま動いており、切り戻しは不要です。いつものURLを確認してください。

**アプリの切り替え後に開けない・動作がおかしい場合は、追加のビルドをせず、次の復旧操作へ進みます。**

## 元に戻す：同じターミナルでこの1行

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\rollback-production.ps1
```

直近の更新作業で保存したアプリを選びます。日時やGitの番号の入力は不要です。旧イメージがPC内に残っていればそれを使い、なければ保存したアーカイブから読み込みます。再ビルドやDBの復元は行いません。

`App rollback complete` と表示されたら、いつものアカウントでログインし、在庫・履歴を確認します。更新後に入力したデータもDBに残ります。

ビルドだけの失敗でアプリを切り替えていない場合は、復旧スクリプトも現在の旧アプリを確認してそのまま保持します。保存状態が見つからないと止まった場合、無理にGitやDBを戻さないでください。

## 戻した後

- ソースファイルは新版のままです。原因を直すまでは、再ビルドや `docker compose up --build` をしないでください。
- `.deployment-backups` を消さないでください。復旧用イメージとダンプを保持しています。
- `docker compose down -v`、ボリューム削除、DBの初期化・復元は、この更新・復旧では使いません。
- 復旧もDockerエンジンが正常に動いていることが前提です。Docker自体が起動しない場合は、そのエラーを先に確認します。

細かな検査内容は[詳しい更新手順](docs/職場PC更新手順.md)、確認したテストと制限は[検証結果](docs/更新版検証結果.md)にあります。
