import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import guardrailRoutes from './routes/guardrail.js';
import { 
  getRuntimeSystemPrompt, 
  updateRuntimeSystemPrompt, 
  resetRuntimeSystemPrompt 
} from './services/pmAgent.js';

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

// All models - NO DUPLICATES
const ALL_MODELS: Model[] = [
  // Cloud Models
  { model: 'qwen3.5:cloud', name: 'Qwen 3.5 Cloud', provider: 'Alibaba', size: 'Cloud', verified: true },
  { model: 'glm-5.2:cloud', name: 'GLM 5.2 Cloud', provider: 'Zhipu AI', size: 'Cloud', verified: true },
  
  // Working NVIDIA Models
  { model: 'nemotron-3-super', name: 'Nemotron 3 Super', provider: 'NVIDIA', size: 'Super', verified: true },
  { model: 'nemotron-3-nano:30b', name: 'Nemotron 3 Nano', provider: 'NVIDIA', size: '30B', verified: true },
  { model: 'nemotron-3-ultra', name: 'Nemotron 3 Ultra', provider: 'NVIDIA', size: 'Ultra', verified: false },
  
  // Working Google Models
  { model: 'gemma4:31b', name: 'Gemma 4', provider: 'Google', size: '31B', verified: true },
  
  // Other potentially working models
  { model: 'gpt-oss:120b', name: 'GPT-OSS', provider: 'Open Source', size: '120B', verified: false },
  { model: 'gpt-oss:20b', name: 'GPT-OSS (Small)', provider: 'Open Source', size: '20B', verified: false },
  { model: 'minimax-m3', name: 'MiniMax M3', provider: 'MiniMax', size: 'M3', verified: false },
];

const modelName = getCleanModelName();

console.log('🔧 Configuration:');
console.log(`  - PORT: ${port}`);
console.log(`  - OLLAMA_BASE_URL: ${process.env.OLLAMA_BASE_URL}`);
console.log(`  - OLLAMA_MODEL: "${modelName}"`);
console.log(`  - OLLAMA_API_KEY: ${process.env.OLLAMA_API_KEY ? '✓ Set' : '✗ Not set'}`);
console.log(`  - Total Models: ${ALL_MODELS.length}`);

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
      totalModels: ALL_MODELS.length
    }
  });
});

// ============================================================
// SYSTEM PROMPT MANAGEMENT APIS - 3 Options: View, Edit, Reset
// ============================================================

// 1. GET - View current runtime system prompt
app.get('/api/system-prompt', (req, res) => {
  const { prompt, isModified } = getRuntimeSystemPrompt();
  res.json({
    systemPrompt: prompt,
    isModified: isModified,
    isDefault: !isModified
  });
});

// 2. PUT - Edit/Update runtime system prompt
app.put('/api/system-prompt', (req, res) => {
  const { systemPrompt } = req.body;
  
  if (!systemPrompt || typeof systemPrompt !== 'string') {
    return res.status(400).json({
      error: 'systemPrompt is required and must be a string'
    });
  }

  const result = updateRuntimeSystemPrompt(systemPrompt);
  
  if (!result.success) {
    return res.status(400).json({ error: result.message });
  }
  
  res.json({
    success: true,
    message: result.message,
    isModified: true
  });
});

// 3. POST - Reset to default system prompt
app.post('/api/system-prompt/reset', (req, res) => {
  const { prompt, isModified } = resetRuntimeSystemPrompt();
  res.json({
    success: true,
    systemPrompt: prompt,
    isModified: isModified,
    isDefault: true,
    message: 'System prompt reset to default'
  });
});

// ============================================================
// END: System Prompt Management APIs
// ============================================================

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
    let availableModels = ALL_MODELS.filter(model => {
      const isAvailable = availableModelNames.some(available =>
        available === model.model ||
        available.includes(model.model) ||
        model.model.includes(available)
      );
      
      if (model.model === 'qwen3.5:cloud' || model.model === 'glm-5.2:cloud') {
        return true;
      }
      
      return isAvailable;
    });

    if (availableModels.length === 0) {
      console.log('⚠️ No models found, returning defaults');
      availableModels = [
        { model: 'qwen3.5:cloud', name: 'Qwen 3.5 Cloud', provider: 'Alibaba', size: 'Cloud', verified: true },
        { model: 'glm-5.2:cloud', name: 'GLM 5.2 Cloud', provider: 'Zhipu AI', size: 'Cloud', verified: true },
        { model: 'nemotron-3-super', name: 'Nemotron 3 Super', provider: 'NVIDIA', size: 'Super', verified: true },
        { model: 'gemma4:31b', name: 'Gemma 4', provider: 'Google', size: '31B', verified: true },
      ];
    }

    const sortedModels = availableModels.sort((a, b) => {
      if (a.model.includes('cloud') && !b.model.includes('cloud')) return -1;
      if (!a.model.includes('cloud') && b.model.includes('cloud')) return 1;
      if (a.verified && !b.verified) return -1;
      if (!a.verified && b.verified) return 1;
      return a.name.localeCompare(b.name);
    });

    const uniqueModels = Array.from(
      new Map(sortedModels.map(m => [m.model, m])).values()
    );

    console.log(`✅ Returning ${uniqueModels.length} unique models`);

    res.json({
      free: uniqueModels,
      recommended: 'qwen3.5:cloud',
      allAvailable: availableModelNames
    });

  } catch (error) {
    console.error('❌ Error fetching models:', error);
    const defaultModels = [
      { model: 'qwen3.5:cloud', name: 'Qwen 3.5 Cloud', provider: 'Alibaba', size: 'Cloud', verified: true },
      { model: 'glm-5.2:cloud', name: 'GLM 5.2 Cloud', provider: 'Zhipu AI', size: 'Cloud', verified: true },
      { model: 'nemotron-3-super', name: 'Nemotron 3 Super', provider: 'NVIDIA', size: 'Super', verified: true },
      { model: 'gemma4:31b', name: 'Gemma 4', provider: 'Google', size: '31B', verified: true },
    ];
    res.json({
      free: defaultModels,
      recommended: 'qwen3.5:cloud'
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
  console.log(`📋 ${ALL_MODELS.length} total models configured\n`);
});