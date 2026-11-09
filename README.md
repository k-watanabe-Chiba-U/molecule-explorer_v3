# 分子観察鏡 / Digital Molecular Imaging System

講義用の固定8構造を切り替えて表示するGitHub Pagesサイト。

## 今回の変更
- **6: 塩 (NaCl)、7: 塩 (NaCl) 溶ける前、8: 塩 (NaCl) 溶け始め**: 距離 2.30–3.12 Å の Na–Cl 最近接イオン対に、格子の連結線を表示します。
- **8**: 水分子中の酸素原子 (O) とナトリウムイオン (Na) の間に連結線を描きません（距離に関係なく）。
- 水分子内部の O–H 結合は従来どおり表示します。他の6〜8の自動生成された結合は再構成します。
- **1〜5** の分子モデルや操作性は変更していません。
- 化学的な注記: Na–Cl の線はイオン結晶中の近接関係を表す**可視化上の連結線**であり、共有結合を意味しません。水和時の Na–O 間の相互作用は、表示上の線を省いただけで、相互作用が存在しないという意味ではありません。

## 既存サイトを最小限の変更で更新する
1. GitHubの `k-watanabe-Chiba-U/molecule-explorer` を開きます。
2. リポジトリ直下の `app.js` をこのパッケージの `app.js` に置き換え、Commit changesで保存します。
3. 同じく `index.html` を置き換えると、ページ最下部の結合説明文も更新できます（任意）。
4. 既存のXYZは変更不要です。GitHub Pages反映後にブラウザで再読み込みします。

## サイト一式をアップロードし直す場合
- `index.html` / `styles.css` / `app.js` / `molecule-catalog.json` はリポジトリの最上位に配置します。
- `molecules/` 内には番号付き `1_...xyz` ～ `8_...xyz` の8ファイルを配置します。
- 旧テスト用のXYZが残っていると、番号順の8件選択に混入する可能性があるため削除してください。
- GitHub Pages Settings → Pagesは **Deploy from a branch**, branch **main**, folder **/(root)**。
- `molecule-catalog.json` はJekyll Liquidテンプレートなので、GitHub Pages上で自動生成されます。ローカルで直接HTMLを開いた場合には一覧が動きません。

## 動作検証
- 6〜8の元XYZで隣接Na–Cl距離2.82 Å、8のNa–O水和距離2.45 Åを確認。
- 3Dmol.jsの原子 `bonds`/`bondOrder` を変更する方式。
- 原子の座標値は一切変更していません。
