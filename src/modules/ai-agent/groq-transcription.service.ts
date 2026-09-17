import { Injectable } from '@nestjs/common';
import { createLogger } from '../../common/services/logger.service';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

@Injectable()
export class GroqTranscriptionService {
  private readonly logger = createLogger('GroqTranscriptionService');

  /**
   * Transcreve um áudio (Buffer ou Base64) usando Fallback Chain (Groq -> OpenAI Whisper -> Fallback Mensagem).
   */
  async transcribeAudio(audioInput: Buffer | string, mimetype = 'audio/ogg'): Promise<string> {
    const groqKey = process.env.GROQ_API_KEY || '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';
    const groqModel = process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3-turbo';

    let buffer: Buffer;
    if (typeof audioInput === 'string') {
      const base64Clean = audioInput.includes(';base64,') ? audioInput.split(';base64,')[1] : audioInput;
      buffer = Buffer.from(base64Clean, 'base64');
    } else {
      buffer = audioInput;
    }

    if (buffer.length === 0) {
      throw new Error('Audio buffer is empty');
    }

    let ext = '.ogg';
    if (mimetype.includes('mp3') || mimetype.includes('mpeg')) ext = '.mp3';
    else if (mimetype.includes('wav')) ext = '.wav';
    else if (mimetype.includes('m4a') || mimetype.includes('mp4')) ext = '.m4a';

    const tempFilePath = path.join(
      os.tmpdir(),
      `openwa_audio_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`,
    );

    try {
      await fs.promises.writeFile(tempFilePath, buffer);
      const fileBuffer = await fs.promises.readFile(tempFilePath);
      const blob = new Blob([fileBuffer], { type: mimetype });

      // Provedor 1: Groq Whisper
      if (groqKey) {
        try {
          this.logger.log(`Transcribing audio via Provider 1: Groq (${groqModel})...`);
          const formData = new FormData();
          formData.append('file', blob, path.basename(tempFilePath));
          formData.append('model', groqModel);
          formData.append('language', 'pt');
          formData.append('response_format', 'json');

          const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${groqKey}` },
            body: formData,
          });

          if (response.ok) {
            const result = (await response.json()) as { text?: string };
            if (result.text && result.text.trim()) {
              this.logger.log(`Groq Transcription success: "${result.text.trim()}"`);
              return result.text.trim();
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Provider 1 (Groq) failed: ${msg}. Trying Provider 2 (OpenAI)...`);
        }
      }

      // Provedor 2: OpenAI Whisper Fallback
      const openAiKey = process.env.OPENAI_API_KEY;
      if (openAiKey) {
        try {
          this.logger.log('Transcribing audio via Provider 2: OpenAI (whisper-1)...');
          const formData = new FormData();
          formData.append('file', blob, path.basename(tempFilePath));
          formData.append('model', 'whisper-1');
          formData.append('language', 'pt');

          const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${openAiKey}` },
            body: formData,
          });

          if (response.ok) {
            const result = (await response.json()) as { text?: string };
            if (result.text && result.text.trim()) {
              this.logger.log(`OpenAI Transcription success: "${result.text.trim()}"`);
              return result.text.trim();
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Provider 2 (OpenAI) failed: ${msg}.`);
        }
      }

      // Fallback final gracioso
      this.logger.warn('All transcription providers failed/unconfigured. Returning polite text fallback prompt.');
      return '[Áudio recebido - por gentileza, pode me mandar em texto para eu te responder mais rápido?]';
    } finally {
      if (fs.existsSync(tempFilePath)) {
        fs.promises.unlink(tempFilePath).catch(() => undefined);
      }
    }
  }
}
