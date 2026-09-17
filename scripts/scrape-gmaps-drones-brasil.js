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

const SEARCH_QUERIES = [
  'empresa pulverizacao drone brasil',
  'loja de drones brasil',
  'manutencao de drones brasil',
  'mapeamento agricola drone',
  'drones agricultura de precisao'
];

async function runDronesScraper() {
  console.log('🛸 Iniciando Scraper Nacional de Drones (Brasil Inteiro - Sem Limite Geográfico)...');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=pt-BR']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  const allScrapedLeads = [];

  for (const query of SEARCH_QUERIES) {
    console.log(`\n🔎 Pesquisando no Google Maps: "${query}"...`);
    const targetUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}?entry=ttu`;

    try {
      await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      await page.waitForSelector('div[role="feed"]', { timeout: 15000 }).catch(() => {});

      // Rolar resultados
      await page.evaluate(async () => {
        const feed = document.querySelector('div[role="feed"]');
        if (!feed) return;
        for (let i = 0; i < 10; i++) {
          feed.scrollBy(0, 1000);
          await new Promise(r => setTimeout(r, 1200));
        }
      });

      const placeLinks = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="/maps/place/"]'));
        return Array.from(new Set(links.map(a => a.href)));
      });

      console.log(`📍 ${placeLinks.length} locais encontrados para "${query}"`);

      for (let i = 0; i < Math.min(placeLinks.length, 15); i++) {
        const link = placeLinks[i];
        try {
          await page.goto(link, { waitUntil: 'networkidle2', timeout: 25000 });
          await new Promise(r => setTimeout(r, 1200));

          const details = await page.evaluate(() => {
            const name = document.querySelector('h1')?.innerText?.trim() || '';
            const bodyText = document.body.innerText;
            const phoneMatch = bodyText.match(/\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/);
            const phone = phoneMatch ? phoneMatch[0] : '';
            
            let website = '';
            const siteBtn = document.querySelector('a[data-tooltip*="site"], a[aria-label*="site"], a[data-item-id="authority"]');
            if (siteBtn && siteBtn.href) {
              website = siteBtn.href;
            }

            const category = document.querySelector('button[jsaction*="category"]')?.innerText || 'Drones & Tecnologia Agrícola';
            const address = document.querySelector('button[data-item-id="address"]')?.innerText || '';

            return { name, phone, website, category, address };
          });

          if (!details.name) continue;

          const cleanPhone = sanitizePhone(details.phone);
          const hasNoRealSite = isSocialLinkOrNoWebsite(details.website);

          if (cleanPhone && hasNoRealSite) {
            console.log(`✅ [QUALIFICADO - SEM SITE] ${details.name} | Tel: +${cleanPhone}`);
            allScrapedLeads.push({
              name: details.name,
              phone: cleanPhone,
              category: '🚁 Drones & Agricultura de Precisão',
              website: details.website || null,
              address: details.address
            });
          }
        } catch (err) {
          // Ignora falhas em links individuais
        }
      }
    } catch (err) {
      console.error(`Erro ao pesquisar query "${query}":`, err.message);
    }
  }

  await browser.close();

  console.log(`\n🎉 Total de Leads de Drones Qualificados Sem Site: ${allScrapedLeads.length}`);

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Supabase URL/Key ausente.');
    return;
  }

  let insertedChip1 = 0;
  let insertedChip2 = 0;

  for (let idx = 0; idx < allScrapedLeads.length; idx++) {
    const lead = allScrapedLeads[idx];
    
    // Divide os leads entre os dois chips/sócios (alternado ou por nicho)
    const assignedChip = (idx % 2 === 0) ? 'Chip 1 (Principal)' : 'Chip 2 (TOR Proxy)';

    try {
      const payload = {
        name: lead.name,
        phone: lead.phone,
        status: 'pending',
        metadata: {
          tag: 'LEAD_OURO',
          category: '🚁 Drones & Agricultura de Precisão',
          assigned_chip: assignedChip,
          source: 'Google Maps Drones Brasil',
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
        if (assignedChip.includes('Chip 1')) insertedChip1++;
        else insertedChip2++;
        console.log(`💾 Salvo no Supabase [${assignedChip}]: ${lead.name} (+${lead.phone})`);
      }
    } catch (e) {
      console.error(`Erro ao salvar ${lead.name}:`, e.message);
    }
  }

  console.log(`\n🏆 Varredura concluída!`);
  console.log(`- Novos Leads Atribuídos ao Chip 1: ${insertedChip1}`);
  console.log(`- Novos Leads Atribuídos ao Chip 2: ${insertedChip2}`);
}

runDronesScraper();
