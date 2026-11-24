# プラモ在庫管理（単体版）

ビルド不要・静的ファイルのみで動作するプラモデル資材（塗料・デカール等）向けの在庫管理PWAです。  
サーバーや外部ビルド環境なしで、GitHub Pages やローカルWebサーバーにそのまま配置して使えます。

## 主な機能

- **ガンプラ本体の在庫管理**: 種別「ガンプラ」を追加。グレード（HG/RG/MG/PG等）と製作状況（未組立 / 製作中 / 完成）を記録し、製作状況での絞り込みが可能（積みプラ管理向け）。
- **在庫一覧・フィルタ**: 商品名・JAN・メーカー・品番・保管場所での検索、種別（ガンプラ / 塗料 / デカール / その他）および在庫状態（在庫あり / 残りわずか / 不足）での絞り込み、大きな `＋` / `−` ボタンでの数量調整。
- **買い物リスト**: 所持数 (`qty`) が目標数 (`desired`) 未満のアイテムを自動抽出し、不足数 (`desired - qty`) を表示。
- **JANコード登録・照合**:
  - カメラ読み取り（ZXing UMD を第一に、非対応時は `BarcodeDetector` へフォールバック）
  - 手入力・USBバーコードリーダー（Enter確定）
  - 照合チェーン（ローカル在庫 → UPCitemdb → ホビーサーチ用プロキシ → 手動登録＋Web確認リンク）と照合ログ表示
- **GitHub 同期 & JSONバックアップ**:
  - GitHub Contents API 経由での `inventory.json` 読み込み・保存（SHA競合検知と強制上書き対応）
  - トークンなし運用・バックアップ用の JSON エクスポート / インポート

## 画面の操作

- 一覧の各行は「札（グレード／品番） | 名前・置き場 | 数量の − ＋」の順に並びます。
- ガンプラの札は、製作状況を塗りで示します（枠だけ＝未組立、下帯＝製作中、ベタ塗り＝完成）。
- 行の名前の部分をタップすると、編集フォームが開きます。削除は誤操作を防ぐため、編集フォームの中にだけあります。
- 配色・書体・レイアウトの決まりごとは `DESIGN_LOCK.md` にまとめています。

---

## 使い方

1. ブラウザで `index.html` を開きます（PWA・カメラ機能を使う場合は **HTTPS** 環境が必要です。GitHub Pages を推奨します）。
2. 下部ナビの **JAN登録** または在庫タブの **+ 手動で新規登録** からアイテムを追加します。
3. データはこの端末の `localStorage`（`plamo-inventory-v1`）に保存されます。別端末と共有したい場合は **設定** タブから GitHub 同期または JSON エクスポート/インポートを利用してください。

---

## GitHub Pages への置き方

1. GitHub で新規リポジトリ（Public または Private）を作成し、このフォルダのファイル一式（`index.html`, `style.css`, `app.js`, `manifest.webmanifest`, `sw.js` 等）をプッシュします。
2. リポジトリの **Settings → Pages** を開きます。
3. **Source** に `Deploy from a branch`、ブランチに `main`（フォルダ `/ (root)`）を選択して保存します。
4. 数分後に発行される `https://<ユーザー名>.github.io/<リポジトリ名>/` にスマホやPCからアクセスし、必要に応じて「ホーム画面に追加」でPWAとしてインストールできます。

---

## GitHub 同期の設定

在庫データ保存用のリポジトリ（アプリ本体と同じリポジトリでも、専用のリポジトリでも可）を用意し、**設定** タブで以下を入力します。

- **Owner**: GitHubユーザー名またはOrganization名
- **Repo**: データを保存するリポジトリ名
- **Branch**: 既定 `main`
- **Path**: 既定 `inventory.json`
- **Personal Access Token (Fine-grained PAT)**:
  1. GitHub の **Settings → Developer settings → Personal access tokens → Fine-grained tokens** から新規作成します。
  2. **Repository access** で対象リポジトリのみを選択します。
  3. **Permissions → Repository permissions → Contents** を **Read and write** に設定して発行します。

> **セキュリティ注意**: 入力したトークンはそのブラウザの `localStorage`（`plamo-settings-v1`）にのみ保存されます。JSON エクスポートファイルには**絶対に含まれません**。共有PCでは使用しないでください。

---

## Cloudflare Worker のデプロイ手順（任意）

国内ホビー商品のJAN自動取得を使いたい場合、`worker/hobbysearch-worker.js` を Cloudflare Workers にデプロイします。

1. Cloudflare ダッシュボードにログインし、**Workers & Pages → Create → Create Worker** を開きます。
2. 任意のWorker名（例: `hobbysearch-proxy`）を付けて作成し、**Edit code** で `worker/hobbysearch-worker.js` の中身を貼り付けて **Deploy** します。
3. 発行された URL（例: `https://hobbysearch-proxy.<subdomain>.workers.dev`）をアプリ内の **設定 → ホビーサーチ用プロキシ URL** に入力して保存します。

---

## JAN照合の仕組みと限界（正直な注意点）

本アプリは「APIキーなしで動くこと」を優先しているため、JAN照合には以下の制約があります。

1. **UPCitemdb 無料トライアルAPI**:
   - キー不要で動作しますが、1日のリクエスト回数制限やレート制限（HTTP 429）があります。
   - 海外DBが中心のため、**日本のプラモデル用塗料や水転写デカールのJANはヒットしないことが多い**です。
   - ブラウザからの直接アクセスでCORSエラーになる環境もあります（エラー時は照合ログに理由を表示して次のステップへ進みます）。
2. **ホビーサーチ用プロキシ (Cloudflare Worker)**:
   - 対象サイト（`www.1999.co.jp`）の検索・商品ページをHTML取得してJSON-LD等を抽出する仕組みです。
   - **対象サイトのボット対策（WAF / Cloudflare チャレンジ等）により、HTTP 403 等で弾かれる場合があります。** 弾かれた場合、Worker は HTTP 502 を返し、捏造データは返しません。
   - 対象サイトのHTML構造変更により抽出できなくなる可能性もあります。
3. **Webで確認リンク**:
   - 上記で自動取得できない場合は、ホビーサーチ / Amazon / 楽天市場 / 駿河屋の検索ページを新規タブで開くボタンを表示します。目視で確認のうえ手動入力してください。
4. **カメラ読み取り**:
   - カメラAPI（`getUserMedia`）は **HTTPS** 環境（または `localhost`）でのみ動作します。
   - 暗い場所や塗料瓶の曲面・光沢面はピントが合いにくく読み取れないことがあります。その場合は手入力欄をご利用ください。
