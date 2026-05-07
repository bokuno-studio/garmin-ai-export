# garmin-ai-export

## プロジェクト概要

Garmin Connect のデータエクスポート ZIP を、ChatGPT / Gemini / Claude など各種AIが読める形式に変換するWebアプリ。

---

## ターゲットユーザー

- スマートフォンユーザー
- 技術的な知識がない人
- **1手間だけで済む**体験が必須

---

## ユーザーフロー（決定済み）

```
1. Garmin Connect からZIPをエクスポート（ユーザー自身で行う）
2. このWebアプリにZIPをアップロード（1タップ）
3. 変換済みZIPをダウンロード（1タップ）
4. ChatGPT / Gemini / Claude にアップロードして質問
```

---

## 技術方針（決定済み）

### クライアントサイド処理（必須）

Garmin ZIPは数GBになることがあり、Vercelのrequest body上限（4.5MB）を超える。
サーバーを介さず**ブラウザ内で完結**させる。

- JSZip — ZIP展開・再圧縮
- PapaParse — CSV解析
- FileSaver.js — ダウンロード

データがサーバーに送られないのでプライバシー面でも優位。

### 出力形式

- **クリーンなCSV**（ChatGPT / Gemini / Claude すべてのCode Interpreterで使える汎用形式）
- AIへの使い方を書いた **プロンプトテンプレート**（テキストファイル）を同梱
- まとめて1つのZIPとして出力

---

## Garmin ZIPの構造（参考）

```
DI_CONNECT/
  DI-Connect-Analytics/
    summarizedActivities*.csv   # 活動サマリー（距離・ペース・心拍など）
    health_snapshot*.csv        # HRV・Body Battery・RHR・ストレス
    sleep*.csv                  # 睡眠データ
  DI-Connect-Fitness/
    *.fit                       # バイナリ（詳細ラップ等）→ v2対応
  DI-Connect-User/
    user_profile*.json          # プロフィール
```

---

## MVP スコープ（v1）

- [ ] summarizedActivities CSV の抽出・クリーニング
- [ ] health_snapshot CSV の抽出・クリーニング
- [ ] sleep CSV の抽出・クリーニング
- [ ] AIプロンプトテンプレートの同梱
- [ ] ブラウザ完結で変換・ダウンロード
- [ ] スマホで操作しやすいUI

## v2 以降（スコープ外）

- FIT → CSV 変換（直近N件のラップデータ）
- 複数ユーザー対応
- 多言語対応

---

## 技術スタック（未確定・要検討）

候補A: シンプルHTML/JS（フレームワークなし、ファイル1本）
候補B: Next.js（静的エクスポート）

バックエンド不要のため、静的ホスティング（Vercel / GitHub Pages）で動く。

---

## 次にやること

1. 技術スタックを決める（HTML/JS vs Next.js）
2. Garmin ZIPのフォルダ構造を実際のエクスポートで確認
3. MVP実装

「状況把握して」と言えばここから続きを始められる。
