export interface SecurityEvent {
  id: string;
  type: string;
  ip: string;
  endpoint: string;
  userAgent?: string;
  timestamp: Date;
  details?: unknown;
}

// In-memory storage for security events (in production, use database)
const securityEvents: SecurityEvent[] = [];

export function getSecurityEvents(limit: number = 100, type?: string, ip?: string): SecurityEvent[] {
  let filteredEvents = [...securityEvents];

  // Filter by type if specified
  if (type) {
    filteredEvents = filteredEvents.filter(event => event.type === type);
  }

  // Filter by IP if specified
  if (ip) {
    filteredEvents = filteredEvents.filter(event => event.ip === ip);
  }

  // Sort by timestamp (newest first)
  filteredEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Return limited results
  return filteredEvents.slice(0, limit);
}

export function addSecurityEvent(event: Omit<SecurityEvent, 'id' | 'timestamp'>): void {
  const newEvent: SecurityEvent = {
    ...event,
    id: Date.now().toString(),
    timestamp: new Date()
  };

  securityEvents.push(newEvent);

  // Keep only last 1000 events to prevent memory issues
  if (securityEvents.length > 1000) {
    securityEvents.splice(0, securityEvents.length - 1000);
  }
}

export function clearSecurityEvents(): void {
  securityEvents.length = 0;
} 