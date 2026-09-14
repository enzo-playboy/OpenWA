import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AiAgentService } from './ai-agent.service';
import { AgencyAgentTemplatesService } from './agency-agent-templates.service';
import { AiAgentConfig } from './entities/ai-agent-config.entity';
import { AiKnowledge } from './entities/ai-knowledge.entity';
import { AiLog } from './entities/ai-log.entity';

@ApiTags('ai-agent')
@Controller('ai-agent')
export class AiAgentController {
  constructor(
    private readonly aiAgentService: AiAgentService,
    private readonly agencyAgentTemplatesService: AgencyAgentTemplatesService,
  ) {}

  @Get('config')
  @ApiOperation({ summary: 'Obter configuração atual do Agente de IA' })
  getConfig(): Promise<AiAgentConfig> {
    return this.aiAgentService.getConfig();
  }

  @Put('config')
  @ApiOperation({ summary: 'Atualizar configuração do Agente de IA' })
  updateConfig(@Body() body: Partial<AiAgentConfig>): Promise<AiAgentConfig> {
    return this.aiAgentService.updateConfig(body);
  }

  @Get('templates/categories')
  @ApiOperation({ summary: 'Listar categorias disponíveis nos agentes de agência' })
  getAgencyCategories() {
    return this.agencyAgentTemplatesService.getCategories();
  }

  @Get('templates')
  @ApiOperation({ summary: 'Listar todos os templates de agentes de agência disponíveis' })
  getAgencyTemplates(@Query('category') category?: string) {
    return this.agencyAgentTemplatesService.getAllTemplates(category);
  }

  @Get('templates/:slug')
  @ApiOperation({ summary: 'Obter detalhes e o prompt completo de um agente de agência' })
  getAgencyTemplateBySlug(@Param('slug') slug: string) {
    return this.agencyAgentTemplatesService.getTemplateBySlug(slug);
  }

  @Post('templates/apply/:slug')
  @ApiOperation({ summary: 'Aplicar o prompt de um agente de agência ao agente de IA ativo' })
  applyAgencyTemplate(@Param('slug') slug: string): Promise<AiAgentConfig> {
    return this.agencyAgentTemplatesService.applyTemplateToConfig(slug);
  }

  @Get('knowledge')
  @ApiOperation({ summary: 'Listar itens da Base de Conhecimento' })
  getKnowledge(): Promise<AiKnowledge[]> {
    return this.aiAgentService.getKnowledgeBase();
  }

  @Post('knowledge')
  @ApiOperation({ summary: 'Adicionar novo item de treinamento/conhecimento' })
  addKnowledge(@Body() body: Partial<AiKnowledge>): Promise<AiKnowledge> {
    return this.aiAgentService.addKnowledge(body);
  }

  @Put('knowledge/:id')
  @ApiOperation({ summary: 'Atualizar item da Base de Conhecimento' })
  updateKnowledge(
    @Param('id') id: string,
    @Body() body: Partial<AiKnowledge>,
  ): Promise<AiKnowledge> {
    return this.aiAgentService.updateKnowledge(id, body);
  }

  @Delete('knowledge/:id')
  @ApiOperation({ summary: 'Remover item da Base de Conhecimento' })
  async deleteKnowledge(@Param('id') id: string): Promise<{ success: boolean }> {
    const success = await this.aiAgentService.deleteKnowledge(id);
    return { success };
  }

  @Post('test')
  @ApiOperation({ summary: 'Testar respostas da IA (Playground)' })
  async testAi(@Body() body: { message: string; history?: any[] }): Promise<{ response: string }> {
    const response = await this.aiAgentService.generateResponse(
      body.message,
      body.history || [],
    );
    return { response };
  }

  @Get('logs')
  @ApiOperation({ summary: 'Listar histórico de respostas da IA' })
  getLogs(@Query('limit') limit?: number): Promise<AiLog[]> {
    return this.aiAgentService.getLogs(limit ? Number(limit) : 50);
  }

  @Post('chats/toggle-pause')
  @ApiOperation({ summary: 'Ativar ou Pausar IA para um chat específico' })
  togglePauseChat(
    @Body() body: { chatId: string; pause?: boolean },
  ): { chatId: string; paused: boolean } {
    return this.aiAgentService.togglePauseChat(body.chatId, body.pause);
  }

  @Get('chats/paused')
  @ApiOperation({ summary: 'Listar todos os chats com IA pausada' })
  getPausedChats(): string[] {
    return this.aiAgentService.getPausedChats();
  }

  @Get('chats/status')
  @ApiOperation({ summary: 'Verificar status da IA para um determinado chat' })
  getChatStatus(@Query('chatId') chatId: string): { chatId: string; paused: boolean } {
    const isPaused = this.aiAgentService.isChatPaused(chatId);
    return { chatId, paused: isPaused };
  }
}

