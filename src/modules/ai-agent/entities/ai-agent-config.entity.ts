import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('ai_agent_configs')
export class AiAgentConfig {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ default: 'OpenWA AI Assistant' })
  name!: string;

  @Column({ default: 'openrouter' })
  provider!: string;

  @Column({ type: 'text', default: 'Você é um assistente de vendas e atendimento ao cliente educado, eficiente e direto ao ponto. Responda em português do Brasil de forma clara e amigável.' })
  systemPrompt!: string;

  @Column({ default: 'google/gemini-2.5-flash-free' })
  model!: string;

  @Column({ type: 'float', default: 0.7 })
  temperature!: number;

  @Column({ default: 500 })
  maxTokens!: number;

  @Column({ default: true })
  enabled!: boolean;

  @Column({ default: true })
  autoReplyOnLeadMessage!: boolean;

  @Column({ default: true })
  autoReplyOnCadenceReply!: boolean;

  @Column({ default: 2000 })
  typingDelayMs!: number;

  @Column({ default: 5000 })
  bufferDelayMs!: number;

  @Column({ type: 'text', nullable: true })
  customApiKey!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
