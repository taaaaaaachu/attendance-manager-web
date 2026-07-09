# Attendance Manager Web

出社・在宅勤怠を記録し、出社率を集計するWebアプリ。ユーザーは各自の勤怠のみを扱う個人〜小規模チーム向けの単一プロダクト。

## Language

**ユーザー(User)**:
Cloudflare Accessで認証されたメールアドレスそのもの。D1に`users`テーブルは存在せず、`attendance_records`にDISTINCTな`user_id`として登場するメールアドレスの集合が「ユーザー一覧」の実体となる(勤怠記録が1件もない人はユーザー一覧に現れない)。

**管理者(Admin)**:
Worker環境変数(`vars`/secret)に列挙されたメールアドレスの集合に自分のメールアドレスが含まれるユーザー。Cloudflare Access側のグループ分けやD1のroleカラムではなく、Worker側の設定のみで判定する。
