# 九州方言翻訳API

Gemini-2.0-Flash APIを使用した九州地方の方言と標準語を相互翻訳するシンプルなREST APIです。

## 🌟 特徴

- **7つの九州方言に対応**: 福岡弁、熊本弁、鹿児島弁、大分弁、宮崎弁、長崎弁、佐賀弁
- **高精度翻訳**: Gemini-2.0-Flash APIによる自然な翻訳
- **双方向翻訳**: 標準語→方言、方言→標準語の両方向に対応
- **バッチ処理**: 複数テキストの一括翻訳
- **セキュリティ**: レート制限とHelmet.jsによる保護
- **シンプル**: 軽量で理解しやすいAPI設計

## 🚀 クイックスタート

### 1. インストール

```bash
git clone <repository-url>
cd kyushu-dialect-translator-api
npm install
```

### 2. 環境設定

```bash
cp .env.example .env
```

`.env`ファイルを編集してGemini API キーを設定:

```env
GEMINI_API_KEY=your_actual_api_key_here
NODE_ENV=development
PORT=3000
```

### 3. 起動

**開発環境:**
```bash
npm run dev
```

**本番環境:**
```bash
npm start
```

サーバーは `http://localhost:3000` で起動します。

## 📚 API仕様

### Base URL
```
http://localhost:3000/api
```

### 認証
現在認証は不要です。レート制限: 15分間に100リクエスト。

---

## 📋 エンドポイント

### 1. ヘルスチェック

APIの稼働状況を確認します。

**エンドポイント:**
```http
GET /api/health
```

**レスポンス:**
```json
{
  "status": "healthy",
  "timestamp": "2025-08-11T10:00:00.000Z",
  "version": "2.0.0"
}
```

---

### 2. 対応方言一覧

利用可能な方言の一覧を取得します。

**エンドポイント:**
```http
GET /api/dialects
```

**レスポンス:**
```json
{
  "success": true,
  "dialects": [
    {
      "code": "fukuoka",
      "name": "福岡弁"
    },
    {
      "code": "kumamoto", 
      "name": "熊本弁"
    },
    {
      "code": "kagoshima",
      "name": "鹿児島弁"
    },
    {
      "code": "oita",
      "name": "大分弁"
    },
    {
      "code": "miyazaki",
      "name": "宮崎弁"
    },
    {
      "code": "nagasaki",
      "name": "長崎弁"
    },
    {
      "code": "saga",
      "name": "佐賀弁"
    }
  ],
  "total_count": 7
}
```

---

### 3. 翻訳

テキストを翻訳します。

**エンドポイント:**
```http
POST /api/translate
```

**リクエストヘッダー:**
```
Content-Type: application/json
```

**リクエストボディ:**
```json
{
  "text": "今日はとても疲れました",
  "from": "standard",
  "to": "dialect",
  "dialect": "fukuoka"
}
```

**パラメーター:**
| パラメーター | 型 | 必須 | 説明 |
|-------------|-----|------|------|
| `text` | string | ✅ | 翻訳するテキスト（最大2000文字） |
| `from` | string | ✅ | 翻訳元: `"standard"` または `"dialect"` |
| `to` | string | ✅ | 翻訳先: `"standard"` または `"dialect"` |
| `dialect` | string | ✅ | 方言コード（上記の方言一覧参照） |

**成功レスポンス (200):**
```json
{
  "success": true,
  "data": {
    "original_text": "今日はとても疲れました",
    "translated_text": "今日はばり疲れたばい",
    "from_type": "standard",
    "to_type": "dialect",
    "dialect_code": "fukuoka",
    "dialect_name": "福岡弁",
    "processing_time_ms": 1234
  }
}
```

**エラーレスポンス例:**
```json
{
  "success": false,
  "error": "翻訳するテキストが必要です"
}
```

---

### 4. バッチ翻訳

複数のテキストを一括で翻訳します。

**エンドポイント:**
```http
POST /api/translate/batch
```

**リクエストヘッダー:**
```
Content-Type: application/json
```

**リクエストボディ:**
```json
{
  "texts": [
    "おはようございます",
    "ありがとうございます", 
    "お疲れ様でした"
  ],
  "from": "standard",
  "to": "dialect",
  "dialect": "kumamoto"
}
```

**パラメーター:**
| パラメーター | 型 | 必須 | 説明 |
|-------------|-----|------|------|
| `texts` | array | ✅ | 翻訳するテキストの配列（最大20件、各2000文字以下） |
| `from` | string | ✅ | 翻訳元: `"standard"` または `"dialect"` |
| `to` | string | ✅ | 翻訳先: `"standard"` または `"dialect"` |
| `dialect` | string | ✅ | 方言コード |

**成功レスポンス (200):**
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "index": 0,
        "original": "おはようございます",
        "translated": "おはようございますばい",
        "success": true
      },
      {
        "index": 1,
        "original": "ありがとうございます",
        "translated": "だんだん",
        "success": true
      },
      {
        "index": 2,
        "original": "お疲れ様でした", 
        "translated": "お疲れ様でしたばい",
        "success": true
      }
    ],
    "from_type": "standard",
    "to_type": "dialect",
    "dialect_code": "kumamoto",
    "dialect_name": "熊本弁",
    "processing_time_ms": 2345,
    "total_count": 3,
    "success_count": 3
  }
}
```

---

## 📝 使用例

### cURL

**標準語→方言:**
```bash
curl -X POST http://localhost:3000/api/translate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "今日は暑いですね",
    "from": "standard",
    "to": "dialect", 
    "dialect": "kagoshima"
  }'
```

**方言→標準語:**
```bash
curl -X POST http://localhost:3000/api/translate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "わっぜ暑いっど",
    "from": "dialect",
    "to": "standard",
    "dialect": "kagoshima"
  }'
```

### JavaScript (fetch)

```javascript
async function translateText(text, from, to, dialect) {
  const response = await fetch('/api/translate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: text,
      from: from,
      to: to,
      dialect: dialect
    })
  });
  
  const result = await response.json();
  
  if (result.success) {
    console.log('翻訳結果:', result.data.translated_text);
  } else {
    console.error('エラー:', result.error);
  }
}

// 使用例
translateText('こんにちは', 'standard', 'dialect', 'miyazaki');
```

### Python (requests)

```python
import requests

def translate_text(text, from_type, to_type, dialect):
    url = 'http://localhost:3000/api/translate'
    data = {
        'text': text,
        'from': from_type,
        'to': to_type,
        'dialect': dialect
    }
    
    response = requests.post(url, json=data)
    result = response.json()
    
    if result['success']:
        return result['data']['translated_text']
    else:
        raise Exception(result['error'])

# 使用例
translated = translate_text('ありがとう', 'standard', 'dialect', 'oita')
print(f'翻訳結果: {translated}')
```

---

## 🗺️ 方言コード一覧

| コード | 方言名 | 地域 |
|--------|--------|------|
| `fukuoka` | 福岡弁 | 福岡県 |
| `kumamoto` | 熊本弁 | 熊本県 |
| `kagoshima` | 鹿児島弁 | 鹿児島県 |
| `oita` | 大分弁 | 大分県 |
| `miyazaki` | 宮崎弁 | 宮崎県 |
| `nagasaki` | 長崎弁 | 長崎県 |
| `saga` | 佐賀弁 | 佐賀県 |

---

## ⚠️ エラーレスポンス

すべてのエラーレスポンスは以下の形式です:

```json
{
  "success": false,
  "error": "エラーメッセージ",
  "message": "詳細なエラー情報（任意）"
}
```

### HTTPステータスコード

| コード | 説明 |
|--------|------|
| 200 | 成功 |
| 400 | バリデーションエラー |
| 429 | レート制限超過 |
| 500 | サーバーエラー |

### よくあるエラー

**400 Bad Request:**
- `翻訳するテキストが必要です`
- `テキストは2000文字以下にしてください`
- `fromとtoは "standard" または "dialect" である必要があります`
- `翻訳元と翻訳先が同じです`
- `対応していない方言コードです`

**429 Too Many Requests:**
- `レート制限に達しました。しばらく待ってから再度お試しください。`

**500 Internal Server Error:**
- `サーバーエラーが発生しました`
- `翻訳エラー: [詳細]`

---

## 🔧 開発者向け情報

### 技術スタック
- **Node.js** 16以上
- **Express.js** 4.19.2
- **Google Gemini AI** 0.21.0
- **その他**: cors, helmet, express-rate-limit

### プロジェクト構造
```
project/
├── server.js          # メインサーバーファイル
├── package.json       # 依存関係
├── .env.example       # 環境変数テンプレート
├── .env              # 環境変数（要作成）
└── README.md         # このファイル
```

### 環境変数
| 変数 | 必須 | デフォルト | 説明 |
|------|------|-----------|------|
| `GEMINI_API_KEY` | ✅ | なし | Google Gemini API キー |
| `PORT` | ❌ | 3000 | サーバーポート |
| `NODE_ENV` | ❌ | development | 実行環境 |

---

## 🚀 デプロイ

### Heroku
```bash
heroku create your-app-name
heroku config:set GEMINI_API_KEY=your_key_here
git push heroku main
```

### Vercel
```bash
npm install -g vercel
vercel
```

### Railway/Render
1. GitHubリポジトリを連携
2. 環境変数 `GEMINI_API_KEY` を設定
3. デプロイ実行

---

## 📄 ライセンス

MIT License

---

## 🤝 コントリビューション

1. フォークを作成
2. 機能ブランチを作成 (`git checkout -b feature/amazing-feature`)
3. コミット (`git commit -m 'Add some amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`) 
5. プルリクエストを作成

---

## 📞 サポート

- **Issue報告**: [GitHub Issues](https://github.com/your-username/kyushu-dialect-api/issues)
- **質問・要望**: [GitHub Discussions](https://github.com/your-username/kyushu-dialect-api/discussions)

---

*Made with ❤️ for 九州の皆さん*