'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileText, Calendar, Hash, Eye, Filter, ChevronLeft, ChevronRight, RefreshCw, Loader2, Search, CheckCircle, XCircle, Maximize2, Minimize2 } from 'lucide-react';

interface Document {
  id: string;
  content: string;
  metadata: {
    source?: string;
    description?: string;
    filename?: string;
    fileSize?: number;
    fileType?: string;
    uploadedAt?: string;
    chunk?: number;
    chunkCount?: number;
    processedAt?: string;
  };
  created_at: string;
}

interface DocumentsViewerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedSource?: string;
}

export default function DocumentsViewer({ isOpen, onClose, selectedSource }: DocumentsViewerProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalDocuments, setTotalDocuments] = useState(0);
  const [sources, setSources] = useState<string[]>([]);
  const [selectedSourceFilter, setSelectedSourceFilter] = useState<string>(selectedSource || 'all');
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());
  const [fullscreenDoc, setFullscreenDoc] = useState<string | null>(null);
  
  // New state for answer verification
  const [verificationQuestion, setVerificationQuestion] = useState('');
  const [verificationAnswer, setVerificationAnswer] = useState('');
  const [verificationResult, setVerificationResult] = useState<{
    isCorrect: boolean;
    confidence: number;
    reasoning: string;
    sources: Array<{ id: string; snippet: string; metadata: Record<string, unknown> }>;
    foundInDocs: boolean;
    verificationReason: string; // Added for compact display
  } | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Document[]>([]);
  const [searching, setSearching] = useState(false);

  const limit = 10;

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: limit.toString(),
        source: selectedSourceFilter
      });

      const response = await fetch(`/api/documents?${params}`);
      const data = await response.json();

      if (data.ok) {
        setDocuments(data.documents || []);
        setTotalPages(data.pagination.totalPages || 1);
        setTotalDocuments(data.pagination.total || 0);
        setSources(data.sources || []);
      } else {
        console.error('Failed to load documents:', data.error);
      }
    } catch (error) {
      console.error('Error loading documents:', error);
    } finally {
      setLoading(false);
    }
  }, [currentPage, selectedSourceFilter]);

  useEffect(() => {
    if (isOpen) {
      loadDocuments();
    }
  }, [isOpen, loadDocuments]);

  useEffect(() => {
    if (selectedSource && selectedSource !== selectedSourceFilter) {
      setSelectedSourceFilter(selectedSource);
      setCurrentPage(1);
    }
  }, [selectedSource, selectedSourceFilter]);

  const toggleDocExpansion = (docId: string) => {
    const newExpanded = new Set(expandedDocs);
    if (newExpanded.has(docId)) {
      newExpanded.delete(docId);
    } else {
      newExpanded.add(docId);
    }
    setExpandedDocs(newExpanded);
  };

  const toggleFullscreen = (docId: string) => {
    if (fullscreenDoc === docId) {
      setFullscreenDoc(null);
    } else {
      setFullscreenDoc(docId);
    }
  };

  // New function to verify answer
  const verifyAnswer = async () => {
    if (!verificationQuestion.trim() || !verificationAnswer.trim()) {
      alert('Please enter both question and answer to verify');
      return;
    }

    setVerifying(true);
    try {
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: verificationQuestion,
          k: 6,
          model: 'gpt-4o-mini',
          temperature: 0
        })
      });

      const data = await response.json();
      
      if (data.ok) {
        // Check if the answer is found in the documents
        const foundInDocs = data.sources && data.sources.length > 0;
        
        setVerificationResult({
          isCorrect: data.confidence?.overallConfidence >= 7, // High confidence threshold
          confidence: data.confidence?.overallConfidence || 0,
          reasoning: data.reasoning || 'No reasoning provided',
          sources: data.sources || [],
          foundInDocs,
          verificationReason: foundInDocs ? 'Answer found in documents' : 'Answer not found in documents'
        });
      } else {
        setVerificationResult({
          isCorrect: false,
          confidence: 0,
          reasoning: 'Failed to verify answer',
          sources: [],
          foundInDocs: false,
          verificationReason: 'Verification failed'
        });
      }
    } catch (error) {
      console.error('Verification error:', error);
      setVerificationResult({
        isCorrect: false,
        confidence: 0,
        reasoning: 'Error during verification',
        sources: [],
        foundInDocs: false,
        verificationReason: 'Error during verification'
      });
    } finally {
      setVerifying(false);
    }
  };

  // New function to search documents
  const searchDocuments = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: searchQuery,
          k: 10,
          model: 'gpt-4o-mini',
          temperature: 0
        })
      });

      const data = await response.json();
      
      if (data.ok && data.sources) {
        // Convert sources to document format for display
        const searchDocs = data.sources.map((source: { id?: string; snippet?: string; metadata?: Record<string, unknown> }) => ({
          id: source.id || Math.random().toString(),
          content: source.snippet || 'No content available',
          metadata: source.metadata || {},
          created_at: new Date().toISOString()
        }));
        setSearchResults(searchDocs);
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('id-ID', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!isOpen) return null;

  // Fullscreen document view
  if (fullscreenDoc) {
    const doc = documents.find(d => d.id === fullscreenDoc);
    if (!doc) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col">
          {/* Fullscreen Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div>
              <h2 className="text-xl font-bold text-gray-900 flex items-center">
                <FileText className="w-5 h-5 mr-2 text-blue-600" />
                {doc.metadata?.source || 'Document'} - Full View
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Chunk {doc.metadata?.chunk || 'N/A'} • {formatDate(doc.created_at)}
              </p>
            </div>
            <button
              onClick={() => setFullscreenDoc(null)}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            >
              <Minimize2 className="w-5 h-5" />
            </button>
          </div>

          {/* Fullscreen Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="prose max-w-none">
              <div className="bg-gray-50 p-6 rounded-lg border">
                <h3 className="text-lg font-semibold mb-4 text-gray-900">Document Content</h3>
                <div className="text-gray-700 leading-relaxed whitespace-pre-wrap font-mono text-sm">
                  {doc.content}
                </div>
              </div>
              
              {/* Metadata */}
              <div className="mt-6 bg-white p-4 rounded-lg border">
                <h4 className="font-medium text-gray-900 mb-3">Document Metadata</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Source:</span>
                    <p className="font-medium">{doc.metadata?.source || 'Unknown'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Chunk:</span>
                    <p className="font-medium">{doc.metadata?.chunk || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">File Size:</span>
                    <p className="font-medium">{formatFileSize(doc.metadata?.fileSize)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">File Type:</span>
                    <p className="font-medium">{doc.metadata?.fileType || 'Unknown'}</p>
                  </div>
                  {doc.metadata?.description && (
                    <div className="col-span-2">
                      <span className="text-gray-500">Description:</span>
                      <p className="font-medium">{doc.metadata.description}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-7xl w-full max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center">
              <FileText className="w-6 h-6 mr-3 text-blue-600" />
              Documents Viewer
            </h2>
            <p className="text-gray-600 mt-1">
              {totalDocuments} documents found • Page {currentPage} of {totalPages}
            </p>
          </div>
          
          <div className="flex items-center space-x-3">
            <button
              onClick={loadDocuments}
              disabled={loading}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50"
              title="Refresh documents"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              title="Close viewer"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Answer Verification Section - Simplified */}
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center">
            <CheckCircle className="w-4 h-4 mr-2 text-green-600" />
            Answer Verification
          </h3>
          <div className="flex items-center space-x-3">
            <input
              type="text"
              value={verificationQuestion}
              onChange={(e) => setVerificationQuestion(e.target.value)}
              placeholder="Enter question to verify..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder-gray-900"
            />
            <input
              type="text"
              value={verificationAnswer}
              onChange={(e) => setVerificationAnswer(e.target.value)}
              placeholder="Enter answer to verify..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder-gray-900"
            />
            <button
              onClick={verifyAnswer}
              disabled={verifying || !verificationQuestion.trim() || !verificationAnswer.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center whitespace-nowrap"
            >
              {verifying ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-2" />
              )}
              Verify
            </button>
          </div>

          {/* Compact Verification Result */}
          {verificationResult && (
            <div className={`mt-3 p-3 rounded-md border text-sm ${
              verificationResult.isCorrect 
                ? 'bg-green-50 border-green-200' 
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`font-medium ${
                  verificationResult.isCorrect ? 'text-green-800' : 'text-red-800'
                }`}>
                  {verificationResult.isCorrect ? '✅ Verified' : '❌ Not Verified'}
                </span>
                <span className="text-gray-600">
                  Confidence: {verificationResult.confidence}/10 • 
                  Found: {verificationResult.foundInDocs ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="text-xs text-gray-700">
                <p><strong>Reason:</strong> {verificationResult.verificationReason}</p>
                <p><strong>LLM Reasoning:</strong> {verificationResult.reasoning}</p>
                {verificationResult.sources.length > 0 && (
                  <p><strong>Sources:</strong> {verificationResult.sources.length} documents found</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Document Search Section - Simplified */}
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-base font-semibold text-gray-900 mb-3 flex items-center">
            <Search className="w-4 h-4 mr-2 text-blue-600" />
            Search Documents
          </h3>
          <div className="flex items-center space-x-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder-gray-900"
            />
            <button
              onClick={searchDocuments}
              disabled={searching || !searchQuery.trim()}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center whitespace-nowrap"
            >
              {searching ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Search className="w-4 h-4 mr-2" />
              )}
              Search
            </button>
          </div>

          {/* Compact Search Results */}
          {searchResults.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Results: {searchResults.length}</span>
                <button
                  onClick={() => setSearchResults([])}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Clear
                </button>
              </div>
              <div className="max-h-32 overflow-y-auto space-y-2">
                {searchResults.slice(0, 3).map((doc) => (
                  <div key={doc.id} className="p-2 bg-white border border-gray-200 rounded text-xs">
                    <span className="font-medium text-gray-900">{doc.metadata?.source || 'Unknown'}</span>
                    <p className="text-gray-600 line-clamp-2">{doc.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Filters - Compact */}
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-900 flex items-center">
              <Filter className="w-4 h-4 mr-2 text-blue-600" />
              Filters
            </h3>
            <select
              value={selectedSourceFilter}
              onChange={(e) => {
                setSelectedSourceFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
            >
              <option value="all">All Sources</option>
              {sources.map((source) => (
                <option key={source} value={source}>{source}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Documents List - Focused and Taller */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <span className="ml-3 text-gray-600">Loading documents...</span>
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No documents found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {documents.map((doc) => (
                <div key={doc.id} className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">
                  {/* Document Header */}
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center shadow-sm">
                          <FileText className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h4 className="text-lg font-semibold text-gray-900 mb-1">
                            {doc.metadata?.source || 'Unknown Source'}
                          </h4>
                          <div className="flex items-center space-x-6 text-sm">
                            <span className="flex items-center text-gray-700 font-medium">
                              <Hash className="w-4 h-4 mr-2 text-blue-500" />
                              Chunk {doc.metadata?.chunk || 'N/A'}
                            </span>
                            <span className="flex items-center text-gray-700 font-medium">
                              <Calendar className="w-4 h-4 mr-2 text-blue-500" />
                              {formatDate(doc.created_at)}
                            </span>
                            {doc.metadata?.fileSize && (
                              <span className="flex items-center text-gray-700 font-medium">
                                <Eye className="w-4 h-4 mr-2 text-blue-500" />
                                {formatFileSize(doc.metadata.fileSize)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => toggleFullscreen(doc.id)}
                          className="p-3 text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-all duration-200 shadow-sm"
                          title="Fullscreen view"
                        >
                          <Maximize2 className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => toggleDocExpansion(doc.id)}
                          className="p-3 text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-all duration-200 shadow-sm"
                          title={expandedDocs.has(doc.id) ? 'Collapse content' : 'Expand content'}
                        >
                          {expandedDocs.has(doc.id) ? (
                            <ChevronLeft className="w-5 h-5" />
                          ) : (
                            <ChevronRight className="w-5 h-5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  {/* Document Content - Much Taller */}
                  <div className="px-6 py-5">
                    <div className={`transition-all duration-300 ease-in-out ${
                      expandedDocs.has(doc.id) ? 'max-h-none' : 'max-h-48'
                    } overflow-hidden`}>
                      <div className={`text-gray-900 leading-relaxed text-base ${
                        expandedDocs.has(doc.id) ? '' : 'line-clamp-6'
                      }`}>
                        {doc.content}
                      </div>
                      
                      {expandedDocs.has(doc.id) && (
                        <div className="mt-6 pt-6 border-t border-gray-200">
                          <h5 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Document Details</h5>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                            <div className="bg-gray-50 p-4 rounded-lg">
                              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">File Size</span>
                              <p className="text-sm font-semibold text-gray-900">{formatFileSize(doc.metadata?.fileSize)}</p>
                            </div>
                            <div className="bg-gray-50 p-4 rounded-lg">
                              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">File Type</span>
                              <p className="text-sm font-semibold text-gray-900">{doc.metadata?.fileType || 'Unknown'}</p>
                            </div>
                            <div className="bg-gray-50 p-4 rounded-lg">
                              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Chunk Count</span>
                              <p className="text-sm font-semibold text-gray-900">{doc.metadata?.chunkCount || 'N/A'}</p>
                            </div>
                            <div className="bg-gray-50 p-4 rounded-lg">
                              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Upload Date</span>
                              <p className="text-sm font-semibold text-gray-900">{formatDate(doc.created_at)}</p>
                            </div>
                          </div>
                          
                          {doc.metadata?.description && (
                            <div className="mt-6 bg-blue-50 p-4 rounded-lg border border-blue-200">
                              <span className="text-xs font-medium text-blue-600 uppercase tracking-wide block mb-2">Description</span>
                              <p className="text-sm text-blue-900">{doc.metadata.description}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {/* Expand/Collapse Indicator */}
                    <div className="mt-4 flex items-center justify-center">
                      <button
                        onClick={() => toggleDocExpansion(doc.id)}
                        className="text-blue-600 hover:text-blue-700 text-sm font-medium hover:bg-blue-50 px-3 py-2 rounded-lg transition-colors flex items-center space-x-2"
                      >
                        {expandedDocs.has(doc.id) ? (
                          <>
                            <span>Show Less</span>
                            <ChevronLeft className="w-4 h-4" />
                          </>
                        ) : (
                          <>
                            <span>Read More</span>
                            <ChevronRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-6 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Showing page {currentPage} of {totalPages}
              </div>
              
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                
                <span className="px-3 py-2 text-sm text-gray-700">
                  {currentPage}
                </span>
                
                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


