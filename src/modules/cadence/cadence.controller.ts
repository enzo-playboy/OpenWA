import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { Public } from '../auth/decorators/auth.decorators';
import { CadenceService } from './cadence.service';
import { CreateCadenceDto } from './dto/create-cadence.dto';
import { EnrollBatchLeadsDto } from './dto/enroll-lead.dto';

@ApiTags('Cadence (Follow-up 10 Toques)')
@Public()
@Controller('sessions/:sessionId/cadences')
export class CadenceController {
  constructor(private readonly cadenceService: CadenceService) {}

  @Post()
  @ApiOperation({ summary: 'Criar uma nova régua de cadência de até 10 toques com regras anti-ban' })
  @ApiParam({ name: 'sessionId', description: 'ID da sessão do WhatsApp' })
  create(
    @Param('sessionId') sessionId: string,
    @Body() dto: CreateCadenceDto,
  ) {
    dto.sessionId = sessionId;
    return this.cadenceService.createCadence(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar todas as réguas de cadência da sessão' })
  @ApiParam({ name: 'sessionId', description: 'ID da sessão do WhatsApp' })
  findAll(@Param('sessionId') sessionId: string) {
    return this.cadenceService.findAllCadences(sessionId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obter detalhes de uma régua de cadência específica' })
  @ApiParam({ name: 'sessionId', description: 'ID da sessão do WhatsApp' })
  @ApiParam({ name: 'id', description: 'ID da cadência' })
  findOne(@Param('id') id: string) {
    return this.cadenceService.findCadenceById(id);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Obter estatísticas de desempenho e conversão da cadência' })
  @ApiParam({ name: 'sessionId', description: 'ID da sessão do WhatsApp' })
  @ApiParam({ name: 'id', description: 'ID da cadência' })
  getStats(@Param('id') id: string) {
    return this.cadenceService.getCadenceStats(id);
  }

  @Post(':id/enroll')
  @ApiOperation({ summary: 'Cadastrar lead(s) na régua de 10 toques' })
  @ApiParam({ name: 'sessionId', description: 'ID da sessão do WhatsApp' })
  @ApiParam({ name: 'id', description: 'ID da cadência' })
  enroll(@Param('id') id: string, @Body() dto: EnrollBatchLeadsDto) {
    return this.cadenceService.enrollLeads(id, dto.leads);
  }

  @Post(':id/import-supabase')
  @ApiOperation({ summary: 'Importar leads diretamente da tabela do Supabase para a cadência' })
  @ApiParam({ name: 'sessionId', description: 'ID da sessão do WhatsApp' })
  @ApiParam({ name: 'id', description: 'ID da cadência' })
  importSupabase(@Param('id') id: string) {
    return this.cadenceService.importFromSupabase(id);
  }

  @Post('leads/:progressId/pause')
  @ApiOperation({ summary: 'Pausar follow-up de um lead específico' })
  @ApiParam({ name: 'sessionId', description: 'ID da sessão do WhatsApp' })
  @ApiParam({ name: 'progressId', description: 'ID do progresso do lead' })
  pauseLead(@Param('progressId') progressId: string) {
    return this.cadenceService.pauseLead(progressId);
  }

  @Post('leads/:progressId/resume')
  @ApiOperation({ summary: 'Retomar follow-up de um lead pausado' })
  @ApiParam({ name: 'sessionId', description: 'ID da sessão do WhatsApp' })
  @ApiParam({ name: 'progressId', description: 'ID do progresso do lead' })
  resumeLead(@Param('progressId') progressId: string) {
    return this.cadenceService.resumeLead(progressId);
  }
}
