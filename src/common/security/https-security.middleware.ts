import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Middleware para forçar HTTPS e aplicar cabeçalhos de segurança em trânsito (OWASP / HSTS).
 */
@Injectable()
export class HttpsSecurityMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const isHttps =
      req.secure || req.headers['x-forwarded-proto'] === 'https' || req.headers['x-forwarded-ssl'] === 'on';

    // Redireciona HTTP para HTTPS em produção
    if (!isHttps && process.env.NODE_ENV === 'production' && process.env.FORCE_HTTPS === 'true') {
      const host = req.headers.host || 'localhost';
      return res.redirect(301, `https://${host}${req.url}`);
    }

    // Aplica cabeçalhos de segurança HTTP rígidos em trânsito
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;",
    );

    next();
  }
}
