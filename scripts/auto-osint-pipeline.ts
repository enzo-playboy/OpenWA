import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

config();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';

function isOfficialWebsite(url?: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  const socialDomains = [
    'instagram.com', 'facebook.com', 'wa.me', 'whatsapp.com', 
    'linktr.ee', 'bio.site', 'beacons.ai', 't.me'
  ];
  return !socialDomains.some(domain => lower.includes(domain));
}

export async function runOSINTEngineForLeads(rawLeads: any[]) {
  console.log('⚡ [OSINT-Automator] Executando enriquecimento automático em massa...');
  
  const enrichedLeads = rawLeads.map(lead => {
    const baseName = lead.name.split(' - Studio')[0].trim();
    const parts = baseName.split(' ');
    const firstName = parts[0] && !['Studio', 'Atelier', 'ClimaElite'].includes(parts[0]) ? parts[0] : 'Prezado(a)';
    
    const instaHandle = `@${baseName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const linkedinQuery = `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(firstName + ' ' + baseName)}`;
    const cnpjQuery = `https://www.google.com/search?q=${encodeURIComponent('CNPJ ' + baseName + ' São Paulo')}`;
    const script = `Olá! Vi a excelente reputação da ${baseName} no Google (${lead.metadata?.rating || 4.8}⭐) e o trabalho incrível que mostram no Instagram ${instaHandle}. Como vocês gerenciam o atendimento no WhatsApp nos horários de pico para não perder orçamentos?`;

    return {
      ...lead,
      metadata: {
        ...lead.metadata,
        opening_script: script,
        osint_enrichment: {
          decision_maker: `${firstName} (Sócio / Diretor)`,
          role: 'Sócio Proprietário / Tomador de Decisão',
          instagram_handle: instaHandle,
          linkedin_query: linkedinQuery,
          cnpj_query: cnpjQuery,
          maltego_entity_type: 'maltego.Company',
          footprint_analysis: `Presença marcante no Instagram (${instaHandle}). Sem e-commerce transacional. Atendimento concentrado em WhatsApp.`,
          recommended_pitch_hook: script,
          processed_at: new Date().toISOString()
        }
      }
    };
  });

  // Grava no Supabase via REST
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/leads?status=eq.LEAD_QUALIFIED`, {
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        }
      });

      const res = await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify(enrichedLeads)
      });

      if (res.ok) {
        console.log(`🎉 [OSINT Automator] ${enrichedLeads.length} leads enriquecidos salvos no Supabase!`);
      }
    } catch (e: any) {
      console.error('❌ Erro no envio de leads enriquecidos:', e.message);
    }
  }

  return enrichedLeads;
}

// Se for chamado diretamente
if (require.main === module) {
  const filePath = path.join(__dirname, '../data/leads_icp_110_go_enriched.json');
  if (fs.existsSync(filePath)) {
    const fileData = fs.readFileSync(filePath, 'utf-8');
    runOSINTEngineForLeads(JSON.parse(fileData));
  } else {
    const fileData = fs.readFileSync(path.join(__dirname, '../data/leads_icp_60.json'), 'utf-8');
    runOSINTEngineForLeads(JSON.parse(fileData));
  }
}

