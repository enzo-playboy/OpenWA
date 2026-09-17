import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { AiAgentConfig } from './entities/ai-agent-config.entity';

export interface AgencyAgentTemplate {
  slug: string;
  category: string;
  name: string;
  description: string;
  color?: string;
  emoji?: string;
  vibe?: string;
  systemPrompt: string;
  filePath: string;
}

@Injectable()
export class AgencyAgentTemplatesService {
  private readonly logger = new Logger(AgencyAgentTemplatesService.name);
  private templatesCache: AgencyAgentTemplate[] | null = null;

  constructor(
    @InjectRepository(AiAgentConfig, 'data')
    private readonly configRepo: Repository<AiAgentConfig>,
  ) {}

  private loadTemplates(): AgencyAgentTemplate[] {
    if (this.templatesCache) {
      return this.templatesCache;
    }

    const registryPath = path.resolve(process.cwd(), 'data/agency-agents-registry.json');
    if (fs.existsSync(registryPath)) {
      try {
        const raw = fs.readFileSync(registryPath, 'utf-8');
        this.templatesCache = JSON.parse(raw) as AgencyAgentTemplate[];
        return this.templatesCache;
      } catch (err) {
        this.logger.error(`Error loading agency agents registry: ${err}`);
      }
    }

    this.templatesCache = [];
    return this.templatesCache;
  }

  getCategories(): { category: string; count: number }[] {
    const templates = this.loadTemplates();
    const map = new Map<string, number>();

    for (const t of templates) {
      const current = map.get(t.category) || 0;
      map.set(t.category, current + 1);
    }

    return Array.from(map.entries()).map(([category, count]) => ({ category, count }));
  }

  getAllTemplates(category?: string): AgencyAgentTemplate[] {
    const templates = this.loadTemplates();
    if (category) {
      return templates.filter(t => t.category.toLowerCase() === category.toLowerCase());
    }
    return templates;
  }

  getTemplateBySlug(slug: string): AgencyAgentTemplate {
    const templates = this.loadTemplates();
    const template = templates.find(t => t.slug === slug || t.slug.toLowerCase() === slug.toLowerCase());
    if (!template) {
      throw new NotFoundException(`Agency Agent template with slug '${slug}' not found.`);
    }
    return template;
  }

  async applyTemplateToConfig(slug: string): Promise<AiAgentConfig> {
    const template = this.getTemplateBySlug(slug);
    let config = await this.configRepo.findOne({ where: {} });

    if (!config) {
      config = this.configRepo.create({
        name: template.name,
        systemPrompt: template.systemPrompt,
        enabled: true,
      });
    } else {
      config.name = `OpenWA - ${template.name}`;
      config.systemPrompt = template.systemPrompt;
    }

    const saved = await this.configRepo.save(config);
    this.logger.log(`Applied agency agent template '${template.name}' (${slug}) to active AI Agent config.`);
    return saved;
  }
}
