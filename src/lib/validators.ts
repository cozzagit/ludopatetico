import { z } from 'zod';

export const syncCompetitionSchema = z.object({
  competitionId: z.number().int().positive(),
});

export const generatePredictionSchema = z.object({
  matchId: z.number().int().positive(),
});

export const syncStatisticsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const syncStatisticsCrossApiSchema = z.object({
  daysBack: z.number().int().positive().default(7),
});

export const activatePremiumSchema = z.object({
  paypalOrderId: z.string().min(1),
  plan: z.enum(['monthly', 'yearly']).default('monthly'),
});

export const paypalOrderSchema = z.object({
  amount: z.string().refine(v => !isNaN(parseFloat(v)) && parseFloat(v) > 0),
  currency: z.string().min(1),
  intent: z.string().min(1),
});

export const registerSchema = z.object({
  username: z.string().min(3).max(30),
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});
