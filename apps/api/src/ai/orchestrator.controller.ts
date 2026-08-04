import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { AiReadGuard } from './ai-read.decorator';
import { CreateAiRunDto } from './orchestrator.dto';
import { AiOrchestratorService } from './orchestrator.service';

@ApiTags('ai-orchestrator')
@AiReadGuard()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('ai/orchestrator')
export class AiOrchestratorController {
  constructor(private readonly orchestrator: AiOrchestratorService) {}

  @Post('runs')
  @ApiOperation({ summary: 'Запустить read-only AI tool с durable trace и decision' })
  @ApiOkResponse({ description: 'AI run, decision и typed tool output' })
  run(@Body() dto: CreateAiRunDto, @CurrentUser() user: AuthPrincipal) {
    return this.orchestrator.run(dto, user);
  }

  @Get('runs/:id')
  @ApiOperation({ summary: 'Получить собственный AI run с шагами и источниками' })
  get(@Param('id') id: string, @CurrentUser() user: AuthPrincipal) {
    return this.orchestrator.getRun(id, user);
  }
}
