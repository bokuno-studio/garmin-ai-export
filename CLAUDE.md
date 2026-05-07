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
    *_summarizedActivities.json # 活動サマリー（距離・ペース・心拍など）
    *_sleepData.json            # 睡眠データ
    UDSFile_*.json              # Body Battery・RHR・ストレスなどの日次健康サマリー
  DI-Connect-Fitness/
    UploadedFiles_*.zip         # 内部の *.fit からラップデータを抽出
  DI-Connect-User/
    user_profile*.json          # プロフィール
```

---

## MVP スコープ（v1）

- [x] `*_summarizedActivities.json` → `activities.csv`
- [x] `*_sleepData.json` → `sleep.csv`
- [x] `UDSFile_*.json` → `daily_health.csv`
- [x] UploadedFiles 内の `*.fit` → `laps.csv`
- [x] AIプロンプトテンプレートの同梱
- [x] ブラウザ完結で変換・ダウンロード
- [x] スマホで操作しやすい英語UI

## v2 以降（スコープ外）

- 複数ユーザー対応
- 多言語対応

---

## 技術スタック

- Next.js（静的エクスポート）
- Tailwind CSS
- JSZip / PapaParse / fit-file-parser / FileSaver.js

バックエンド不要のため、静的ホスティング（Vercel / GitHub Pages）で動く。
