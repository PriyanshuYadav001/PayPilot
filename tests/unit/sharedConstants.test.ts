import { describe, it, expect } from 'vitest';
import { PLAN_LIMITS } from '../../shared/constants';

describe('Shared Constants', () => {
  describe('PLAN_LIMITS', () => {
    it('defines limits for all subscription tiers', () => {
      expect(PLAN_LIMITS).toHaveProperty('free_trial');
      expect(PLAN_LIMITS).toHaveProperty('starter');
      expect(PLAN_LIMITS).toHaveProperty('growth');
      expect(PLAN_LIMITS).toHaveProperty('pro');
    });

    it('free_trial has zero voice calls and positive invoice limit', () => {
      expect(PLAN_LIMITS.free_trial.maxCallsMonthly).toBe(0);
      expect(PLAN_LIMITS.free_trial.maxInvoicesMonthly).toBe(25);
    });

    it('starter plan has price and voice calls included', () => {
      expect(PLAN_LIMITS.starter.priceInr).toBe(499);
      expect(PLAN_LIMITS.starter.maxCallsMonthly).toBe(0);
    });

    it('growth plan has price and voice calls included', () => {
      expect(PLAN_LIMITS.growth.priceInr).toBe(999);
      expect(PLAN_LIMITS.growth.maxCallsMonthly).toBe(100);
    });

    it('pro plan has price and voice calls included', () => {
      expect(PLAN_LIMITS.pro.priceInr).toBe(1999);
      expect(PLAN_LIMITS.pro.maxCallsMonthly).toBe(500);
    });
  });
});
