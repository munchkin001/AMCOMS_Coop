export type CategoryStatus = 'active' | 'inactive';

export interface Category {
  id: string;
  category_code: string;
  name: string; // product_categories.category_name
  description: string | null;
  status: CategoryStatus; // product_categories.is_active ? 'active' : 'inactive'
}

export interface CategoryRow {
  id: string;
  category_code: string;
  category_name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductRow {
  id: string;
  product_code: string;
  product_name: string;
  category_id: string | null;
  unit_of_measure: string;
  unit_price: number;
  cost_price: number | null;
  reorder_level: number | null;
  description: string | null;
  is_active: boolean;
}

export type CreateProductInput = Omit<ProductRow, 'id' | 'is_active'>;

// stock_inventory: one row per product; quantity_on_hand is the "current stock".
export interface StockInventoryRow {
  id: string;
  product_id: string;
  quantity_on_hand: number;
  last_restock_date: string | null;
}

// A restock is a stock_movements row with movement_type 'purchase'; it is the audit trail.
export interface RestockTransaction {
  product_id: string;
  quantity: number; // whole number > 0
  supplier?: string; // saved in stock_movements.description
  reference?: string; // invoice number, saved in stock_movements.reference_number
  date?: string; // YYYY-MM-DD, defaults to today
}

export interface ProductWithStock extends ProductRow {
  current_stock: number; // derived: stock_inventory.quantity_on_hand
  stock_value: number; // derived: current_stock * cost_price
  status: 'Good' | 'Low' | 'Out of Stock';
  last_restocked: string | null;
}

export interface DeleteCategoryResult {
  error: Error | null;
  blocked?: boolean; // true when products are still assigned to the category
}

export interface Product {
  id: string;
  product_code: string;
  product_name: string;
  category_id: string | null; // nullable foreign key to product_categories.id
  unit_of_measure: string;
  unit_price: number;
  cost_price: number;
  reorder_level: number;
  description: string | null;
}

export type ProductFormValues = Omit<Product, 'id' | 'unit_price' | 'cost_price' | 'reorder_level'> & {
  unit_price: string;
  cost_price: string;
  reorder_level: string;
};
