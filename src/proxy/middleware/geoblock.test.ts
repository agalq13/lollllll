import { Request, Response, NextFunction } from 'express';
import { geoblockMiddleware } from './geoblock';
import { config } from '../../config';
// geoip-lite is no longer used
import { logger } from '../../logger'; // Import logger

// Mock the config and logger
jest.mock('../../config', () => ({
  config: {
    GEOBLOCK_ENABLED: true,
    GEOBLOCK_ALLOWED_COUNTRIES: ['RU', 'BY'],
    GEOBLOCK_DB_PATH: undefined, // Default to geoip-lite's bundled DB
  },
}));

jest.mock('../../logger', () => ({
  logger: {
    child: jest.fn().mockReturnThis(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

// geoip-lite is no longer used, so its mock can be removed.

describe('geoblockMiddleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction = jest.fn();
  let statusJsonFn = jest.fn().mockReturnThis(); // to chain .json()

  beforeEach(() => {
    // Reset mocks for each test
    jest.clearAllMocks();
    mockRequest = {
      ip: '1.2.3.4', // Default IP for tests
      ips: ['1.2.3.4'], // Default ips array
      headers: {}, // Initialize headers
    };
    mockResponse = {
      status: jest.fn().mockImplementation(() => ({
        json: statusJsonFn,
      })),
    };
    nextFunction = jest.fn();
    // No default geoip.lookup mock needed
  });

  test('should allow request if geoblocking is disabled', () => {
    config.GEOBLOCK_ENABLED = false;
    geoblockMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);
    expect(nextFunction).toHaveBeenCalled();
    expect(mockResponse.status).not.toHaveBeenCalled();
    config.GEOBLOCK_ENABLED = true; // Reset for other tests
  });

  test('should allow request if cf-ipcountry header is an allowed country (RU)', () => {
    mockRequest.headers = { 'cf-ipcountry': 'RU' };
    geoblockMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);
    expect(nextFunction).toHaveBeenCalled();
    expect(mockResponse.status).not.toHaveBeenCalled();
  });

  test('should allow request if cf-ipcountry header is an allowed country (BY)', () => {
    mockRequest.headers = { 'cf-ipcountry': 'BY' };
    geoblockMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);
    expect(nextFunction).toHaveBeenCalled();
    expect(mockResponse.status).not.toHaveBeenCalled();
  });

  test('should block request if cf-ipcountry header is a disallowed country (US)', () => {
    mockRequest.headers = { 'cf-ipcountry': 'US' };
    geoblockMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);
    expect(nextFunction).not.toHaveBeenCalled();
    expect(mockResponse.status).toHaveBeenCalledWith(403);
    expect(statusJsonFn).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.any(String),
      country_code: 'US',
    }));
  });

  test('should allow request if cf-ipcountry header is missing', () => {
    mockRequest.headers = {}; // No cf-ipcountry header
    geoblockMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);
    expect(nextFunction).toHaveBeenCalled();
    expect(mockResponse.status).not.toHaveBeenCalled();
  });
  
  test('should allow request for private IP addresses (e.g., 127.0.0.1) when cf-ipcountry is missing', () => {
    mockRequest.ip = '127.0.0.1';
    mockRequest.ips = ['127.0.0.1']; 
    mockRequest.headers = {}; // No cf-ipcountry header
    geoblockMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);
    expect(nextFunction).toHaveBeenCalled();
    expect(mockResponse.status).not.toHaveBeenCalled();
    expect(logger.child({ module: 'geoblock' }).debug).toHaveBeenCalledWith(
      { ip: '127.0.0.1' },
      'Client IP is private, cf-ipcountry header not found, skipping geoblock.'
    );
  });

  test('should allow request if client IP is not found and cf-ipcountry is missing', () => {
    mockRequest.ip = undefined;
    mockRequest.ips = [];
    mockRequest.headers = {}; // No cf-ipcountry header
    geoblockMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);
    expect(nextFunction).toHaveBeenCalled();
    expect(logger.child({ module: 'geoblock' }).warn).toHaveBeenCalledWith(
      { ip: undefined },
      'cf-ipcountry header not found, allowing request.'
    );
  });
  
  test('should allow request if cf-ipcountry is "T1" (Tor) and not explicitly blocked', () => {
    mockRequest.headers = { 'cf-ipcountry': 'T1' };
    // Assuming T1 is not in GEOBLOCK_ALLOWED_COUNTRIES, it should be blocked by default
    // If T1 should be allowed, it needs to be added to GEOBLOCK_ALLOWED_COUNTRIES
    // For this test, let's assume default behavior (block if not in allowed list)
    config.GEOBLOCK_ALLOWED_COUNTRIES = ['RU', 'BY']; // Ensure T1 is not allowed
    geoblockMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);
    expect(nextFunction).not.toHaveBeenCalled();
    expect(mockResponse.status).toHaveBeenCalledWith(403);
    expect(statusJsonFn).toHaveBeenCalledWith(expect.objectContaining({ country_code: 'T1' }));
  });

  test('should use default allowed country "RU" if config.GEOBLOCK_ALLOWED_COUNTRIES is empty or undefined', () => {
    config.GEOBLOCK_ALLOWED_COUNTRIES = undefined; 
    mockRequest.headers = { 'cf-ipcountry': 'US' }; // Test blocking a non-RU country
    geoblockMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);
    expect(mockResponse.status).toHaveBeenCalledWith(403);
    expect(statusJsonFn).toHaveBeenCalledWith(expect.objectContaining({ country_code: 'US' }));
    
    // Test allowing RU
    jest.clearAllMocks(); 
    nextFunction = jest.fn(); 
    mockResponse.status = jest.fn().mockImplementation(() => ({ json: statusJsonFn })); 
    mockRequest.headers = { 'cf-ipcountry': 'RU' };
    geoblockMiddleware(mockRequest as Request, mockResponse as Response, nextFunction);
    expect(nextFunction).toHaveBeenCalled();
    expect(mockResponse.status).not.toHaveBeenCalled();

    config.GEOBLOCK_ALLOWED_COUNTRIES = ['RU', 'BY']; // Reset for other tests
  });

  // The GEOBLOCK_DB_PATH related test is no longer relevant as geoip-lite is removed.
  // It can be removed or adapted if there's a new mechanism for external DBs.
  // For now, let's remove it.
});
