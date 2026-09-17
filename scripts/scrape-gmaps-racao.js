const puppeteer = require('puppeteer');
const dotenv = require('dotenv');
dotenv.config({ path: 'e:/prosp/OpenWA/.env' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

function sanitizePhone(phone) {
  if (!phone) return null;
  let cleaned = String(phone).replace(/\D/g, '');
  if (!cleaned) return null;
  if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);
  if (cleaned.length === 10 || cleaned.length === 11) cleaned = '55' + cleaned;
  return cleaned;
}

function isSocialLinkOrNoWebsite(url) {
  if (!url || url.trim() === '') return true;
  const lower = url.toLowerCase();
  if (
    lower.includes('instagram.com') ||
    lower.includes('wa.me') ||
    lower.includes('whatsapp.com') ||
    lower.includes('facebook.com') ||
    lower.includes('linktr.ee') ||
    lower.includes('bio.site') ||
    lower.includes('beacons.ai') ||
    lower.includes('bit.ly') ||
    lower.includes('wats.link')
  ) {
    return true;
  }
  return false;
}

async function runScraper() {
  console.log('🚀 Iniciando Scraper do Google Maps (Ração & Agropecuária - Cuiabá/MT)...');
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=pt-BR']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  const targetUrl = 'https://www.google.com/maps/search/ra%C3%A7ao/@-15.5562008,-56.0539345,14z?entry=ttu';
  console.log('📍 NAVEGANDO PARA:', targetUrl);

  await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });

  // Esperar o painel de resultados carregar
  await page.waitForSelector('div[role="feed"]', { timeout: 30000 }).catch(() => console.log('Aviso: feed não encontrado diretamente, continuando...'));

  // Rolar o painel de resultados para carregar múltiplos resultados
  console.log('📜 Rolando a lista de resultados para carregar todas as lojas de ração...');
  await page.evaluate(async () => {
    const feed = document.querySelector('div[role="feed"]');
    if (!feed) return;
    for (let i = 0; i < 15; i++) {
      feed.scrollBy(0, 1000);
      await new Promise(r => setTimeout(r, 1500));
    }
  });

  // Extrair todos os links/elementos dos resultados
  const placeLinks = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="/maps/place/"]'));
    return Array.from(new Set(links.map(a => a.href)));
  });

  console.log(`🔍 ${placeLinks.length} estabelecimentos encontrados na busca do Google Maps.`);

  const scrapedLeads = [];

  for (let i = 0; i < placeLinks.length; i++) {
    const link = placeLinks[i];
    try {
      console.log(`\n--- [${i + 1}/${placeLinks.length}] Analisando estabelecimento... ---`);
      await page.goto(link, { waitUntil: 'networkidle2', timeout: 30000 });

      await new Promise(r => setTimeout(r, 1500));

      const details = await page.evaluate(() => {
        const name = document.querySelector('h1')?.innerText?.trim() || '';
        
        // Extrai telefone (procura por padrão de número)
        let phone = '';
        const bodyText = document.body.innerText;
        const phoneMatch = bodyText.match(/\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/);
        if (phoneMatch) {
          phone = phoneMatch[0];
        }

        // Procura por botões/links de site
        let website = '';
        const siteBtn = document.querySelector('a[data-tooltip*="site"], a[aria-label*="site"], a[data-item-id="authority"]');
        if (siteBtn && siteBtn.href) {
          website = siteBtn.href;
        }

        // Categoria / Endereço
        const category = document.querySelector('button[jsaction*="category"]')?.innerText || 'Nutrição Animal & Rações';
        const address = document.querySelector('button[data-item-id="address"]')?.innerText || '';

        return { name, phone, website, category, address };
      });

      if (!details.name) continue;

      const cleanPhone = sanitizePhone(details.phone);
      const hasNoRealSite = isSocialLinkOrNoWebsite(details.website);

      console.log(`🏢 Nome: ${details.name}`);
      console.log(`📞 Telefone: ${details.phone} -> Limpo: +${cleanPhone}`);
      console.log(`🌐 Website Detectado: ${details.website || 'Nenhum'}`);
      console.log(`🎯 Status de Site: ${hasNoRealSite ? '✅ SEM SITE PRÓPRIO (QUALIFICADO)' : '❌ POSSUI SITE OFICIAL (DESQUALIFICADO)'}`);

      if (cleanPhone && hasNoRealSite) {
        scrapedLeads.push({
          name: details.name,
          phone: cleanPhone,
          category: '🐄 Nutrição Animal & Rações Agro',
          website: details.website || null,
          address: details.address
        });
      }
    } catch (err) {
      console.error(`Erro ao analisar ${link}:`, err.message);
    }
  }

  await browser.close();

  console.log(`\n🎉 Total de Leads Qualificados (Sem Site com Telefone Válido): ${scrapedLeads.length}`);

  if (scrapedLeads.length === 0) {
    console.log('⚠️ Nenhum novo lead qualificado encontrado nesta varredura.');
    return;
  }

  // Inserir no Supabase
  let inserted = 0;
  for (const lead of scrapedLeads) {
    try {
      const payload = {
        name: lead.name,
        phone: lead.phone,
        status: 'pending',
        metadata: {
          tag: 'LEAD_OURO',
          category: '🐄 Nutrição Animal & Rações Agro',
          assigned_chip: 'Chip 1 (Principal)',
          source: 'Google Maps Ração Cuiabá',
          website_status: 'Sem Site (Instagram/WhatsApp/Nenhum)',
          raw_website: lead.website,
          address: lead.address
        }
      };

      const res = await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        inserted++;
        console.log(`💾 Salvo no Supabase: ${lead.name} (+${lead.phone})`);
      } else {
        console.log(`⚠️ Lead já existia ou ignorado: ${lead.name} (${res.status})`);
      }
    } catch (e) {
      console.error(`Erro ao salvar ${lead.name}:`, e.message);
    }
  }

  console.log(`\n🏆 ${inserted} novos leads de ração sem site foram inseridos no Supabase e adicionados à fila de prospecção!`);
}

runScraper();
