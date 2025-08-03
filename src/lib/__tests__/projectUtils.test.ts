import { detectProjectFromDomain, getProjectFromHost, getProjectConfig, getProjectCachePrefix } from '../projectUtils';

describe('Project Utils', () => {
  describe('detectProjectFromDomain', () => {
    it('should detect PMP project correctly', () => {
      expect(detectProjectFromDomain('premarketprice.com')).toBe('pmp');
      expect(detectProjectFromDomain('www.premarketprice.com')).toBe('pmp');
      expect(detectProjectFromDomain('api.premarketprice.com')).toBe('pmp');
    });

    it('should detect CM project correctly', () => {
      expect(detectProjectFromDomain('capmovers.com')).toBe('cm');
      expect(detectProjectFromDomain('www.capmovers.com')).toBe('cm');
      expect(detectProjectFromDomain('api.capmovers.com')).toBe('cm');
    });

    it('should detect GL project correctly', () => {
      expect(detectProjectFromDomain('gainerslosers.com')).toBe('gl');
      expect(detectProjectFromDomain('www.gainerslosers.com')).toBe('gl');
      expect(detectProjectFromDomain('api.gainerslosers.com')).toBe('gl');
    });

    it('should detect CV project correctly', () => {
      expect(detectProjectFromDomain('stockcv.com')).toBe('cv');
      expect(detectProjectFromDomain('www.stockcv.com')).toBe('cv');
      expect(detectProjectFromDomain('api.stockcv.com')).toBe('cv');
    });

    it('should return PMP as fallback for unknown domains', () => {
      expect(detectProjectFromDomain('unknown.com')).toBe('pmp');
      expect(detectProjectFromDomain('')).toBe('pmp');
      expect(detectProjectFromDomain('example.com')).toBe('pmp');
    });

    it('should handle case insensitive domains', () => {
      expect(detectProjectFromDomain('PREMARKETPRICE.COM')).toBe('pmp');
      expect(detectProjectFromDomain('CapMovers.com')).toBe('cm');
      expect(detectProjectFromDomain('GAINERSLOSERS.COM')).toBe('gl');
      expect(detectProjectFromDomain('StockCV.com')).toBe('cv');
    });
  });

  describe('getProjectFromHost', () => {
    it('should return PMP for localhost development', () => {
      expect(getProjectFromHost('localhost')).toBe('pmp');
      expect(getProjectFromHost('127.0.0.1')).toBe('pmp');
      expect(getProjectFromHost('localhost:3000')).toBe('pmp');
    });

    it('should return PMP for Vercel preview domains', () => {
      expect(getProjectFromHost('project-name.vercel.app')).toBe('pmp');
      expect(getProjectFromHost('preview-xyz.vercel.app')).toBe('pmp');
    });

    it('should return PMP as default fallback', () => {
      expect(getProjectFromHost()).toBe('pmp');
      expect(getProjectFromHost('')).toBe('pmp');
    });
  });

  describe('getProjectConfig', () => {
    it('should return correct project configuration for PMP', () => {
      const config = getProjectConfig('pmp');
      expect(config.code).toBe('pmp');
      expect(config.name).toBe('PreMarketPrice');
      expect(config.domain).toBe('premarketprice.com');
      expect(config.description).toBe('Pre-market stock prices and market cap overview');
    });

    it('should return correct project configuration for CM', () => {
      const config = getProjectConfig('cm');
      expect(config.code).toBe('cm');
      expect(config.name).toBe('CapMovers');
      expect(config.domain).toBe('capmovers.com');
      expect(config.description).toBe('Biggest market cap movers and changes');
    });

    it('should return PMP config as fallback for unknown project', () => {
      const config = getProjectConfig('unknown');
      expect(config.code).toBe('pmp');
      expect(config.name).toBe('PreMarketPrice');
    });
  });

  describe('getProjectCachePrefix', () => {
    it('should return correct cache prefix for each project', () => {
      expect(getProjectCachePrefix('pmp')).toBe('pmp');
      expect(getProjectCachePrefix('cm')).toBe('cm');
      expect(getProjectCachePrefix('gl')).toBe('gl');
      expect(getProjectCachePrefix('cv')).toBe('cv');
    });

    it('should return PMP prefix as fallback', () => {
      expect(getProjectCachePrefix('unknown')).toBe('pmp');
      expect(getProjectCachePrefix()).toBe('pmp');
    });
  });
}); 