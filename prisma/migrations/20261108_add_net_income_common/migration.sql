-- Add netIncomeCommon column to FinancialStatement
-- Holds net income attributable specifically to common shareholders (excluding noncontrolling interests)
-- Preserves netIncome as consolidated group net income for GAAP income statement presentation and ROA.
ALTER TABLE "FinancialStatement" ADD COLUMN "netIncomeCommon" REAL;
