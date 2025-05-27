import { Request, Response, NextFunction } from 'express';
import { config } from '../../config';
import { logger } from '../../logger';

const log = logger.child({ module: 'geoblock' });

export function geoblockMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!config.GEOBLOCK_ENABLED) {
    return next();
  }

  const clientIp = req.ip;
  const countryCode = req.headers['cf-ipcountry'] as string;

  if (!countryCode) {
    // If cf-ipcountry header is not present, check if IP is private
    if (clientIp && req.ips.includes(clientIp)) {
      log.debug({ ip: clientIp }, 'Client IP is private, cf-ipcountry header not found, skipping geoblock.');
    } else {
      log.warn({ ip: clientIp }, 'cf-ipcountry header not found, allowing request.');
    }
    return next();
  }

  // Allow private IP addresses - useful for local development and testing
  // req.ip might return private IPs like 127.0.0.1, 192.168.x.x, 10.x.x.x
  // These might not have cf-ipcountry header, handled above.
  // If cf-ipcountry is 'T1', it's a Tor exit node, treat as special case if needed or block.
  // For now, we'll rely on the country code provided.
  if (clientIp && req.ips.includes(clientIp) && !req.headers['cf-ipcountry']) {
    log.debug({ ip: clientIp }, 'Client IP is private (in req.ips but no cf-ipcountry header), skipping geoblock.');
    return next();
  }

  const geo = { country: countryCode };

  if (!geo.country) {
    // This case should ideally not be reached if cf-ipcountry is present
    // but as a safeguard:
    log.warn({ ip: clientIp }, 'Country code from cf-ipcountry is empty, allowing request.');
    return next();
  }

  const allowedCountries = config.GEOBLOCK_ALLOWED_COUNTRIES || ['RU'];
  if (allowedCountries.includes(geo.country)) {
    log.debug({ ip: clientIp, country: geo.country, source: 'cf-ipcountry' }, 'Access granted by geoblock.');
    return next();
  } else {
    log.warn({ ip: clientIp, country: geo.country, source: 'cf-ipcountry', allowed: allowedCountries }, 'Access denied by geoblock.');
    return res.status(403).json({
      error: 'Access denied. Your country is not permitted to access this service.',
      country_code: geo.country,
    });
  }
}
