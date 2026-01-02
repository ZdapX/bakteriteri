
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs'); // Ditambahkan untuk pengecekan file
const SupaworkAI = require('../lib/supawork.js');
const { 
  generateImageLimiter, 
  createAccountLimiter, 
  apiLimiter 
} = require('../middlewares/rateLimit.js');

const app = express();
const supawork = new SupaworkAI();

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "http:", "blob:"],
      connectSrc: ["'self'", "https://api.nekolabs.web.id", "https://api.internal.temp-mail.io", "https://supawork.ai"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? 
    process.env.ALLOWED_ORIGINS.split(',') : '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('combined'));

// Middleware untuk serve static files di development
if (process.env.NODE_ENV !== 'production') {
  app.use(express.static(path.join(__dirname, '../public')));
}

// API Routes harus didefinisikan SEBELUM catch-all route

// Health Check Endpoint
app.get('/health', apiLimiter, (req, res) => {
  res.json({
    success: true,
    message: 'Text-to-Image API is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    endpoints: {
      generate: 'POST /api/generate',
      batch: 'POST /api/generate/batch',
      createAccount: 'POST /api/account/create',
      styles: 'GET /api/styles',
      download: 'GET /api/download?url=IMAGE_URL'
    },
    version: '1.0.0'
  });
});

// Get available styles
app.get('/api/styles', apiLimiter, (req, res) => {
  try {
    const styles = [
      { 
        id: 'realistic', 
        name: 'Realistic', 
        description: 'Gambar realistis seperti foto dengan detail tinggi', 
        icon: 'fas fa-camera',
        example_prompt: 'A photorealistic portrait of a person with detailed skin texture'
      },
      { 
        id: 'anime', 
        name: 'Anime', 
        description: 'Gaya anime Jepang dengan karakter yang ekspresif', 
        icon: 'fas fa-user-ninja',
        example_prompt: 'Anime character with colorful hair in a magical forest'
      },
      { 
        id: 'cartoon', 
        name: 'Cartoon', 
        description: 'Gaya kartun yang lucu dan penuh warna', 
        icon: 'fas fa-smile',
        example_prompt: 'Cute cartoon animals having a tea party'
      },
      { 
        id: 'fantasy', 
        name: 'Fantasy', 
        description: 'Gaya fantasi dengan makhluk ajaib dan dunia epik', 
        icon: 'fas fa-dragon',
        example_prompt: 'Majestic dragon flying over ancient castle at sunset'
      },
      { 
        id: 'ghibli', 
        name: 'Ghibli Studio', 
        description: 'Gaya khas Studio Ghibli yang magis dan nostalgia', 
        icon: 'fas fa-film',
        example_prompt: 'Ghibli style magical forest with spirits and whimsical creatures'
      },
      { 
        id: 'cyberpunk', 
        name: 'Cyberpunk', 
        description: 'Gaya futuristik dengan neon dan teknologi tinggi', 
        icon: 'fas fa-city',
        example_prompt: 'Cyberpunk cityscape at night with flying cars and neon signs'
      }
    ];
    
    const aspectRatios = [
      { id: '1:1', name: 'Square', description: 'Perfect for social media' },
      { id: '16:9', name: 'Landscape', description: 'Widescreen format' },
      { id: '9:16', name: 'Portrait', description: 'Mobile and vertical' },
      { id: '4:3', name: 'Classic', description: 'Traditional photo format' },
      { id: '3:4', name: 'Vertical', description: 'Book and magazine format' }
    ];
    
    res.json({
      success: true,
      data: {
        styles,
        aspect_ratios: aspectRatios,
        default_settings: {
          style: 'realistic',
          aspect_ratio: '1:1',
          max_prompt_length: 500,
          max_batch_size: 5
        }
      }
    });
    
  } catch (error) {
    console.error('Error in /api/styles:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load styles'
    });
  }
});

// Generate single image
app.post('/api/generate', generateImageLimiter, async (req, res) => {
  try {
    const startTime = Date.now();
    const { prompt, style, aspect_ratio, model, negative_prompt, seed } = req.body;
    
    // Validasi input
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Prompt diperlukan dan harus berupa string',
        code: 'INVALID_PROMPT'
      });
    }
    
    if (prompt.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Prompt tidak boleh kosong',
        code: 'EMPTY_PROMPT'
      });
    }
    
    if (prompt.length > 500) {
      return res.status(400).json({
        success: false,
        error: 'Prompt maksimal 500 karakter',
        code: 'PROMPT_TOO_LONG'
      });
    }
    
    // Validasi style
    const validStyles = ['realistic', 'anime', 'cartoon', 'fantasy', 'ghibli', 'cyberpunk'];
    const selectedStyle = style && validStyles.includes(style.toLowerCase()) 
      ? style.toLowerCase() 
      : 'realistic';
    
    // Validasi aspect ratio
    const validRatios = ['1:1', '16:9', '9:16', '4:3', '3:4'];
    const selectedRatio = aspect_ratio && validRatios.includes(aspect_ratio) 
      ? aspect_ratio 
      : '1:1';
    
    console.log(`[API] Generating image with:`, {
      prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
      style: selectedStyle,
      aspect_ratio: selectedRatio,
      model: model || 'default',
      has_negative_prompt: !!negative_prompt,
      has_seed: !!seed
    });
    
    // Options untuk generator
    const options = {
      style: selectedStyle,
      aspectRatio: selectedRatio,
      model: model || 'text_to_image_generator',
      customAccount: null,
      useExistingAccount: false // Selalu buat akun baru untuk setiap request
    };
    
    // Tambahkan negative prompt jika ada
    if (negative_prompt && typeof negative_prompt === 'string') {
      options.negativePrompt = negative_prompt.substring(0, 200);
    }
    
    // Tambahkan seed jika ada
    if (seed && Number.isInteger(parseInt(seed))) {
      options.seed = parseInt(seed);
    }
    
    // Generate image
    const result = await supawork.generateImage(prompt, options);
    
    const processingTime = Date.now() - startTime;
    
    if (result.success) {
      // Format response
      const responseData = {
        image_url: result.image_url,
        prompt: result.prompt,
        style: result.style,
        aspect_ratio: result.aspect_ratio,
        model: result.model,
        timestamp: result.timestamp,
        metadata: {
          processing_time_ms: processingTime,
          credits_used: 1,
          generation_id: `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        }
      };
      
      // Add seed jika digunakan
      if (options.seed) {
        responseData.seed = options.seed;
      }
      
      console.log(`[API] Generation successful in ${processingTime}ms`);
      
      res.json({
        success: true,
        data: responseData,
        meta: {
          processing_time: `${(processingTime / 1000).toFixed(2)}s`,
          credits_used: 1,
          cache_key: `image_${Buffer.from(prompt).toString('base64').substr(0, 32)}`
        }
      });
    } else {
      console.error(`[API] Generation failed:`, result.error);
      
      // Classify error types
      let statusCode = 500;
      let errorCode = 'GENERATION_FAILED';
      
      if (result.error.includes('timeout') || result.error.includes('Timeout')) {
        statusCode = 504;
        errorCode = 'GENERATION_TIMEOUT';
      } else if (result.error.includes('credits') || result.error.includes('limit')) {
        statusCode = 429;
        errorCode = 'CREDITS_EXHAUSTED';
      } else if (result.error.includes('invalid') || result.error.includes('Invalid')) {
        statusCode = 400;
        errorCode = 'INVALID_PARAMETERS';
      }
      
      res.status(statusCode).json({
        success: false,
        error: result.error || 'Gagal generate gambar',
        code: errorCode,
        details: process.env.NODE_ENV === 'development' ? result.error : undefined
      });
    }
    
  } catch (error) {
    console.error('[API] Unhandled error in /api/generate:', error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      details: process.env.NODE_ENV === 'development' ? {
        message: error.message,
        stack: error.stack
      } : undefined
    });
  }
});

// Generate multiple images (batch)
app.post('/api/generate/batch', generateImageLimiter, async (req, res) => {
  try {
    const startTime = Date.now();
    const { prompts, style, aspect_ratio, model } = req.body;
    
    // Validasi input
    if (!Array.isArray(prompts) || prompts.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Prompts diperlukan dan harus berupa array',
        code: 'INVALID_PROMPTS'
      });
    }
    
    if (prompts.length > 5) {
      return res.status(400).json({
        success: false,
        error: 'Maksimal 5 prompts per batch',
        code: 'BATCH_TOO_LARGE'
      });
    }
    
    // Validasi setiap prompt
    const validPrompts = [];
    const invalidPrompts = [];
    
    prompts.forEach((prompt, index) => {
      if (typeof prompt !== 'string' || prompt.trim().length === 0) {
        invalidPrompts.push({ index, reason: 'Empty or invalid prompt' });
      } else if (prompt.length > 500) {
        invalidPrompts.push({ index, reason: 'Prompt too long' });
      } else {
        validPrompts.push(prompt.trim());
      }
    });
    
    if (validPrompts.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Tidak ada prompt yang valid',
        code: 'NO_VALID_PROMPTS',
        invalid_prompts: invalidPrompts
      });
    }
    
    console.log(`[API] Batch generation with ${validPrompts.length} prompts`);
    
    // Validasi style
    const validStyles = ['realistic', 'anime', 'cartoon', 'fantasy', 'ghibli', 'cyberpunk'];
    const selectedStyle = style && validStyles.includes(style.toLowerCase()) 
      ? style.toLowerCase() 
      : 'realistic';
    
    // Validasi aspect ratio
    const validRatios = ['1:1', '16:9', '9:16', '4:3', '3:4'];
    const selectedRatio = aspect_ratio && validRatios.includes(aspect_ratio) 
      ? aspect_ratio 
      : '1:1';
    
    // Options untuk generator
    const options = {
      style: selectedStyle,
      aspectRatio: selectedRatio,
      model: model || 'text_to_image_generator',
      useExistingAccount: false
    };
    
    // Generate images secara sequential
    const results = [];
    const failedGenerations = [];
    
    for (let i = 0; i < validPrompts.length; i++) {
      const prompt = validPrompts[i];
      
      try {
        console.log(`[API] Generating image ${i + 1}/${validPrompts.length}`);
        
        const result = await supawork.generateImage(prompt, options);
        
        if (result.success) {
          results.push({
            success: true,
            data: {
              image_url: result.image_url,
              prompt: result.prompt,
              style: result.style,
              aspect_ratio: result.aspect_ratio,
              model: result.model,
              timestamp: result.timestamp,
              index: i
            }
          });
        } else {
          failedGenerations.push({
            index: i,
            prompt: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
            error: result.error
          });
          
          results.push({
            success: false,
            error: result.error,
            index: i
          });
        }
        
        // Delay antar generasi untuk mengurangi load
        if (i < validPrompts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
      } catch (error) {
        console.error(`[API] Error in batch generation ${i + 1}:`, error);
        failedGenerations.push({
          index: i,
          prompt: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
          error: error.message
        });
        
        results.push({
          success: false,
          error: error.message,
          index: i
        });
      }
    }
    
    const processingTime = Date.now() - startTime;
    
    // Filter hasil yang sukses
    const successfulResults = results.filter(r => r.success);
    const failedResults = results.filter(r => !r.success);
    
    const responseData = {
      batch_id: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      total_prompts: validPrompts.length,
      successful: successfulResults.length,
      failed: failedResults.length,
      processing_time_ms: processingTime,
      results: successfulResults.map(r => r.data),
      failures: failedResults.map(f => ({
        index: f.index,
        error: f.error
      }))
    };
    
    // Jika ada hasil yang sukses
    if (successfulResults.length > 0) {
      console.log(`[API] Batch completed: ${successfulResults.length}/${validPrompts.length} successful`);
      
      res.json({
        success: true,
        data: responseData,
        meta: {
          processing_time: `${(processingTime / 1000).toFixed(2)}s`,
          credits_used: successfulResults.length,
          efficiency: `${((successfulResults.length / validPrompts.length) * 100).toFixed(1)}%`
        }
      });
    } else {
      // Semua gagal
      console.error(`[API] Batch failed: all ${validPrompts.length} generations failed`);
      
      res.status(500).json({
        success: false,
        error: 'Semua generasi gambar gagal',
        code: 'ALL_GENERATIONS_FAILED',
        data: responseData
      });
    }
    
  } catch (error) {
    console.error('[API] Unhandled error in /api/generate/batch:', error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error in batch generation',
      code: 'BATCH_INTERNAL_ERROR'
    });
  }
});

// Create new account (for manual use/testing)
app.post('/api/account/create', createAccountLimiter, async (req, res) => {
  try {
    console.log('[API] Creating new account...');
    
    const result = await supawork.createAccount();
    
    if (result.success) {
      console.log('[API] Account created successfully:', result.account.email);
      
      res.json({
        success: true,
        data: {
          email: result.account.email,
          password: result.account.password,
          token: result.account.token,
          identity: result.account.identity,
          created_at: result.timestamp,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 jam
        },
        meta: {
          account_type: 'temporary',
          retention_period: '24 hours',
          credits_available: 10
        }
      });
    } else {
      console.error('[API] Account creation failed:', result.error);
      
      res.status(500).json({
        success: false,
        error: result.error || 'Gagal membuat akun',
        code: 'ACCOUNT_CREATION_FAILED'
      });
    }
    
  } catch (error) {
    console.error('[API] Error in account creation:', error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error during account creation',
      code: 'ACCOUNT_INTERNAL_ERROR'
    });
  }
});

// Download proxy endpoint
app.get('/api/download', apiLimiter, async (req, res) => {
  try {
    const { url, filename } = req.query;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL parameter diperlukan',
        code: 'MISSING_URL'
      });
    }
    
    // Validasi URL
    try {
      new URL(url);
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'URL tidak valid',
        code: 'INVALID_URL'
      });
    }
    
    // Hanya izinkan URL dari domain tertentu untuk keamanan
    const allowedDomains = [
      'supawork.ai',
      'oss-accelerate.aliyuncs.com',
      'aliyuncs.com'
    ];
    
    const urlObj = new URL(url);
    const isAllowed = allowedDomains.some(domain => urlObj.hostname.includes(domain));
    
    if (!isAllowed && process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        error: 'URL tidak diizinkan untuk didownload',
        code: 'URL_NOT_ALLOWED'
      });
    }
    
    console.log(`[API] Downloading from: ${url}`);
    
    // Download image
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 30000
    });
    
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
    }
    
    // Get content type and buffer
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = await response.buffer();
    
    // Set headers untuk download
    const downloadFilename = filename || `ai-art-${Date.now()}.${getFileExtension(contentType)}`;
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache 24 jam
    
    // Send file
    res.send(buffer);
    
  } catch (error) {
    console.error('[API] Download error:', error);
    
    // Fallback: redirect ke URL asli
    if (req.query.url) {
      console.log('[API] Falling back to redirect');
      res.redirect(req.query.url);
    } else {
      res.status(500).json({
        success: false,
        error: 'Gagal mengunduh gambar',
        code: 'DOWNLOAD_FAILED',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
});

// Get file extension from content type
function getFileExtension(contentType) {
  const extensions = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif'
  };
  
  return extensions[contentType] || 'jpg';
}

// Status endpoint untuk monitoring
app.get('/api/status', apiLimiter, (req, res) => {
  const status = {
    status: 'operational',
    timestamp: new Date().toISOString(),
    services: {
      api: 'online',
      generation: 'online',
      accounts: 'online'
    },
    statistics: {
      uptime: process.uptime(),
      memory_usage: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
      node_version: process.version,
      environment: process.env.NODE_ENV || 'development'
    },
    limits: {
      rate_limit: '100 requests per 15 minutes',
      generation_limit: '50 images per 15 minutes',
      batch_limit: '5 images per batch'
    }
  };
  
  res.json(status);
});

// Test endpoint untuk debugging
app.post('/api/test', apiLimiter, async (req, res) => {
  try {
    const { action } = req.body;
    
    switch (action) {
      case 'ping':
        res.json({ success: true, message: 'pong', timestamp: new Date().toISOString() });
        break;
        
      case 'echo':
        res.json({ success: true, data: req.body, timestamp: new Date().toISOString() });
        break;
        
      case 'validate':
        // Validasi koneksi ke external services
        const services = {
          temp_mail: false,
          bypass_api: false,
          supawork: false
        };
        
        // Test temp-mail API
        try {
          const tmResponse = await fetch('https://api.internal.temp-mail.io/api/v3/domains', {
            headers: {
              'Application-Name': 'web',
              'Application-Version': '4.0.0',
              'X-CORS-Header': 'iaWg3pchvFx48fY'
            }
          });
          services.temp_mail = tmResponse.ok;
        } catch (error) {
          console.error('Temp-mail test failed:', error);
        }
        
        // Test bypass API
        try {
          const bypassResponse = await fetch('https://api.nekolabs.web.id/tools/bypass/cf-turnstile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: 'https://supawork.ai/app',
              siteKey: '0x4AAAAAACBjrLhJyEE6mq1c'
            })
          });
          services.bypass_api = bypassResponse.ok;
        } catch (error) {
          console.error('Bypass API test failed:', error);
        }
        
        // Test Supawork accessibility
        try {
          const swResponse = await fetch('https://supawork.ai', {
            headers: { 'User-Agent': 'Mozilla/5.0' }
          });
          services.supawork = swResponse.ok;
        } catch (error) {
          console.error('Supawork test failed:', error);
        }
        
        res.json({
          success: true,
          services,
          all_services_ok: Object.values(services).every(Boolean),
          timestamp: new Date().toISOString()
        });
        break;
        
      default:
        res.status(400).json({
          success: false,
          error: 'Invalid test action',
          valid_actions: ['ping', 'echo', 'validate']
        });
    }
    
  } catch (error) {
    console.error('[API] Test error:', error);
    res.status(500).json({
      success: false,
      error: 'Test failed',
      details: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[API] Unhandled error middleware:', err);
  
  // Cek jika error rate limit
  if (err.status === 429) {
    return res.status(429).json({
      success: false,
      error: 'Terlalu banyak request. Silakan coba lagi nanti.',
      code: 'RATE_LIMIT_EXCEEDED',
      retry_after: err.headers?.['retry-after'] || 900 // 15 menit dalam detik
    });
  }
  
  res.status(500).json({
    success: false,
    error: 'Something went wrong!',
    code: 'INTERNAL_SERVER_ERROR',
    request_id: req.headers['x-request-id'] || `req_${Date.now()}`,
    timestamp: new Date().toISOString()
  });
});

// 404 handler untuk API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint tidak ditemukan',
    code: 'ENDPOINT_NOT_FOUND',
    requested_path: req.originalUrl,
    available_endpoints: [
      'POST /api/generate',
      'POST /api/generate/batch',
      'GET /api/styles',
      'POST /api/account/create',
      'GET /api/download',
      'GET /api/status',
      'GET /api/health'
    ]
  });
});

// HANYA di development, kita serve static files dari Express
if (process.env.NODE_ENV !== 'production') {
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  });
  
  app.get('*', (req, res) => {
    // Coba serve file static
    const filePath = path.join(__dirname, '../public', req.path);
    if (fs.existsSync(filePath) && !req.path.startsWith('/api/')) {
      res.sendFile(filePath);
    } else {
      // Fallback ke index.html untuk SPA
      res.sendFile(path.join(__dirname, '../public/index.html'));
    }
  });
} else {
  // Di production, fallback ke frontend SPA
  app.use('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  });
}

// Graceful shutdown handler
process.on('SIGTERM', () => {
  console.log('[API] SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[API] SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Global error handler
process.on('uncaughtException', (error) => {
  console.error('[API] Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[API] Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start server untuk development lokal
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  const API_BASE_URL = process.env.API_BASE_URL || `http://localhost:${PORT}`;
  
  // Cek environment variables
  console.log('[API] Environment:', process.env.NODE_ENV || 'development');
  console.log('[API] Port:', PORT);
  console.log('[API] Allowed Origins:', process.env.ALLOWED_ORIGINS || '*');
  
  app.listen(PORT, () => {
    console.log(`[API] Server running on port ${PORT}`);
    console.log(`[API] Local URL: http://localhost:${PORT}`);
    console.log(`[API] API Base URL: ${API_BASE_URL}`);
    console.log(`[API] Health check: http://localhost:${PORT}/health`);
    console.log(`[API] Frontend: http://localhost:${PORT}/`);
    console.log(`[API] Ready to generate AI images!`);
  });
}

// Export untuk Vercel
module.exports = app;
