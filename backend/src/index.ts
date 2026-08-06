import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import guardrailRoutes from './routes/guardrail.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Helper to clean model name
function getCleanModelName(): string {
  let model = process.env.OLLAMA_MODEL || 'nemotron-3-super';
  model = model.trim();
  if (model.includes('=')) {
    const parts = model.split('=');
    model = parts[parts.length - 1].trim();
  }
  model = model.replace(/["']/g, '');
  return model;
}

// Define model interface
interface Model {
  model: string;
  name: string;
  provider: string;
  size: string;
  verified: boolean;
}

interface OllamaModel {
  name?: string;
  model?: string;
  modified_at?: string;
  size?: number;
  digest?: string;
  details?: {
    parent_model?: string;
    format?: string;
    family?: string;
    families?: string[];
    parameter_size?: string;
    quantization_level?: string;
  };
}

interface OllamaTagsResponse {
  models: OllamaModel[];
}

// All free models (verified working)
const FREE_MODELS: Model[] = [
  // NVIDIA Models - Confirmed Working
  { model: 'nemotron-3-super', name: 'Nemotron 3 Super', provider: 'NVIDIA', size: 'Super', verified: true },
  { model: 'nemotron-3-nano:30b', name: 'Nemotron 3 Nano', provider: 'NVIDIA', size: '30B', verified: true },
  { model: 'nemotron-3-ultra', name: 'Nemotron 3 Ultra', provider: 'NVIDIA', size: 'Ultra', verified: false },
  
  // Google Gemma Models
  { model: 'gemma4:31b', name: 'Gemma 4', provider: 'Google', size: '31B', verified: true },
  { model: 'gemma3:27b', name: 'Gemma 3', provider: 'Google', size: '27B', verified: false },
  { model: 'gemma3:12b', name: 'Gemma 3 (Small)', provider: 'Google', size: '12B', verified: false },
  { model: 'gemma3:4b', name: 'Gemma 3 (Mini)', provider: 'Google', size: '4B', verified: false },
  
  // Meta Llama Models
  { model: 'llama3.2:3b', name: 'Llama 3.2', provider: 'Meta', size: '3B', verified: false },
  { model: 'llama3.2:1b', name: 'Llama 3.2 (Tiny)', provider: 'Meta', size: '1B', verified: false },
  { model: 'llama3.1:8b', name: 'Llama 3.1', provider: 'Meta', size: '8B', verified: false },
  
  // Mistral Models
  { model: 'mistral:7b', name: 'Mistral', provider: 'Mistral AI', size: '7B', verified: false },
  { model: 'ministral-3:8b', name: 'Ministral 3', provider: 'Mistral AI', size: '8B', verified: false },
  { model: 'ministral-3:3b', name: 'Ministral 3 (Tiny)', provider: 'Mistral AI', size: '3B', verified: false },
  
  // Alibaba Qwen Models
  { model: 'qwen2.5:7b', name: 'Qwen 2.5', provider: 'Alibaba', size: '7B', verified: false },
  { model: 'qwen2.5:14b', name: 'Qwen 2.5 (Large)', provider: 'Alibaba', size: '14B', verified: false },
  { model: 'qwen3-coder:480b', name: 'Qwen 3 Coder', provider: 'Alibaba', size: '480B', verified: false },
  
  // Microsoft Phi Models
  { model: 'phi3:3.8b', name: 'Phi-3 Mini', provider: 'Microsoft', size: '3.8B', verified: false },
  { model: 'phi3:14b', name: 'Phi-3', provider: 'Microsoft', size: '14B', verified: false },
  
  // Zhipu AI Models
  { model: 'glm-4.7', name: 'GLM 4.7', provider: 'Zhipu AI', size: '4.7', verified: false },
  { model: 'glm4:9b-chat', name: 'GLM 4 (Chat)', provider: 'Zhipu AI', size: '9B', verified: false },
  
  // Open-Source GPT Models
  { model: 'gpt-oss:120b', name: 'GPT-OSS', provider: 'Open Source', size: '120B', verified: false },
  { model: 'gpt-oss:20b', name: 'GPT-OSS (Small)', provider: 'Open Source', size: '20B', verified: false },
  
  // MiniMax Models
  { model: 'minimax-m3', name: 'MiniMax M3', provider: 'MiniMax', size: 'M3', verified: false },
  { model: 'minimax-m2.5', name: 'MiniMax M2.5', provider: 'MiniMax', size: 'M2.5', verified: false },
  
  // Code-Specific Models
  { model: 'codellama:7b', name: 'Code Llama', provider: 'Meta', size: '7B', verified: false },
  { model: 'deepseek-coder:6.7b', name: 'DeepSeek Coder', provider: 'DeepSeek', size: '6.7B', verified: false },
  
  // Lightweight Models
  { model: 'tinyllama:1.1b', name: 'TinyLlama', provider: 'Open Source', size: '1.1B', verified: false },
  { model: 'devstral-small-2:24b', name: 'Devstral Small', provider: 'Devstral', size: '24B', verified: false },
];

const modelName = getCleanModelName();

console.log('🔧 Configuration:');
console.log(`  - PORT: ${port}`);
console.log(`  - OLLAMA_BASE_URL: ${process.env.OLLAMA_BASE_URL}`);
console.log(`  - OLLAMA_MODEL: "${process.env.modelName}"`);
console.log(`  - OLLAMA_API_KEY: ${process.env.OLLAMA_API_KEY ? '✓ Set' : '✗ Not set'}`);
console.log(`  - Total Models: ${FREE_MODELS.length}`);

// Middleware
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api', guardrailRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'PM Guardrail Checker is running',
    config: {
      model: modelName,
      baseUrl: process.env.OLLAMA_BASE_URL,
      totalModels: FREE_MODELS.length
    }
  });
});

// Get available models
app.get('/api/models', async (req, res) => {
  try {
    const response = await fetch(`${process.env.OLLAMA_BASE_URL}/api/tags`, {
      headers: {
        'Authorization': `Bearer ${process.env.OLLAMA_API_KEY}`
      }
    });

    let availableModelNames: string[] = [];

    if (response.ok) {
      const data = await response.json() as OllamaTagsResponse;
      const availableModels = data.models || [];
      availableModelNames = availableModels.map((m: OllamaModel) => m.model || m.name || '');
      console.log('📡 Available models from Ollama:', availableModelNames);
    }

    // Filter models that are available
    const availableFreeModels = FREE_MODELS.filter(freeModel => {
      const isAvailable = availableModelNames.some(available =>
        available === freeModel.model ||
        available.includes(freeModel.model) ||
        freeModel.model.includes(available)
      );

      if (availableModelNames.length === 0) {
        return true;
      }

      return isAvailable;
    });

    if (availableFreeModels.length > 0) {
      console.log(`✅ Found ${availableFreeModels.length} available free models`);
      return res.json({
        free: availableFreeModels,
        recommended: 'nemotron-3-super',
        allAvailable: availableModelNames
      });
    }

    res.json({
      free: FREE_MODELS,
      recommended: 'nemotron-3-super',
      allAvailable: availableModelNames
    });

  } catch (error) {
    console.error('❌ Error fetching models:', error);
    res.json({
      free: FREE_MODELS,
      recommended: 'nemotron-3-super'
    });
  }
});

// Set active model
app.post('/api/model', (req, res) => {
  const { model } = req.body;
  if (!model) {
    return res.status(400).json({ error: 'Model name is required' });
  }

  process.env.OLLAMA_MODEL = model;

  res.json({
    success: true,
    model: model,
    message: `Switched to ${model}`
  });
});

app.listen(port, () => {
  console.log(`\n🚀 PM Guardrail Checker running on http://localhost:${port}`);
  console.log(`📝 Health check: http://localhost:${port}/health`);
  console.log(`🤖 Using model: "${modelName}"`);
  console.log(`📋 ${FREE_MODELS.length} free models configured\n`);
});