import * as fs from 'fs';
import * as path from 'path';

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

export function parseFrontmatter(content: string): { metadata: Record<string, string>; body: string } {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { metadata: {}, body: content.trim() };
  }

  const [, yamlStr, body] = match;
  const metadata: Record<string, string> = {};

  yamlStr.split(/\r?\n/).forEach((line) => {
    const colonIndex = line.indexOf(':');
    if (colonIndex !== -1) {
      const key = line.slice(0, colonIndex).trim();
      let val = line.slice(colonIndex + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      metadata[key] = val;
    }
  });

  return { metadata, body: body.trim() };
}

export function syncAgencyAgents(): AgencyAgentTemplate[] {
  const baseDir = path.resolve(__dirname, '../agency-agents');
  const outputFilePath = path.resolve(__dirname, '../data/agency-agents-registry.json');

  if (!fs.existsSync(baseDir)) {
    console.error(`Directory not found: ${baseDir}`);
    return [];
  }

  const templates: AgencyAgentTemplate[] = [];

  const entries = fs.readdirSync(baseDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      const category = entry.name;
      const categoryDir = path.join(baseDir, category);
      const files = fs.readdirSync(categoryDir);

      for (const file of files) {
        if (file.endsWith('.md')) {
          const filePath = path.join(categoryDir, file);
          const rawContent = fs.readFileSync(filePath, 'utf-8');
          const { metadata, body } = parseFrontmatter(rawContent);

          const slug = file.replace(/\.md$/, '');
          const template: AgencyAgentTemplate = {
            slug,
            category,
            name: metadata.name || slug.replace(/-/g, ' ').toUpperCase(),
            description: metadata.description || '',
            color: metadata.color || '#3B82F6',
            emoji: metadata.emoji || '🤖',
            vibe: metadata.vibe || '',
            systemPrompt: body,
            filePath: path.relative(path.resolve(__dirname, '..'), filePath).replace(/\\/g, '/'),
          };

          templates.push(template);
        }
      }
    }
  }

  const outputDir = path.dirname(outputFilePath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputFilePath, JSON.stringify(templates, null, 2), 'utf-8');
  console.log(`Successfully synced ${templates.length} agency agent templates to ${outputFilePath}`);
  return templates;
}

if (require.main === module) {
  syncAgencyAgents();
}
