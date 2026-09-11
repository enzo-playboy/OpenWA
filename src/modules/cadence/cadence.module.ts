import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cadence } from './entities/cadence.entity';
import { CadenceStep } from './entities/cadence-step.entity';
import { LeadCadenceProgress } from './entities/lead-cadence-progress.entity';
import { CadenceService } from './cadence.service';
import { CadenceEngineService } from './cadence-engine.service';
import { SupabaseSyncService } from './supabase-sync.service';
import { CadenceController } from './cadence.controller';
import { MessageModule } from '../message/message.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Cadence, CadenceStep, LeadCadenceProgress], 'data'),
    MessageModule,
  ],
  controllers: [CadenceController],
  providers: [CadenceService, CadenceEngineService, SupabaseSyncService],
  exports: [CadenceService, CadenceEngineService, SupabaseSyncService],
})
export class CadenceModule {}
