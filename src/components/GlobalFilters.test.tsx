import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GlobalFilters } from './GlobalFilters';
import * as InventoryContext from '@/context/InventoryContext';

const mockSetFilterSupplier = vi.fn();
const mockSetFilterCategory = vi.fn();
const mockSetDemandDays = vi.fn();
const mockSetSearchQuery = vi.fn();

const createMockContext = (overrides = {}) => ({
  suppliers: ['Supplier A', 'Supplier B', 'Supplier C'],
  categories: ['Electronics', 'Furniture', 'Clothing'],
  filterSupplier: '',
  setFilterSupplier: mockSetFilterSupplier,
  filterCategory: '',
  setFilterCategory: mockSetFilterCategory,
  demandDays: 90,
  setDemandDays: mockSetDemandDays,
  searchQuery: '',
  setSearchQuery: mockSetSearchQuery,
  hasData: true,
  filtered: Array(10).fill({}),
  analysis: Array(25).fill({}),
  loadFile: vi.fn(),
  loadSample: vi.fn(),
  ...overrides,
});

describe('GlobalFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should not render when hasData is false', () => {
      vi.spyOn(InventoryContext, 'useInventory').mockReturnValue(
        createMockContext({ hasData: false }) as any
      );

      const { container } = render(<GlobalFilters />);
      expect(container.firstChild).toBeNull();
    });

    it('should render all filter controls when hasData is true', () => {
      vi.spyOn(InventoryContext, 'useInventory').mockReturnValue(
        createMockContext() as any
      );

      render(<GlobalFilters />);

      expect(screen.getByPlaceholderText('Search SKUs…')).toBeInTheDocument();
      expect(screen.getByText('Supplier')).toBeInTheDocument();
      expect(screen.getByText('Category')).toBeInTheDocument();
      expect(screen.getByText('Demand window')).toBeInTheDocument();
      expect(screen.getByText('days')).toBeInTheDocument();
    });

    it('should display result count when search query is active', () => {
      vi.spyOn(InventoryContext, 'useInventory').mockReturnValue(
        createMockContext({ searchQuery: 'test' }) as any
      );

      render(<GlobalFilters />);

      expect(screen.getByText('10/25')).toBeInTheDocument();
    });

    it('should not display result count when search query is empty', () => {
      vi.spyOn(InventoryContext, 'useInventory').mockReturnValue(
        createMockContext({ searchQuery: '' }) as any
      );

      render(<GlobalFilters />);

      expect(screen.queryByText('10/25')).not.toBeInTheDocument();
    });
  });

  describe('search input', () => {
    it('should display current search query value', () => {
      vi.spyOn(InventoryContext, 'useInventory').mockReturnValue(
        createMockContext({ searchQuery: 'existing search' }) as any
      );

      render(<GlobalFilters />);

      const input = screen.getByPlaceholderText('Search SKUs…') as HTMLInputElement;
      expect(input.value).toBe('existing search');
    });

    it('should call setSearchQuery on input change', () => {
      vi.spyOn(InventoryContext, 'useInventory').mockReturnValue(
        createMockContext() as any
      );

      render(<GlobalFilters />);

      const input = screen.getByPlaceholderText('Search SKUs…');
      fireEvent.change(input, { target: { value: 'new search' } });

      expect(mockSetSearchQuery).toHaveBeenCalledWith('new search');
    });
  });

  describe('demand days input', () => {
    it('should display current demandDays value', () => {
      vi.spyOn(InventoryContext, 'useInventory').mockReturnValue(
        createMockContext({ demandDays: 60 }) as any
      );

      render(<GlobalFilters />);

      const input = screen.getByDisplayValue('60') as HTMLInputElement;
      expect(input).toBeInTheDocument();
    });

    it('should call setDemandDays with number on input change', () => {
      vi.spyOn(InventoryContext, 'useInventory').mockReturnValue(
        createMockContext() as any
      );

      render(<GlobalFilters />);

      const input = screen.getByDisplayValue('90');
      fireEvent.change(input, { target: { value: '30' } });

      expect(mockSetDemandDays).toHaveBeenCalledWith(30);
    });

    it('should default to 90 when input is invalid', () => {
      vi.spyOn(InventoryContext, 'useInventory').mockReturnValue(
        createMockContext() as any
      );

      render(<GlobalFilters />);

      const input = screen.getByDisplayValue('90');
      fireEvent.change(input, { target: { value: '' } });

      expect(mockSetDemandDays).toHaveBeenCalledWith(90);
    });
  });

  describe('supplier filter', () => {
    it('should render all supplier options when dropdown is opened', async () => {
      vi.spyOn(InventoryContext, 'useInventory').mockReturnValue(
        createMockContext() as any
      );

      render(<GlobalFilters />);

      // Find the supplier select trigger (first combobox)
      const supplierTriggers = screen.getAllByRole('combobox');
      const supplierTrigger = supplierTriggers[0];
      
      await userEvent.click(supplierTrigger);

      // Wait for dropdown to open and check options
      await screen.findByRole('listbox');
      expect(screen.getByRole('option', { name: 'Supplier A' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Supplier B' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Supplier C' })).toBeInTheDocument();
    });

    it('should call setFilterSupplier when a supplier is selected', async () => {
      vi.spyOn(InventoryContext, 'useInventory').mockReturnValue(
        createMockContext() as any
      );

      render(<GlobalFilters />);

      const supplierTriggers = screen.getAllByRole('combobox');
      await userEvent.click(supplierTriggers[0]);
      
      await screen.findByRole('listbox');
      const supplierOption = screen.getByRole('option', { name: 'Supplier A' });
      await userEvent.click(supplierOption);

      expect(mockSetFilterSupplier).toHaveBeenCalledWith('Supplier A');
    });
  });

  describe('category filter', () => {
    it('should render all category options when dropdown is opened', async () => {
      vi.spyOn(InventoryContext, 'useInventory').mockReturnValue(
        createMockContext() as any
      );

      render(<GlobalFilters />);

      const categoryTriggers = screen.getAllByRole('combobox');
      const categoryTrigger = categoryTriggers[1];
      
      await userEvent.click(categoryTrigger);

      await screen.findByRole('listbox');
      expect(screen.getByRole('option', { name: 'Electronics' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Furniture' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Clothing' })).toBeInTheDocument();
    });

    it('should call setFilterCategory when a category is selected', async () => {
      vi.spyOn(InventoryContext, 'useInventory').mockReturnValue(
        createMockContext() as any
      );

      render(<GlobalFilters />);

      const categoryTriggers = screen.getAllByRole('combobox');
      await userEvent.click(categoryTriggers[1]);
      
      await screen.findByRole('listbox');
      const categoryOption = screen.getByRole('option', { name: 'Electronics' });
      await userEvent.click(categoryOption);

      expect(mockSetFilterCategory).toHaveBeenCalledWith('Electronics');
    });
  });

  describe('accessibility', () => {
    it('should have proper labels for all inputs', () => {
      vi.spyOn(InventoryContext, 'useInventory').mockReturnValue(
        createMockContext() as any
      );

      render(<GlobalFilters />);

      expect(screen.getByText('Supplier')).toBeInTheDocument();
      expect(screen.getByText('Category')).toBeInTheDocument();
      expect(screen.getByText('Demand window')).toBeInTheDocument();
    });

    it('should have search icon visible', () => {
      vi.spyOn(InventoryContext, 'useInventory').mockReturnValue(
        createMockContext() as any
      );

      render(<GlobalFilters />);

      // The search icon is rendered as an SVG with lucide-react
      const searchInput = screen.getByPlaceholderText('Search SKUs…');
      expect(searchInput.parentElement?.querySelector('svg')).toBeInTheDocument();
    });
  });
});
