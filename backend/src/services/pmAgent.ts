import { ChatOllama } from '@langchain/ollama';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { DEFAULT_SYSTEM_PROMPT } from '../prompts/pmPrompt.js';


let runtimeSystemPrompt: string = DEFAULT_SYSTEM_PROMPT;
let isPromptModified: boolean = false;

const TEST_INSTRUCTION = `
########################################

TEST MODE

Your task is to determine whether the user's request is inside the allowed scope defined by your system prompt.

Follow the Scope section's step-by-step qualification exactly, then output:
1. The entire first line, exactly: "DECISION: YES" or "DECISION: NO" — nothing else on that line, no extra punctuation.
2. Then a brief explanation that names the specific capability(ies) that drove the decision. For a scoped YES (mixed request), explicitly state what is in scope and what is excluded. For a NO, name which step failed (the master question, the Intent & Context Assessment, the Bucket C financial/HR framing bar, or materiality).

Example output format:
DECISION: YES
This request is about a CRM for managing customers — Bucket A, self-evidently organizational vocabulary, and the Intent & Context Assessment passes.

DECISION: NO
This request describes a multiplayer game (Bucket B). The one-line payroll mention is decorative, not a substantive request, so it doesn't bring this into scope.

The first line must be exactly "DECISION: YES" or "DECISION: NO" — do not prepend or append anything to it.

In TEST MODE, stop after the Explanation. Do not add the \`***\` separator and do not continue into a user-facing reply or discovery question — TEST MODE only evaluates the classification, not the conversation that would follow it.

########################################
`;


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

    let modelName = selectedModel || process.env.OLLAMA_MODEL || 'nemotron-3-super';

    modelName = modelName.trim();
    if (modelName.includes('=')) {
      const parts = modelName.split('=');
      modelName = parts[parts.length - 1].trim();
    }
    modelName = modelName.replace(/["']/g, '');

    console.log(`📡 Using model: "${modelName}"`);
    console.log(`🔗 Base URL: ${baseUrl}`);
    console.log(`📝 Using runtime system prompt (Modified: ${isPromptModified})`);


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

    // Parse the response.
    // Only the exact first-line format "DECISION: YES" / "DECISION: NO" is
    // accepted. Anything else fails closed to NO — no substring fallback,
    // since a loose match on "YES"/"NO" anywhere in the line is exploitable
    // (e.g. ordinary words containing "no" as a substring) and defeats the
    // guardrail's fail-closed guarantee.
    const lines = content.trim().split('\n');
    const firstLine = (lines[0] || '').trim();
    const decisionMatch = /^DECISION:\s*(YES|NO)\.?$/i.exec(firstLine);

    let decision: 'YES' | 'NO' = 'NO';
    let explanation = content;

    if (decisionMatch) {
      decision = decisionMatch[1].toUpperCase() as 'YES' | 'NO';
      explanation = lines.slice(1).join('\n').trim() || content;
    } else {
      console.warn('⚠️ Model did not return the exact "DECISION: YES/NO" first-line format — failing closed to NO');
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