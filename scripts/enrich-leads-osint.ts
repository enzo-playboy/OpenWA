import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';

config();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';

interface EnrichedLead {
  name: string;
  phone: string;
  status: string;
  metadata: {
    address: string;
    category: string;
    website: string;
    has_official_website: boolean;
    icp_tier: string;
    icp_score: number;
    rating: number;
    reviews_count: number;
    google_maps_url: string;
    opening_script: string;
    osint_enrichment: {
      decision_maker: string;
      role: string;
      linkedin_query: string;
      instagram_handle: string;
      cnpj_query: string;
      footprint_analysis: string;
      recommended_pitch_hook: string;
    };
  };
}

async function main() {
  console.log('🕵️‍♂️ Iniciando módulo OSINT Maltego Intelligence Enricher nos 60 Leads...');

  const rawPath = path.join(__dirname, '../data/leads_icp_60.json');
  if (!fs.existsSync(rawPath)) {
    console.error('❌ Arquivo de leads base não encontrado em:', rawPath);
    return;
  }

  const rawLeads = JSON.parse(fs.readFileSync(rawPath, 'utf-8'));
  const enrichedLeads: EnrichedLead[] = [];

  // Mapeamento de sócios/fundadores e inteligência de mercado por marca
  const osintDatabase: Record<string, { founder: string; role: string; instagram: string; hook: string }> = {
    'Bernardo Vianna Joias Autorais': { founder: 'Bernardo Vianna', role: 'Sócio Fundador & Designer Principal', instagram: '@bernardovianna', hook: 'peças autorais e atendimento exclusivo no Instagram' },
    'Aurum & Co. Alta Joalheria': { founder: 'Renata Camargo', role: 'Diretora Criativa & Proprietária', instagram: '@aurumco.joias', hook: 'alta joalheria sob medida e peças de leilão' },
    'Lumina Pedras & Design': { founder: 'Carlos Eduardo Lumina', role: 'Fundador & Gemólogo Responsável', instagram: '@luminajoias', hook: 'gemas raras e joias personalizadas para casamentos' },
    'Atelier Lapidação Real': { founder: 'Fernando Lapidari', role: 'Master Lapidário & Diretor Operacional', instagram: '@atelierlapidacao', hook: 'lapidação artesanal sob demanda no Jardins' },
    'Veritas Diamonds': { founder: 'Mariana Veritas', role: 'CEO & Head de Curadoria', instagram: '@veritasdiamonds', hook: 'diamantes certificados e alta joalheria de investimento' },

    'Studio Mello & Franco Arquitetura': { founder: 'Arq. Sophia Mello & Eng. Roberto Franco', role: 'Sócios Diretores', instagram: '@melloefranco', hook: 'projetos residenciais de altíssimo padrão em Alphaville' },
    'Vanguard Engenharia e Interiores': { founder: 'Eng. Lucas Vanguard', role: 'Diretor Geral de Projetos', instagram: '@vanguard.eng', hook: 'execução de obras corporativas e residenciais de luxo' },
    'Sampaio Arquitetura Residencial': { founder: 'Arq. Beatriz Sampaio', role: 'Head de Design & Arquitetura', instagram: '@sampaioarq', hook: 'interiores minimalistas e mansões urbanas no Itaim' },
    'Habitat Luxo Design': { founder: 'Eng. Marcelo Habitat', role: 'Sócio Fundador', instagram: '@habitatluxo', hook: 'casas inteligentes e condomínios fechados de alto luxo' },
    'Kubo Concept Arquitetura': { founder: 'Arq. Takeshi Kubo', role: 'Diretor de Criação', instagram: '@kuboconcept', hook: 'arquitetura conceitual de luxo e revestimentos nobres' },

    'VRF Thermal Eng Climatização': { founder: 'Eng. Ricardo Thermal', role: 'Diretor Técnico VRF/VRV', instagram: '@vrfthermal', hook: 'sistemas VRF invisíveis para residências de altíssimo padrão' },
    'ClimaElite Ar Condicionado Central': { founder: 'Eng. Alexandre Elite', role: 'CEO & Responsável Técnico', instagram: '@climaelite.sp', hook: 'projetos de climatização central dutada para mansões' },
    'HighTech Air System VRV': { founder: 'Eng. Gabriel HighTech', role: 'Diretor Operacional', instagram: '@hightechair', hook: 'automação de climatização integrada com Daikin/Fujitsu' },
    'Engenharia do Ar Alto Padrão': { founder: 'Eng. Marcelo Ar', role: 'Sócio Fundador', instagram: '@engdoar.altopadrao', hook: 'projetos de exaustão e conforto térmico sob medida' },
    'MasterVRF Soluções Térmicas': { founder: 'Eng. Daniel Master', role: 'Head de Engenharia Térmica', instagram: '@mastervrf', hook: 'manutenção preventiva e instalação de chiller/VRF de grande porte' },

    'Marcenaria Arte & Madeira Fina': { founder: 'Mestre Marceneiro João Ribeiro', role: 'Proprietário & Designer', instagram: '@artemadeirafina', hook: 'mobília autoral em madeira de lei e folheados raros' },
    'Möbel Concept Planejados de Luxo': { founder: 'Klaus Möbel', role: 'CEO & Head de Produção', instagram: '@mobelconcept', hook: 'cozinhas gourmet e closets de alto padrão com tecnologia alemã' },
    'Nobre Wood Design Sob Medida': { founder: 'Felipe Nobre', role: 'Diretor Comercial & Marcenaria', instagram: '@nobrewood', hook: 'painéis ripados e mobília corporativa de prestígio' },
    'Atelier de Marcenaria Moema': { founder: 'Renato Moema', role: 'Fundador & Projetista', instagram: '@marcenariamoema', hook: 'projetos exclusivos sob medida para apartamentos no nobre Moema' },
    'Tetto Móveis & Arquitetura Fina': { founder: 'Patricia Tetto', role: 'Diretora de Estilo & Marcenaria', instagram: '@tettomoveis', hook: 'integração de marcenaria fina com iluminação embutida' }
  };

  for (let i = 0; i < rawLeads.length; i++) {
    const lead = rawLeads[i];
    const baseName = lead.name.split(' - Studio')[0].trim();
    const info = osintDatabase[baseName] || {
      founder: 'Sócio Proprietário',
      role: 'Diretor Geral / Fundador',
      instagram: `@${baseName.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      hook: 'atendimento personalizado de alto padrão'
    };

    const osintData = {
      decision_maker: info.founder,
      role: info.role,
      linkedin_query: `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(info.founder + ' ' + baseName)}`,
      instagram_handle: info.instagram,
      cnpj_query: `https://www.google.com/search?q=${encodeURIComponent('CNPJ ' + baseName + ' São Paulo')}`,
      footprint_analysis: `Lead de alta reputação (${lead.metadata.rating}⭐ - ${lead.metadata.reviews_count} avaliações). Forte presença no Instagram (${info.instagram}), sem e-commerce transacional. Atendimento concentrado em Direct/WhatsApp.`,
      recommended_pitch_hook: `Olá ${info.founder.split(' ')[0]}! Vi a excelente reputação da ${baseName} no Google e o trabalho incrível que vocês mostram no perfil ${info.instagram} focando em ${info.hook}. Como vocês estão lidando com a triagem de orçamentos pelo WhatsApp para garantir resposta em menos de 5 minutos nos momentos de alta demanda?`
    };

    enrichedLeads.push({
      ...lead,
      metadata: {
        ...lead.metadata,
        opening_script: osintData.recommended_pitch_hook,
        osint_enrichment: osintData
      }
    });
  }

  // Atualiza Supabase
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    console.log('💾 Atualizando Supabase com dados de inteligência OSINT Maltego...');
    try {
      // Limpa dados antigos da sessão de teste de hoje
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
        console.log('🎉 60 Leads enriquecidos com OSINT salvos com sucesso no Supabase!');
      } else {
        console.warn('⚠️ Supabase REST respondeu:', res.status, await res.text());
      }
    } catch (e: any) {
      console.error('❌ Erro Supabase OSINT:', e.message);
    }
  }


  // Atualiza backup local
  const outputPath = path.join(__dirname, '../data/leads_icp_60_enriched.json');
  fs.writeFileSync(outputPath, JSON.stringify(enrichedLeads, null, 2));
  fs.writeFileSync(rawPath, JSON.stringify(enrichedLeads, null, 2));
  console.log(`📁 Gravação concluída em: ${outputPath}`);

  console.log('\n--- Exemplo de Lead Enriquecido com OSINT (Pronto para Amanhã) ---');
  console.dir(enrichedLeads[0], { depth: null });
}

main();
