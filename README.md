# ぐるっとポン 情報収集ツール

マーケティング媒体（AdverTimes・MarkeZine・DIGIDAY Japan・ITmedia Marketing）から記事を収集し、ぐるっとポンの事業コンテキストに沿った「コンセプト」と「企画ヒント」に変換するツール。

---

## 構成

| ファイル | 役割 |
|---|---|
| `index.html` | GitHub Pages（フロントエンド）|
| `worker.js`  | Cloudflare Worker（バックエンド）|
| `README.md`  | このファイル |

**情報の流れ**

```
RSS フィード
  → Cloudflare Worker
    → Claude Haiku（D-1テーマフィルタ）
    → 記事全文スクレイピング
    → Claude Sonnet（コンセプト・企画ヒント生成）
  → JSON レスポンス
→ GitHub Pages（カード表示）
```

---

## セットアップ手順

### 1. GitHub Pages（フロントエンド）

1. このリポジトリを GitHub に Push
2. Settings → Pages → Source を `main` ブランチ・`/ (root)` に設定
3. 公開 URL（例：`https://YOUR_ORG.github.io/infocurator/`）を控えておく
4. 手順 2 完了後、`index.html` の `WORKER_URL` を実際の Worker URL に変更して再 Push

### 2. Cloudflare Worker（バックエンド）

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) にログイン
2. Workers & Pages → 「Create application」→「Create Worker」
3. エディタに `worker.js` の内容を貼り付けてデプロイ
4. Worker の URL（例：`https://infocurator.YOUR_SUBDOMAIN.workers.dev`）を控えておく

### 3. 環境変数の設定（Cloudflare）

Worker の設定画面 → 「Settings」→「Variables」→「Environment Variables」

| 変数名 | 値 | 備考 |
|---|---|---|
| `CLAUDE_API_KEY` | `sk-ant-...` | Anthropic API キー（必須）|

> **注意**：API キーは絶対に `worker.js` 本体に直書きしないこと。

### 4. WORKER_URL の書き換え

`index.html` の先頭付近にある以下の行を編集：

```javascript
const WORKER_URL = 'https://YOUR_WORKER.YOUR_SUBDOMAIN.workers.dev';
```

変更後に GitHub に Push すると自動で GitHub Pages に反映される。

### 5. 動作確認

GitHub Pages の URL にアクセスし「今すぐ収集する」を押して記事カードが表示されれば完了。

---

## Google Drive 連携（将来追加）

> 現状はフォールバック（`worker.js` 内のハードコード情報）で動作します。
> Google Workspace 導入後（目安：6ヶ月後）に以下の手順で追加します。

### 想定の情報フロー

```
各自が原本を Google Drive「原本」フォルダに保存
  → Claude 等で指定プロンプトを使い変換
  → 「整形済み」フォルダに .md ファイルとして保存
→ Cloudflare Worker が Drive API 経由で整形済みフォルダを参照
→ コンテキストとして変換プロンプトに注入
```

### 必要な追加作業

1. Google Cloud Console でプロジェクト作成・Drive API を有効化
2. サービスアカウント作成 → JSON キーを発行
3. 整形済みフォルダをサービスアカウントに共有（閲覧権限）
4. Cloudflare Worker に環境変数を追加：
   - `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON`（サービスアカウント JSON）
   - `GOOGLE_DRIVE_FOLDER_ID`（整形済みフォルダの ID）
5. `worker.js` 末尾のコメントアウト `fetchDriveContext()` を実装・有効化

### CORS について

フロントエンド（GitHub Pages）→ Worker → Drive API という構成なので、
Drive API の CORS 問題は Worker を経由することで回避できます。

---

## 運用メモ

- **収集頻度**：手動（「今すぐ収集する」ボタン）
- **最大取得件数**：6件/回（コスト上限。`worker.js` の `capped.slice(0, 6)` で調整可能）
- **推定コスト**：1回の収集あたり $0.04〜$0.07（Haiku フィルタ + Sonnet 変換）
- **D-1テーマの更新**：四半期ごとに `worker.js` 内の `D1_FILTER_PROMPT` を見直す
- **テーマ除外基準**：同じく `worker.js` 内の除外基準セクションを編集

---

## トラブルシューティング

| 症状 | 確認箇所 |
|---|---|
| 収集ボタンを押しても何も起きない | `WORKER_URL` が正しく設定されているか確認 |
| 「CLAUDE_API_KEY が設定されていません」 | Cloudflare Worker の環境変数を確認 |
| 記事が 0 件になる | RSS ソースの URL が変わっていないか確認。Cloudflare のログを確認 |
| 記事が文字化けする | RSS フィードの文字コードが UTF-8 以外の可能性。`worker.js` の `fetchRSS` を調整 |

---

## ファイル更新履歴

| 日付 | 内容 |
|---|---|
| 2026-06-18 | 初版（Notion 連携を Google Drive 連携に変更） |
| 2026-06-23 | worker.js・index.html 新規実装 |
