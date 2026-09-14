import * as dotenv from 'dotenv';

dotenv.config();

export interface PlaceNewResult {
  id: string;
  name: string;
  address: string;
  rating: number;
  userRatingCount: number;
  websiteUri?: string;
  phone?: string;
  category?: string;
  googleMapsUri?: string;
  hasWebsite: boolean;
  icpScore: number;
}

export async function searchPlacesNew(textQuery: string, maxResults = 20): Promise<PlaceNewResult[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GEMINI_API_KEY || '';

  if (!apiKey) {
    console.warn('⚠️ Nenhuma GOOGLE_PLACES_API_KEY encontrada no .env. Usando fallback de dados.');
  }

  const url = 'https://places.googleapis.com/v1/places:searchText';

  const fieldMask = [
    'places.id',
    'places.displayName',
    'places.formattedAddress',
    'places.rating',
    'places.userRatingCount',
    'places.websiteUri',
    'places.nationalPhoneNumber',
    'places.primaryTypeDisplayName',
    'places.googleMapsUri',
  ].join(',');

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': fieldMask,
      },
      body: JSON.stringify({
        textQuery,
        languageCode: 'pt-BR',
        maxResultCount: maxResults,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Erro na Places API (New): ${res.status} ${errText}`);
      return [];
    }

    const data = await res.json();
    const places = data.places || [];

    return places.map((p: any) => {
      const websiteUri = p.websiteUri || null;
      const hasWebsite = !!websiteUri && !websiteUri.includes('google.com');

      let score = 0;
      if (!hasWebsite) score += 30;
      if ((p.rating || 0) >= 4.5 && (p.userRatingCount || 0) >= 25) score += 25;
      score += 25; // Tier 1 Nicho
      score += 20; // Região

      return {
        id: p.id,
        name: p.displayName?.text || 'Sem Nome',
        address: p.formattedAddress || '',
        rating: p.rating || 0,
        userRatingCount: p.userRatingCount || 0,
        websiteUri,
        phone: p.nationalPhoneNumber || null,
        category: p.primaryTypeDisplayName?.text || '',
        googleMapsUri: p.googleMapsUri || '',
        hasWebsite,
        icpScore: Math.min(score, 100),
      };
    });
  } catch (err) {
    console.error('Erro ao consultar a Places API (New):', err);
    return [];
  }
}

if (require.main === module) {
  const query = process.argv[2] || 'clinicas esteticas em moema sp';
  searchPlacesNew(query).then((results) => {
    console.log(`Encontrados ${results.length} resultados na Places API (New):`);
    console.table(results.slice(0, 10));
  });
}
