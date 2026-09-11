const fs = require('fs');
const path = require('path');
const os = require('os');
require('dotenv').config();

// Criar um Buffer de áudio WAV mínimo sintético (1 segundo de silêncio/tom em 8kHz 16-bit mono)
function createSampleWavBuffer() {
  const sampleRate = 8000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const numSamples = sampleRate * 1; // 1 segundo
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;

  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size
  buffer.writeUInt16LE(1, 20);  // AudioFormat (1 = PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Gerar tom leve senoidal para não ser silêncio absoluto
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.floor(Math.sin((i / sampleRate) * 2 * Math.PI * 440) * 10000);
    buffer.writeInt16LE(sample, 44 + i * 2);
  }

  return buffer;
}

async function testGroqTranscription() {
  const apiKey = process.env.GROQ_API_KEY || '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';
  const model = process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3-turbo';

  console.log(`[Groq Test] Usando a chave: ${apiKey.substring(0, 12)}...`);
  console.log(`[Groq Test] Usando o modelo: ${model}`);

  const wavBuffer = createSampleWavBuffer();
  const tempPath = path.join(os.tmpdir(), `test_audio_${Date.now()}.wav`);
  fs.writeFileSync(tempPath, wavBuffer);

  try {
    const fileBuffer = fs.readFileSync(tempPath);
    const blob = new Blob([fileBuffer], { type: 'audio/wav' });

    const formData = new FormData();
    formData.append('file', blob, 'sample.wav');
    formData.append('model', model);
    formData.append('language', 'pt');
    formData.append('response_format', 'json');

    console.log(`[Groq Test] Enviando requisição para Groq Whisper API...`);
    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`❌ Erro na API Groq (${response.status}):`, errText);
      process.exit(1);
    }

    const result = await response.json();
    console.log(`✅ Conexão e Transcrição com Groq testada com SUCESSO!`);
    console.log(`📝 Resultado retornado:`, JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`❌ Erro durante o teste:`, err);
    process.exit(1);
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
}

testGroqTranscription();
