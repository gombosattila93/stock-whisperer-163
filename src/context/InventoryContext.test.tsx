import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { InventoryProvider, useInventory } from './InventoryContext';
import { sampleCsv } from '@/lib/sampleData';

// Test component to access context
function TestConsumer({ onMount }: { onMount: (ctx: ReturnType<typeof useInventory>) => void }) {
  const ctx = useInventory();
  onMount(ctx);
  return (
    <div>
      <span data-testid="hasData">{ctx.hasData.toString()}</span>
      <span data-testid="analysisCount">{ctx.analysis.length}</span>
      <span data-testid="filteredCount">{ctx.filtered.length}</span>
      <span data-testid="demandDays">{ctx.demandDays}</span>
      <span data-testid="filterSupplier">{ctx.filterSupplier}</span>
      <span data-testid="filterCategory">{ctx.filterCategory}</span>
      <span data-testid="searchQuery">{ctx.searchQuery}</span>
    </div>
  );
}

describe('InventoryContext', () => {
  describe('initial state', () => {
    it('should have no data initially', () => {
      let ctx: ReturnType<typeof useInventory>;
      render(
        <InventoryProvider>
          <TestConsumer onMount={(c) => { ctx = c; }} />
        </InventoryProvider>
      );

      expect(screen.getByTestId('hasData').textContent).toBe('false');
      expect(screen.getByTestId('analysisCount').textContent).toBe('0');
      expect(screen.getByTestId('filteredCount').textContent).toBe('0');
    });

    it('should have default demandDays of 90', () => {
      render(
        <InventoryProvider>
          <TestConsumer onMount={() => {}} />
        </InventoryProvider>
      );

      expect(screen.getByTestId('demandDays').textContent).toBe('90');
    });

    it('should have empty filters initially', () => {
      render(
        <InventoryProvider>
          <TestConsumer onMount={() => {}} />
        </InventoryProvider>
      );

      expect(screen.getByTestId('filterSupplier').textContent).toBe('');
      expect(screen.getByTestId('filterCategory').textContent).toBe('');
      expect(screen.getByTestId('searchQuery').textContent).toBe('');
    });
  });

  describe('loadSample', () => {
    it('should load sample data and set hasData to true', async () => {
      let ctx: ReturnType<typeof useInventory>;
      render(
        <InventoryProvider>
          <TestConsumer onMount={(c) => { ctx = c; }} />
        </InventoryProvider>
      );

      await act(async () => {
        await ctx!.loadSample();
      });

      await waitFor(() => {
        expect(screen.getByTestId('hasData').textContent).toBe('true');
      });
    });

    it('should populate analysis after loading sample', async () => {
      let ctx: ReturnType<typeof useInventory>;
      render(
        <InventoryProvider>
          <TestConsumer onMount={(c) => { ctx = c; }} />
        </InventoryProvider>
      );

      await act(async () => {
        await ctx!.loadSample();
      });

      await waitFor(() => {
        expect(parseInt(screen.getByTestId('analysisCount').textContent!)).toBeGreaterThan(0);
      });
    });

    it('should extract unique suppliers from loaded data', async () => {
      let ctx: ReturnType<typeof useInventory>;
      render(
        <InventoryProvider>
          <TestConsumer onMount={(c) => { ctx = c; }} />
        </InventoryProvider>
      );

      await act(async () => {
        await ctx!.loadSample();
      });

      await waitFor(() => {
        expect(ctx!.suppliers.length).toBeGreaterThan(0);
        // Suppliers should be sorted
        const sorted = [...ctx!.suppliers].sort();
        expect(ctx!.suppliers).toEqual(sorted);
      });
    });

    it('should extract unique categories from loaded data', async () => {
      let ctx: ReturnType<typeof useInventory>;
      render(
        <InventoryProvider>
          <TestConsumer onMount={(c) => { ctx = c; }} />
        </InventoryProvider>
      );

      await act(async () => {
        await ctx!.loadSample();
      });

      await waitFor(() => {
        expect(ctx!.categories.length).toBeGreaterThan(0);
        // Categories should be sorted
        const sorted = [...ctx!.categories].sort();
        expect(ctx!.categories).toEqual(sorted);
      });
    });
  });

  describe('filtering', () => {
    it('should filter by supplier', async () => {
      let ctx: ReturnType<typeof useInventory>;
      render(
        <InventoryProvider>
          <TestConsumer onMount={(c) => { ctx = c; }} />
        </InventoryProvider>
      );

      await act(async () => {
        await ctx!.loadSample();
      });

      await waitFor(() => {
        expect(ctx!.analysis.length).toBeGreaterThan(0);
      });

      const totalCount = ctx!.filtered.length;
      const firstSupplier = ctx!.suppliers[0];

      act(() => {
        ctx!.setFilterSupplier(firstSupplier);
      });

      await waitFor(() => {
        expect(ctx!.filtered.length).toBeLessThanOrEqual(totalCount);
        ctx!.filtered.forEach(item => {
          expect(item.supplier).toBe(firstSupplier);
        });
      });
    });

    it('should filter by category', async () => {
      let ctx: ReturnType<typeof useInventory>;
      render(
        <InventoryProvider>
          <TestConsumer onMount={(c) => { ctx = c; }} />
        </InventoryProvider>
      );

      await act(async () => {
        await ctx!.loadSample();
      });

      await waitFor(() => {
        expect(ctx!.analysis.length).toBeGreaterThan(0);
      });

      const firstCategory = ctx!.categories[0];

      act(() => {
        ctx!.setFilterCategory(firstCategory);
      });

      await waitFor(() => {
        ctx!.filtered.forEach(item => {
          expect(item.category).toBe(firstCategory);
        });
      });
    });

    it('should filter by search query matching SKU', async () => {
      let ctx: ReturnType<typeof useInventory>;
      render(
        <InventoryProvider>
          <TestConsumer onMount={(c) => { ctx = c; }} />
        </InventoryProvider>
      );

      await act(async () => {
        await ctx!.loadSample();
      });

      await waitFor(() => {
        expect(ctx!.analysis.length).toBeGreaterThan(0);
      });

      const firstSku = ctx!.analysis[0].sku;
      const searchTerm = firstSku.substring(0, 3).toLowerCase();

      act(() => {
        ctx!.setSearchQuery(searchTerm);
      });

      await waitFor(() => {
        ctx!.filtered.forEach(item => {
          const matches = 
            item.sku.toLowerCase().includes(searchTerm) ||
            item.sku_name.toLowerCase().includes(searchTerm) ||
            item.supplier.toLowerCase().includes(searchTerm) ||
            item.category.toLowerCase().includes(searchTerm);
          expect(matches).toBe(true);
        });
      });
    });

    it('should combine multiple filters', async () => {
      let ctx: ReturnType<typeof useInventory>;
      render(
        <InventoryProvider>
          <TestConsumer onMount={(c) => { ctx = c; }} />
        </InventoryProvider>
      );

      await act(async () => {
        await ctx!.loadSample();
      });

      await waitFor(() => {
        expect(ctx!.analysis.length).toBeGreaterThan(0);
      });

      const firstSupplier = ctx!.suppliers[0];
      const firstCategory = ctx!.categories[0];

      act(() => {
        ctx!.setFilterSupplier(firstSupplier);
        ctx!.setFilterCategory(firstCategory);
      });

      await waitFor(() => {
        ctx!.filtered.forEach(item => {
          expect(item.supplier).toBe(firstSupplier);
          expect(item.category).toBe(firstCategory);
        });
      });
    });

    it('should clear filters when set to empty string', async () => {
      let ctx: ReturnType<typeof useInventory>;
      render(
        <InventoryProvider>
          <TestConsumer onMount={(c) => { ctx = c; }} />
        </InventoryProvider>
      );

      await act(async () => {
        await ctx!.loadSample();
      });

      await waitFor(() => {
        expect(ctx!.analysis.length).toBeGreaterThan(0);
      });

      const totalCount = ctx!.filtered.length;

      act(() => {
        ctx!.setFilterSupplier(ctx!.suppliers[0]);
      });

      await waitFor(() => {
        expect(ctx!.filtered.length).toBeLessThanOrEqual(totalCount);
      });

      act(() => {
        ctx!.setFilterSupplier('');
      });

      await waitFor(() => {
        expect(ctx!.filtered.length).toBe(totalCount);
      });
    });
  });

  describe('demandDays', () => {
    it('should update demandDays and recalculate analysis', async () => {
      let ctx: ReturnType<typeof useInventory>;
      render(
        <InventoryProvider>
          <TestConsumer onMount={(c) => { ctx = c; }} />
        </InventoryProvider>
      );

      await act(async () => {
        await ctx!.loadSample();
      });

      await waitFor(() => {
        expect(ctx!.analysis.length).toBeGreaterThan(0);
      });

      const initialAnalysis = [...ctx!.analysis];

      act(() => {
        ctx!.setDemandDays(30);
      });

      await waitFor(() => {
        expect(screen.getByTestId('demandDays').textContent).toBe('30');
        // Analysis should be recalculated (avg_daily_demand may differ)
        expect(ctx!.analysis.length).toBe(initialAnalysis.length);
      });
    });
  });

  describe('error handling', () => {
    it('should throw error when useInventory is used outside provider', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      expect(() => {
        render(<TestConsumer onMount={() => {}} />);
      }).toThrow('useInventory must be used within InventoryProvider');

      consoleError.mockRestore();
    });
  });
});
