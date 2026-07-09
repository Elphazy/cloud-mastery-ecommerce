import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);
  private readonly financeTable = process.env.MYSQL_FINANCE_TABLE || 'table_finance';

  constructor(private prisma: PrismaService) {}

  private getSafeTableName() {
    if (!/^[A-Za-z0-9_]+$/.test(this.financeTable)) {
      throw new Error(`Invalid MYSQL_FINANCE_TABLE value: ${this.financeTable}`);
    }
    return this.financeTable;
  }

  private inferProductType(name: string) {
    const normalized = name.toLowerCase();
    if (normalized.includes('money market') || normalized.includes('mmf')) {
      return 'MMF';
    }
    if (normalized.includes('treasury') || normalized.includes('t-bill') || normalized.includes('bond')) {
      return 'Government Security';
    }
    if (normalized.includes('fixed deposit')) {
      return 'Fixed Deposit';
    }
    return 'Finance';
  }

  async findAll() {
    try {
      const table = this.getSafeTableName();
      const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM \`${table}\` ORDER BY created_at DESC`,
      );

      return rows.map((row, index) => {
        const name =
          row.productName || row.product_name || row.name || row.title || row.Name
            ? String(
                row.productName || row.product_name || row.name || row.title || row.Name,
              )
            : 'Unnamed Finance Product';
        const derivedId = `finance-${index}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

        return {
          id: row.id ? String(row.id) : derivedId,
          sku: row.sku ? String(row.sku) : undefined,
          productName: name,
          productType: row.productType || row.product_type || row.category || row.Category
            ? String(row.productType || row.product_type || row.category || row.Category)
            : this.inferProductType(name),
          subType: row.subType || row.sub_type ? String(row.subType || row.sub_type) : null,
          provider: row.provider ? String(row.provider) : null,
          description: row.description || row.Details ? String(row.description || row.Details) : null,
          minInvestmentKes: row.minInvestmentKes || row.min_investment_kes || row.minimumInvestmentKes || row.minimum_investment_kes || row.Minimum_Requirement
            ? Number(
                row.minInvestmentKes ||
                  row.min_investment_kes ||
                  row.minimumInvestmentKes ||
                  row.minimum_investment_kes ||
                  row.Minimum_Requirement,
              ).toString()
            : '0',
          expectedReturnPct: row.expectedReturnPct || row.expected_return_pct || row.returnPct || row.return_pct || row.Interest_Rate
            ? Number(
                row.expectedReturnPct ||
                  row.expected_return_pct ||
                  row.returnPct ||
                  row.return_pct ||
                  row.Interest_Rate,
              ).toString()
            : '0',
          riskLevel: row.riskLevel || row.risk_level ? String(row.riskLevel || row.risk_level) : 'Unknown',
          liquidity: row.liquidity ? String(row.liquidity) : null,
          tenor: row.tenor ? String(row.tenor) : null,
          regulatedBy: row.regulatedBy || row.regulated_by ? String(row.regulatedBy || row.regulated_by) : null,
          bestFor: row.bestFor || row.best_for ? String(row.bestFor || row.best_for) : null,
          targetAgeMin: row.targetAgeMin || row.target_age_min ? String(row.targetAgeMin || row.target_age_min) : null,
          targetAgeMax: row.targetAgeMax || row.target_age_max ? String(row.targetAgeMax || row.target_age_max) : null,
          created_at: row.createdAt || row.created_at || null,
          updated_at: row.updatedAt || row.updated_at || null,
        };
      });
    } catch (error) {
      this.logger.error(
        `Finance MySQL read failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw error;
    }
  }
}
