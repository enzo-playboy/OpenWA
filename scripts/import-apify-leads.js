const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const LEADS_TABLE = process.env.SUPABASE_LEADS_TABLE || 'leads';

/**
 * Format phone number to standard E.164 without '+' or spaces, ensuring 55 DDI for Brazil.
 */
function sanitizePhone(phone) {
  if (!phone) return null;
  let cleaned = String(phone).replace(/\D/g, '');
  if (!cleaned) return null;

  // If it starts with 0, strip it
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }

  // If 10 or 11 digits (e.g. 11999998888 or 1133334444), prepend Brazil country code 55
  if (cleaned.length === 10 || cleaned.length === 11) {
    cleaned = '55' + cleaned;
  }

  return cleaned;
}

/**
 * Fetch dataset items from Apify API or local file
 */
async function fetchApifyDataset(datasetIdOrPath, apifyToken) {
  if (fs.existsSync(datasetIdOrPath)) {
    console.log('Lendo arquivo local: ' + datasetIdOrPath);
    const raw = fs.readFileSync(datasetIdOrPath, 'utf8');
    return JSON.parse(raw);
  }

  console.log('Buscando dataset da Apify API ID/Run: ' + datasetIdOrPath + '...');
  const url = datasetIdOrPath.startsWith('http')
    ? datasetIdOrPath
    : `https://api.apify.com/v2/datasets/${datasetIdOrPath}/items`;

  const headers = {};
  if (apifyToken) {
    headers.Authorization = `Bearer ${apifyToken}`;
  }
  headers.Accept = 'application/json';

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Erro ao buscar dataset da Apify: ${res.status} ${res.statusText}`);
  }
  return await res.json();
}

/**
 * Main execution function
 */
async function main() {
  const args = process.argv.slice(2);
  const target = args[0]; // Dataset ID, Run URL, or local file path

  if (!target) {
    console.log(`
Usage:
  node scripts/import-apify-leads.js <DATASET_ID|RUN_URL|FILE_PATH>

Exemplo 1 (Apify Dataset ID):
  node scripts/import-apify-leads.js abc123def456

Exemplo 2 (Arquivo JSON Local):
  node scripts/import-apify-leads.js ./data/leads.json
`);
    process.exit(1);
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('SUPABASE_URL e SUPABASE_KEY precisam estar configurados no .env!');
    process.exit(1);
  }

  const onlyNoWebsite = args.includes('--only-no-website');
  const onlyHasWebsite = args.includes('--only-has-website');

  try {
    const rawItems = await fetchApifyDataset(target, process.env.APIFY_TOKEN);
    if (!Array.isArray(rawItems)) {
      throw new Error('O dataset retornado não é um array.');
    }

    console.log('Foram encontrados ' + rawItems.length + ' registros brutos no dataset.');

    const formattedLeads = [];
    let skippedCount = 0;
    let websiteFilteredCount = 0;

    for (const item of rawItems) {
      // Extract phone from common Apify leads-scraper & Google Maps fields
      const rawPhone = item.phone || item.mobile || item.phone_number || item.mobileNumber || item.phones?.[0] || item.phoneUnformatted || item.phoneNumber || item.contactPhone;
      const cleanPhone = sanitizePhone(rawPhone);

      if (!cleanPhone) {
        skippedCount++;
        continue;
      }

      // Check website
      const website = item.website || item.domain || item.companyWebsite || item.company_domain || '';
      const hasWebsite = Boolean(website && String(website).trim().length > 0 && !['false', 'n/a', 'none', '-'].includes(String(website).trim().toLowerCase()));

      if (onlyNoWebsite && hasWebsite) {
        websiteFilteredCount++;
        continue;
      }
      if (onlyHasWebsite && !hasWebsite) {
        websiteFilteredCount++;
        continue;
      }

      const name = item.fullName || (item.firstName ? (item.firstName + ' ' + (item.lastName || '')).trim() : null) || item.name || item.title || item.companyName || 'Lead Frio';
      const company = item.companyName || item.company || item.organization || item.title || item.name || '';
      const email = item.email || item.work_email || item.personal_email || '';
      const jobTitle = item.title || item.jobTitle || item.position || item.job_title || item.categoryName || '';

      formattedLeads.push({
        phone: cleanPhone,
        name: name,
        status: 'pending',
        current_step: 0,
        metadata: {
          company: company,
          email: email,
          job_title: jobTitle,
          website: website || null,
          has_website: hasWebsite,
          apify_source: 'apify-importer',
          raw_data: item,
        },
      });
    }

    // Deduplicate leads by phone number in memory
    const leadMap = new Map();
    for (const lead of formattedLeads) {
      if (!leadMap.has(lead.phone)) {
        leadMap.set(lead.phone, lead);
      }
    }
    const uniqueLeads = Array.from(leadMap.values());

    console.log('Leads validados com telefone unico: ' + uniqueLeads.length);
    if (websiteFilteredCount > 0) {
      console.log('Filtrados por regra de site: ' + websiteFilteredCount);
    }
    if (skippedCount > 0) {
      console.log('Ignorados por falta de telefone: ' + skippedCount);
    }

    if (uniqueLeads.length === 0) {
      console.log('Nenhum lead valido com telefone para importar.');
      process.exit(0);
    }

    // Insert into Supabase in batches of 50
    const BATCH_SIZE = 50;
    let insertedTotal = 0;

    for (let i = 0; i < uniqueLeads.length; i += BATCH_SIZE) {
      const batch = uniqueLeads.slice(i, i + BATCH_SIZE);
      const endpoint = `${SUPABASE_URL}/rest/v1/${LEADS_TABLE}?on_conflict=phone`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify(batch),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('Erro no lote ' + (Math.floor(i / BATCH_SIZE) + 1) + ':', errorText);
      } else {
        const inserted = await res.json();
        insertedTotal += inserted.length;
        console.log('Lote ' + (Math.floor(i / BATCH_SIZE) + 1) + ' importado com sucesso: +' + inserted.length + ' leads.');
      }
    }

    console.log('\nImportacao concluida! Total de ' + insertedTotal + ' leads inseridos na tabela \'' + LEADS_TABLE + '\' do Supabase!');
    console.log('Agora você pode disparar a importacao no OpenWA para iniciar a cadencia de 3 lotes diarios!');
  } catch (err) {
    console.error('Erro na execucao:', err.message);
    process.exit(1);
  }
}

main();