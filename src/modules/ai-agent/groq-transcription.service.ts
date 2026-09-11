import { Injectable } from '@nestjs/common';
import { createLogger } from '../../common/services/logger.service';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

@Injectable()
export class GroqTranscriptionService {
  private readonly logger = createLogger('GroqTranscriptionService');

  /**
   * Transcreve um áudio (Buffer ou Base64) usando a API Groq (whisper-large-v3-turbo)
   */
  async transcribeAudio(audioInput: Buffer | string, mimetype = 'audio/ogg'): Promise<string> {
    const apiKey = process.env.GROQ_API_KEY || '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';
    const model = process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3-turbo';
    const endpoint = 'https://api.groq.com/openai/v1/audio/transcriptions';

    if (!apiKey) {
      throw new Error('GROQ_API_KEY is not configured.');
    }

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

    const tempFilePath = path.join(os.tmpdir(), `openwa_audio_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`);

    try {
      await fs.promises.writeFile(tempFilePath, buffer);
      this.logger.log(`Temporary audio saved at ${tempFilePath} (${buffer.length} bytes). Transcribing via Groq (${model})...`);

      const fileBuffer = await fs.promises.readFile(tempFilePath);
      const blob = new Blob([fileBuffer], { type: mimetype });

      const formData = new FormData();
      formData.append('file', blob, path.basename(tempFilePath));
      formData.append('model', model);
      formData.append('language', 'pt');
      formData.append('response_format', 'json');
      formData.append('temperature', '0');

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Groq API returned HTTP ${response.status}: ${errText}`);
      }

      const result: any = await response.json();
      const transcribedText = result.text ? result.text.trim() : '';

      this.logger.log(`Groq Transcription success: "${transcribedText}"`);
      return transcribedText;
    } catch (err: any) {
      this.logger.error(`Failed to transcribe audio via Groq: ${err.message}`);
      throw err;
    } finally {
      if (fs.existsSync(tempFilePath)) {
        fs.promises.unlink(tempFilePath).catch(() => undefined);
      }
    }
  }
}
