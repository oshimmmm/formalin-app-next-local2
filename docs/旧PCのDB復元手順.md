# 旧PCのDBをダンプの内容へ入れ替える

旧サーバーPCの既存DBに、選んだバックアップのデータを読み込む手順です。旧PCの在庫・履歴・ユーザーはダンプ時点の内容に置き換わります。現在稼働している本番サーバーを更新する操作とは別です。

## 更新スクリプトとの違い

`update-production.ps1` はアプリだけを更新し、更新前後のDBコンテナIDとデータ用ボリューム名が一致することを確認します。各レコードを全件照合する処理ではありません。

`database-before.dump` はPostgreSQLのバックアップ用アーカイブです。そのファイルをデータ保存先へ接続するだけでは使えません。今回の `restore-old-pc-database.ps1` は、`pg_restore` で既存DBに内容を読み込みます。[PostgreSQL公式の説明](https://www.postgresql.org/docs/17/app-pgrestore.html)

## 1. 旧PCとファイルを確認する

旧PCで、いつものアプリのフォルダーをVS Codeで開き、PowerShellで実行します。

```powershell
hostname
git branch --show-current
git status --short
```

- 表示された旧PC名を控えます。復元コマンドのPC名は、この文字を固定して指定します。
- ブランチが `master`、`git status --short` が空であることを確認します。
- 利用者の入力を止めます。17:30の自動バックアップが動いている時間は避けます。
- Cドライブとアプリのフォルダーのドライブに、最低約10GBに加え、ダンプと退避用バックアップを置くための空きが必要です。スクリプトも事前確認します。

今回表示された保存先であれば、使うファイルは次のものです。

```text
.deployment-backups\20261027-165131-125\database-before.dump
```

これは更新時にUSBからコピーしたダンプです。2026年10月27日16:51にDBから新しく取得したデータ、という意味ではありません。元のUSBダンプのバックアップ時点を確認してください。

## 2. 復元スクリプトを取得する

```powershell
git pull --ff-only origin master
```

エラーが出た場合は次へ進みません。

## 3. 旧PC名を固定して復元する

下の `OLD-PC-NAME` を、手順1で控えた旧PC名へ置き換えます。PC名が一致しなければ、スクリプトはDocker操作前に止まります。

```powershell
$oldPcName = 'OLD-PC-NAME'
$dumpFile = '.\.deployment-backups\20261027-165131-125\database-before.dump'
Test-Path -LiteralPath $dumpFile
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\restore-old-pc-database.ps1 -ExpectedComputerName $oldPcName -DumpFile $dumpFile
```

`Test-Path` が `True` であることを確認してから、最後の行を実行します。PC名には、確認済みの旧PC名を文字として指定してください。その場の `hostname` の結果を自動で渡すと、PCの取り違えを検出できません。

スクリプトはローカルDockerだけを対象にし、既存のアプリ・DBの所属と保存ボリュームを確認します。選択したダンプを検査してからアプリだけを止め、旧PCの現在のDBをPC内の `.database-restore-backups` へ新しく退避します。退避に失敗した場合は、復元へ進みません。

その後、DBコンテナと保存ボリュームを維持したまま、ダンプの内容を既存DBへ復元します。USBや入力元のダンプは書き換えません。新しいアプリのビルドも行いません。

復元は `--single-transaction` を使います。復元中のSQLエラーで、途中までの入れ替えを残さないための設定です。通信断やDocker自体の障害では、状態を確認してから対処してください。[PostgreSQL公式の説明](https://www.postgresql.org/docs/17/app-pgrestore.html)

## 4. アプリで確認する

最後に `Restore and login-page check complete.` で始まる行が表示されたら、旧PCのいつものURLでいったんログアウトし、ログイン・在庫・履歴・Excel出力を確認します。ログインに使うユーザー情報もダンプの内容へ戻るため、そのバックアップに含まれるアカウントを使います。途中の `DATABASE RESTORE COMMITTED` はデータの復元完了を示し、その後のアプリ検査とは別です。

エラーが出たら、追加の復元・ビルドを重ねず、表示された内容と退避ファイルの場所を控えてください。

復元前の旧PCのデータへ戻したい場合は、保存された退避ダンプを同じ復元スクリプトの `-DumpFile` に指定します。アプリ用の `rollback-production.ps1` はDBを復元しません。

同じアプリ・DB構造のダンプを使う前提です。ダンプに含まれるオブジェクトを置き換える方式のため、ダンプに含まれない独自のテーブルなどは削除しません。

## 検証したこと

PC名、容量不足、リモートDockerの拒否、コンテナ・保存先の照合、ダンプの形式・内容一覧・ハッシュ、退避失敗時の停止、復元エラー時の再起動、正常復元後の検査を含む19件の模擬テストが、PowerShell 7.6.5とWindows PowerShell 5.1.26100.9711で成功しました。模擬テストでは実Docker・実DBを操作していません。

別途、この開発PCの分離したPostgreSQL 17.2で、架空データから作ったダンプを既存の検証用DBへ復元し、データが入れ替わることを確認しました。意図的にSQLエラーを起こした復元では、元のレコードと制約が保たれることも確認しました。検証用DBは削除し、検証用PostgreSQLは終了済みです。

旧PC・本番サーバーPCの実データを使った復元は、こちらからは実行していません。
