export interface ParsedProductRow {
  sku: string;
  name: string;
  price: number;
  cost: number;
  category: string;
  trackingMode: 'quantity' | 'serialized';
}

export interface ImportRowError {
  row: number;
  sku: string;
  message: string;
}

export interface ImportResult {
  created: number;
  updated: number;
  unchanged: number;
  errors: ImportRowError[];
}
