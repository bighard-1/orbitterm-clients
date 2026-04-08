import { useAppLogStore, type AppLogLevel } from '../store/useAppLogStore';

const CLOUD_SCOPE_PREFIXES = ['cloud-sync', 'cloud-bootstrap'];
const CLOUD_SYNC_SESSION_KEY = 'orbitterm:cloud-sync-session:v1';
const CLOUD_SYNC_POLICY_KEY = 'orbitterm:cloud-sync-policy:v1';
const CLOUD_SYNC_BOOTSTRAP_CACHE_KEY = 'orbitterm:cloud-bootstrap-cache:v1';

const shouldMaskCloudDomain = (scope: string): boolean => {
  const normalized = scope.trim().toLowerCase();
  return CLOUD_SCOPE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
};

const redactSyncDomainInText = (input: string): string => {
  if (!input) {
    return input;
  }
  return input.replace(/\bhttps?:\/\/[^\s/]+/gi, (raw) => {
    if (raw.toLowerCase().startsWith('https://')) {
      return 'https://**';
    }
    if (raw.toLowerCase().startsWith('http://')) {
      return 'http://**';
    }
    return '**';
  });
};

const safeReadLocalStorage = (key: string): string => {
  try {
    return window.localStorage.getItem(key) ?? '';
  } catch (_error) {
    return '';
  }
};

const collectKnownSyncDomains = (): string[] => {
  const domains = new Set<string>();
  const captureFromURL = (raw: string): void => {
    const value = raw.trim();
    if (!value) {
      return;
    }
    try {
      const parsed = new URL(value);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        domains.add(`${parsed.protocol}//${parsed.host}`.toLowerCase());
      }
    } catch (_error) {
      // Ignore malformed URL values.
    }
  };

  const sessionRaw = safeReadLocalStorage(CLOUD_SYNC_SESSION_KEY);
  if (sessionRaw) {
    try {
      const parsed = JSON.parse(sessionRaw) as { apiBaseUrl?: string };
      captureFromURL(typeof parsed.apiBaseUrl === 'string' ? parsed.apiBaseUrl : '');
    } catch (_error) {
      // Ignore parse failures.
    }
  }

  const policyRaw = safeReadLocalStorage(CLOUD_SYNC_POLICY_KEY);
  if (policyRaw) {
    try {
      const parsed = JSON.parse(policyRaw) as { defaultSyncDomain?: string };
      captureFromURL(typeof parsed.defaultSyncDomain === 'string' ? parsed.defaultSyncDomain : '');
    } catch (_error) {
      // Ignore parse failures.
    }
  }

  const bootstrapRaw = safeReadLocalStorage(CLOUD_SYNC_BOOTSTRAP_CACHE_KEY);
  if (bootstrapRaw) {
    try {
      const parsed = JSON.parse(bootstrapRaw) as {
        endpoint?: string;
        policy?: { defaultSyncDomain?: string };
      };
      captureFromURL(typeof parsed.endpoint === 'string' ? parsed.endpoint : '');
      captureFromURL(
        parsed.policy && typeof parsed.policy.defaultSyncDomain === 'string'
          ? parsed.policy.defaultSyncDomain
          : ''
      );
    } catch (_error) {
      // Ignore parse failures.
    }
  }

  return Array.from(domains);
};

const redactKnownSyncDomainsInText = (input: string): string => {
  const knownDomains = collectKnownSyncDomains();
  if (!input || knownDomains.length === 0) {
    return input;
  }
  let output = input;
  for (const domain of knownDomains) {
    const escaped = domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const httpsPattern = new RegExp(`${escaped}`, 'gi');
    output = output.replace(httpsPattern, (raw) => {
      if (raw.toLowerCase().startsWith('https://')) {
        return 'https://**';
      }
      if (raw.toLowerCase().startsWith('http://')) {
        return 'http://**';
      }
      return '**';
    });
  }
  return output;
};

const redactEmailInText = (input: string): string => {
  if (!input) {
    return input;
  }
  return input.replace(/\b([A-Za-z0-9._%+-]{1,64})@([A-Za-z0-9.-]+\.[A-Za-z]{2,24})\b/g, (_raw, local: string, domain: string) => {
    const localTrimmed = String(local ?? '').trim();
    if (!localTrimmed) {
      return `***@${domain}`;
    }
    if (localTrimmed.length <= 2) {
      return `${localTrimmed[0] ?? '*'}***@${domain}`;
    }
    return `${localTrimmed.slice(0, 2)}***@${domain}`;
  });
};

const redactBearerTokenInText = (input: string): string => {
  if (!input) {
    return input;
  }
  return input
    .replace(/\b(Bearer)\s+[A-Za-z0-9\-._~+/]+=*/gi, '$1 **')
    .replace(/\b(Authorization['"]?\s*[:=]\s*['"]?Bearer)\s+[A-Za-z0-9\-._~+/]+=*/gi, '$1 **');
};

const redactJWTLikeTokenInText = (input: string): string => {
  if (!input) {
    return input;
  }
  // JWT-like token: xxx.yyy.zzz with base64url-ish parts.
  return input.replace(
    /\b[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,}\b/g,
    '**jwt**'
  );
};

const redactSecretAssignmentsInText = (input: string): string => {
  if (!input) {
    return input;
  }
  return input
    .replace(/\b(token|access_token|refresh_token|id_token|password|passphrase|private_key|secret|api_key|apikey)\b\s*[:=]\s*["']?([^"'\s,;]+)/gi, '$1=**')
    .replace(/\b(github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9]+|sk-[A-Za-z0-9-_]+)/g, '**secret**');
};

const redactIPv4InText = (input: string): string => {
  if (!input) {
    return input;
  }
  return input.replace(/\b((?:\d{1,3}\.){3}\d{1,3})\b/g, (raw, ip: string) => {
    const segments = String(ip).split('.');
    if (segments.length !== 4) {
      return raw;
    }
    return `${segments[0]}.${segments[1]}.*.*`;
  });
};

const sanitizeSensitiveText = (input: string): string => {
  let output = input;
  output = redactEmailInText(output);
  output = redactBearerTokenInText(output);
  output = redactJWTLikeTokenInText(output);
  output = redactSecretAssignmentsInText(output);
  output = redactIPv4InText(output);
  return output;
};

const normalizeDetail = (detail: unknown): string | undefined => {
  if (detail == null) {
    return undefined;
  }
  if (typeof detail === 'string') {
    return detail;
  }
  if (detail instanceof Error) {
    return detail.stack ?? detail.message;
  }
  try {
    return JSON.stringify(detail);
  } catch (_error) {
    return String(detail);
  }
};

export const appendAppLog = (
  level: AppLogLevel,
  scope: string,
  message: string,
  detail?: unknown
): void => {
  const shouldMask = shouldMaskCloudDomain(scope);
  const normalizedMessage = shouldMask
    ? redactSyncDomainInText(message)
    : redactKnownSyncDomainsInText(message);
  const normalizedDetailRaw = normalizeDetail(detail);
  const normalizedDetail =
    normalizedDetailRaw == null
      ? undefined
      : shouldMask
        ? redactSyncDomainInText(normalizedDetailRaw)
        : redactKnownSyncDomainsInText(normalizedDetailRaw);
  const finalMessage = sanitizeSensitiveText(normalizedMessage);
  const finalDetail = normalizedDetail == null ? undefined : sanitizeSensitiveText(normalizedDetail);

  useAppLogStore.getState().appendLog({
    level,
    scope,
    message: finalMessage,
    detail: finalDetail
  });
};

export const logAppInfo = (scope: string, message: string, detail?: unknown): void => {
  appendAppLog('info', scope, message, detail);
};

export const logAppWarn = (scope: string, message: string, detail?: unknown): void => {
  appendAppLog('warn', scope, message, detail);
};

export const logAppError = (scope: string, message: string, detail?: unknown): void => {
  appendAppLog('error', scope, message, detail);
};
