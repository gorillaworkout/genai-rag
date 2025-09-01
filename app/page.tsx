'use client';

import { useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { MessageCircle, Search, Loader2, RefreshCw, FileText } from 'lucide-react';
import ErrorBoundary from './components/ErrorBoundary';
import DocumentsViewer from './components/DocumentsViewer';

// Dynamic imports to avoid hydration issues
const UploadArea = dynamic(() => import('./components/UploadArea'), {
  ssr: false,
  loading: () => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
        <div className="space-y-3">
          <div className="h-32 bg-gray-200 rounded"></div>
          <div className="h-10 bg-gray-200 rounded"></div>
        </div>
      </div>
    </div>
  )
});

const SourceCard = dynamic(() => import('./components/SourceCard'), {
  ssr: false,
  loading: () => (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
        <div className="h-3 bg-gray-200 rounded w-1/3"></div>
      </div>
    </div>
  )
});

interface Source {
  id: string;
  source: string;
  count: number;
  lastUpdated: string;
}

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  confidence?: number;
  reasoning?: string;
  sources?: Array<{ id: string; snippet: string; metadata: Record<string, unknown> }>;
}

export default function Home() {
  const [sources, setSources] = useState<Source[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [isClient, setIsClient] = useState(false);
  const [showDocumentsViewer, setShowDocumentsViewer] = useState(false);
  const [selectedSourceForViewer, setSelectedSourceForViewer] = useState<string>('all');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Client-side only state to avoid hydration issues
  useEffect(() => {
    setIsClient(true);
    loadSources();
  }, []);

  const loadSources = async () => {
    try {
      const response = await fetch('/api/debug');
      const data = await response.json();
      if (data.ok) {
        // Group documents by source
        const sourceMap = new Map<string, { count: number; lastUpdated: string }>();
        data.sampleDocuments?.forEach((doc: { metadata?: { source?: string } }) => {
          const source = doc.metadata?.source || 'unknown';
          if (!sourceMap.has(source)) {
            sourceMap.set(source, { count: 0, lastUpdated: new Date().toISOString() });
          }
          sourceMap.get(source)!.count++;
        });
        
        const sourcesList = Array.from(sourceMap.entries()).map(([source, info]) => ({
          id: source,
          source,
          count: info.count,
          lastUpdated: info.lastUpdated
        }));
        setSources(sourcesList);
      }
    } catch (error) {
      console.error('Failed to load sources:', error);
    }
  };

  const handleFileUpload = async (file: File, metadata: { source: string; description: string }) => {
    setUploadStatus('uploading');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('source', metadata.source || file.name);
      formData.append('description', metadata.description);

      const response = await fetch('/api/ingest', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        setUploadStatus('success');
        loadSources(); // Reload sources
        setTimeout(() => setUploadStatus('idle'), 3000);
      } else {
        throw new Error('Upload failed');
      }
    } catch {
      setUploadStatus('error');
      setTimeout(() => setUploadStatus('idle'), 3000);
    }
  };

  const handleTextUpload = async (text: string, metadata: { source: string; description: string }) => {
    setUploadStatus('uploading');
    try {
      const response = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text,
          metadata: {
            source: metadata.source || 'manual-input',
            description: metadata.description,
            timestamp: new Date().toISOString()
          }
        })
      });

      if (response.ok) {
        setUploadStatus('success');
        loadSources(); // Reload sources
        setTimeout(() => setUploadStatus('idle'), 3000);
      } else {
        throw new Error('Upload failed');
      }
    } catch {
      setUploadStatus('error');
      setTimeout(() => setUploadStatus('idle'), 3000);
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: inputMessage,
          k: 4,
          model: 'gpt-4o-mini',
          temperature: 0
        })
      });

      const data = await response.json();
      
      if (data.ok) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
          content: data.answer,
          timestamp: new Date(),
          confidence: data.confidence?.overallConfidence,
          reasoning: data.reasoning,
          sources: data.sources
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        throw new Error(data.error || 'Failed to get response');
      }
    } catch {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: 'Maaf, terjadi kesalahan dalam memproses pertanyaan Anda.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleViewDocuments = (sourceId: string) => {
    setSelectedSourceForViewer(sourceId);
    setShowDocumentsViewer(true);
  };

  const handleCloseDocumentsViewer = () => {
    setShowDocumentsViewer(false);
    setSelectedSourceForViewer('all');
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-6">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                  <Search className="w-6 h-6 text-white" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900">RAG Document Assistant</h1>
              </div>
              <div className="flex items-center space-x-4">
                            <Link
              href="/documents"
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <FileText className="w-4 h-4" />
              <span>View All Documents</span>
            </Link>
                <div className="text-sm text-gray-500">
                  Powered by AI • LangChain • Supabase
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left Sidebar - Document Upload & Sources */}
            <div className="lg:col-span-1 space-y-6">
              
              {/* Document Upload Section */}
              <UploadArea
                onFileUpload={handleFileUpload}
                onTextUpload={handleTextUpload}
                uploadStatus={uploadStatus}
              />

              {/* Sources List */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                    <Search className="w-5 h-5 mr-2 text-green-600" />
                    Available Sources
                  </h2>
                  <button
                    onClick={loadSources}
                    className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                    title="Refresh sources"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="space-y-3">
                  {!isClient ? (
                    // Loading skeleton while client-side rendering
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="bg-gray-100 rounded-lg p-4 animate-pulse">
                          <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
                          <div className="h-3 bg-gray-200 rounded w-1/4"></div>
                        </div>
                      ))}
                    </div>
                  ) : sources.length > 0 ? (
                                         sources.map((source) => (
                       <SourceCard
                         key={source.id}
                         source={source}
                         onViewDocuments={handleViewDocuments}
                       />
                     ))
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <Search className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p>No documents uploaded yet</p>
                      <p className="text-sm">Upload your first document to get started</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Side - Chat Interface */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 h-[600px] flex flex-col">
                
                {/* Chat Header */}
                <div className="p-6 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                    <MessageCircle className="w-5 h-5 mr-2 text-purple-600" />
                    Ask Questions About Your Documents
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Ask anything about the documents you&apos;ve uploaded. The AI will search through all sources to find the best answer.
                  </p>
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {messages.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <MessageCircle className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                      <h3 className="text-lg font-medium mb-2">Start a conversation</h3>
                      <p className="text-sm">Ask questions about your uploaded documents</p>
                    </div>
                  ) : (
                    messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg px-4 py-3 ${
                            message.type === 'user'
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 text-gray-900'
                          }`}
                        >
                          <div className="mb-2">{message.content}</div>
                          
                          {message.type === 'assistant' && message.confidence && (
                            <div className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-200">
                              <div className="flex items-center space-x-2">
                                <span>Confidence:</span>
                                <div className="flex items-center space-x-1">
                                  {[...Array(10)].map((_, i) => (
                                    <div
                                      key={i}
                                      className={`w-2 h-2 rounded-full ${
                                        i < message.confidence! ? 'bg-green-500' : 'bg-gray-300'
                                      }`}
                                    />
                                  ))}
                                </div>
                                <span className="text-xs">({message.confidence}/10)</span>
                              </div>
                            </div>
                          )}
                          
                          {message.type === 'assistant' && message.reasoning && (
                            <div className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-200">
                              <strong>Reasoning:</strong> {message.reasoning}
                            </div>
                          )}
                          
                          {message.type === 'assistant' && message.sources && message.sources.length > 0 && (
                            <div className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-200">
                              <strong>Sources:</strong> {message.sources.length} documents found
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                  
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-gray-100 text-gray-900 rounded-lg px-4 py-3">
                        <div className="flex items-center space-x-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Thinking...</span>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-6 border-t border-gray-200">
                  <div className="flex space-x-3">
                    <textarea
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Ask a question about your documents..."
                      className="flex-1 px-3 py-2 border text-black border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                      rows={2}
                      disabled={isLoading}
                    />
                    <button
                      onClick={sendMessage}
                      disabled={!inputMessage.trim() || isLoading}
                      className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                    >
                      {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Search className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Press Enter to send, Shift+Enter for new line
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Documents Viewer Modal */}
      <DocumentsViewer
        isOpen={showDocumentsViewer}
        onClose={handleCloseDocumentsViewer}
        selectedSource={selectedSourceForViewer}
      />
    </ErrorBoundary>
  );
}
