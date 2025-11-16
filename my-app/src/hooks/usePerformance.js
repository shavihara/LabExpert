import { useEffect, useRef, useCallback } from 'react';

// Performance monitoring hook
export const usePerformanceMonitor = (componentName) => {
  const renderCount = useRef(0);
  const startTime = useRef(performance.now());

  useEffect(() => {
    renderCount.current += 1;
    const endTime = performance.now();
    const renderTime = endTime - startTime.current;
    
    if (renderTime > 16) { // More than 1 frame (60fps)
      console.warn(`Slow render detected: ${componentName} took ${renderTime.toFixed(2)}ms`);
    }

    return () => {
      startTime.current = performance.now();
    };
  });

  return {
    renderCount: renderCount.current,
    resetCounter: () => { renderCount.current = 0; }
  };
};

// Memoization hook for expensive calculations
export const useMemoizedCalculation = (calculationFunction, dependencies) => {
  const cache = useRef(new Map());
  const depsString = JSON.stringify(dependencies);

  const cachedResult = cache.current.get(depsString);
  if (cachedResult !== undefined) {
    return cachedResult;
  }

  const result = calculationFunction();
  cache.current.set(depsString, result);
  
  // Limit cache size to prevent memory leaks
  if (cache.current.size > 100) {
    const firstKey = cache.current.keys().next().value;
    cache.current.delete(firstKey);
  }

  return result;
};

// Debounced callback hook
export const useDebouncedCallback = (callback, delay) => {
  const timeoutRef = useRef(null);
  const callbackRef = useRef(callback);

  // Update callback ref when callback changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const debouncedCallback = useCallback((...args) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      callbackRef.current(...args);
    }, delay);
  }, [delay]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return debouncedCallback;
};

// Throttled callback hook
export const useThrottledCallback = (callback, delay) => {
  const lastCallRef = useRef(0);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const throttledCallback = useCallback((...args) => {
    const now = Date.now();
    if (now - lastCallRef.current >= delay) {
      lastCallRef.current = now;
      callbackRef.current(...args);
    }
  }, [delay]);

  return throttledCallback;
};

// Intersection observer hook for lazy loading
export const useIntersectionObserver = (options) => {
  const [entry, setEntry] = useState(null);
  const [node, setNode] = useState(null);

  const observer = useRef(null);

  useEffect(() => {
    if (observer.current) observer.current.disconnect();

    observer.current = new window.IntersectionObserver(([entry]) => setEntry(entry), options);

    const { current: currentObserver } = observer;
    if (node) currentObserver.observe(node);

    return () => currentObserver.disconnect();
  }, [node, options]);

  return [setNode, entry];
};

// Virtualization hook for large lists
export const useVirtualization = (items, itemHeight, containerHeight) => {
  const [scrollTop, setScrollTop] = useState(0);
  const [startIndex, setStartIndex] = useState(0);
  const [endIndex, setEndIndex] = useState(0);

  const totalHeight = items.length * itemHeight;
  const visibleItemCount = Math.ceil(containerHeight / itemHeight);

  useEffect(() => {
    const start = Math.floor(scrollTop / itemHeight);
    const end = start + visibleItemCount + 1; // +1 for buffer
    
    setStartIndex(Math.max(0, start));
    setEndIndex(Math.min(items.length, end));
  }, [scrollTop, itemHeight, visibleItemCount, items.length]);

  const visibleItems = items.slice(startIndex, endIndex);
  const offsetY = startIndex * itemHeight;

  return {
    visibleItems,
    totalHeight,
    offsetY,
    handleScroll: (e) => setScrollTop(e.target.scrollTop)
  };
};

// Web worker hook for heavy computations
export const useWebWorker = (workerScript) => {
  const workerRef = useRef(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    workerRef.current = new Worker(workerScript);
    
    workerRef.current.onmessage = (event) => {
      setResult(event.data);
      setIsProcessing(false);
    };

    workerRef.current.onerror = (error) => {
      setError(error);
      setIsProcessing(false);
    };

    return () => {
      workerRef.current.terminate();
    };
  }, [workerScript]);

  const postMessage = (data) => {
    setIsProcessing(true);
    setError(null);
    workerRef.current.postMessage(data);
  };

  return { result, error, isProcessing, postMessage };
};