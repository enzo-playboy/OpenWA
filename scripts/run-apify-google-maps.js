const dotenv = require('dotenv');
const { spawnSync } = require('child_process');

dotenv.config();

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const APIFY_API_BASE_URL = 'https://api.apify.com/v2';

function readPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main() {
  if (!APIFY_TOKEN) {
    console.error('APIFY_TOKEN precisa estar configurado no .env!');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const skipImport = args.includes('--skip-import');
  const positionalArgs = args.filter((arg) => !arg.startsWith('--'));
  const location = positionalArgs[0] || process.env.APIFY_LOCATION || 'São Paulo, SP, Brazil';
  const configuredTerms = (process.env.APIFY_SEARCH_TERMS || '')
    .split(',')
    .map((term) => term.trim())
    .filter(Boolean);
  const searchTerms = positionalArgs.slice(1).length > 0
    ? positionalArgs.slice(1)
    : configuredTerms.length > 0
      ? configuredTerms
      : ['relojoaria', 'joalheria', 'clinica estetica', 'odontologia estetica', 'marcenaria planejado', 'optica'];
  const actorId = process.env.APIFY_GOOGLE_PLACES_ACTOR || 'compass~crawler-google-places';
  const maxCrawledPlacesPerSearch = readPositiveInteger(
    process.env.APIFY_MAX_RESULTS_PER_SEARCH,
    30,
  );
  const pollIntervalMs = readPositiveInteger(process.env.APIFY_POLL_INTERVAL_MS, 5000);
  const runTimeoutMs = readPositiveInteger(process.env.APIFY_RUN_TIMEOUT_MS, 10 * 60 * 1000);

  console.log('Iniciando Google Maps Scraper na Apify...');
  console.log(`Localização: ${location}`);
  console.log(`Termos de Busca: ${searchTerms.join(', ')}`);
  console.log('Filtro Ativo: Apenas empresas SEM site (onlyWithoutWebsite: true)');

  const inputPayload = {
    searchStringsArray: searchTerms,
    locationQuery: location,
    maxCrawledPlacesPerSearch,
    onlyWithoutWebsite: true,
    language: 'pt-BR',
  };

  const startResponse = await fetch(`${APIFY_API_BASE_URL}/acts/${actorId}/runs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${APIFY_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(inputPayload),
  });

  if (!startResponse.ok) {
    const errorText = await startResponse.text();
    throw new Error(`Erro ao iniciar ator na Apify: ${startResponse.status} ${errorText}`);
  }

  const runData = await startResponse.json();
  const runId = runData.data?.id;
  const datasetId = runData.data?.defaultDatasetId;

  if (!runId || !datasetId) {
    throw new Error('A Apify não retornou runId ou defaultDatasetId.');
  }

  console.log(`Run iniciado com sucesso no Apify! Run ID: ${runId}`);
  console.log(`Dataset ID: ${datasetId}`);
  console.log('Aguardando a conclusão da raspagem...');

  const startedAt = Date.now();
  let status = 'RUNNING';

  while (!['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) {
    if (Date.now() - startedAt >= runTimeoutMs) {
      throw new Error(`Tempo limite de ${runTimeoutMs} ms atingido enquanto aguardava a Apify.`);
    }

    await delay(pollIntervalMs);
    const checkResponse = await fetch(`${APIFY_API_BASE_URL}/actor-runs/${runId}`, {
      headers: {
        Authorization: `Bearer ${APIFY_TOKEN}`,
      },
    });

    if (!checkResponse.ok) {
      const errorText = await checkResponse.text();
      throw new Error(`Erro ao consultar execução da Apify: ${checkResponse.status} ${errorText}`);
    }

    const checkData = await checkResponse.json();
    status = checkData.data?.status || 'UNKNOWN';
    console.log(`STATUS: ${status}...`);
  }

  if (status !== 'SUCCEEDED') {
    throw new Error(`A execução falhou com status: ${status}`);
  }

  console.log('Raspagem no Google Maps concluída com sucesso!');

  if (skipImport) {
    console.log('Importação para o Supabase ignorada.');
    return;
  }

  console.log('Importando automaticamente os leads sem site para o Supabase...');
  const importResult = spawnSync(
    process.execPath,
    ['scripts/import-apify-leads.js', datasetId, '--only-no-website'],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        APIFY_TOKEN,
      },
    },
  );

  if (importResult.error) {
    throw importResult.error;
  }

  if (importResult.status !== 0) {
    throw new Error(`Erro na importação para o Supabase: código ${importResult.status}`);
  }
}

main().catch((error) => {
  console.error('Erro na execução:', error.message);
  process.exitCode = 1;
});