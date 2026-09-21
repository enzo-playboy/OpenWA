import { containsCollection, endsWithQuestion } from '../content-rules';

describe('content-rules — Regra 7 (sempre terminar com pergunta)', () => {
  it('aceita mensagem terminando em "?"', () => {
    expect(endsWithQuestion('Oi Maria! Faz sentido a gente conversar?')).toBe(true);
    expect(endsWithQuestion('Vocês vendem ouro ou semijoia?')).toBe(true);
  });

  it('aceita decoração depois da pergunta (asterisco/emoji do script de treinamento)', () => {
    expect(endsWithQuestion('Maria, ficou mais alguma dúvida?*')).toBe(true);
    expect(endsWithQuestion('É isso que você busca? 🙏')).toBe(true);
  });

  it('aceita interrogação duplicada ("certo??")', () => {
    expect(endsWithQuestion('Podemos avançar, certo??')).toBe(true);
  });

  it('rejeita mensagem terminando em silêncio (afirmativo ou ponto final)', () => {
    expect(endsWithQuestion('Qualquer coisa me avisa!')).toBe(false);
    expect(endsWithQuestion('Fico à disposição.')).toBe(false);
    expect(endsWithQuestion('Se algum dia fizer sentido, é só chamar')).toBe(false);
  });

  it('rejeita vazio', () => {
    expect(endsWithQuestion('')).toBe(false);
    expect(endsWithQuestion('   ')).toBe(false);
  });

  it('ponto final antes do "?" não confunde o validador', () => {
    // "…hoje?" termina a mensagem: o '.' interno está no meio do texto.
    expect(endsWithQuestion('Hoje a cotação subiu. E para você, compensa?')).toBe(true);
    // "…terminou." termina a mensagem com ponto.
    expect(endsWithQuestion('A cotação subiu. Acho que compensa.')).toBe(false);
  });
});

describe('content-rules — Regra 5 (proibido cobrar resposta)', () => {
  it('detecta as frases clássicas de cobrança', () => {
    expect(containsCollection('Oi! Tô aguardando sua resposta, viu?')).toBe(true);
    expect(containsCollection('Estou aguardando sua resposta sobre a proposta')).toBe(true);
    expect(containsCollection('Vai me responder?')).toBe(true);
    expect(containsCollection('Por que você sumiu?')).toBe(true);
    expect(containsCollection('Me responde por favor')).toBe(true);
    expect(containsCollection('Fico aguardando retorno')).toBe(true);
  });

  it('detecta cobrança mesmo com variações de acento/caixa', () => {
    expect(containsCollection('TÔ AGUARDANDO SUA RESPOSTA')).toBe(true);
    expect(containsCollection('Voce vai responder ou nao?')).toBe(true);
  });

  it('NÃO marca mensagens normais de follow-up com valor', () => {
    expect(containsCollection('Oi Maria! A cotação do ouro subiu hoje. Faz sentido te contar?')).toBe(false);
    expect(containsCollection('Passando para saber se a estrutura de irrigação ajudou na lavoura?')).toBe(false);
    expect(containsCollection('Um cliente com a mesma dúvida teceu um feedback ótimo. Quer ver?')).toBe(false);
  });

  it('NÃO marca quando "aguardando" aparece em contexto legítimo e sem pressão', () => {
    // Ex.: falando do lead/pedido, não cobrando-o.
    expect(containsCollection('Seu pedido está aguardando a confirmação do pagamento')).toBe(false);
    expect(containsCollection('Sua cotação está em análise e logo te trago a resposta')).toBe(false);
  });

  it('texto vazio não é cobrança', () => {
    expect(containsCollection('')).toBe(false);
  });
});
