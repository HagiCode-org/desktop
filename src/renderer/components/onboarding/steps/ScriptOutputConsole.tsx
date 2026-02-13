import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { Terminal } from 'lucide-react';
import { selectScriptOutputLogs } from '../../../store/slices/onboardingSlice';
import type { RootState } from '../../../store';
import type { ScriptOutput } from '../../../../types/onboarding';

interface ScriptOutputConsoleProps {
  maxHeight?: string;
  title?: string;
}

export function ScriptOutputConsole({ maxHeight = '200px', title = 'Console Output' }: ScriptOutputConsoleProps) {
  const logs = useSelector((state: RootState) => selectScriptOutputLogs(state));
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  if (logs.length === 0) {
    return null;
  }

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const renderLogLine = (log: ScriptOutput, index: number) => {
    const isStderr = log.type === 'stderr';
    const textColor = isStderr ? 'text-red-400' : 'text-green-400';

    return (
      <div
        key={`${log.timestamp}-${index}`}
        className={`font-mono text-xs leading-relaxed ${textColor} whitespace-pre-wrap break-all`}
      >
        <span className="text-gray-500 mr-2">{formatTimestamp(log.timestamp)}</span>
        <span>{log.data}</span>
      </div>
    );
  };

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 border-b border-gray-700">
        <Terminal className="w-4 h-4 text-gray-400" />
        <span className="text-sm text-gray-300 font-medium">{title}</span>
        <span className="text-xs text-gray-500 ml-auto">{logs.length} lines</span>
      </div>

      {/* Console content */}
      <div
        ref={containerRef}
        className="p-3 overflow-y-auto bg-gray-950"
        style={{ maxHeight }}
      >
        {logs.map((log, index) => renderLogLine(log, index))}
      </div>
    </div>
  );
}
