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


const CURATED_MODELS: Model[] = [
  { model: 'glm-5.2:cloud', name: 'GLM 5.2 Cloud', provider: 'Zhipu AI', size: 'Cloud', verified: true },
  { model: 'qwen3.5:cloud', name: 'Qwen 3.5 Cloud', provider: 'Alibaba', size: 'Cloud', verified: true },
  { model: 'gemma4:31b', name: 'Gemma 4', provider: 'Google', size: '31B', verified: true },
  { model: 'nemotron-3-nano:30b', name: 'Nemotron 3 Nano', provider: 'NVIDIA', size: '30B', verified: true },
  { model: 'nemotron-3-super', name: 'Nemotron 3 Super', provider: 'NVIDIA', size: 'Super', verified: true },
  { model: 'gpt-oss:120b', name: 'GPT-OSS', provider: 'Open Source', size: '120B', verified: true },
  { model: 'gpt-oss:20b', name: 'GPT-OSS (Small)', provider: 'Open Source', size: '20B', verified: true },
  { model: 'minimax-m3', name: 'MiniMax M3', provider: 'MiniMax', size: 'M3', verified: true },
  { model: 'nemotron-3-ultra', name: 'Nemotron 3 Ultra', provider: 'NVIDIA', size: 'Ultra', verified: true },
];

const RECOMMENDED_MODEL = 'qwen3.5:cloud';

const modelName = getCleanModelName();

console.log('🔧 Configuration:');
console.log(`  - PORT: ${port}`);
console.log(`  - OLLAMA_BASE_URL: ${process.env.OLLAMA_BASE_URL}`);
console.log(`  - OLLAMA_MODEL: "${modelName}"`);
console.log(`  - OLLAMA_API_KEY: ${process.env.OLLAMA_API_KEY ? '✓ Set' : '✗ Not set'}`);
console.log(`  - Models: curated allowlist of ${CURATED_MODELS.length}, served via /api/models`);

// Middleware
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://pm-agent-checker.duckdns.org'
  ],
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
      baseUrl: process.env.OLLAMA_BASE_URL
    }
  });
});



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


app.get('/api/models', (req, res) => {
  console.log(`✅ Returning ${CURATED_MODELS.length} curated models:`, CURATED_MODELS.map(m => m.model));

  res.json({
    free: CURATED_MODELS,
    recommended: RECOMMENDED_MODEL,
    allAvailable: CURATED_MODELS.map(m => m.model)
  });
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
  console.log(`📋 ${CURATED_MODELS.length} curated models available via /api/models\n`);
});