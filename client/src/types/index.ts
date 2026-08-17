export * from '../../../shared/types';

export interface DashboardMetrics {
  totalOutstanding: number;
  overdueAmount: number;
  averageDsoDays: number;
  collectionEfficiencyRate: number;
  activeFollowUpsCount: number;
  openDisputesCount: number;
  activePromisesCount: number;
}

export interface AgingBucketSummary {
  current: number;
  bucket1_30: number;
  bucket31_60: number;
  bucket61_90: number;
  bucket90Plus: number;
}
