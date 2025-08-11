const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// リクエストログミドルウェア
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// セキュリティ設定（CSPを緩和してインラインスタイル・スクリプトを許可）
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "data:"],
      connectSrc: ["'self'"]
    }
  }
}));

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));

// 静的ファイル配信（publicディレクトリ）
app.use(express.static(path.join(__dirname, 'public')));

// ルートページでindex.htmlを配信（修正版）
app.get('/', (req, res) => {
  // Accept ヘッダーをチェックしてJSONが要求されているかどうかを判断
  const acceptsJson = req.headers.accept && req.headers.accept.includes('application/json');
  
  if (acceptsJson) {
    // JSON レスポンスを返す
    res.status(200).json({
      message: '九州方言翻訳API',
      version: '2.0.0',
      status: 'running',
      server_uptime: process.uptime(),
      memory_usage: process.memoryUsage(),
      timestamp: new Date().toISOString(),
      endpoints: [
        'GET /api/health',
        'GET /api/dialects',
        'POST /api/translate',
        'POST /api/translate/batch'
      ],
      documentation: 'README.mdを参照してください'
    });
  } else {
    // HTML ファイルを配信
    const indexPath = path.join(__dirname, 'index.html');
    res.sendFile(indexPath, (err) => {
      if (err) {
        console.error('index.html配信エラー:', err);
        res.status(500).json({
          error: 'ファイル配信エラー',
          message: err.message,
          timestamp: new Date().toISOString()
        });
      }
    });
  }
});

// レート制限設定
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分
  max: 100,
  message: { 
    success: false,
    error: 'レート制限に達しました。しばらく待ってから再度お試しください。' 
  }
});
app.use('/api/', limiter);

// Gemini API初期化
let genAI;
try {
  if (!process.env.GEMINI_API_KEY) {
    console.warn('⚠️  GEMINI_API_KEY が設定されていません。翻訳機能は動作しません。');
  } else {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    console.log('✅ Gemini API が初期化されました');
  }
} catch (error) {
  console.error('❌ Gemini API初期化エラー:', error.message);
}

// 対応方言リスト
const supportedDialects = [
  { code: 'fukuoka', name: '福岡弁' },
  { code: 'kumamoto', name: '熊本弁' },
  { code: 'kagoshima', name: '鹿児島弁' },
  { code: 'oita', name: '大分弁' },
  { code: 'miyazaki', name: '宮崎弁' },
  { code: 'nagasaki', name: '長崎弁' },
  { code: 'saga', name: '佐賀弁' }
];

// ヘルスチェック
app.get('/api/health', (req, res) => {
  console.log('ヘルスチェック実行');
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    gemini_configured: !!process.env.GEMINI_API_KEY,
    supported_dialects_count: supportedDialects.length,
    server_uptime: process.uptime(),
    memory_usage: process.memoryUsage()
  });
});

// 対応方言一覧
app.get('/api/dialects', (req, res) => {
  console.log('方言一覧取得');
  res.json({
    success: true,
    dialects: supportedDialects,
    total_count: supportedDialects.length,
    timestamp: new Date().toISOString()
  });
});

// Gemini翻訳関数
async function translateWithGemini(text, from, to, dialectCode) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY が設定されていません');
    }

    if (!genAI) {
      genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }

    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash-exp",
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024,
      }
    });
    
    const dialectInfo = supportedDialects.find(d => d.code === dialectCode);
    const dialectName = dialectInfo ? dialectInfo.name : '九州弁';
    
    let prompt;
    if (from === 'standard' && to === 'dialect') {
      // 標準語から方言へ
      prompt = `あなたは${dialectName}の専門家です。以下の標準語のテキストを自然で現地の人が実際に使うような${dialectName}に翻訳してください。

重要な指示:
- 翻訳結果のみを返してください（説明や追加情報は不要）
- 自然で親しみやすい${dialectName}の表現を使用してください
- 文脈に応じて適切な方言表現を選択してください

標準語: ${text}

${dialectName}:`;
    } else {
      // 方言から標準語へ
      prompt = `あなたは${dialectName}の専門家です。以下の${dialectName}のテキストを自然で正しい標準語に翻訳してください。

重要な指示:
- 翻訳結果のみを返してください（説明や追加情報は不要）
- 自然で適切な標準語の表現を使用してください
- 方言のニュアンスを保ちながら標準語に変換してください

${dialectName}: ${text}

標準語:`;
    }

    console.log('Gemini API呼び出し開始');
    const result = await model.generateContent(prompt);
    const response = await result.response;
    console.log('Gemini API呼び出し完了');
    
    const translatedText = response.text().trim();
    
    // 翻訳結果の後処理（不要な説明文を除去）
    const lines = translatedText.split('\n');
    const cleanedText = lines[0].replace(/^(標準語|方言|翻訳結果|結果)[:：]\s*/, '').trim();
    
    return cleanedText || translatedText;
    
  } catch (error) {
    console.error('Gemini API Error:', error);
    throw new Error(`翻訳エラー: ${error.message}`);
  }
}

// 翻訳エンドポイント
app.post('/api/translate', async (req, res) => {
  console.log('翻訳リクエスト受信:', req.body);
  
  try {
    const { text, from, to, dialect } = req.body;

    // バリデーション
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: '翻訳するテキストが必要です'
      });
    }

    if (text.length > 2000) {
      return res.status(400).json({
        success: false,
        error: 'テキストは2000文字以下にしてください'
      });
    }

    if (!['standard', 'dialect'].includes(from) || !['standard', 'dialect'].includes(to)) {
      return res.status(400).json({
        success: false,
        error: 'fromとtoは "standard" または "dialect" である必要があります'
      });
    }

    if (from === to) {
      return res.status(400).json({
        success: false,
        error: '翻訳元と翻訳先が同じです'
      });
    }

    if (!dialect || !supportedDialects.find(d => d.code === dialect)) {
      return res.status(400).json({
        success: false,
        error: '対応していない方言コードです',
        supported_dialects: supportedDialects.map(d => d.code)
      });
    }

    // 翻訳実行
    const startTime = Date.now();
    const translatedText = await translateWithGemini(text, from, to, dialect);
    const processingTime = Date.now() - startTime;

    const dialectInfo = supportedDialects.find(d => d.code === dialect);

    console.log('翻訳完了:', {
      original: text,
      translated: translatedText,
      processingTime
    });

    res.json({
      success: true,
      data: {
        original_text: text,
        translated_text: translatedText,
        from_type: from,
        to_type: to,
        dialect_code: dialect,
        dialect_name: dialectInfo.name,
        processing_time_ms: processingTime,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Translation Error:', error);
    res.status(500).json({
      success: false,
      error: 'サーバーエラーが発生しました',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// バッチ翻訳エンドポイント
app.post('/api/translate/batch', async (req, res) => {
  console.log('バッチ翻訳リクエスト受信:', req.body);
  
  try {
    const { texts, from, to, dialect } = req.body;

    if (!Array.isArray(texts) || texts.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'textsは配列である必要があります'
      });
    }

    if (texts.length > 20) {
      return res.status(400).json({
        success: false,
        error: 'バッチ翻訳は一度に20件までです'
      });
    }

    // バリデーション
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      if (!text || typeof text !== 'string' || text.length > 2000) {
        return res.status(400).json({
          success: false,
          error: `無効なテキストが含まれています（インデックス${i}）: 2000文字以下の文字列である必要があります`
        });
      }
    }

    if (!['standard', 'dialect'].includes(from) || !['standard', 'dialect'].includes(to)) {
      return res.status(400).json({
        success: false,
        error: 'fromとtoは "standard" または "dialect" である必要があります'
      });
    }

    if (!dialect || !supportedDialects.find(d => d.code === dialect)) {
      return res.status(400).json({
        success: false,
        error: '対応していない方言コードです',
        supported_dialects: supportedDialects.map(d => d.code)
      });
    }

    const startTime = Date.now();
    const dialectInfo = supportedDialects.find(d => d.code === dialect);

    // 並列処理で翻訳（但し同時実行数を制限）
    const batchSize = 5; // 同時実行数を制限
    const results = [];
    
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchPromises = batch.map(async (text, batchIndex) => {
        const originalIndex = i + batchIndex;
        try {
          const translated = await translateWithGemini(text, from, to, dialect);
          return {
            index: originalIndex,
            original: text,
            translated,
            success: true
          };
        } catch (error) {
          console.error(`翻訳エラー (インデックス${originalIndex}):`, error);
          return {
            index: originalIndex,
            original: text,
            translated: null,
            success: false,
            error: error.message
          };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // バッチ間で少し待機（API制限対策）
      if (i + batchSize < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // インデックス順にソート
    results.sort((a, b) => a.index - b.index);
    
    const processingTime = Date.now() - startTime;
    const successCount = results.filter(r => r.success).length;

    console.log('バッチ翻訳完了:', {
      totalCount: texts.length,
      successCount,
      processingTime
    });

    res.json({
      success: true,
      data: {
        results: results,
        from_type: from,
        to_type: to,
        dialect_code: dialect,
        dialect_name: dialectInfo.name,
        processing_time_ms: processingTime,
        total_count: texts.length,
        success_count: successCount,
        error_count: texts.length - successCount,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Batch Translation Error:', error);
    res.status(500).json({
      success: false,
      error: 'サーバーエラーが発生しました',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// エラーハンドリングミドルウェア
app.use((error, req, res, next) => {
  console.error('Unhandled Error:', error);
  res.status(500).json({
    success: false,
    error: 'サーバー内部エラーが発生しました',
    timestamp: new Date().toISOString()
  });
});

// 404 ハンドラー
app.use((req, res) => {
  console.log(`404 - 見つからないエンドポイント: ${req.method} ${req.url}`);
  res.status(404).json({
    success: false,
    error: 'エンドポイントが見つかりません',
    requested_path: req.url,
    available_endpoints: [
      'GET /',
      'GET /api/health',
      'GET /api/dialects', 
      'POST /api/translate',
      'POST /api/translate/batch'
    ],
    timestamp: new Date().toISOString()
  });
});

// サーバー起動
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🚀 九州方言翻訳API サーバーが起動しました');
  console.log('='.repeat(60));
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`🌐 API Base: http://localhost:${PORT}/api`);
  console.log(`📚 対応方言: ${supportedDialects.map(d => d.name).join(', ')}`);
  console.log(`🔑 Gemini API Key: ${process.env.GEMINI_API_KEY ? '✅ 設定済み' : '❌ 未設定'}`);
  console.log(`🕐 起動時刻: ${new Date().toLocaleString('ja-JP')}`);
  console.log('='.repeat(60));
  console.log('📖 ブラウザで http://localhost:' + PORT + ' にアクセスしてダッシュボードを確認してください');
  console.log('='.repeat(60));
});