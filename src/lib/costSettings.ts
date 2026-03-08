export type ServiceLevelKey = '90%' | '95%' | '99%';

export interface ServiceLevelSettings {
  usePerClassServiceLevel: boolean;
  classA: ServiceLevelKey;
  classB: ServiceLevelKey;
  classC: ServiceLevelKey;
}

export interface CostSettings {
  // Holding cost
  holdingCostEnabled: boolean;
  annualInterestRate: number; // % e.g. 8

  // Storage cost
  storageCostEnabled: boolean;
  storageCostPerPalletPerMonth: number; // € e.g. 15
  unitsPerPallet: number; // e.g. 100

  // Ordering cost per supplier
  orderingCostEnabled: boolean;
  defaultOrderingCost: number; // € e.g. 50
  supplierOrderingCosts: Record<string, number>; // supplier -> €

  // Quantity price breaks
  priceBreaksEnabled: boolean;
  priceBreaks: Record<string, { minQty: number; unitPrice: number }[]>; // sku -> sorted array

  // Stockout cost
  stockoutCostEnabled: boolean;
  defaultMarginPct: number; // % e.g. 25

  // Obsolescence
  obsolescenceCostEnabled: boolean;
  categoryObsolescenceRates: Record<string, number>; // category -> annual %

  // Minimum order value
  minOrderValueEnabled: boolean;
  supplierMinOrderValues: Record<string, number>; // supplier -> €

  // Payment terms
  paymentTermsEnabled: boolean;
  supplierPaymentTermsDays: Record<string, number>; // supplier -> days

  // EWMA demand smoothing
  ewmaEnabled: boolean;
  ewmaAlpha: number; // 0.1 to 0.5, default 0.3

  // Lead time variability per supplier
  supplierLeadTimeStats: Record<string, { avgLeadTimeActual: number; stdDevLeadTime: number }>;
}

export const DEFAULT_COST_SETTINGS: CostSettings = {
  holdingCostEnabled: false,
  annualInterestRate: 8,

  storageCostEnabled: false,
  storageCostPerPalletPerMonth: 15,
  unitsPerPallet: 100,

  orderingCostEnabled: false,
  defaultOrderingCost: 50,
  supplierOrderingCosts: {},

  priceBreaksEnabled: false,
  priceBreaks: {},

  stockoutCostEnabled: false,
  defaultMarginPct: 25,

  obsolescenceCostEnabled: false,
  categoryObsolescenceRates: {},

  minOrderValueEnabled: false,
  supplierMinOrderValues: {},

  paymentTermsEnabled: false,
  supplierPaymentTermsDays: {},

  ewmaEnabled: false,
  ewmaAlpha: 0.3,

  supplierLeadTimeStats: {},
};
