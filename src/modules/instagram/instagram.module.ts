import { Module, forwardRef } from '@nestjs/common';
import { InstagramService } from './instagram.service';
import { InstagramController } from './instagram.controller';
import { AiAgentModule } from '../ai-agent/ai-agent.module';

@Module({
  imports: [
    // Usando forwardRef pois o AiAgentModule precisará chamar o InstagramModule
    // e o InstagramModule chama o AiAgentModule.
    forwardRef(() => AiAgentModule),
  ],
  providers: [InstagramService],
  controllers: [InstagramController],
  exports: [InstagramService],
})
export class InstagramModule {}
