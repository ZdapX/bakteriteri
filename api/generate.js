
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const SupaworkAI = require('../lib/supawork.js');
const { 
  generateImageLimiter, 
  createAccountLimiter, 
  apiLimiter 
} = require('../middlewares/rateLimit.js');

const app = express();
const supawork = new SupaworkAI();

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? 
    process.env.ALLOWED_ORIGINS.split(',') : '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

// Health Check Endpoint
app.get('/', apiLimiter, (req, res) => {
  res.json({
    success: true,
    message: 'Text-to-Image API is running',
    endpoints: {
      generate: 'POST /api/generate',
      batch: 'POST /api/generate/batch',
      createAccount: 'POST /api/account/create',
      styles: 'GET /api/styles'
    },
    version: '1.0.0'
  });
});

// Get available styles
app.get('/api/styles', apiLimiter, (req, res) => {
  res.json({
    success: true,
    styles: [
      { id: 'realistic', name: 'Realistic', description: 'Gambar realistis seperti foto' },
      { id: 'anime', name: 'Anime', description: 'Gaya anime Jepang' },
      { id: 'cartoon', name: 'Cartoon', description: 'Gaya kartun' },
      { id: 'fantasy', name: 'Fantasy', description: 'Gaya fantasi ajaib' },
      { id: 'ghibli', name: 'Ghibli Studio', description: 'Gaya Studio Ghibli' },
      { id: 'cyberpunk', name: 'Cyberpunk', description: 'Gaya futuristik cyberpunk' }
    ],
    aspect_ratios: ['1:1', '4:3', '16:9', '9:16', '3:4']
  });
});

// Generate single image
app.post('/api/generate', generateImageLimiter, async (req, res) => {
  try {
    const { prompt, style, aspect_ratio, model } = req.body;
    
    // Validasi input
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Prompt diperlukan dan harus berupa string'
      });
    }
    
    if (prompt.length > 500) {
      return res.status(400).json({
        success: false,
        error: 'Prompt maksimal 500 karakter'
      });
    }
    
    // Default values
    const options = {
      style: style || 'realistic',
      aspectRatio: aspect_ratio || '1:1',
      model: model || 'text_to_image_generator'
    };
    
    console.log(`Generating image with prompt: "${prompt}", style: ${options.style}`);
    
    const result = await supawork.generateImage(prompt, options);
    
    if (result.success) {
      res.json({
        success: true,
        data: {
          image_url: result.image_url,
          prompt: result.prompt,
          style: result.style,
          aspect_ratio: result.aspect_ratio,
          model: result.model,
          timestamp: result.timestamp,
          download_url: `/api/download?url=${encodeURIComponent(result.image_url)}`
        },
        meta: {
          processing_time: new Date() - new Date(result.timestamp),
          credits_used: 1
        }
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Gagal generate gambar'
      });
    }
    
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Generate multiple images (batch)
app.post('/api/generate/batch', generateImageLimiter, async (req, res) => {
  try {
    const { prompts, style, aspect_ratio, model } = req.body;
    
    if (!Array.isArray(prompts) || prompts.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Prompts diperlukan dan harus berupa array'
      });
    }
    
    if (prompts.length > 5) {
      return res.status(400).json({
        success: false,
        error: 'Maksimal 5 prompts per batch'
      });
    }
    
    const options = {
      style: style || 'realistic',
      aspectRatio: aspect_ratio || '1:1',
      model: model || 'text_to_image_generator'
    };
    
    console.log(`Generating batch with ${prompts.length} prompts`);
    
    const results = await supawork.generateMultipleImages(prompts, options);
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    res.json({
      success: true,
      data: {
        images: successful.map(r => ({
          image_url: r.image_url,
          prompt: r.prompt,
          style: r.style,
          aspect_ratio: r.aspect_ratio,
          model: r.model,
          timestamp: r.timestamp
        })),
        failed: failed.map(f => f.error)
      },
      meta: {
        total: results.length,
        successful: successful.length,
        failed: failed.length,
        credits_used: successful.length
      }
    });
    
  } catch (error) {
    console.error('Batch API Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Create new account (for manual use)
app.post('/api/account/create', createAccountLimiter, async (req, res) => {
  try {
    const result = await supawork.createAccount();
    
    if (result.success) {
      res.json({
        success: true,
        data: {
          email: result.account.email,
          password: result.account.password,
          token: result.account.token,
          created_at: result.timestamp
        },
        message: 'Akun berhasil dibuat'
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error
      });
    }
    
  } catch (error) {
    console.error('Account creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Gagal membuat akun'
    });
  }
});

// Download proxy endpoint
app.get('/api/download', apiLimiter, async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL diperlukan'
      });
    }
    
    // Redirect langsung ke URL gambar
    res.redirect(url);
    
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({
      success: false,
      error: 'Gagal mengunduh gambar'
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Something went wrong!'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint tidak ditemukan'
  });
});

// Start server for local development
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`API available at http://localhost:${PORT}`);
  });
}

// Export for Vercel
module.exports = app;
