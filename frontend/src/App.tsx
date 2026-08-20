import { useState, useEffect } from 'react';
import { 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Loader2, 
  Zap, 
  ChevronDown, 
  RefreshCw,
  Cpu,
  Shield,
  Brain,
  ChevronRight,
  Eye,
  Edit3,
  Save,
  RotateCcw,
  X,
  FileText
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface Model {
  model: string;
  name: string;
  provider: string;
  size: string;
  verified: boolean;
}

// Fallback shown only before the first successful fetch, or if
// GET /api/models fails entirely. The real model list always comes
// dynamically from the backend (see fetchModels below) - this mirrors
// the backend's curated 9-model allowlist (backend/src/index.ts,
// CURATED_MODELS) so the dropdown is correct even in that edge case.
const DEFAULT_MODELS: Model[] = [
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

function App() {
  const [prompt, setPrompt] = useState('');
  const [decision, setDecision] = useState<'YES' | 'NO' | null>(null);
  const [fullResponse, setFullResponse] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<Model[]>(DEFAULT_MODELS);
  const [selectedModel, setSelectedModel] = useState<string>(RECOMMENDED_MODEL);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelUsed, setModelUsed] = useState<string | null>(null);
  const [responseTime, setResponseTime] = useState<number | null>(null);
  
  // ============================================================
  // 3-Option System Prompt State
  // ============================================================
  const [injectedPrompt, setInjectedPrompt] = useState<string | null>(null);
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState('');
  const [currentSystemPrompt, setCurrentSystemPrompt] = useState<string | null>(null);
  const [isPromptModified, setIsPromptModified] = useState(false);
  const [promptSaveStatus, setPromptSaveStatus] = useState<{ type: 'success' | 'error' | null; message: string }>({ type: null, message: '' });

  // Fetch current system prompt on mount
  useEffect(() => {
    fetchCurrentSystemPrompt();
  }, []);

  const fetchCurrentSystemPrompt = async () => {
    try {
      const response = await fetch(`${API_URL}/api/system-prompt`);
      const data = await response.json();
      setCurrentSystemPrompt(data.systemPrompt);
      setIsPromptModified(data.isModified);
    } catch (error) {
      console.error('Failed to fetch system prompt:', error);
    }
  };

  const fetchModels = async () => {
    setLoadingModels(true);
    try {
      const response = await fetch(`${API_URL}/api/models`);
      const data = await response.json();

      console.log('Models from API:', data);

      let modelList: Model[] = [];

      if (data.free && data.free.length > 0) {
        const uniqueMap = new Map<string, Model>();
        data.free.forEach((model: Model) => {
          if (!uniqueMap.has(model.model)) {
            uniqueMap.set(model.model, model);
          }
        });
        modelList = Array.from(uniqueMap.values());
      } else {
        modelList = DEFAULT_MODELS;
      }

      const sortedModels = modelList.sort((a, b) => a.name.localeCompare(b.name));

      setModels(sortedModels);

      const recommended = data.recommended && sortedModels.some((m: Model) => m.model === data.recommended)
        ? data.recommended
        : sortedModels[0]?.model || RECOMMENDED_MODEL;
      setSelectedModel(recommended);
    } catch (error) {
      console.error('Failed to fetch models:', error);
      setModels(DEFAULT_MODELS);
      setSelectedModel(RECOMMENDED_MODEL);
    } finally {
      setLoadingModels(false);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setError(null);
    setDecision(null);
    setFullResponse(null);
    setExplanation(null);
    setModelUsed(null);
    setResponseTime(null);
    setInjectedPrompt(null);

    const startTime = performance.now();

    try {
      const response = await fetch(`${API_URL}/api/guardrail`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          model: selectedModel
        })
      });

      const endTime = performance.now();
      setResponseTime(Math.round(endTime - startTime));

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setDecision(data.decision);
      setFullResponse(data.fullResponse || '');
      setExplanation(data.explanation || data.fullResponse || '');
      setModelUsed(data.modelUsed || selectedModel);
      setInjectedPrompt(data.injectedPrompt || null);
      
      // Refresh system prompt status
      await fetchCurrentSystemPrompt();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to the server. Make sure the backend is running.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // 3-Option Prompt Modal Handlers
  // 1. View - Open modal in view mode
  // 2. Edit - Switch to edit mode
  // 3. Reset - Reset to default
  // ============================================================
  
  // Option 1: View - Open modal in view mode
  const openPromptModal = () => {
    setEditedPrompt(injectedPrompt || currentSystemPrompt || '');
    setIsEditingPrompt(false); // View mode by default
    setIsPromptModalOpen(true);
    setPromptSaveStatus({ type: null, message: '' });
  };

  const closePromptModal = () => {
    setIsPromptModalOpen(false);
    setIsEditingPrompt(false);
    setEditedPrompt('');
    setPromptSaveStatus({ type: null, message: '' });
  };

  // Option 2: Edit - Switch to edit mode
  const handleEditPrompt = () => {
    setIsEditingPrompt(true);
    setEditedPrompt(injectedPrompt || currentSystemPrompt || '');
  };

  const handleCancelEdit = () => {
    setIsEditingPrompt(false);
    setEditedPrompt(injectedPrompt || currentSystemPrompt || '');
    setPromptSaveStatus({ type: null, message: '' });
  };

  const handleApplyChanges = async () => {
    if (!editedPrompt || editedPrompt.trim().length === 0) {
      setPromptSaveStatus({ type: 'error', message: 'System prompt cannot be empty' });
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/system-prompt`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ systemPrompt: editedPrompt })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update system prompt');
      }

      setPromptSaveStatus({ type: 'success', message: 'System prompt updated successfully!' });
      setIsEditingPrompt(false);
      setIsPromptModified(true);
      setCurrentSystemPrompt(editedPrompt);
      
      // Update injected prompt preview with new content + TEST_INSTRUCTION
      const updatedInjected = editedPrompt + '\n\n' + '########################################\n\nTEST MODE...';
      setInjectedPrompt(updatedInjected);
    } catch (err) {
      setPromptSaveStatus({ type: 'error', message: err instanceof Error ? err.message : 'Failed to update system prompt' });
    }
  };

  // Option 3: Reset to Default
  const handleResetToDefault = async () => {
    try {
      const response = await fetch(`${API_URL}/api/system-prompt/reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reset system prompt');
      }

      setCurrentSystemPrompt(data.systemPrompt);
      setIsPromptModified(false);
      setIsEditingPrompt(false);
      setEditedPrompt(data.systemPrompt);
      setPromptSaveStatus({ type: 'success', message: 'System prompt reset to default' });
      
      // Clear injected prompt preview
      setInjectedPrompt(null);
      
      // Re-fetch current system prompt
      await fetchCurrentSystemPrompt();
    } catch (err) {
      setPromptSaveStatus({ type: 'error', message: err instanceof Error ? err.message : 'Failed to reset system prompt' });
    }
  };

  const examplePrompts = [
    'Build me a CRM for managing customers',
    'Create an HRM system for employee management',
    'Build a PUBG clone',
    'Create my portfolio website',
    'Write Python code for an API',
    'Build hospital management software'
  ];

  return (
    <div className="min-h-screen bg-[#F7F7F8] text-[#18181B]">
      <div className="max-w-3xl mx-auto px-6 py-14">

        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[#18181B]">
              <Zap className="text-white" size={18} strokeWidth={2.25} />
            </span>
            <span className="font-mono text-[11px] tracking-[0.18em] text-[#71717A] uppercase">
              Guardrail Test Console
            </span>
          </div>
          <h1 className="text-[28px] leading-tight font-semibold text-[#18181B] tracking-tight">
            PM Agent Guardrail Checker
          </h1>
          <p className="mt-2 text-[15px] text-[#52525B] leading-relaxed max-w-xl">
            Run a prompt against the PM Agent's system prompt and see whether it
            passes scope guardrails.
          </p>
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center px-2 py-0.5 rounded border border-[#E4E4E7] bg-white font-mono text-[11px] text-[#3F3F46]">
              v2.0
            </span>
            <span className="inline-flex items-center px-2 py-0.5 rounded border border-[#E4E4E7] bg-white font-mono text-[11px] text-[#3F3F46]">
              {models.length} models
            </span>
            {/* Status indicator: Default / Modified */}
            <span className={`inline-flex items-center px-2 py-0.5 rounded border font-mono text-[11px] ${isPromptModified ? 'border-yellow-400 bg-yellow-50 text-yellow-700' : 'border-[#E4E4E7] bg-white text-[#3F3F46]'}`}>
              {isPromptModified ? '⚡ Modified' : 'Default Prompt'}
            </span>
          </div>
        </div>

        {/* Model Selector */}
        <div className="bg-white rounded-xl border border-[#E4E4E7] p-5 mb-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Cpu className="text-[#52525B]" size={15} />
              <label className="text-[13px] font-medium text-[#3F3F46]">
                Model
              </label>
            </div>
            <button
              onClick={fetchModels}
              disabled={loadingModels}
              className="text-[12px] text-[#3F3F46] hover:text-[#18181B] flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[#E4E4E7] hover:bg-[#FAFAFA] transition disabled:opacity-50"
            >
              <RefreshCw size={12} className={loadingModels ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          <div className="relative">
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-[#E4E4E7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#18181B]/10 focus:border-[#A1A1AA] appearance-none bg-white pr-10 text-[14px] font-mono text-[#27272A] transition disabled:opacity-50"
              disabled={loadingModels || loading}
            >
              {models.map((model) => (
                <option key={model.model} value={model.model}>
                  {model.name} · {model.provider} · {model.size}
                  {model.verified ? ' ✓' : ''}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3.5 top-1/2 transform -translate-y-1/2 text-[#A1A1AA] pointer-events-none" size={16} />
          </div>

          <div className="mt-3 flex items-center justify-between text-[12px] text-[#A1A1AA] font-mono">
            <span>{models.length} available</span>
            {modelUsed && (
              <span className="text-[#3F3F46]">
                last: {modelUsed}
              </span>
            )}
          </div>
        </div>

        {/* Input Card */}
        <div className="bg-white rounded-xl border border-[#E4E4E7] p-5 mb-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label htmlFor="prompt" className="block text-[13px] font-medium text-[#3F3F46] mb-2">
                Prompt
              </label>
              <textarea
                id="prompt"
                rows={4}
                className="w-full px-3.5 py-3 border border-[#E4E4E7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#18181B]/10 focus:border-[#A1A1AA] transition resize-none bg-[#FAFAFA] text-[14px] text-[#27272A] placeholder:text-[#A1A1AA] font-mono leading-relaxed"
                placeholder="e.g., Build me a CRM for managing customers"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !prompt.trim()}
              className="w-full bg-[#18181B] hover:bg-[#27272A] disabled:bg-[#D4D4D8] disabled:cursor-not-allowed text-white font-medium text-[14px] py-3 px-6 rounded-lg transition flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  Analyzing...
                </>
              ) : (
                <>
                  <Brain size={16} />
                  Run guardrail check
                </>
              )}
            </button>
          </form>
        </div>

        {/* Stats */}
        {responseTime && decision && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-white rounded-lg px-4 py-3 border border-[#E4E4E7]">
              <p className="text-[11px] text-[#A1A1AA] font-mono uppercase tracking-wide">Response time</p>
              <p className="text-[16px] font-semibold text-[#18181B] font-mono mt-0.5">{responseTime}ms</p>
            </div>
            <div className="bg-white rounded-lg px-4 py-3 border border-[#E4E4E7]">
              <p className="text-[11px] text-[#A1A1AA] font-mono uppercase tracking-wide">Model used</p>
              <p className="text-[16px] font-semibold text-[#18181B] font-mono mt-0.5 truncate">{modelUsed || 'N/A'}</p>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="bg-white border border-[#FCA5A5] rounded-xl p-4 mb-4 flex items-start gap-3">
            <AlertCircle className="text-[#DC2626] flex-shrink-0 mt-0.5" size={18} />
            <div>
              <p className="text-[#991B1B] font-medium text-[14px]">Request failed</p>
              <p className="text-[#B91C1C] text-[13px] mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Result Display */}
        {decision && (
          <div className="bg-white rounded-xl border border-[#E4E4E7] overflow-hidden animate-fadeIn">

            {/* Decision strip */}
            <div className={`flex items-center justify-between px-5 py-4 border-b ${
              decision === 'YES'
                ? 'bg-[#F0FDF4] border-[#BBF7D0]'
                : 'bg-[#FEF2F2] border-[#FECACA]'
            }`}>
              <div className="flex items-center gap-2.5">
                {decision === 'YES' ? (
                  <CheckCircle className="text-[#16A34A]" size={20} />
                ) : (
                  <XCircle className="text-[#DC2626]" size={20} />
                )}
                <span className={`font-mono font-semibold text-[15px] tracking-tight ${
                  decision === 'YES' ? 'text-[#166534]' : 'text-[#991B1B]'
                }`}>
                  {decision === 'YES' ? 'PASS' : 'FAIL'}
                </span>
              </div>
              <span className={`font-mono text-[12px] ${
                decision === 'YES' ? 'text-[#16A34A]' : 'text-[#DC2626]'
              }`}>
                {decision}
              </span>
            </div>

            <div className="p-5">
              {/* Guardrail Analysis */}
              <div className="p-4 bg-[#FAFAFA] rounded-lg border border-[#F0F0F1]">
                <p className="text-[13px] text-[#3F3F46] leading-relaxed">
                  <span className="font-semibold text-[#18181B]">Analysis — </span>
                  {decision === 'YES'
                    ? "This request is within the allowed scope of the PM Agent. It aligns with enterprise business software requirements."
                    : "This request violates one or more guardrails. It either falls outside business software scope or contains prohibited elements (technical requests, non-business applications, etc.)."}
                </p>
              </div>

              {/* Explanation from AI */}
              {explanation && (
                <div className="mt-4">
                  <details className="cursor-pointer group">
                    <summary className="text-[13px] text-[#3F3F46] hover:text-[#18181B] font-medium flex items-center gap-1.5 list-none">
                      <ChevronRight className="group-open:rotate-90 transition text-[#A1A1AA]" size={14} />
                      AI reasoning & explanation
                    </summary>
                    <div className="mt-3 bg-[#FAFAFA] rounded-lg p-4 border border-[#F0F0F1]">
                      <p className="text-[13px] text-[#3F3F46] whitespace-pre-wrap leading-relaxed">
                        {explanation}
                      </p>
                    </div>
                  </details>
                </div>
              )}

              {/* ============================================================
                  Option 1: View Injected Prompt
                  ============================================================ */}
              {injectedPrompt && (
                <div className="mt-4">
                  <button
                    onClick={openPromptModal}
                    className="text-[13px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1.5"
                  >
                    <Eye size={14} />
                    View Injected Prompt
                  </button>
                </div>
              )}

              {/* Full Response */}
              {fullResponse && fullResponse !== explanation && (
                <div className="mt-3">
                  <details className="cursor-pointer group">
                    <summary className="text-[12px] text-[#A1A1AA] hover:text-[#71717A] font-medium flex items-center gap-1.5 list-none">
                      <ChevronRight className="group-open:rotate-90 transition" size={12} />
                      Raw technical response
                    </summary>
                    <div className="mt-2 bg-[#18181B] rounded-lg p-3.5 border border-[#27272A]">
                      <p className="text-[12px] text-[#D4D4D8] whitespace-pre-wrap font-mono leading-relaxed">
                        {fullResponse}
                      </p>
                    </div>
                  </details>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Quick Test Examples */}
        <div className="mt-8">
          <p className="text-[12px] text-[#A1A1AA] mb-3 font-mono uppercase tracking-wide">Quick test examples</p>
          <div className="flex flex-wrap gap-2">
            {examplePrompts.map((example) => (
              <button
                key={example}
                onClick={() => setPrompt(example)}
                className="text-[12.5px] bg-white hover:bg-[#FAFAFA] hover:border-[#D4D4D8] text-[#3F3F46] px-3 py-1.5 rounded-full transition border border-[#E4E4E7] disabled:opacity-50"
                disabled={loading}
              >
                {example.length > 30 ? example.slice(0, 30) + '...' : example}
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 text-center text-[12px] text-[#A1A1AA] border-t border-[#E4E4E7] pt-6">
          <p className="flex items-center justify-center gap-2 font-mono">
            <Shield size={12} />
            PM Guardrail Checker v2.0
            <span className="w-1 h-1 bg-[#D4D4D8] rounded-full inline-block"></span>
            <span>{models.length} models available</span>
          </p>
        </div>
      </div>

      {/* ============================================================
          Modal: 3-Option System Prompt Editor
          Options: View | Edit | Reset to Default
          ============================================================ */}
      {isPromptModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E4E4E7]">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-[#18181B]" />
                <h2 className="text-[16px] font-semibold text-[#18181B]">
                  {isEditingPrompt ? '✏️ Edit System Prompt' : '📄 System Prompt'}
                </h2>
              </div>
              <button
                onClick={closePromptModal}
                className="p-1 hover:bg-[#F4F4F5] rounded-md transition"
              >
                <X size={18} className="text-[#71717A]" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              {/* Status indicator */}
              <div className="mb-4 flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center px-2 py-0.5 rounded border font-mono text-[11px] ${isPromptModified ? 'border-yellow-400 bg-yellow-50 text-yellow-700' : 'border-[#E4E4E7] bg-white text-[#3F3F46]'}`}>
                  {isPromptModified ? '⚡ Modified' : '📌 Default'}
                </span>
                <span className="text-[11px] text-[#A1A1AA] font-mono">
                  {isEditingPrompt ? '(Edit Mode)' : '(Read Only)'}
                </span>
                {promptSaveStatus.type && (
                  <span className={`text-[12px] ${promptSaveStatus.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                    {promptSaveStatus.message}
                  </span>
                )}
              </div>

              {/* Prompt Content */}
              {isEditingPrompt ? (
                <textarea
                  value={editedPrompt}
                  onChange={(e) => setEditedPrompt(e.target.value)}
                  className="w-full h-80 px-4 py-3 border border-[#E4E4E7] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#18181B]/10 focus:border-[#A1A1AA] font-mono text-[13px] leading-relaxed resize-none"
                  placeholder="Enter system prompt..."
                />
              ) : (
                <div className="bg-[#FAFAFA] rounded-lg p-4 border border-[#F0F0F1] max-h-80 overflow-y-auto">
                  <pre className="text-[13px] text-[#3F3F46] whitespace-pre-wrap font-mono leading-relaxed">
                    {editedPrompt || injectedPrompt || 'No prompt available'}
                  </pre>
                </div>
              )}
            </div>

            {/* Modal Footer - 3 Options: View, Edit, Reset */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-[#E4E4E7] flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                {isEditingPrompt ? (
                  // Edit Mode Actions
                  <>
                    <button
                      onClick={handleCancelEdit}
                      className="px-4 py-2 text-[13px] text-[#3F3F46] hover:bg-[#F4F4F5] rounded-lg transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleApplyChanges}
                      className="px-4 py-2 bg-[#18181B] hover:bg-[#27272A] text-white text-[13px] font-medium rounded-lg transition flex items-center gap-1.5"
                    >
                      <Save size={14} />
                      Save & Apply
                    </button>
                  </>
                ) : (
                  // View Mode Actions - 3 Options
                  <>
                    {/* Option 2: Edit */}
                    <button
                      onClick={handleEditPrompt}
                      className="px-4 py-2 bg-[#18181B] hover:bg-[#27272A] text-white text-[13px] font-medium rounded-lg transition flex items-center gap-1.5"
                    >
                      <Edit3 size={14} />
                      Edit Prompt
                    </button>
                    {/* Option 3: Reset to Default */}
                    <button
                      onClick={handleResetToDefault}
                      className="px-4 py-2 text-[13px] text-[#DC2626] hover:bg-red-50 rounded-lg transition flex items-center gap-1.5 border border-red-200 hover:border-red-300"
                    >
                      <RotateCcw size={14} />
                      Reset to Default
                    </button>
                  </>
                )}
              </div>
              {/* Option 1: View - Close (always available) */}
              <button
                onClick={closePromptModal}
                className="px-4 py-2 text-[13px] text-[#3F3F46] hover:bg-[#F4F4F5] rounded-lg transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ============================================================ */}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.25s ease-out;
        }
      `}</style>
    </div>
  );
}

export default App;