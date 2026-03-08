import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseCsvString, parseCsvFile, exportToCsv } from './csvUtils';

describe('csvUtils', () => {
  describe('parseCsvString', () => {
    it('should parse a valid CSV string into RawRow array', async () => {
      const csv = `sku,sku_name,supplier,category,date,partner_id,sold_qty,unit_price,stock_qty,lead_time_days,ordered_qty,expected_delivery_date
SKU001,Widget A,Supplier X,Electronics,2024-01-01,P001,10,25.50,100,7,50,2024-01-15`;

      const rows = await parseCsvString(csv);

      expect(rows).toHaveLength(1);
      expect(rows[0].sku).toBe('SKU001');
      expect(rows[0].sku_name).toBe('Widget A');
      expect(rows[0].supplier).toBe('Supplier X');
      expect(rows[0].category).toBe('Electronics');
    });

    it('should parse multiple rows', async () => {
      const csv = `sku,sku_name,supplier,category,date,partner_id,sold_qty,unit_price,stock_qty,lead_time_days,ordered_qty,expected_delivery_date
SKU001,Widget A,Supplier X,Electronics,2024-01-01,P001,10,25.50,100,7,50,2024-01-15
SKU002,Widget B,Supplier Y,Furniture,2024-01-02,P002,5,15.00,200,14,30,2024-01-20`;

      const rows = await parseCsvString(csv);

      expect(rows).toHaveLength(2);
      expect(rows[0].sku).toBe('SKU001');
      expect(rows[1].sku).toBe('SKU002');
    });

    it('should skip empty lines', async () => {
      const csv = `sku,sku_name,supplier,category,date,partner_id,sold_qty,unit_price,stock_qty,lead_time_days,ordered_qty,expected_delivery_date
SKU001,Widget A,Supplier X,Electronics,2024-01-01,P001,10,25.50,100,7,50,2024-01-15

SKU002,Widget B,Supplier Y,Furniture,2024-01-02,P002,5,15.00,200,14,30,2024-01-20
`;

      const rows = await parseCsvString(csv);
      expect(rows).toHaveLength(2);
    });

    it('should trim header whitespace', async () => {
      const csv = ` sku , sku_name ,supplier,category,date,partner_id,sold_qty,unit_price,stock_qty,lead_time_days,ordered_qty,expected_delivery_date
SKU001,Widget A,Supplier X,Electronics,2024-01-01,P001,10,25.50,100,7,50,2024-01-15`;

      const rows = await parseCsvString(csv);

      expect(rows[0].sku).toBe('SKU001');
      expect(rows[0].sku_name).toBe('Widget A');
    });

    it('should return empty array for header-only CSV', async () => {
      const csv = `sku,sku_name,supplier,category,date,partner_id,sold_qty,unit_price,stock_qty,lead_time_days,ordered_qty,expected_delivery_date`;

      const rows = await parseCsvString(csv);
      expect(rows).toHaveLength(0);
    });

    it('should handle zero values in numeric fields', async () => {
      const csv = `sku,sku_name,supplier,category,date,partner_id,sold_qty,unit_price,stock_qty,lead_time_days,ordered_qty,expected_delivery_date
SKU001,Widget A,Supplier X,Electronics,2024-01-01,P001,0,0,0,0,0,2024-01-15`;

      const rows = await parseCsvString(csv);

      expect(rows[0].sold_qty).toBe('0');
      expect(rows[0].stock_qty).toBe('0');
    });
  });

  describe('parseCsvFile', () => {
    it('should parse a File object', async () => {
      const csvContent = `sku,sku_name,supplier,category,date,partner_id,sold_qty,unit_price,stock_qty,lead_time_days,ordered_qty,expected_delivery_date
SKU001,Widget A,Supplier X,Electronics,2024-01-01,P001,10,25.50,100,7,50,2024-01-15`;

      const file = new File([csvContent], 'test.csv', { type: 'text/csv' });
      const rows = await parseCsvFile(file);

      expect(rows).toHaveLength(1);
      expect(rows[0].sku).toBe('SKU001');
    });
  });

  describe('exportToCsv', () => {
    let mockCreateObjectURL: ReturnType<typeof vi.fn>;
    let mockRevokeObjectURL: ReturnType<typeof vi.fn>;
    let mockClick: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      vi.useFakeTimers();
      mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-url');
      mockRevokeObjectURL = vi.fn();
      mockClick = vi.fn();

      global.URL.createObjectURL = mockCreateObjectURL;
      global.URL.revokeObjectURL = mockRevokeObjectURL;

      vi.spyOn(document, 'createElement').mockReturnValue({
        href: '',
        download: '',
        click: mockClick,
      } as any);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should create a blob and trigger download', () => {
      const data = [
        { sku: 'SKU001', name: 'Widget A', qty: 10 },
        { sku: 'SKU002', name: 'Widget B', qty: 20 },
      ];

      exportToCsv(data, 'export.csv');

      expect(mockCreateObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(mockClick).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });

    it('should set the correct filename', () => {
      const mockElement = { href: '', download: '', click: mockClick } as any;
      vi.spyOn(document, 'createElement').mockReturnValue(mockElement);

      exportToCsv([{ a: 1 }], 'my-data.csv');

      expect(mockElement.download).toBe('my-data.csv');
    });

    it('should handle empty data array', () => {
      exportToCsv([], 'empty.csv');

      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockClick).toHaveBeenCalled();
    });
  });
});
