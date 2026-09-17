import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiAgentConfig } from './entities/ai-agent-config.entity';
import { AiKnowledge } from './entities/ai-knowledge.entity';
import { AiLog } from './entities/ai-log.entity';
import { MessageEngagement } from './entities/message-engagement.entity';
import { Message } from '../message/entities/message.entity';
import { AiAgentService } from './ai-agent.service';
import { AgencyAgentTemplatesService } from './agency-agent-templates.service';
import { AiAgentController } from './ai-agent.controller';
import { GroqTranscriptionService } from './groq-transcription.service';
import { LlmProviderChainService } from './llm-provider-chain.service';
import { AiFeedbackLoopService } from './ai-feedback-loop.service';
import { InstagramModule } from '../instagram/instagram.module';
import { forwardRef } from '@nestjs/common';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiAgentConfig, AiKnowledge, AiLog, Message, MessageEngagement], 'data'),
    forwardRef(() => InstagramModule),
  ],
  controllers: [AiAgentController],
  providers: [
    AiAgentService,
    AgencyAgentTemplatesService,
    GroqTranscriptionService,
    LlmProviderChainService,
    AiFeedbackLoopService,
  ],
  exports: [
    AiAgentService,
    AgencyAgentTemplatesService,
    GroqTranscriptionService,
    LlmProviderChainService,
    AiFeedbackLoopService,
  ],
})
export class AiAgentModule {}
