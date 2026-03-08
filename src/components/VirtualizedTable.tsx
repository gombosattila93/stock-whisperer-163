import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

interface VirtualizedTableProps<T> {
  data: T[];
  columns: {
    key: string;
    header: React.ReactNode;
    render: (item: T) => React.ReactNode;
    className?: string;
  }[];
  rowKey: (item: T) => string;
  rowClassName?: (item: T) => string;
  estimateSize?: number;
  onRowClick?: (item: T) => void;
  /** Below this count, render normally without virtualization */
  virtualThreshold?: number;
}

export function VirtualizedTable<T>({
  data,
  columns,
  rowKey,
  rowClassName,
  estimateSize = 44,
  onRowClick,
  virtualThreshold = 200,
}: VirtualizedTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: 20,
  });

  // For small datasets, skip virtualization
  if (data.length < virtualThreshold) {
    return (
      <div className="overflow-auto">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col.key} className={col.className}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map(item => (
              <tr
                key={rowKey(item)}
                className={`${rowClassName?.(item) || ''} ${onRowClick ? 'cursor-pointer' : ''}`}
                onClick={() => onRowClick?.(item)}
              >
                {columns.map(col => (
                  <td key={col.key}>{col.render(item)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div ref={parentRef} className="overflow-auto max-h-[70vh]">
      <table className="data-table">
        <thead className="sticky top-0 z-10">
          <tr>
            {columns.map(col => (
              <th key={col.key} className={col.className}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Spacer for items before visible range */}
          {rowVirtualizer.getVirtualItems().length > 0 && (
            <tr style={{ height: rowVirtualizer.getVirtualItems()[0]?.start || 0 }}>
              <td colSpan={columns.length} className="p-0 border-0" />
            </tr>
          )}
          {rowVirtualizer.getVirtualItems().map(virtualRow => {
            const item = data[virtualRow.index];
            return (
              <tr
                key={rowKey(item)}
                className={`${rowClassName?.(item) || ''} ${onRowClick ? 'cursor-pointer' : ''}`}
                onClick={() => onRowClick?.(item)}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
              >
                {columns.map(col => (
                  <td key={col.key}>{col.render(item)}</td>
                ))}
              </tr>
            );
          })}
          {/* Spacer for items after visible range */}
          {rowVirtualizer.getVirtualItems().length > 0 && (
            <tr style={{
              height: rowVirtualizer.getTotalSize() -
                (rowVirtualizer.getVirtualItems().at(-1)?.end || 0),
            }}>
              <td colSpan={columns.length} className="p-0 border-0" />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
