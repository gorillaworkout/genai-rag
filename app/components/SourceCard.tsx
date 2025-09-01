'use client';

import { Calendar, Hash, Eye } from 'lucide-react';

interface SourceCardProps {
  source: {
    id: string;
    source: string;
    count: number;
    lastUpdated: string;
  };
  onViewDocuments?: (sourceId: string) => void;
}

export default function SourceCard({ source, onViewDocuments }: SourceCardProps) {
  const getSourceIcon = (sourceName: string) => {
    if (sourceName.includes('langchain')) return '🔗';
    if (sourceName.includes('fitur')) return '⚙️';
    if (sourceName.includes('manual')) return '✏️';
    return '📄';
  };

  const getSourceColor = (sourceName: string) => {
    if (sourceName.includes('langchain')) return 'from-blue-500 to-blue-600';
    if (sourceName.includes('fitur')) return 'from-green-500 to-green-600';
    if (sourceName.includes('manual')) return 'from-purple-500 to-purple-600';
    return 'from-gray-500 to-gray-600';
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3">
          <div className={`w-10 h-10 bg-gradient-to-r ${getSourceColor(source.source)} rounded-lg flex items-center justify-center text-white text-lg`}>
            {getSourceIcon(source.source)}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 text-sm">{source.source}</h3>
            <div className="flex items-center space-x-4 text-xs text-gray-500 mt-1">
              <div className="flex items-center space-x-1">
                <Hash className="w-3 h-3" />
                <span>{source.count} docs</span>
              </div>
              <div className="flex items-center space-x-1">
                <Calendar className="w-3 h-3" />
                <span>{new Date(source.lastUpdated).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </div>
        
                       {onViewDocuments && (
                 <button
                   onClick={() => onViewDocuments(source.source)}
                   className="text-blue-600 hover:text-blue-700 p-1 rounded hover:bg-blue-50 transition-colors"
                   title="View documents"
                 >
                   <Eye className="w-4 h-4" />
                 </button>
               )}
      </div>
      
      <div className="mt-3 pt-3 border-t border-gray-100">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Last updated</span>
          <span className="text-gray-700 font-medium">
            {new Date(source.lastUpdated).toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
