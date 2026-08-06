import { ChatOllama } from '@langchain/ollama';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { pmPrompt } from '../prompts/pmPrompt.js';

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

export async function checkGuardrail(
  userPrompt: string,
  selectedModel?: string
): Promise<{
  decision: 'YES' | 'NO';
  fullResponse?: string;
  explanation?: string;
  error?: string;
  modelUsed?: string;
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

    // Build the config object
    const config: any = {
      baseUrl: baseUrl,
      model: modelName,
      temperature: 0.3,
    };

    // Only add apiKey if it exists and is not empty
    if (apiKey && apiKey.trim() !== '') {
      config.apiKey = apiKey;
    }

    const model = new ChatOllama(config);

    const systemPrompt = pmPrompt() + '\n\n' + TEST_INSTRUCTION;

    const messages = [
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ];

    console.log(`📤 Sending request for: "${userPrompt.substring(0, 50)}..."`);

    const response = await model.invoke(messages);
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
      modelUsed: modelName
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

    return {
      decision: 'NO',
      error: `Error: ${errorMessage}`,
      modelUsed: selectedModel || 'unknown'
    };
  }
}