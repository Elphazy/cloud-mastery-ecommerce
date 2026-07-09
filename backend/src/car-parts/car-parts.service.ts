import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class CarPartsService {
  private readonly logger = new Logger(CarPartsService.name);
  private readonly partsTable = process.env.MYSQL_PARTS_TABLE || 'table_parts_catalog';

  constructor(private prisma: PrismaService) {}

  private getSafeTableName() {
    if (!/^[A-Za-z0-9_]+$/.test(this.partsTable)) {
      throw new Error(`Invalid MYSQL_PARTS_TABLE value: ${this.partsTable}`);
    }
    return this.partsTable;
  }

  private toIso(value: unknown): string | null {
    if (value && typeof value === 'object' && 'value' in value) {
      return String((value as { value: unknown }).value);
    }
    if (value == null) {
      return null;
    }
    return String(value);
  }

  async findAll() {
    try {
      const table = this.getSafeTableName();
      const rows = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT * FROM \`${table}\` ORDER BY created_at DESC`,
      );

      return rows.map((row) => ({
        id: row.id ? String(row.id) : '',
        sku: row.sku ? String(row.sku) : '',
        make: row.make ? String(row.make) : '',
        model: row.model ? String(row.model) : '',
        yearFrom: row.yearFrom || row.year_from ? String(row.yearFrom || row.year_from) : '',
        yearTo: row.yearTo || row.year_to ? String(row.yearTo || row.year_to) : '',
        brand: row.brand ? String(row.brand) : '',
        batteryType: row.batteryType || row.battery_type ? String(row.batteryType || row.battery_type) : '',
        capacityAh: row.capacityAh || row.capacity_ah ? String(row.capacityAh || row.capacity_ah) : '0',
        cca: row.cca ? String(row.cca) : '0',
        voltage: row.voltage ? String(row.voltage) : '0',
        engineCc: row.engineCc || row.engine_cc ? String(row.engineCc || row.engine_cc) : '0',
        branchLocation: row.branchLocation || row.branch_location ? String(row.branchLocation || row.branch_location) : '',
        stock: row.stock ? String(row.stock) : '0',
        warrantyMonths: row.warrantyMonths || row.warranty_months ? String(row.warrantyMonths || row.warranty_months) : '0',
        priceKes: row.priceKes || row.price_kes ? String(row.priceKes || row.price_kes) : '0',
        imageUrl: row.imageUrl || row.image_url ? String(row.imageUrl || row.image_url) : null,
        created_at: this.toIso(row.created_at),
        updated_at: this.toIso(row.updated_at),
        order_id: row.order_id ? String(row.order_id) : null,
      }));
    } catch (error) {
      this.logger.error(
        `MySQL car parts read failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return [];
    }
  }
}
