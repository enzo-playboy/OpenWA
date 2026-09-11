import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiAgentConfig } from './entities/ai-agent-config.entity';
import { AiKnowledge } from './entities/ai-knowledge.entity';
import { AiLog } from './entities/ai-log.entity';
import { Message } from '../message/entities/message.entity';
import { AiAgentService } from './ai-agent.service';
import { AiAgentController } from './ai-agent.controller';
import { GroqTranscriptionService } from './groq-transcription.service';
import { InstagramModule } from '../instagram/instagram.module';
import { forwardRef } from '@nestjs/common';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiAgentConfig, AiKnowledge, AiLog, Message], 'data'),
    forwardRef(() => InstagramModule),
  ],
  controllers: [AiAgentController],
  providers: [AiAgentService, GroqTranscriptionService],
  exports: [AiAgentService, GroqTranscriptionService],
})
export class AiAgentModule {}

