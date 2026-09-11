# my-profile

## 多言語対応（multilingual i18n）

- 対応言語（4言語）: `ja`（既定）/ `zh`（简体中文）/ `en` / `ko`
- 言語切替: 各ページのヘッダーの言語スイッチャー（ネイティブ名で表示）で切替。`?lang=XX` クエリ、`localStorage.preferredLanguage` の順で解決し、切替後は localStorage に永続化。
- 辞書: `i18n/{ja,zh,en,ko}.js`（`window.DICT_XX`）
- マネージャ: `js/i18n.js`（`I18N`）— `data-i18n`（text）、`data-i18n-html`(HTML)、`data-i18n-attr="key|attr,key2|attr2"`(属性) を再帰適用、`<title>`/`<meta>`/`html lang`(`data-lang`) を更新、未翻訳時の一瞬の素の表示（FOEL）は `pre-i18n` + `visibility:hidden` で防止。
- 成果物データ: `data/projects.js`（`window.PROJECTS_DATA`、43項目×4言語）
- 実績ページ `portfolio.html` はデータ駆動レンダリング（検索は4言語横断・フィルタ・ソート・モーダル/カルーセル・ロードモア）。
- 検証: `node --check`/lint（辞書キー網羅・重複ID・リンク整合）/ 実際のページ状況は jsdom ハーネスで確認。