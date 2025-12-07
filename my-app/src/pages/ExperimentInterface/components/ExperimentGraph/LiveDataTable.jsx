import React, { useState, useMemo, useEffect, useRef } from 'react';
import { FiMaximize2, FiMinimize2, FiDownload, FiCopy, FiEye, FiEyeOff } from 'react-icons/fi';
import { useFullscreen } from '../../../../context/FullscreenContext';

const LiveDataTable = ({ data, isFullscreen, onToggleFullscreen, onNeglectedDataChange, neglectedData: propNeglectedData, columns, hideNeglectColumn = false, hideSampleColumn = false, hideCopyButton = false, hideNeglectAllButton = false, hideCsvButton = false, containerClassName = '', visibleRowCount, onContainerRef }) => {
  const [sortConfig, setSortConfig] = useState({ key: 'time', direction: 'ascending' });
  const [localNeglectedData, setLocalNeglectedData] = useState(new Set());
  const tableRef = useRef(null);
  const theadRef = useRef(null);
  const [rowHeight, setRowHeight] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const containerRef = useRef(null);
  const { fullscreenElement, requestFullscreenFor, exitFullscreen } = useFullscreen();
  const activeFullscreen = fullscreenElement === containerRef.current || !!isFullscreen;

  useEffect(() => {
    if (onContainerRef) onContainerRef(containerRef.current);
  }, [onContainerRef]);
  
  // Use propNeglectedData if provided, otherwise use local state
  const neglectedData = propNeglectedData !== undefined ? propNeglectedData : localNeglectedData;
  const setNeglectedData = propNeglectedData !== undefined ? onNeglectedDataChange : setLocalNeglectedData;

  const displayColumns = useMemo(() => {
    const baseCols = columns && columns.length ? columns : Object.keys(data[0] || {}).filter(k => k !== '__originalIndex').map(k => ({ key: k, label: k }));
    return hideSampleColumn ? baseCols.filter(c => c.key !== 'sample') : baseCols;
  }, [columns, data, hideSampleColumn]);

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

  useEffect(() => {
    if (!tableRef.current) return;
    const headH = theadRef.current ? theadRef.current.getBoundingClientRect().height : 0;
    setHeaderHeight(headH);
    const r = tableRef.current.querySelector('tbody tr');
    if (r) {
      const h = r.getBoundingClientRect().height;
      setRowHeight(h);
    }
  }, [sortedData, displayColumns, isFullscreen]);

  const requestSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const exportToCSV = () => {
    if (!data.length) return;
    
    const cols = displayColumns;
    const headers = `${cols.map(c => c.label).join(',')},Neglected`;
    const csvRows = data.map((row, idx) => {
      const originalIndex = row.__originalIndex ?? idx;
      const neg = neglectedData.has(originalIndex) ? 'neglected' : '';
      const base = cols.map(c => {
        const value = row[c.key];
        if (typeof value === 'string' && value.includes(',')) return `"${value}"`;
        return value;
      }).join(',');
      return `${base},${neg}`;
    });
    const csvContent = [headers, ...csvRows].join('\n');
    
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
    
    const cols = displayColumns;
    const tsvRows = data.map(row => cols.map(c => row[c.key]).join('\t'));
    const tsvContent = [cols.map(c => c.label).join('\t'), ...tsvRows].join('\n');
    
    try {
      await navigator.clipboard.writeText(tsvContent);
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
    const allIndices = new Set(data.map((row, index) => row.__originalIndex ?? index));
    setNeglectedData(allIndices);
  };

  // Notify parent component when neglected data changes (only in uncontrolled mode)
  useEffect(() => {
    if (onNeglectedDataChange && propNeglectedData === undefined) {
      onNeglectedDataChange(neglectedData);
    }
  }, [neglectedData, onNeglectedDataChange, propNeglectedData]);

  if (!data.length) {
    return (
      <div ref={containerRef} className={`${activeFullscreen ? 'fixed inset-0 z-50 bg-white p-4 overflow-auto' : ''} ${containerClassName} h-full`}>
        <div className="flex items-center justify-center h-full min-h-[240px] p-6">
          <div className="text-center">
            <div className="text-slate-400 mb-2">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-600 mb-1">No Data Yet</h3>
            <p className="text-slate-500 text-sm">Start the experiment to see live data here</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`${activeFullscreen ? 'fixed inset-0 z-50 bg-white p-4 overflow-auto' : ''} ${containerClassName}`}>
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
        
        <div className="flex flex-wrap items-center justify-end gap-1 sm:gap-2">
          {neglectedData.size > 0 && (
            <button
              onClick={clearAllNeglected}
              aria-label="Show All"
              className="flex items-center gap-1 p-2 sm:px-3 sm:py-1.5 bg-orange-600 text-white rounded-lg text-xs sm:text-sm font-medium hover:bg-orange-700 transition-all"
            >
              <FiEye size={16} />
              <span className="hidden sm:inline">Show All</span>
            </button>
          )}
          {!hideNeglectAllButton && (
          <button
            onClick={neglectAll}
            aria-label="Neglect All"
            className="flex items-center gap-1 p-2 sm:px-3 sm:py-1.5 bg-gray-600 text-white rounded-lg text-xs sm:text-sm font-medium hover:bg-gray-700 transition-all"
          >
            <FiEyeOff size={16} />
            <span className="hidden sm:inline">Neglect All</span>
          </button>
          )}
          {!hideCsvButton && (
          <button
            onClick={exportToCSV}
            aria-label="Export CSV"
            className="flex items-center gap-1 p-2 sm:px-3 sm:py-1.5 bg-green-600 text-white rounded-lg text-xs sm:text-sm font-medium hover:bg-green-700 transition-all"
          >
            <FiDownload size={16} />
            <span className="hidden sm:inline">CSV</span>
          </button>
          )}
          
          {!hideCopyButton && (
          <button
            onClick={copyToClipboard}
            aria-label="Copy"
            className="flex items-center gap-1 p-2 sm:px-3 sm:py-1.5 bg-blue-600 text-white rounded-lg text-xs sm:text-sm font-medium hover:bg-blue-700 transition-all"
          >
            <FiCopy size={16} />
            <span className="hidden sm:inline">Copy</span>
          </button>
          )}
          
          <button
            onClick={async () => {
              if (fullscreenElement === containerRef.current) {
                await exitFullscreen();
              } else {
                await requestFullscreenFor(containerRef.current);
              }
              if (onToggleFullscreen) onToggleFullscreen();
            }}
            aria-label={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            className="flex items-center gap-1 p-2 sm:px-3 sm:py-1.5 bg-slate-600 text-white rounded-lg text-xs sm:text-sm font-medium hover:bg-slate-700 transition-all"
          >
            {activeFullscreen ? <FiMinimize2 size={16} /> : <FiMaximize2 size={16} />}
            <span className="hidden sm:inline">{activeFullscreen ? 'Exit' : 'Fullscreen'}</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto" style={
          activeFullscreen
            ? { maxHeight: 'calc(100vh - 200px)' }
            : (visibleRowCount && rowHeight ? { maxHeight: headerHeight + rowHeight * visibleRowCount } : undefined)
        }>
          <table ref={tableRef} className="w-full">
            <thead ref={theadRef} className="bg-slate-50">
              <tr>
                {!hideNeglectColumn && (
                  <th className="px-3 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    Neglect
                  </th>
                )}
                {displayColumns.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => requestSort(col.key)}
                    className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      {sortConfig.key === col.key && (
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
                    {!hideNeglectColumn && (
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={isNeglected}
                          onChange={() => toggleNeglectData(originalIndex)}
                          className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                      </td>
                    )}
                    {displayColumns.map((col, cellIndex) => {
                      const value = row[col.key];
                      const precision = typeof col.precision === 'number' ? col.precision : (col.format === 'int' ? 0 : 4);
                      const formatted = typeof value === 'number' ? value.toFixed(precision) : value;
                      return (
                        <td key={cellIndex} className="px-4 py-3 text-sm text-slate-700 font-mono">
                          {formatted}
                        </td>
                      );
                    })}
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
