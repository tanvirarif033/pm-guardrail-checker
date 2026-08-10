import { Router } from 'express';
import { checkGuardrail } from '../services/pmAgent.js';

const router = Router();

router.post('/guardrail', async (req, res) => {
  try {
    const { prompt, model } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({
        error: 'Prompt is required and must be a string'
      });
    }

    if (prompt.length > 1000) {
      return res.status(400).json({
        error: 'Prompt is too long (max 1000 characters)'
      });
    }

    const result = await checkGuardrail(prompt, model);

    if (result.error) {
      return res.status(500).json({
        error: result.error,
        decision: result.decision,
        modelUsed: result.modelUsed,
        explanation: result.explanation,
        injectedPrompt: result.injectedPrompt
      });
    }

    res.json({
      prompt,
      decision: result.decision,
      explanation: result.explanation || result.fullResponse,
      fullResponse: result.fullResponse,
      modelUsed: result.modelUsed,
      injectedPrompt: result.injectedPrompt
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

router.get('/test', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Guardrail API is working',
    endpoints: {
      guardrail: '/api/guardrail (POST)',
      test: '/api/test (GET)',
      systemPrompt: '/api/system-prompt (GET)',
      updateSystemPrompt: '/api/system-prompt (PUT)',
      resetSystemPrompt: '/api/system-prompt/reset (POST)'
    }
  });
});

export default router;