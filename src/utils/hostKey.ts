import type { HostConfig } from '../types/host';

export const buildHostKey = (host: HostConfig): string => {
  const protocol = host.basicInfo.protocol ?? 'ssh';
  if (protocol === 'serial') {
    return `${protocol}::${host.identityId}::${host.basicInfo.serialPath || 'serial.local'}::${host.basicInfo.serialBaudRate || 115200}::${host.basicInfo.name}`;
  }
  return `${protocol}::${host.identityId}::${host.basicInfo.address}:${host.basicInfo.port}::${host.basicInfo.name}`;
};
