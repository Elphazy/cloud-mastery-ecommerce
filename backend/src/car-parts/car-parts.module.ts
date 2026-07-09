import { Module } from '@nestjs/common';
import { CarPartsController } from './car-parts.controller';
import { CarPartsService } from './car-parts.service';
import { PrismaService } from 'src/prisma.service';

@Module({
  controllers: [CarPartsController],
  providers: [CarPartsService, PrismaService],
  exports: [CarPartsService],
})
export class CarPartsModule {}
