# ウチスマ スマホ操作調査 — 出典・判断メモ

- 調査日: 2026-07-18
- 対象: スマホ向け2D対戦アクションの操作設計と、現行ウチスマへの適用可能性
- 成果物: `report.html`（共有用）、`artifact.json`（レポートの正本データ）

## 運用方針の更新（2026-07-19）

- PCブラウザ版を本体として維持し、スマホ版は別アプリ・別成果物として運用する。
- 以下の調査で示した入力形式やA/B案はスマホ別アプリへ引き継ぐ。PC版`index.html`へタッチUIを直接追加する計画ではない。
- simやルールを共有する場合も、UI、配布、バージョンはPC版から分離する。

## 先に結論

スマホ化は技術的に可能。近い製品実例として、横視点のプラットフォームファイターである Brawlhalla と Flash Party が現行ストアに存在する。ウチスマの現行コードは、ゲーム進行と入力源が `InputSample` を介して分離されているため、最初の試作はシミュレーションやオンライン同期方式を変えず、タッチ入力源を一つ足す形で進められる。

ただし、公開インストール数やレビュー数は「市場に受け入れられている」ことの参考にはなるものの、タッチ操作そのものの満足度を証明するデータではない。最終判断は実機A/Bテストで行う。

## 公式・一次情報

### Brawlhalla — 最も近い実例

- Ubisoft, “Brawlhalla Now Available on Mobile”  
  https://news.ubisoft.com/en-us/article/1kyM6xMlvLXtYa0un5XpKN/brawlhalla-now-available-on-mobile  
  iOS / Android版、最大8人、全機種クロスプレイ、カスタマイズ可能なタッチ操作、対応コントローラーを確認。
- Google Play, Brawlhalla  
  https://play.google.com/store/apps/details?id=air.com.ubisoft.brawl.halla.platform.fighting.action.pvp  
  2026-07-18確認時点で 1,000万+ ダウンロード、評価4.4、約34.5万レビュー、2026-06-03更新。
- Ubisoft, “Brawlhalla Celebrates 100 Million Lifetime Players”  
  https://news.ubisoft.com/en-us/article/MvVxfuQT6SZ5XnlJY8Pgp/brawlhalla-celebrates-100-million-lifetime-players-with-ingame-event  
  2023年に全プラットフォーム累計1億プレイヤー。モバイル単独の数字ではない点に注意。
- Brawlhalla Wiki, Controls  
  https://brawlhalla.wiki.gg/wiki/Controls  
  移動、ジャンプ、落下、弱攻撃、強攻撃、投げ、回避・ダッシュという操作集合と、操作の再設定可を確認。公式出版社ページではないため補助資料として扱う。

### Flash Party — 近い実例

- Apple App Store, Flash Party  
  https://apps.apple.com/us/app/flash-party/id1579850555  
  “platform fighter” と明記。20体以上、1v1、チーム戦、乱闘、サッカー、フレンド戦。2026-07-18確認時点で評価4.8、約1.5万評価。公式ストア本文だけでは現在の詳細なボタン配置まで確認できないため、実機確認が必要。

### Smash Legends — 隣接する実例

- Google Play, SMASH LEGENDS  
  https://play.google.com/store/apps/details?hl=en-US&id=com.linegames.sl  
  2026-07-18確認時点で 1,000万+ ダウンロード、約32万レビュー、2026-03-10更新。“simple slide-and-touch controls”。1v1、2v2、3v3、最大8人のバトルロイヤル。
- Apple App Store, SMASH LEGENDS  
  https://apps.apple.com/us/app/smash-legends-action-fight/id1492660284  
  評価4.7、約2.9万評価。“simple slide-and-touch controls”。
- 注意: 3D / 2.5Dのアリーナ型であり、横視点のプラットフォームファイターではない。モバイル専用に単純化された操作の参考として採用。

### Brawl Stars — モバイル操作の規模実績

- Google Play, Brawl Stars  
  https://play.google.com/store/apps/details?hl=en-US&id=com.supercell.brawlstars  
  2026-07-18確認時点で 5億+ ダウンロード、約2,600万レビュー、Editors' Choice。横視点格闘ではなく、3v3 / 5v5の見下ろし型アリーナゲーム。
- Supercell, “Optional Update – Customizable Controls”  
  https://supercell.com/en/games/brawlstars/blog/release-notes/optional-update-customizable-controls/  
  操作配置のカスタマイズとオート射撃の存在を確認。
- Supercell, “New Power, Brawl Pass Changes, and a New Starr Drop!”  
  https://supercell.com/en/games/brawlstars/blog/news/new-power-brawl-pass-changes-and-a-new-starr-drop-2/  
  同じ操作を、タップでも、攻撃・必殺技と同様の照準ジョイスティックでも使える設計例を確認。「初心者はタップ、熟練者はドラッグ」の併存を考える根拠。

### Apple — タッチ操作の設計・実装指針

- Apple Human Interface Guidelines, Game controls  
  https://developer.apple.com/design/human-interface-guidelines/game-controls  
  タッチ操作の併設、親指の届きやすさ、セーフエリア、頻用操作44×44pt以上、押下状態・音・触覚フィードバック、抽象的なA/Xではなく行動を示す記号、状況に応じた表示、1操作への複数機能統合、長押しによる溜め攻撃、左側移動・右側アクション、フローティングスティックを確認。
- Apple Developer Documentation, Adding virtual controls to games that support game controllers in iOS  
  https://developer.apple.com/documentation/gamecontroller/adding-virtual-controls-to-games-that-support-game-controllers-in-ios  
  タッチ用仮想操作、不要な操作の非表示、ジェスチャー利用、物理コントローラー接続時の仮想コントローラー非表示を確認。

## 現行ウチスマで確認した事実

対象: `index.html`（2026-07-18時点）

- `NEUTRAL` と各入力源が、`left / right / up / down / jump / attack / guard / balloon / start` を持つ同じ入力形式を返す。
- キーボード入力と Gamepad API が既に同じ入力レイヤーへ統合されている。
- タッチ / Pointer Events の入力源はまだない。
- 攻撃は押して離すと通常攻撃、2秒長押しで必殺技が自動発動する。
- 上・下攻撃は、攻撃発火時に上下入力があり、左右入力がない場合に選ばれる。それ以外は正面攻撃。
- ガードは地上限定の押下中動作で、移動と他行動を止める。
- 風船は押下中動作で、1ストックにつき1回の復帰資源。
- オンライン同期では8個の真偽入力を1バイトへ詰めている。既存の真偽入力だけをタッチから生成する試作は同期仕様を変えずに済む。

## 事実と推論の境界

### 確認できた事実

- スマホ上で横視点のプラットフォームファイターを提供している現行タイトルがある。
- Brawlhallaはカスタマイズ可能なタッチ操作とコントローラーの両方を提供する。
- 大規模なモバイル対戦ゲームでは、操作配置のカスタマイズ、タップとドラッグの併用が実装されている。
- ウチスマは入力源を追加できる構造になっている。

### 推論・提案

- ウチスマでは、左親指の移動スティックと右親指のアクション領域が最も妥当。
- 初回試作は現在の4アクションボタンを保ち、ゲームルールを変えない方が比較基準を作りやすい。
- 次の比較案として、攻撃ボタンをドラッグして上下攻撃を選ぶ設計と、状況依存のユーティリティボタンを試す価値がある。
- 同じ端末で複数人が画面を共有する方式は、指の衝突と画面遮蔽が大きいため、スマホ版は原則1人1端末のオンライン対戦を想定するのが自然。

これらは製品利用データから確定した結論ではなく、公式情報と現行コードから立てた仮説である。

## グラフに使う数値と、使わない数値

Brawlhallaの全プラットフォーム累計プレイヤー、Google Playのダウンロード下限、App Storeの評価件数は、定義・対象プラットフォーム・期間が異なる。単一の棒グラフにすると規模を比較できるように見えてしまうため、今回は正確な参照表に留めた。

レポート内の唯一の棒グラフは、ウチスマの試作設計から直接数えられる「右親指のアクション領域数」だけを比較する。忠実版は攻撃・ジャンプ・ガード・風船の4領域、タッチ最適化版は攻撃パッド・ジャンプ・状況依存ユーティリティの3領域。これは優劣の結論ではなく、A/Bテストで検証する設計差を示すもの。

## 推奨する実機検証

### 試作A: 現行ルール忠実版

- 左: フローティング4方向スティック
- 右: 攻撃、ジャンプ、ガード、風船
- 攻撃: タップして離す=通常、2秒長押し=必殺技
- 現行 `InputSample` のまま実装

### 試作B: タッチ最適化版

- 左: フローティング移動スティック
- 右: 大きな攻撃パッド（タップ=正面、上下ドラッグ=方向攻撃、長押し=必殺技）、ジャンプ、状況依存ユーティリティ
- 状況依存ユーティリティ: 地上=ガード、空中=風船
- 明示的な攻撃方向を同期するなら、入力形式とオンラインプロトコルの版管理が必要
- 地上から風船を出せなくなる等、現行ルールとの差が生じるため比較試験専用とする

### 合格基準（未計測の仮説）

- 5人中4人以上が、最初の説明後、口頭救助なしで基本チュートリアルを完了
- 方向攻撃の意図一致率80%以上
- 3試合あたり、操作起因の自滅が1回以下 / 人
- 5人中4人以上が、タッチ操作のまま即再戦を選ぶ
- コントローラーなしでも遊べると判断される

記録項目: 押し損ね、方向誤り、意図しないジャンプ・ガード・風船、指による対象遮蔽、利き手、快適さ5段階、試合後の再戦選択。
