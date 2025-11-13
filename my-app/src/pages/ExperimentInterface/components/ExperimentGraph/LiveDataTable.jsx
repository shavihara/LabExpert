import React, { useState, useMemo, useEffect } from 'react';
import { FiMaximize2, FiMinimize2, FiDownload, FiCopy, FiEye, FiEyeOff } from 'react-icons/fi';

const LiveDataTable = ({ data, isFullscreen, onToggleFullscreen, onNeglectedDataChange, neglectedData: propNeglectedData }) => {
  const [sortConfig, setSortConfig] = useState({ key: 'time', direction: 'ascending' });
  const [localNeglectedData, setLocalNeglectedData] = useState(new Set());
  
  // Use propNeglectedData if provided, otherwise use local state
  const neglectedData = propNeglectedData !== undefined ? propNeglectedData : localNeglectedData;
  const setNeglectedData = propNeglectedData !== undefined ? onNeglectedDataChange : setLocalNeglectedData;

  const sortedData = useMemo(() => {
    if (!data.length) return [];
    
    let sortableData = [...data];
    if (sortConfig.key) {
      sortableData.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableData;
  }, [data, sortConfig]);

  const requestSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const exportToCSV = () => {
    if (!data.length) return;
    
    const headers = Object.keys(data[0]).join(',');
    const csvContent = [
      headers,
      ...data.map(row => 
        Object.values(row).map(value => 
          typeof value === 'string' && value.includes(',') ? `"${value}"` : value
        ).join(',')
      )
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `experiment_data_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const copyToClipboard = async () => {
    if (!data.length) return;
    
    const csvContent = [
      Object.keys(data[0]).join('\t'),
      ...data.map(row => Object.values(row).join('\t'))
    ].join('\n');
    
    try {
      await navigator.clipboard.writeText(csvContent);
      alert('✓ Data copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy:', err);
      alert('❌ Failed to copy data to clipboard');
    }
  };

  const toggleNeglectData = (index) => {
    const newNeglectedData = new Set(neglectedData);
    if (newNeglectedData.has(index)) {
      newNeglectedData.delete(index);
    } else {
      newNeglectedData.add(index);
    }
    setNeglectedData(newNeglectedData);
  };

  const clearAllNeglected = () => {
    setNeglectedData(new Set());
  };

  const neglectAll = () => {
    const allIndices = new Set(data.map((_, index) => index));
    setNeglectedData(allIndices);
  };

  // Notify parent component when neglected data changes
  useEffect(() => {
    if (onNeglectedDataChange) {
      onNeglectedDataChange(neglectedData);
    }
  }, [neglectedData, onNeglectedDataChange]);

  if (!data.length) {
    return (
      <div className="bg-slate-50 rounded-xl p-8 text-center">
        <div className="text-slate-400 mb-2">
          <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-slate-600 mb-1">No Data Yet</h3>
        <p className="text-slate-500 text-sm">Start the experiment to see live data here</p>
      </div>
    );
  }

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50 bg-white p-4' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">Live Data Table</h3>
          <p className="text-sm text-slate-500">
            {data.length} samples recorded
            {neglectedData.size > 0 && (
              <span className="ml-2 text-orange-600">
                ({neglectedData.size} neglected)
              </span>
            )}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {neglectedData.size > 0 && (
            <button
              onClick={clearAllNeglected}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 transition-all"
            >
              <FiEye size={14} /> Show All
            </button>
          )}
          <button
            onClick={neglectAll}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-all"
          >
            <FiEyeOff size={14} /> Neglect All
          </button>
          <button
            onClick={exportToCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-all"
          >
            <FiDownload size={14} /> CSV
          </button>
          
          <button
            onClick={copyToClipboard}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-all"
          >
            <FiCopy size={14} /> Copy
          </button>
          
          <button
            onClick={onToggleFullscreen}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-600 text-white rounded-lg text-sm font-medium hover:bg-slate-700 transition-all"
          >
            {isFullscreen ? <FiMinimize2 size={14} /> : <FiMaximize2 size={14} />}
            {isFullscreen ? ' Exit' : ' Fullscreen'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  Neglect
                </th>
                {Object.keys(data[0]).map((key) => (
                  <th
                    key={key}
                    onClick={() => requestSort(key)}
                    className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                      {sortConfig.key === key && (
                        <span>
                          {sortConfig.direction === 'ascending' ? '↑' : '↓'}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {sortedData.map((row, sortedIndex) => {
                // Use the unique index stored in the row data (added by parent component)
                const originalIndex = row.__originalIndex || sortedIndex;
                const isNeglected = neglectedData.has(originalIndex);
                return (
                  <tr 
                    key={originalIndex} 
                    className={`hover:bg-slate-50 transition-colors ${isNeglected ? 'bg-slate-100 opacity-60' : ''}`}
                  >
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={isNeglected}
                        onChange={() => toggleNeglectData(originalIndex)}
                        className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                    </td>
                    {Object.values(row).map((value, cellIndex) => (
                      <td
                        key={cellIndex}
                        className="px-4 py-3 text-sm text-slate-700 font-mono"
                      >
                        {typeof value === 'number' ? value.toFixed(4) : value}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Info */}
      <div className="mt-3 text-xs text-slate-500 text-center">
        Showing {Math.min(data.length, 100)} of {data.length} records
        {data.length > 100 && ' (first 100 shown)'}
      </div>
    </div>
  );
};

export default LiveDataTable;