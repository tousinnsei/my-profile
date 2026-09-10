# AGENTS.md

鄧信成（教育AI研究者・起業家）のポートフォリオサイト（static: HTML + CSS + Vanilla JS + JSON）。

## リポジトリ運用（デプロイワークフロー）

### GitHub への反映（main が本番）
1. 作業は `backup/pre-redesign` で行い、動作確認後に `main` を最新化
   ```
   git add -A
   git commit -m "..."
   git checkout main
   git merge backup/pre-redesign --ff-only
   git push origin main
   ```
2. 最初のコミット前にローカル git 身份の設定が必要（未設定なら）:
   ```
   git config user.name "tousinnsei"
   git config user.email "tousinnsei@gmail.com"
   git config core.autocrlf input
   ```
   ※ `core.autocrlf=input`（コミット時LF）で改行差分を防ぐ。

### Vercel への本番デプロイ（自動）
- プロジェクト `alpha-44dc/my-profile` は GitHub と連携済み（git integration）。
- **`main` への push だけで自動デプロイ** → `https://www.ybhtkj.cn/` に反映。
- 追加の手動操作は不要。

### デプロイ確認（目視 or コマンド）
- 本番: https://www.ybhtkj.cn/
- 最新Productionデプロイ一覧:
  ```
  npx vercel ls my-profile --prod
  ```
  ※ Vercel CLI 未ログイン時は `npx vercel login`（デバイスフロー、ブラウザ認証）を先に実行。

### リリース直後の自動チェック
```
npx vercel whoami                     # tousinnsei が表示されればログイン済み
Invoke-WebRequest https://www.ybhtkj.cn/ -UseBasicParsing   # 200 確認
```
新UIが反映されているかは、`portfolio.html` に `すべての実績を見る` / `countHint` / `data-year` が含まれるかで確認できる。

## 併存ブランチ
- `main`（本番） / `backup/pre-redesign`（作業用）は同一コミットに ff しておくことが多い。
- リファクタ作業は作業用ブランチで実施し、検証（jsdom ハーネス：48チェック / `node --check` / リンク整合）を通過してから `main` へ含める方針。