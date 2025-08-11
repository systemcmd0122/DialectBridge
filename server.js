const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const https = require('https');
const http = require('http');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Keep-Alive設定用の変数
let keepAliveUrl = 'https://yammering-nevsa-tisk0122-af0d41bb.koyeb.app'; // 固定URL
let keepAliveInterval = null;
let lastActivityTime = Date.now();
let activityCounter = 0;

console.log('🔄 Keep-Alive URL設定:', keepAliveUrl);

// リクエストログミドルウェア（アクティビティ追跡付き）
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} - ${req.method} ${req.url} - IP: ${req.ip}`);
  
  // アクティビティ更新（keep-aliveリクエスト以外）
  if (!req.url.includes('/api/keep-alive')) {
    lastActivityTime = Date.now();
    activityCounter++;
  }
  
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
      version: '2.1.0',
      status: 'running',
      server_uptime: process.uptime(),
      memory_usage: process.memoryUsage(),
      keep_alive_status: {
        enabled: !!keepAliveUrl,
        url: keepAliveUrl,
        last_activity: new Date(lastActivityTime).toISOString(),
        activity_count: activityCounter,
        minutes_since_last_activity: Math.floor((Date.now() - lastActivityTime) / 60000)
      },
      timestamp: new Date().toISOString(),
      endpoints: [
        'GET /api/health',
        'GET /api/dialects',
        'GET /api/keep-alive',
        'GET /api/stats',
        'POST /api/translate',
        'POST /api/translate/batch',
        'POST /api/translate/detect'
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

// レート制限設定（keep-aliveエンドポイントを除外）
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分
  max: 100,
  message: { 
    success: false,
    error: 'レート制限に達しました。しばらく待ってから再度お試しください。' 
  },
  skip: (req) => {
    // keep-aliveエンドポイントはレート制限から除外
    return req.url === '/api/keep-alive';
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

// Keep-Alive エンドポイント（軽量なレスポンス）
app.get('/api/keep-alive', (req, res) => {
  const timestamp = Date.now();
  const uptime = process.uptime();
  
  res.status(200).json({
    status: 'alive',
    timestamp: new Date(timestamp).toISOString(),
    uptime_seconds: Math.floor(uptime),
    uptime_formatted: formatUptime(uptime),
    memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    last_real_activity: new Date(lastActivityTime).toISOString(),
    activity_count: activityCounter,
    keep_alive_ping: true
  });
});

// サーバー統計エンドポイント
app.get('/api/stats', (req, res) => {
  const uptime = process.uptime();
  const memUsage = process.memoryUsage();
  
  res.json({
    success: true,
    server_stats: {
      status: 'running',
      uptime_seconds: Math.floor(uptime),
      uptime_formatted: formatUptime(uptime),
      memory_usage: {
        rss_mb: Math.round(memUsage.rss / 1024 / 1024),
        heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
        heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
        external_mb: Math.round(memUsage.external / 1024 / 1024)
      },
      activity: {
        last_activity: new Date(lastActivityTime).toISOString(),
        activity_count: activityCounter,
        minutes_since_last_activity: Math.floor((Date.now() - lastActivityTime) / 60000)
      },
      keep_alive: {
        enabled: !!keepAliveUrl,
        url: keepAliveUrl,
        interval_active: !!keepAliveInterval
      },
      environment: {
        node_version: process.version,
        platform: process.platform,
        arch: process.arch,
        is_production: process.env.NODE_ENV === 'production'
      }
    },
    timestamp: new Date().toISOString()
  });
});

// ヘルスチェック（拡張版）
app.get('/api/health', (req, res) => {
  console.log('ヘルスチェック実行');
  const uptime = process.uptime();
  const memUsage = process.memoryUsage();
  
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '2.1.0',
    gemini_configured: !!process.env.GEMINI_API_KEY,
    supported_dialects_count: supportedDialects.length,
    server_uptime: uptime,
    uptime_formatted: formatUptime(uptime),
    memory_usage: {
      rss_mb: Math.round(memUsage.rss / 1024 / 1024),
      heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024)
    },
    keep_alive_active: !!keepAliveInterval,
    last_activity: new Date(lastActivityTime).toISOString(),
    activity_count: activityCounter
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

// 方言判定と翻訳を行うGemini関数
async function detectDialectAndTranslate(text) {
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
        temperature: 0.3, // 判定の精度を上げるため温度を下げる
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024,
      }
    });

    // 方言判定と翻訳を同時に行うプロンプト
    const dialectList = supportedDialects.map(d => `- ${d.code}: ${d.name}`).join('\n');
    
    const prompt = `あなたは九州地方の方言の専門家です。以下のテキストを分析し、どの九州方言か判定してから標準語に翻訳してください。

対応方言:
${dialectList}

重要な指示:
1. まず、テキストがどの九州方言かを判定してください
2. 判定が困難な場合は「unknown」とし、一般的な九州弁として扱ってください
3. その後、標準語に翻訳してください
4. 以下のJSON形式で回答してください（他の文章は含めないでください）:

{
  "detected_dialect": "方言コード（例: fukuoka, kumamoto, unknown等）",
  "dialect_name": "方言名（例: 福岡弁、熊本弁、九州弁等）",
  "confidence": "判定の信頼度（high, medium, low）",
  "translated_text": "標準語に翻訳されたテキスト",
  "original_text": "元のテキスト"
}

分析対象テキスト: ${text}`;

    console.log('Gemini API（方言判定）呼び出し開始');
    const result = await model.generateContent(prompt);
    const response = await result.response;
    console.log('Gemini API（方言判定）呼び出し完了');
    
    const responseText = response.text().trim();
    
    try {
      // JSONレスポンスをパース
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('JSON形式のレスポンスが見つかりません');
      }
      
      const parsedResponse = JSON.parse(jsonMatch[0]);
      
      // レスポンスの検証
      if (!parsedResponse.detected_dialect || !parsedResponse.translated_text) {
        throw new Error('不完全なレスポンス');
      }
      
      // 方言コードの正規化
      let dialectCode = parsedResponse.detected_dialect.toLowerCase();
      let dialectName = parsedResponse.dialect_name;
      
      // 対応方言リストにない場合は「unknown」に設定
      const validDialect = supportedDialects.find(d => d.code === dialectCode);
      if (!validDialect && dialectCode !== 'unknown') {
        dialectCode = 'unknown';
        dialectName = '九州弁（詳細不明）';
      }
      
      return {
        detected_dialect: dialectCode,
        dialect_name: dialectName,
        confidence: parsedResponse.confidence || 'medium',
        translated_text: parsedResponse.translated_text,
        original_text: text
      };
      
    } catch (parseError) {
      console.error('JSON解析エラー:', parseError);
      console.error('Raw response:', responseText);
      
      // JSON解析に失敗した場合のフォールバック
      // 単純な九州弁として標準語に翻訳
      const fallbackTranslation = await translateWithGemini(text, 'dialect', 'standard', 'fukuoka');
      
      return {
        detected_dialect: 'unknown',
        dialect_name: '九州弁（詳細不明）',
        confidence: 'low',
        translated_text: fallbackTranslation,
        original_text: text
      };
    }
    
  } catch (error) {
    console.error('Dialect Detection Error:', error);
    throw new Error(`方言判定エラー: ${error.message}`);
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

// 方言自動判定翻訳エンドポイント
app.post('/api/translate/detect', async (req, res) => {
  console.log('方言自動判定翻訳リクエスト受信:', req.body);
  
  try {
    const { text } = req.body;

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

    // 方言判定と翻訳実行
    const startTime = Date.now();
    const result = await detectDialectAndTranslate(text);
    const processingTime = Date.now() - startTime;

    console.log('方言自動判定翻訳完了:', {
      original: text,
      detected: result.detected_dialect,
      translated: result.translated_text,
      processingTime
    });

    res.json({
      success: true,
      data: {
        original_text: result.original_text,
        translated_text: result.translated_text,
        detected_dialect: result.detected_dialect,
        dialect_name: result.dialect_name,
        confidence: result.confidence,
        processing_time_ms: processingTime,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Dialect Detection Translation Error:', error);
    res.status(500).json({
      success: false,
      error: 'サーバーエラーが発生しました',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Keep-Alive機能の実装
function performKeepAlive() {
  if (!keepAliveUrl) {
    console.log('⚠️  Keep-Alive URL が設定されていません');
    return;
  }

  const url = `${keepAliveUrl}/api/keep-alive`;
  const protocol = keepAliveUrl.startsWith('https') ? https : http;
  
  const options = {
    method: 'GET',
    timeout: 30000,
    headers: {
      'User-Agent': 'KeepAlive/1.0',
      'Accept': 'application/json'
    }
  };

  console.log(`🔄 Keep-Alive ping実行中... ${url}`);
  
  const req = protocol.get(url, options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      if (res.statusCode === 200) {
        try {
          const response = JSON.parse(data);
          console.log(`✅ Keep-Alive成功 - Uptime: ${response.uptime_formatted || 'N/A'}`);
        } catch (e) {
          console.log('✅ Keep-Alive成功 (JSON解析失敗)');
        }
      } else {
        console.log(`⚠️  Keep-Alive警告: HTTP ${res.statusCode}`);
      }
    });
  });

  req.on('error', (error) => {
    console.error('❌ Keep-Alive エラー:', error.message);
  });

  req.on('timeout', () => {
    req.destroy();
    console.error('❌ Keep-Alive タイムアウト');
  });
}

// Keep-Aliveの開始（常時有効）
function startKeepAlive() {
  if (keepAliveInterval) {
    console.log('Keep-Alive は既に実行中です');
    return;
  }

  if (!keepAliveUrl) {
    console.log('⚠️  Keep-Alive URL が未設定のためスキップします');
    return;
  }

  // 最初のpingは5分後
  setTimeout(() => {
    performKeepAlive();
    
    // その後は14分間隔で実行（15分のタイムアウトを回避）
    keepAliveInterval = setInterval(() => {
      performKeepAlive();
    }, 14 * 60 * 1000); // 14分 = 840,000ms
    
  }, 5 * 60 * 1000); // 5分後に開始

  console.log('🔄 Keep-Alive スケジューラを開始しました（14分間隔）');
}

// Keep-Aliveの停止
function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
    console.log('🛑 Keep-Alive を停止しました');
  }
}

// アップタイム表示用のフォーマット関数
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (days > 0) {
    return `${days}日 ${hours}時間 ${minutes}分 ${secs}秒`;
  } else if (hours > 0) {
    return `${hours}時間 ${minutes}分 ${secs}秒`;
  } else if (minutes > 0) {
    return `${minutes}分 ${secs}秒`;
  } else {
    return `${secs}秒`;
  }
}

// 定期的なメモリ使用量ログ
function logMemoryUsage() {
  const memUsage = process.memoryUsage();
  const uptime = process.uptime();
  
  console.log('📊 サーバー状況レポート:');
  console.log(`   稼働時間: ${formatUptime(uptime)}`);
  console.log(`   メモリ使用量: ${Math.round(memUsage.rss / 1024 / 1024)}MB`);
  console.log(`   アクティビティ数: ${activityCounter}`);
  console.log(`   最終アクティビティ: ${Math.floor((Date.now() - lastActivityTime) / 60000)}分前`);
  console.log(`   Keep-Alive状態: ${keepAliveInterval ? '🟢 有効' : '🔴 無効'}`);
}

// 30分ごとにメモリ使用量をログ出力
setInterval(logMemoryUsage, 30 * 60 * 1000);

// プロセス終了時のクリーンアップ
process.on('SIGINT', () => {
  console.log('\n🛑 サーバー終了処理を開始...');
  stopKeepAlive();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 サーバー終了処理を開始...');
  stopKeepAlive();
  process.exit(0);
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
      'GET /api/keep-alive',
      'GET /api/stats',
      'POST /api/translate',
      'POST /api/translate/batch',
      'POST /api/translate/detect'
    ],
    timestamp: new Date().toISOString()
  });
});

// サーバー起動
const server = app.listen(PORT, () => {
  console.log('='.repeat(80));
  console.log('🚀 九州方言翻訳API サーバーが起動しました');
  console.log('='.repeat(80));
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`🌐 API Base: http://localhost:${PORT}/api`);
  console.log(`🌐 Koyeb URL: ${keepAliveUrl}`);
  console.log(`📚 対応方言: ${supportedDialects.map(d => d.name).join(', ')}`);
  console.log(`🔑 Gemini API Key: ${process.env.GEMINI_API_KEY ? '✅ 設定済み' : '❌ 未設定'}`);
  console.log(`🕐 起動時刻: ${new Date().toLocaleString('ja-JP')}`);
  console.log(`🆕 新機能: 方言自動判定翻訳 (/api/translate/detect)`);
  
  // Keep-Alive設定（常時有効）
  console.log(`🔄 Keep-Alive URL: ${keepAliveUrl}`);
  console.log(`🔄 Keep-Alive 間隔: 14分`);
  console.log(`🔄 Keep-Alive: 常時有効モード`);
  
  // Keep-Alive開始
  startKeepAlive();
  
  console.log('='.repeat(80));
  console.log('📖 ブラウザで http://localhost:' + PORT + ' にアクセスしてダッシュボードを確認してください');
  console.log('📊 サーバー統計: ' + keepAliveUrl + '/api/stats');
  console.log('🔍 方言自動判定: POST ' + keepAliveUrl + '/api/translate/detect');
  console.log('🔄 Keep-Alive確認: ' + keepAliveUrl + '/api/keep-alive');
  console.log('='.repeat(80));
  
  // 初期メモリ使用量ログ
  setTimeout(logMemoryUsage, 10000); // 10秒後
});

// サーバーのKeep-Alive設定
server.keepAliveTimeout = 65000; // 65秒
server.headersTimeout = 66000; // 66秒