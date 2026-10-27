import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CreateSaleDto } from './dto/create-sale.dto.js';
import { SalesService, type SaleResponse } from './sales.service.js';
import { WebhookSecretGuard } from './webhook-secret.guard.js';

@Controller('webhooks')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post('sales')
  @UseGuards(WebhookSecretGuard)
  async receive(
    @Body() dto: CreateSaleDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SaleResponse> {
    const result = await this.salesService.register(dto);
    response.status(result.idempotentReplay ? 200 : 201);
    return result;
  }
}
