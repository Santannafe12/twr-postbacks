import { Controller, Get, Query } from '@nestjs/common';
import { SalesReportQueryDto } from './dto/sales-report-query.dto.js';
import { ReportsService, type SalesReport } from './reports.service.js';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('sales')
  report(@Query() query: SalesReportQueryDto): Promise<SalesReport> {
    return this.reportsService.report(query);
  }
}
