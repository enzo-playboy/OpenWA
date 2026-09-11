const dotenv = require('dotenv');
dotenv.config({ path: 'e:/prosp/OpenWA/.env' });

const API_KEY = 'dev-admin-key';
const BASE_URL = 'http://127.0.0.1:2785/api';

async function addKnowledge() {
  const item = {
    title: 'Links de Demonstração e Portfólio de Sites',
    category: 'portfolio',
    content: `Quando o cliente pedir para ver exemplos de sites de joalherias ou relojoarias, compartilhe os links oficiais:
- Template de Joalheria/Relojoaria: https://jewel-shine-template.vercel.app/
- Portfólio Geral da Flowra Labs: https://inspiring-portfolio-studio.vercel.app/

Explique que criamos sites sob medida, extremamente elegantes, modernos e otimizados para celulares para gerar mais vendas e credibilidade.`,
    isActive: true
  };

  const res = await fetch(BASE_URL + '/ai-agent/knowledge', {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(item)
  });

  const data = await res.json();
  console.log('✅ Links salvos no cérebro da Sofia!');
}

addKnowledge();
