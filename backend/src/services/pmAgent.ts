import { ChatOllama } from '@langchain/ollama';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { DEFAULT_SYSTEM_PROMPT } from '../prompts/pmPrompt.js';

// ============================================================
// RUNTIME SYSTEM PROMPT STATE
// Starts with DEFAULT_SYSTEM_PROMPT
// Can be modified via API at runtime
// Resets to default on server restart
// ============================================================
let runtimeSystemPrompt: string = DEFAULT_SYSTEM_PROMPT;
let isPromptModified: boolean = false;

const TEST_INSTRUCTION = `
########################################

TEST MODE

Your task is to determine whether the user's request is inside the allowed scope defined by your system prompt.

Analyze the request carefully and provide:
1. First line: "DECISION: YES" or "DECISION: NO"
2. Then provide a brief explanation of why this decision was made, referencing the specific guardrails that apply.

Example output format:
DECISION: YES
This request is about building a CRM system, which is enterprise business software. It falls within the allowed scope.

DECISION: NO
This request is about building a game, which is not enterprise business software. It violates the business-only scope guardrail.

Output exactly in this format with DECISION: first, followed by explanation.

########################################
`;

// ============================================================
// RUNTIME PROMPT MANAGEMENT FUNCTIONS
// ============================================================

// Get current runtime system prompt
export function getRuntimeSystemPrompt(): { prompt: string; isModified: boolean } {
  return { prompt: runtimeSystemPrompt, isModified: isPromptModified };
}

// Update runtime system prompt
export function updateRuntimeSystemPrompt(newPrompt: string): { success: boolean; message: string } {
  if (!newPrompt || newPrompt.trim().length === 0) {
    return { success: false, message: 'System prompt cannot be empty' };
  }
  runtimeSystemPrompt = newPrompt;
  isPromptModified = true;
  console.log('✅ Runtime system prompt updated');
  return { success: true, message: 'System prompt updated successfully' };
}

// Reset runtime system prompt to default
export function resetRuntimeSystemPrompt(): { prompt: string; isModified: boolean } {
  runtimeSystemPrompt = DEFAULT_SYSTEM_PROMPT;
  isPromptModified = false;
  console.log('🔄 Runtime system prompt reset to default');
  return { prompt: runtimeSystemPrompt, isModified: isPromptModified };
}

// ============================================================
// GUARDRAIL CHECK FUNCTION
// ============================================================

export async function checkGuardrail(
  userPrompt: string,
  selectedModel?: string
): Promise<{
  decision: 'YES' | 'NO';
  fullResponse?: string;
  explanation?: string;
  error?: string;
  modelUsed?: string;
  injectedPrompt?: string;
}> {
  try {
    if (!userPrompt || userPrompt.trim().length === 0) {
      return {
        decision: 'NO',
        error: 'Empty prompt provided'
      };
    }

    const baseUrl = process.env.OLLAMA_BASE_URL || 'https://ollama.com';
    const apiKey = process.env.OLLAMA_API_KEY;

    let modelName = selectedModel || process.env.OLLAMA_MODEL || 'qwen3.5:cloud';

    modelName = modelName.trim();
    if (modelName.includes('=')) {
      const parts = modelName.split('=');
      modelName = parts[parts.length - 1].trim();
    }
    modelName = modelName.replace(/["']/g, '');

    console.log(`📡 Using model: "${modelName}"`);
    console.log(`🔗 Base URL: ${baseUrl}`);
    console.log(`📝 Using runtime system prompt (Modified: ${isPromptModified})`);

    // ============================================================
    // KEY: Use the RUNTIME system prompt (not the default directly)
    // ============================================================
    const systemPrompt = runtimeSystemPrompt + '\n\n' + TEST_INSTRUCTION;

    const model = new ChatOllama({
      baseUrl: baseUrl,
      model: modelName,
      temperature: 0.1,
    });

    const messages = [
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ];

    console.log(`📤 Sending request for: "${userPrompt.substring(0, 50)}..."`);
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout after 30 seconds')), 30000);
    });

    const responsePromise = model.invoke(messages);
    const response = await Promise.race([responsePromise, timeoutPromise]) as any;
    
    const content = response.content as string;

    console.log(`📥 Received response: "${content.substring(0, 200)}..."`);

    // Parse the response
    const lines = content.trim().split('\n');
    let decision: 'YES' | 'NO' = 'NO';
    let explanation = content;

    if (lines.length > 0) {
      const firstLine = lines[0].toUpperCase();
      if (firstLine.includes('DECISION: YES')) {
        decision = 'YES';
        explanation = lines.slice(1).join('\n').trim() || content;
      } else if (firstLine.includes('DECISION: NO')) {
        decision = 'NO';
        explanation = lines.slice(1).join('\n').trim() || content;
      } else if (firstLine.includes('YES')) {
        decision = 'YES';
        explanation = content;
      } else if (firstLine.includes('NO')) {
        decision = 'NO';
        explanation = content;
      }
    }

    if (!decision) {
      if (content.toUpperCase().includes('YES')) {
        decision = 'YES';
      } else if (content.toUpperCase().includes('NO')) {
        decision = 'NO';
      }
    }

    return {
      decision,
      fullResponse: content,
      explanation: explanation || content,
      modelUsed: modelName,
      injectedPrompt: systemPrompt // Return the full injected prompt
    };
  } catch (error: any) {
    console.error('❌ Error checking guardrail:', error);

    let errorMessage = 'Unknown error occurred';
    if (error.error) {
      errorMessage = typeof error.error === 'string' ? error.error : JSON.stringify(error.error);
    } else if (error.message) {
      errorMessage = error.message;
    }

    if (errorMessage.includes('subscription') || errorMessage.includes('upgrade')) {
      return {
        decision: 'NO',
        error: `This model requires a subscription. Please select a free model.`,
        modelUsed: selectedModel || 'unknown'
      };
    }

    if (errorMessage.includes('timeout')) {
      return {
        decision: 'NO',
        error: `Request timed out. The model is taking too long to respond. Try a faster model like 'nemotron-3-nano:30b'.`,
        modelUsed: selectedModel || 'unknown'
      };
    }

    return {
      decision: 'NO',
      error: `Error: ${errorMessage}`,
      modelUsed: selectedModel || 'unknown'
    };
  }
}