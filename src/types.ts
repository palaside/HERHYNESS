export interface Product {
  plu: string;
  barcode?: string;
  name_th: string;
  price: number;
  image_url: string;
}

export interface ExtractedItem {
  plu: string;
  description: string;
  price: number;
  qty: number;
}

export interface MatchResult {
  plu: string;
  name_th: string;
  price: number;
  qty: number;
  total: number;
  image_url: string;
  originalPlu?: string; // If there was a typo/closest match
  matchType: 'exact' | 'typo' | 'none';
  levenshteinDistance?: number;
  barcode?: string;
}
