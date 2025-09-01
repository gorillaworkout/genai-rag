'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, FileText, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface UploadAreaProps {
  onFileUpload: (file: File, metadata: { source: string; description: string }) => Promise<void>;
  onTextUpload: (text: string, metadata: { source: string; description: string }) => Promise<void>;
  uploadStatus: 'idle' | 'uploading' | 'success' | 'error';
}

export default function UploadArea({ onFileUpload, onTextUpload, uploadStatus }: UploadAreaProps) {
  const [isClient, setIsClient] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadText, setUploadText] = useState('');
  const [uploadMetadata, setUploadMetadata] = useState({ source: '', description: '' });
  const [activeTab, setActiveTab] = useState<'file' | 'text'>('file');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Ensure client-side only rendering
  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
        onFileUpload(file, uploadMetadata);
      } else {
        alert('Please upload a text file (.txt, .md)');
      }
    }
  }, [onFileUpload, uploadMetadata]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onFileUpload(file, uploadMetadata);
    }
  };

  const handleTextSubmit = () => {
    if (uploadText.trim()) {
      onTextUpload(uploadText, uploadMetadata);
    }
  };

  const resetForm = () => {
    setUploadText('');
    setUploadMetadata({ source: '', description: '' });
  };

  // Show loading skeleton while client-side rendering
  if (!isClient) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            <div className="h-32 bg-gray-200 rounded"></div>
            <div className="h-10 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
        <Upload className="w-5 h-5 mr-2 text-blue-600" />
        Upload Documents
      </h2>

      {/* Tab Navigation */}
      <div className="flex space-x-1 mb-4 bg-gray-100 p-1 rounded-lg">
        <button
          onClick={() => setActiveTab('file')}
          className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'file'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <FileText className="w-4 h-4 inline mr-2" />
          File Upload
        </button>
        <button
          onClick={() => setActiveTab('text')}
          className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'text'
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <FileText className="w-4 h-4 inline mr-2" />
          Text Input
        </button>
      </div>

      {activeTab === 'file' ? (
        /* File Upload Tab */
        <div className="space-y-4">
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-all ${
              isDragOver
                ? 'border-blue-400 bg-blue-50'
                : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              accept=".txt,.md,.pdf,.doc,.docx"
              className="hidden"
            />
            
            <Upload className={`w-12 h-12 mx-auto mb-4 ${isDragOver ? 'text-blue-600' : 'text-gray-400'}`} />
            
            <div className="space-y-2">
              <p className="text-lg font-medium text-gray-900">
                {isDragOver ? 'Drop your file here' : 'Choose a file or drag and drop'}
              </p>
              <p className="text-sm text-gray-500">
                Supports: TXT, MD, PDF, DOC, DOCX
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors"
              >
                Browse Files
              </button>
            </div>
          </div>

          {/* Metadata Inputs */}
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              value={uploadMetadata.source}
              onChange={(e) => setUploadMetadata(prev => ({ ...prev, source: e.target.value }))}
              placeholder="Source name (e.g., docs-langchain)"
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
            />
            <input
              type="text"
              value={uploadMetadata.description}
              onChange={(e) => setUploadMetadata(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Description (optional)"
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
            />
          </div>
        </div>
      ) : (
        /* Text Input Tab */
        <div className="space-y-4">
          <textarea
            value={uploadText}
            onChange={(e) => setUploadText(e.target.value)}
            placeholder="Paste your text content here...\n\nYou can paste articles, documentation, or any text content you want to make searchable."
            className="w-full h-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-black
            "
          />
          
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              value={uploadMetadata.source}
              onChange={(e) => setUploadMetadata(prev => ({ ...prev, source: e.target.value }))}
              placeholder="Source name (e.g., manual-input)"
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
            />
            <input
              type="text"
              value={uploadMetadata.description}
              onChange={(e) => setUploadMetadata(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Description (optional)"
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
            />
          </div>

          <div className="flex space-x-3">
            <button
              onClick={handleTextSubmit}
              disabled={!uploadText.trim() || uploadStatus === 'uploading'}
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
            >
              {uploadStatus === 'uploading' && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {uploadStatus === 'success' && <CheckCircle className="w-4 h-4 mr-2 text-green-500" />}
              {uploadStatus === 'error' && <AlertCircle className="w-4 h-4 mr-2 text-red-500" />}
              {uploadStatus === 'idle' && 'Upload Text'}
              {uploadStatus === 'success' && 'Uploaded Successfully!'}
              {uploadStatus === 'error' && 'Upload Failed'}
            </button>
            
            <button
              onClick={resetForm}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Status Messages */}
      {uploadStatus === 'success' && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
          <div className="flex items-center space-x-2 text-green-800">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm font-medium">Document uploaded successfully!</span>
          </div>
        </div>
      )}

      {uploadStatus === 'error' && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-center space-x-2 text-red-800">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm font-medium">Upload failed. Please try again.</span>
          </div>
        </div>
      )}
    </div>
  );
}
