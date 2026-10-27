import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { SalesModule } from './sales/sales.module.js';

@Module({
  imports: [PrismaModule, SalesModule, ReportsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
