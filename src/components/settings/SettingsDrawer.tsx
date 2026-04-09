import { useEffect, useMemo, useState } from 'react';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { toast } from 'sonner';
import type { AuthMethod, IdentityConfig } from '../../types/host';
import { runHealthCheck, type HealthCheckResponse } from '../../services/inspector';
import {
  sshExportPrivateKey,
  sshGenerateKeypair,
  sshPasswordAuthStatus,
  sshSetPasswordAuth,
  type SshPasswordAuthStatusResponse,
  type SshKeyAlgorithm
} from '../../services/ssh';
import { ORBIT_THEME_PRESETS } from '../../theme/orbitTheme';
import { useHostStore } from '../../store/useHostStore';
import {
  useUiSettingsStore,
  type CloseWindowAction,
  type UiContrastMode
} from '../../store/useUiSettingsStore';
import { buildHostKey } from '../../utils/hostKey';
import { APP_LANGUAGE_OPTIONS, type AppLanguage } from '../../i18n/core';
import { useI18n } from '../../i18n/useI18n';
import {
  authenticateByBiometric,
  bindBiometricMasterPasswordFromSession,
  clearBiometricMasterPassword,
  readBiometricStatus
} from '../../services/mobileBiometric';

interface SettingsDrawerProps {
  open: boolean;
  isMobileView?: boolean;
  onClose: () => void;
  onOpenAbout: () => void;
  onOpenInspector: () => void;
  activeCategory: SettingsCategory;
  onCategoryChange: (category: SettingsCategory) => void;
  focusSectionId: string | null;
  focusSequence: number;
  activeTerminalSessionId: string | null;
  activeTerminalHostId: string | null;
  activeTerminalTitle: string | null;
  onOpenCloudAuth: () => void;
  onRunSyncSelfHeal: () => Promise<void>;
}

export type SettingsCategory = 'profile' | 'settings' | 'files' | 'other';

const SETTINGS_CATEGORY_OPTIONS: ReadonlyArray<{ id: SettingsCategory }> = [
  { id: 'profile' },
  { id: 'settings' },
  { id: 'files' },
  { id: 'other' }
];

const FONT_OPTIONS: ReadonlyArray<{ label: string; value: string }> = [
  {
    label: 'JetBrainsMono Nerd Font (图标推荐)',
    value:
      '"JetBrainsMono Nerd Font", "Symbols Nerd Font Mono", "Nerd Font Symbols", "JetBrains Mono", "IBM Plex Mono", "Source Code Pro", Inconsolata, monospace'
  },
  {
    label: 'IBM Plex Mono (推荐)',
    value:
      '"IBM Plex Mono", "Symbols Nerd Font Mono", "Nerd Font Symbols", "JetBrainsMono Nerd Font", "JetBrains Mono", "Source Code Pro", Inconsolata, "Sarasa Mono SC", Menlo, Monaco, monospace'
  },
  {
    label: 'Source Code Pro',
    value:
      '"Source Code Pro", "Symbols Nerd Font Mono", "Nerd Font Symbols", "IBM Plex Mono", "JetBrainsMono Nerd Font", "JetBrains Mono", Inconsolata, "Sarasa Mono SC", Menlo, Monaco, monospace'
  },
  {
    label: 'Fira Code',
    value:
      '"Fira Code", "Symbols Nerd Font Mono", "Nerd Font Symbols", "IBM Plex Mono", "Source Code Pro", "JetBrainsMono Nerd Font", "JetBrains Mono", Inconsolata, Menlo, Monaco, monospace'
  },
  {
    label: 'Inconsolata',
    value:
      'Inconsolata, "Symbols Nerd Font Mono", "Nerd Font Symbols", "IBM Plex Mono", "Source Code Pro", "JetBrainsMono Nerd Font", "JetBrains Mono", "Fira Code", Menlo, Monaco, monospace'
  },
  {
    label: 'JetBrains Mono',
    value:
      '"JetBrains Mono", "Symbols Nerd Font Mono", "Nerd Font Symbols", "JetBrainsMono Nerd Font", "IBM Plex Mono", "Source Code Pro", Inconsolata, Menlo, Monaco, monospace'
  },
  {
    label: 'Sarasa Mono SC',
    value:
      '"Sarasa Mono SC", "Symbols Nerd Font Mono", "Nerd Font Symbols", "IBM Plex Mono", "Source Code Pro", Inconsolata, "JetBrainsMono Nerd Font", "JetBrains Mono", Menlo, Monaco, monospace'
  },
  {
    label: 'SF Mono',
    value:
      'SFMono-Regular, "SF Mono", "Symbols Nerd Font Mono", "Nerd Font Symbols", "IBM Plex Mono", "Source Code Pro", Inconsolata, Menlo, Monaco, monospace'
  }
];

interface ShortcutItem {
  combo: string;
  action: string;
}

const DESKTOP_SHORTCUTS: ReadonlyArray<ShortcutItem> = [
  { combo: 'Cmd/Ctrl + K', action: '打开命令面板（Shift + K 切换 AI 助手）' },
  { combo: 'Cmd/Ctrl + ,', action: '打开或关闭设置中心' },
  { combo: 'Cmd/Ctrl + F', action: '聚焦资产搜索框' },
  { combo: 'Cmd/Ctrl + B', action: '展开/收起 SFTP 抽屉（SSH 会话）' },
  { combo: 'Cmd/Ctrl + J', action: '显示/隐藏终端命令条' },
  { combo: 'Cmd/Ctrl + W', action: '关闭当前终端会话' }
];

const MOBILE_SHORTCUTS: ReadonlyArray<ShortcutItem> = [
  { combo: 'Tab / Esc', action: '通过移动端输入辅助条发送控制键' },
  { combo: 'Ctrl / Alt', action: '作为一次性修饰键，作用于下一次方向键输入' },
  { combo: '← ↑ ↓ →', action: '在命令行中移动光标或浏览历史' },
  { combo: '⌨', action: '启用/关闭系统键盘输入' },
  { combo: '⋮', action: '打开底部操作抽屉（历史/复制/指令库）' }
];

export function SettingsDrawer({
  open,
  isMobileView = false,
  onClose,
  onOpenAbout,
  onOpenInspector,
  activeCategory,
  onCategoryChange,
  focusSectionId,
  focusSequence,
  activeTerminalSessionId,
  activeTerminalHostId,
  activeTerminalTitle,
  onOpenCloudAuth,
  onRunSyncSelfHeal
}: SettingsDrawerProps): JSX.Element | null {
  const { t } = useI18n();
  const terminalFontSize = useUiSettingsStore((state) => state.terminalFontSize);
  const terminalFontFamily = useUiSettingsStore((state) => state.terminalFontFamily);
  const terminalLineHeight = useUiSettingsStore((state) => state.terminalLineHeight);
  const terminalOpacity = useUiSettingsStore((state) => state.terminalOpacity);
  const terminalBlur = useUiSettingsStore((state) => state.terminalBlur);
  const acrylicBlur = useUiSettingsStore((state) => state.acrylicBlur);
  const acrylicSaturation = useUiSettingsStore((state) => state.acrylicSaturation);
  const acrylicBrightness = useUiSettingsStore((state) => state.acrylicBrightness);
  const themePresetId = useUiSettingsStore((state) => state.themePresetId);
  const autoLockEnabled = useUiSettingsStore((state) => state.autoLockEnabled);
  const autoLockMinutes = useUiSettingsStore((state) => state.autoLockMinutes);
  const closeWindowAction = useUiSettingsStore((state) => state.closeWindowAction);
  const autoSftpPathSyncEnabled = useUiSettingsStore((state) => state.autoSftpPathSyncEnabled);
  const mobileBiometricEnabled = useUiSettingsStore((state) => state.mobileBiometricEnabled);
  const language = useUiSettingsStore((state) => state.language);
  const uiScalePercent = useUiSettingsStore((state) => state.uiScalePercent);
  const contrastMode = useUiSettingsStore((state) => state.contrastMode);
  const setTerminalFontSize = useUiSettingsStore((state) => state.setTerminalFontSize);
  const setTerminalFontFamily = useUiSettingsStore((state) => state.setTerminalFontFamily);
  const setTerminalLineHeight = useUiSettingsStore((state) => state.setTerminalLineHeight);
  const setTerminalOpacity = useUiSettingsStore((state) => state.setTerminalOpacity);
  const setTerminalBlur = useUiSettingsStore((state) => state.setTerminalBlur);
  const setAcrylicBlur = useUiSettingsStore((state) => state.setAcrylicBlur);
  const setAcrylicSaturation = useUiSettingsStore((state) => state.setAcrylicSaturation);
  const setAcrylicBrightness = useUiSettingsStore((state) => state.setAcrylicBrightness);
  const setThemePresetId = useUiSettingsStore((state) => state.setThemePresetId);
  const setAutoLockEnabled = useUiSettingsStore((state) => state.setAutoLockEnabled);
  const setAutoLockMinutes = useUiSettingsStore((state) => state.setAutoLockMinutes);
  const setCloseWindowAction = useUiSettingsStore((state) => state.setCloseWindowAction);
  const setAutoSftpPathSyncEnabled = useUiSettingsStore((state) => state.setAutoSftpPathSyncEnabled);
  const setMobileBiometricEnabled = useUiSettingsStore((state) => state.setMobileBiometricEnabled);
  const setLanguage = useUiSettingsStore((state) => state.setLanguage);
  const setUiScalePercent = useUiSettingsStore((state) => state.setUiScalePercent);
  const setContrastMode = useUiSettingsStore((state) => state.setContrastMode);
  const cloudSyncSession = useHostStore((state) => state.cloudSyncSession);
  const cloudSyncPolicy = useHostStore((state) => state.cloudSyncPolicy);
  const cloudLicenseStatus = useHostStore((state) => state.cloudLicenseStatus);
  const isActivatingCloudLicense = useHostStore((state) => state.isActivatingCloudLicense);
  const isSyncingCloud = useHostStore((state) => state.isSyncingCloud);
  const cloudSyncError = useHostStore((state) => state.cloudSyncError);
  const cloudTeams = useHostStore((state) => state.cloudTeams);
  const currentCloudTeamRole = useHostStore((state) => state.currentCloudTeamRole);
  const isLoadingCloudTeams = useHostStore((state) => state.isLoadingCloudTeams);
  const switchCloudTeam = useHostStore((state) => state.switchCloudTeam);
  const identities = useHostStore((state) => state.identities);
  const hosts = useHostStore((state) => state.hosts);
  const isSavingVault = useHostStore((state) => state.isSavingVault);
  const addIdentity = useHostStore((state) => state.addIdentity);
  const updateIdentity = useHostStore((state) => state.updateIdentity);
  const logoutCloudAccount = useHostStore((state) => state.logoutCloudAccount);
  const refreshCloudLicenseStatus = useHostStore((state) => state.refreshCloudLicenseStatus);
  const cloudUser2FAStatus = useHostStore((state) => state.cloudUser2FAStatus);
  const cloudUser2FASetup = useHostStore((state) => state.cloudUser2FASetup);
  const cloudUser2FABackupCodes = useHostStore((state) => state.cloudUser2FABackupCodes);
  const isUpdatingCloud2FA = useHostStore((state) => state.isUpdatingCloud2FA);
  const refreshCloudUser2FAStatus = useHostStore((state) => state.refreshCloudUser2FAStatus);
  const beginCloudUser2FASetup = useHostStore((state) => state.beginCloudUser2FASetup);
  const confirmEnableCloudUser2FA = useHostStore((state) => state.confirmEnableCloudUser2FA);
  const disableCloudUser2FA = useHostStore((state) => state.disableCloudUser2FA);
  const activateCloudLicenseCode = useHostStore((state) => state.activateCloudLicenseCode);
  const syncPullFromCloud = useHostStore((state) => state.syncPullFromCloud);
  const vaultVersion = useHostStore((state) => state.vaultVersion);
  const cloudDevices = useHostStore((state) => state.cloudDevices);
  const isLoadingCloudDevices = useHostStore((state) => state.isLoadingCloudDevices);
  const loadCloudDevices = useHostStore((state) => state.loadCloudDevices);
  const cloudSSHKeys = useHostStore((state) => state.cloudSSHKeys);
  const cloudSSHCanRotate = useHostStore((state) => state.cloudSSHCanRotate);
  const cloudSSHDefaultTtlDays = useHostStore((state) => state.cloudSSHDefaultTtlDays);
  const cloudSSHOverlapDays = useHostStore((state) => state.cloudSSHOverlapDays);
  const isLoadingCloudSSHKeys = useHostStore((state) => state.isLoadingCloudSSHKeys);
  const loadCloudSSHKeys = useHostStore((state) => state.loadCloudSSHKeys);
  const rotateCloudSSHKey = useHostStore((state) => state.rotateCloudSSHKey);
  const revokeCloudSSHKey = useHostStore((state) => state.revokeCloudSSHKey);
  const revokeCloudDevice = useHostStore((state) => state.revokeCloudDevice);
  const revokeAllCloudDevices = useHostStore((state) => state.revokeAllCloudDevices);
  const [identityMode, setIdentityMode] = useState<'new' | 'existing'>('new');
  const [selectedIdentityId, setSelectedIdentityId] = useState<string>('');
  const [identityNameInput, setIdentityNameInput] = useState<string>('');
  const [identityUsernameInput, setIdentityUsernameInput] = useState<string>('root');
  const [keyAlgorithm, setKeyAlgorithm] = useState<SshKeyAlgorithm>('ed25519');
  const [isGeneratingKey, setIsGeneratingKey] = useState<boolean>(false);
  const [isCheckingPasswordAuth, setIsCheckingPasswordAuth] = useState<boolean>(false);
  const [isUpdatingPasswordAuth, setIsUpdatingPasswordAuth] = useState<boolean>(false);
  const [passwordAuthStatus, setPasswordAuthStatus] = useState<SshPasswordAuthStatusResponse | null>(null);
  const [isExportingKey, setIsExportingKey] = useState<boolean>(false);
  const [licenseCodeInput, setLicenseCodeInput] = useState<string>('');
  const [isLicensePanelExpanded, setIsLicensePanelExpanded] = useState<boolean>(false);
  const [cloud2FAEnableOtpInput, setCloud2FAEnableOtpInput] = useState<string>('');
  const [cloud2FADisableOtpInput, setCloud2FADisableOtpInput] = useState<string>('');
  const [cloud2FADisableBackupInput, setCloud2FADisableBackupInput] = useState<string>('');
  const [sshRotatePublicKey, setSshRotatePublicKey] = useState<string>('');
  const [sshRotateComment, setSshRotateComment] = useState<string>('');
  const [sshRotateReason, setSshRotateReason] = useState<string>('manual-rotation');
  const [sshRotateTtlDays, setSshRotateTtlDays] = useState<string>('90');
  const [sshRotateOverlapDays, setSshRotateOverlapDays] = useState<string>('7');
  const [sshRevokeReason, setSshRevokeReason] = useState<string>('manual-revoke');
  const [mobileBiometricAvailable, setMobileBiometricAvailable] = useState<boolean>(false);
  const [isShortcutSheetOpen, setIsShortcutSheetOpen] = useState<boolean>(false);
  const [healthReport, setHealthReport] = useState<HealthCheckResponse | null>(null);
  const [isRunningHealthCheck, setIsRunningHealthCheck] = useState<boolean>(false);
  const [isRunningSyncSelfHeal, setIsRunningSyncSelfHeal] = useState<boolean>(false);

  useEffect(() => {
    if (!open || !cloudSyncSession) {
      return;
    }
    void loadCloudDevices();
    void loadCloudSSHKeys();
    void refreshCloudLicenseStatus();
    void refreshCloudUser2FAStatus();
  }, [
    cloudSyncSession,
    loadCloudDevices,
    loadCloudSSHKeys,
    open,
    refreshCloudLicenseStatus,
    refreshCloudUser2FAStatus
  ]);

  useEffect(() => {
    if (identities.length === 0) {
      setSelectedIdentityId('');
      return;
    }
    if (!selectedIdentityId || !identities.some((item) => item.id === selectedIdentityId)) {
      setSelectedIdentityId(identities[0]?.id ?? '');
    }
  }, [identities, selectedIdentityId]);

  useEffect(() => {
    if (!open || !isMobileView) {
      setMobileBiometricAvailable(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const status = await readBiometricStatus();
        if (!cancelled) {
          setMobileBiometricAvailable(status.isAvailable);
        }
      } catch (_error) {
        if (!cancelled) {
          setMobileBiometricAvailable(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isMobileView, open]);

  useEffect(() => {
    if (!open) {
      setIsShortcutSheetOpen(false);
    }
  }, [open]);

  const selectedIdentity = useMemo(() => {
    if (!selectedIdentityId) {
      return null;
    }
    return identities.find((identity) => identity.id === selectedIdentityId) ?? null;
  }, [identities, selectedIdentityId]);

  useEffect(() => {
    if (identityMode !== 'existing' || !selectedIdentity) {
      return;
    }
    setIdentityNameInput(selectedIdentity.name);
    setIdentityUsernameInput(selectedIdentity.username);
  }, [identityMode, selectedIdentity]);

  const activeHost = useMemo(() => {
    if (!activeTerminalHostId) {
      return null;
    }
    return hosts.find((host) => buildHostKey(host) === activeTerminalHostId) ?? null;
  }, [activeTerminalHostId, hosts]);

  const activeSessionIdentity = useMemo(() => {
    if (!activeHost) {
      return null;
    }
    return identities.find((identity) => identity.id === activeHost.identityId) ?? null;
  }, [activeHost, identities]);

  const isProLicenseActive = useMemo(() => {
    const status = (cloudLicenseStatus?.status ?? '').trim().toLowerCase();
    return Boolean(cloudSyncSession && cloudLicenseStatus?.active && status !== 'grace');
  }, [cloudLicenseStatus, cloudSyncSession]);
  const normalizedLicenseFeatures = useMemo(() => {
    const source = cloudLicenseStatus?.features ?? [];
    return new Set(
      source
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item.length > 0)
    );
  }, [cloudLicenseStatus]);
  const canUseKeyDeployFeature = useMemo(() => {
    if (!isProLicenseActive) {
      return false;
    }
    // Open-core hardening: server must explicitly grant paid capability.
    if (normalizedLicenseFeatures.size === 0) {
      return false;
    }
    return normalizedLicenseFeatures.has('key_deploy');
  }, [isProLicenseActive, normalizedLicenseFeatures]);
  const canUsePasswordAuthToggleFeature = useMemo(() => {
    if (!isProLicenseActive) {
      return false;
    }
    // Open-core hardening: server must explicitly grant paid capability.
    if (normalizedLicenseFeatures.size === 0) {
      return false;
    }
    return normalizedLicenseFeatures.has('ssh_password_auth_toggle');
  }, [isProLicenseActive, normalizedLicenseFeatures]);

  const accountDisplay = useMemo(() => {
    if (!cloudSyncSession?.email) {
      return t('settings.offlineMode');
    }
    return cloudSyncSession.email;
  }, [cloudSyncSession, t]);

  const accountAvatar = useMemo(() => {
    const source = cloudSyncSession?.email?.trim();
    if (!source) {
      return 'OT';
    }
    return source.slice(0, 2).toUpperCase();
  }, [cloudSyncSession]);

  const currentCloudTeamId = useMemo(() => {
    const teamId = cloudSyncSession?.currentTeamId?.trim();
    return teamId || '';
  }, [cloudSyncSession?.currentTeamId]);

  const currentCloudTeamName = useMemo(() => {
    if (!currentCloudTeamId) {
      return '个人空间';
    }
    const found = cloudTeams.find((item) => item.id === currentCloudTeamId);
    return found?.name?.trim() || currentCloudTeamId;
  }, [cloudTeams, currentCloudTeamId]);

  const showProfileCategory = activeCategory === 'profile';
  const showSettingsCategory = activeCategory === 'settings';
  const showFilesCategory = activeCategory === 'files';
  const showOtherCategory = activeCategory === 'other';

  const formatRelativeOnline = (isoText: string): string => {
    const date = new Date(isoText);
    if (Number.isNaN(date.getTime())) {
      return '未知在线时间';
    }
    const diffMs = Date.now() - date.getTime();
    if (diffMs < 60_000) {
      return '刚刚在线';
    }
    if (diffMs < 3_600_000) {
      return `${Math.floor(diffMs / 60_000)} 分钟前在线`;
    }
    if (diffMs < 86_400_000) {
      return `${Math.floor(diffMs / 3_600_000)} 小时前在线`;
    }
    return `${Math.floor(diffMs / 86_400_000)} 天前在线`;
  };

  const formatSSHKeyStatus = (
    status: string
  ): { label: string; className: string } => {
    const normalized = status.trim().toLowerCase();
    if (normalized === 'active') {
      return {
        label: '生效中',
        className: 'bg-emerald-100 text-emerald-700'
      };
    }
    if (normalized === 'expired') {
      return {
        label: '已过期',
        className: 'bg-amber-100 text-amber-700'
      };
    }
    if (normalized === 'revoked') {
      return {
        label: '已撤销',
        className: 'bg-rose-100 text-rose-700'
      };
    }
    return {
      label: status || '未知',
      className: 'bg-slate-100 text-slate-200'
    };
  };

  const authMethodLabel = (method: AuthMethod): string => {
    if (method === 'none') {
      return '无认证（本地串口）';
    }
    return method === 'password' ? '密码认证' : '私钥认证';
  };

  const closeWindowActionLabel = (value: CloseWindowAction): string => {
    if (value === 'tray') {
      return '关闭后驻留系统托盘';
    }
    if (value === 'exit') {
      return '关闭后直接退出';
    }
    return '每次关闭都询问';
  };

  const licenseSummary = useMemo(() => {
    if (!cloudSyncSession) {
      return '未登录';
    }
    if (!cloudLicenseStatus) {
      return '授权状态待刷新';
    }
    const status = (cloudLicenseStatus.status ?? '').trim().toLowerCase();
    if (status === 'grace') {
      const graceEnds = cloudLicenseStatus.graceEndsAt ? `（宽限至：${cloudLicenseStatus.graceEndsAt}）` : '';
      return `宽限期中${graceEnds}`;
    }
    if (status === 'revoked') {
      return '授权已回收';
    }
    if (!cloudLicenseStatus.active) {
      return '未激活（仅本地可用）';
    }
    if (cloudLicenseStatus.isLifetime) {
      return '已激活（永久）';
    }
    if (cloudLicenseStatus.expiresAt) {
      const hostLimit =
        typeof cloudLicenseStatus.maxHosts === 'number' && cloudLicenseStatus.maxHosts > 0
          ? `主机上限 ${cloudLicenseStatus.maxHosts}`
          : '主机不限制';
      const deviceLimit =
        typeof cloudLicenseStatus.maxDevices === 'number' && cloudLicenseStatus.maxDevices > 0
          ? `设备上限 ${cloudLicenseStatus.maxDevices}`
          : '设备不限制';
      return `已激活（到期：${cloudLicenseStatus.expiresAt}，${hostLimit}，${deviceLimit}）`;
    }
    return '已激活';
  }, [cloudLicenseStatus, cloudSyncSession]);
  const syncStatusText = useMemo(() => {
    if (cloudSyncSession && !cloudSyncError) {
      return isSyncingCloud ? '正常（同步中）' : '正常';
    }
    return '异常';
  }, [cloudSyncError, cloudSyncSession, isSyncingCloud]);

  useEffect(() => {
    if (!open || !focusSectionId) {
      return;
    }
    let attempts = 0;
    const maxAttempts = 10;
    const tryScroll = (): void => {
      const target = document.getElementById(focusSectionId);
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
        return;
      }
      attempts += 1;
      if (attempts < maxAttempts) {
        window.setTimeout(tryScroll, 45);
      }
    };
    window.setTimeout(tryScroll, 20);
  }, [focusSectionId, focusSequence, open, activeCategory]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (focusSectionId === 'settings-sync-license') {
      setIsLicensePanelExpanded(true);
    }
  }, [focusSectionId, focusSequence, open]);

  useEffect(() => {
    if (!open || !cloudSyncSession) {
      return;
    }
    setSshRotateTtlDays(String(cloudSSHDefaultTtlDays || 90));
    setSshRotateOverlapDays(String(cloudSSHOverlapDays || 7));
  }, [cloudSSHDefaultTtlDays, cloudSSHOverlapDays, cloudSyncSession, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (!activeTerminalSessionId) {
      setPasswordAuthStatus(null);
      return;
    }
    if (!showFilesCategory) {
      return;
    }
    void refreshPasswordAuthStatus();
  }, [activeTerminalSessionId, open, showFilesCategory]);

  useEffect(() => {
    if (!open || !showSettingsCategory || healthReport) {
      return;
    }
    void handleRunHealthCheck();
  }, [healthReport, open, showSettingsCategory]);

  const applyRecommendedSettingsProfile = (): void => {
    const preferredFont = FONT_OPTIONS[1]?.value ?? FONT_OPTIONS[0]?.value ?? terminalFontFamily;
    setTerminalFontFamily(preferredFont);
    setTerminalFontSize(13);
    setTerminalLineHeight(1.2);
    setTerminalOpacity(90);
    setTerminalBlur(6);
    setAcrylicBlur(14);
    setAcrylicSaturation(118);
    setAcrylicBrightness(102);
    setAutoLockEnabled(true);
    setAutoLockMinutes(5);
    setCloseWindowAction('ask');
    setAutoSftpPathSyncEnabled(true);
    setContrastMode('standard');
    toast.success('已应用推荐默认值（平衡可读性、性能与安全）。');
  };

  const handleRunHealthCheck = async (): Promise<void> => {
    setIsRunningHealthCheck(true);
    try {
      const report = await runHealthCheck();
      setHealthReport(report);
      const firstIssue = report.items.find((item) => item.status !== 'ok');
      if (firstIssue) {
        toast.warning(`环境检测提示：${firstIssue.label}`, {
          description: firstIssue.suggestion ?? firstIssue.message
        });
      } else {
        toast.success('环境健康检查通过。');
      }
    } catch (error) {
      const fallback = '环境检测失败，请稍后重试。';
      const message = error instanceof Error ? error.message : fallback;
      toast.error(message || fallback);
    } finally {
      setIsRunningHealthCheck(false);
    }
  };

  const handleCopyHealthReport = async (): Promise<void> => {
    if (!healthReport) {
      toast.message('暂无可复制的检测结果。');
      return;
    }
    const lines = [
      `generatedAt=${healthReport.generatedAt}`,
      ...healthReport.items.map((item) =>
        `${item.id}\t${item.status}\t${item.label}\t${item.message}\t${item.suggestion ?? '-'}`
      )
    ];
    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.success('诊断报告已复制到剪贴板。');
    } catch (_error) {
      toast.error('复制失败，请检查系统剪贴板权限。');
    }
  };

  const handleRunSyncSelfHeal = async (): Promise<void> => {
    setIsRunningSyncSelfHeal(true);
    try {
      await onRunSyncSelfHeal();
      toast.success('同步自修复已执行完成。');
    } catch (error) {
      const fallback = '同步自修复失败，请稍后重试。';
      const message = error instanceof Error ? error.message : fallback;
      toast.error(message || fallback);
    } finally {
      setIsRunningSyncSelfHeal(false);
    }
  };

  const handleGenerateIdentityKeypair = async (): Promise<void> => {
    const normalizedName = identityNameInput.trim();
    const normalizedUsername = identityUsernameInput.trim();
    if (!normalizedUsername) {
      toast.error('请输入身份用户名。');
      return;
    }
    if (identityMode === 'existing' && !selectedIdentity) {
      toast.error('请选择一个已有身份。');
      return;
    }

    setIsGeneratingKey(true);
    try {
      const comment = `${normalizedUsername}@orbitterm`;
      const generated = await sshGenerateKeypair(keyAlgorithm, comment);
      const authConfig = {
        method: 'privateKey' as const,
        password: '',
        privateKey: generated.privateKey,
        passphrase: ''
      };

      if (identityMode === 'existing' && selectedIdentity) {
        const nextIdentity: IdentityConfig = {
          ...selectedIdentity,
          name: normalizedName || selectedIdentity.name,
          username: normalizedUsername,
          authConfig
        };
        await updateIdentity(nextIdentity);
        toast.success(`已为身份「${nextIdentity.name}」生成新密钥`, {
          description: generated.fingerprint
        });
        return;
      }

      const created = await addIdentity({
        name: normalizedName || `${normalizedUsername}@identity`,
        username: normalizedUsername,
        authConfig
      });
      setIdentityMode('existing');
      setSelectedIdentityId(created.id);
      toast.success(`已创建身份「${created.name}」并写入新密钥`, {
        description: generated.fingerprint
      });
    } catch (error) {
      const fallback = '生成密钥失败，请稍后重试。';
      const message = error instanceof Error ? error.message : fallback;
      toast.error(message || fallback);
    } finally {
      setIsGeneratingKey(false);
    }
  };

  const refreshPasswordAuthStatus = async (): Promise<void> => {
    if (!activeTerminalSessionId) {
      setPasswordAuthStatus(null);
      return;
    }

    setIsCheckingPasswordAuth(true);
    try {
      const status = await sshPasswordAuthStatus(activeTerminalSessionId);
      setPasswordAuthStatus(status);
    } catch (error) {
      const fallback = '读取服务器密码登录状态失败，请稍后重试。';
      const message = error instanceof Error ? error.message : fallback;
      toast.error(message || fallback);
    } finally {
      setIsCheckingPasswordAuth(false);
    }
  };

  const handleTogglePasswordAuth = async (enabled: boolean): Promise<void> => {
    if (!canUsePasswordAuthToggleFeature) {
      toast.error('当前授权不包含“密码登录策略切换”能力，请先激活或升级专业版。');
      return;
    }
    if (!activeTerminalSessionId) {
      toast.error('请先连接一个服务器会话。');
      return;
    }

    if (!enabled) {
      const confirmed = window.confirm(
        '即将关闭该服务器的 SSH 密码登录。请确认你已验证密钥可登录，否则可能导致账户被锁在外面。是否继续？'
      );
      if (!confirmed) {
        return;
      }
    }

    setIsUpdatingPasswordAuth(true);
    try {
      const result = await sshSetPasswordAuth(activeTerminalSessionId, enabled);
      setPasswordAuthStatus(result);
      const actionLabel = enabled ? '已开启密码登录' : '已关闭密码登录';
      const backupHint = result.backupPath ? `（已备份：${result.backupPath}）` : '';
      toast.success(`${actionLabel}${backupHint}`);
    } catch (error) {
      const fallback = enabled ? '开启密码登录失败。' : '关闭密码登录失败。';
      const message = error instanceof Error ? error.message : fallback;
      toast.error(message || fallback);
    } finally {
      setIsUpdatingPasswordAuth(false);
    }
  };

  const handleExportPrivateKey = async (identity: IdentityConfig): Promise<void> => {
    const privateKey = identity.authConfig.privateKey?.trim() ?? '';
    if (!privateKey) {
      toast.error('当前身份未配置私钥，无法导出。');
      return;
    }

    const fileSafeName = identity.name.replace(/[^\w\u4e00-\u9fa5-]+/g, '-');
    const selectedPath = await saveDialog({
      defaultPath: `${fileSafeName || 'orbitterm-identity'}.pem`
    });
    if (!selectedPath || Array.isArray(selectedPath)) {
      return;
    }

    setIsExportingKey(true);
    try {
      const result = await sshExportPrivateKey(privateKey, selectedPath);
      toast.success('私钥导出成功', {
        description: `${result.path}（${result.bytes} bytes）`
      });
    } catch (error) {
      const fallback = '私钥导出失败，请检查目标目录权限。';
      const message = error instanceof Error ? error.message : fallback;
      toast.error(message || fallback);
    } finally {
      setIsExportingKey(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div
      className={`ot-settings-drawer fixed flex justify-end bg-black/54 backdrop-blur-[20px] ${
        isMobileView
          ? 'inset-x-0 top-0 bottom-[calc(6.6rem+env(safe-area-inset-bottom))] z-[240]'
          : 'inset-0 z-[320]'
      }`}
    >
      <button
        aria-label="关闭设置"
        className="flex-1 cursor-default"
        onClick={onClose}
        type="button"
      />
      <aside
        className={`relative h-full w-full max-w-[620px] overflow-y-auto border-l border-slate-700/70 bg-[linear-gradient(180deg,rgba(16,22,31,0.92),rgba(12,16,24,0.96))] p-5 text-slate-100 shadow-[0_24px_80px_rgba(0,0,0,0.5)] backdrop-blur-xl ${
          isMobileView ? 'pb-[calc(11.6rem+env(safe-area-inset-bottom))]' : ''
        }`}
      >
        <div className="sticky top-0 z-10 -mx-5 -mt-5 mb-5 flex items-center justify-between border-b border-slate-700/70 bg-slate-950/78 px-5 py-4 backdrop-blur-2xl">
          <h2 className="text-base font-semibold text-slate-100">{t('settings.centerTitle')}</h2>
          <button
            className="rounded-[var(--radius)] px-2 py-1 text-xs text-slate-300 hover:bg-white/70"
            onClick={onClose}
            type="button"
          >
            {t('common.close')}
          </button>
        </div>

        <div className="mt-5 space-y-5">
          <section className="rounded-[var(--radius)] bg-slate-950/70 p-4 shadow-[0_12px_28px_rgba(15,23,42,0.12)] ring-1 ring-[#cbdcf8]">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#8ab1e8] bg-[#2a5b9f] text-sm font-semibold text-white">
                {accountAvatar}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-100">{accountDisplay}</p>
                <p className="text-[11px] text-slate-300">
                  {cloudSyncSession ? t('settings.cloudLoggedIn') : t('settings.cloudNotLoggedIn')}
                </p>
              </div>
            </div>

            {isMobileView ? (
              <div className="mt-3 overflow-hidden rounded-[var(--radius)] border border-slate-700/70 bg-slate-900/60">
                {SETTINGS_CATEGORY_OPTIONS.map((item, index) => {
                  const isActive = activeCategory === item.id;
                  const icon =
                    item.id === 'profile'
                      ? '👤'
                      : item.id === 'settings'
                        ? '⚙️'
                        : item.id === 'files'
                          ? '🗂'
                          : 'ℹ️';
                  return (
                    <button
                      className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs ${
                        isActive ? 'bg-[#142642] text-[#9ec5ff]' : 'text-slate-200 hover:bg-slate-800/72'
                      } ${index < SETTINGS_CATEGORY_OPTIONS.length - 1 ? 'border-b border-slate-700/70' : ''}`}
                      key={item.id}
                      onClick={() => onCategoryChange(item.id)}
                      type="button"
                    >
                      <span className="inline-flex items-center gap-2">
                        <span>{icon}</span>
                        <span>{t(`settings.category.${item.id}`)}</span>
                      </span>
                      <span aria-hidden="true" className="text-slate-400">
                        ›
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {SETTINGS_CATEGORY_OPTIONS.map((item) => (
                  <button
                    className={`rounded-[var(--radius)] border px-2.5 py-1.5 text-xs font-medium ${
                      activeCategory === item.id
                        ? 'border-[#3a73db] bg-[#142642] text-[#9ec5ff] shadow-[0_4px_12px_rgba(40,85,170,0.2)]'
                        : 'border-slate-700/70 bg-slate-900/72 text-slate-200 hover:bg-slate-800/72'
                    }`}
                    key={item.id}
                    onClick={() => onCategoryChange(item.id)}
                    type="button"
                  >
                    {t(`settings.category.${item.id}`)}
                  </button>
                ))}
              </div>
            )}

            <button
              className="mt-3 w-full rounded-[var(--radius)] border border-slate-700/70 bg-slate-900/72 px-3 py-2 text-left text-xs font-medium text-slate-100 hover:bg-slate-800/78"
              onClick={() => {
                setIsShortcutSheetOpen(true);
              }}
              type="button"
            >
              快捷键清单
            </button>
          </section>

          {showSettingsCategory && (
            <section
            className="scroll-mt-20 space-y-2 rounded-[var(--radius)] bg-slate-950/70 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70"
            id="settings-font"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-100">终端字体</h3>
              <button
                className="rounded-[var(--radius)] border border-slate-600/70 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-900/64"
                onClick={applyRecommendedSettingsProfile}
                type="button"
              >
                恢复推荐默认值
              </button>
            </div>
            <label className="block text-xs text-slate-300" htmlFor="terminal-font-family">
              字体家族
            </label>
            <select
              className="w-full rounded-[var(--radius)] border border-slate-700/70 bg-white px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-300"
              id="terminal-font-family"
              onChange={(event) => setTerminalFontFamily(event.target.value)}
              value={terminalFontFamily}
            >
              {FONT_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400">
              推荐安装 JetBrainsMono Nerd Font，可获得更完整的文件夹与 Git 图标显示效果。
            </p>

            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>字体大小</span>
              <span>{terminalFontSize}px</span>
            </div>
            <input
              className="ot-thin-slider w-full accent-[#2f6df4]"
              max={20}
              min={9}
              onChange={(event) => setTerminalFontSize(Number(event.target.value))}
              step={1}
              type="range"
              value={terminalFontSize}
            />

            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>行间距</span>
              <span>{terminalLineHeight.toFixed(2)}x</span>
            </div>
            <input
              className="ot-thin-slider w-full accent-[#2f6df4]"
              max={2.4}
              min={1}
              onChange={(event) => setTerminalLineHeight(Number(event.target.value))}
              step={0.05}
              type="range"
              value={terminalLineHeight}
            />
            </section>
          )}

          {showSettingsCategory && (
            <section
            className="scroll-mt-20 space-y-2 rounded-[var(--radius)] bg-slate-950/70 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70"
            id="settings-acrylic"
          >
            <h3 className="text-sm font-semibold text-slate-100">Acrylic / Blur</h3>
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>终端背景透明度</span>
              <span>{terminalOpacity}%</span>
            </div>
            <input
              className="ot-thin-slider w-full accent-[#2f6df4]"
              max={100}
              min={50}
              onChange={(event) => setTerminalOpacity(Number(event.target.value))}
              step={1}
              type="range"
              value={terminalOpacity}
            />

            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>磨砂强度</span>
              <span>{terminalBlur}px</span>
            </div>
            <input
              className="ot-thin-slider w-full accent-[#2f6df4]"
              max={28}
              min={0}
              onChange={(event) => setTerminalBlur(Number(event.target.value))}
              step={1}
              type="range"
              value={terminalBlur}
            />

            <div className="mt-3 rounded-[var(--radius)] border border-slate-700/70 bg-white/70 p-2.5">
              <p className="text-[11px] font-semibold text-slate-200">全局毛玻璃微调（赛博质感）</p>

              <div className="mt-2 flex items-center justify-between text-xs text-slate-300">
                <span>全局模糊</span>
                <span>{acrylicBlur}px</span>
              </div>
              <input
                className="ot-thin-slider w-full accent-[#2f6df4]"
                max={48}
                min={0}
                onChange={(event) => setAcrylicBlur(Number(event.target.value))}
                step={1}
                type="range"
                value={acrylicBlur}
              />

              <div className="mt-2 flex items-center justify-between text-xs text-slate-300">
                <span>饱和度</span>
                <span>{acrylicSaturation}%</span>
              </div>
              <input
                className="ot-thin-slider w-full accent-[#2f6df4]"
                max={220}
                min={60}
                onChange={(event) => setAcrylicSaturation(Number(event.target.value))}
                step={1}
                type="range"
                value={acrylicSaturation}
              />

              <div className="mt-2 flex items-center justify-between text-xs text-slate-300">
                <span>亮度</span>
                <span>{acrylicBrightness}%</span>
              </div>
              <input
                className="ot-thin-slider w-full accent-[#2f6df4]"
                max={150}
                min={70}
                onChange={(event) => setAcrylicBrightness(Number(event.target.value))}
                step={1}
                type="range"
                value={acrylicBrightness}
              />
            </div>
            </section>
          )}

          {showSettingsCategory && (
            <section
            className="scroll-mt-20 space-y-2 rounded-[var(--radius)] bg-slate-950/70 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70"
            id="settings-theme"
          >
            <h3 className="text-sm font-semibold text-slate-100">主题配色</h3>
            <div className="space-y-2">
              {ORBIT_THEME_PRESETS.map((preset) => (
                <button
                  className={`w-full rounded-[var(--radius)] border px-3 py-2 text-left transition ${
                    preset.id === themePresetId
                      ? 'bg-[#eaf1ff] shadow-[0_8px_20px_rgba(37,99,235,0.16)]'
                      : 'border-white/70 bg-slate-900/68 hover:border-slate-700/70 hover:shadow-[0_8px_18px_rgba(15,23,42,0.08)]'
                  }`}
                  key={preset.id}
                  onClick={() => setThemePresetId(preset.id)}
                  style={
                    preset.id === themePresetId
                      ? {
                          borderColor: preset.terminalBorder
                        }
                      : undefined
                  }
                  type="button"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-slate-100">{preset.name}</p>
                      <p className="mt-0.5 text-xs text-slate-300">{preset.description}</p>
                    </div>
                    <span className="rounded-[var(--radius)] border border-slate-700/70 bg-slate-900/64 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                      {preset.id}
                    </span>
                  </div>
                  <div className="mt-2 overflow-hidden rounded-[var(--radius)] border border-slate-700/70/80 bg-white">
                    <div className="h-7 w-full" style={{ background: preset.bodyBackground }} />
                    <div
                      className="grid grid-cols-5 gap-1 px-2 py-1"
                      style={{ background: preset.terminalTheme.background ?? preset.terminalSurfaceHex }}
                    >
                      <span
                        className="h-1.5 rounded"
                        style={{ background: preset.terminalTheme.foreground ?? '#ffffff' }}
                      />
                      <span className="h-1.5 rounded" style={{ background: preset.terminalTheme.blue ?? '#3b82f6' }} />
                      <span className="h-1.5 rounded" style={{ background: preset.terminalTheme.green ?? '#22c55e' }} />
                      <span className="h-1.5 rounded" style={{ background: preset.terminalTheme.magenta ?? '#a855f7' }} />
                      <span className="h-1.5 rounded" style={{ background: preset.terminalTheme.cursor ?? '#f8fafc' }} />
                    </div>
                  </div>
                </button>
              ))}
            </div>
            </section>
          )}

          {showSettingsCategory && (
            <section
              className="scroll-mt-20 space-y-2 rounded-[var(--radius)] bg-slate-950/70 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70"
              id="settings-language"
            >
              <h3 className="text-sm font-semibold text-slate-100">{t('settings.languageTitle')}</h3>
              <p className="text-xs text-slate-300">{t('settings.languageDesc')}</p>
              <select
                className="w-full rounded-[var(--radius)] border border-slate-700/70 bg-white px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-300"
                onChange={(event) => {
                  setLanguage(event.target.value as AppLanguage);
                }}
                value={language}
              >
                {APP_LANGUAGE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </section>
          )}

          {showSettingsCategory && (
            <section
              className="scroll-mt-20 space-y-2 rounded-[var(--radius)] bg-slate-950/70 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70"
              id="settings-accessibility"
            >
              <h3 className="text-sm font-semibold text-slate-100">无障碍</h3>
              <p className="text-xs text-slate-300">支持界面缩放与高对比度模式，长时间使用更舒适。</p>

              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>界面缩放</span>
                <span>{uiScalePercent}%</span>
              </div>
              <input
                className="ot-thin-slider w-full accent-[#2f6df4]"
                max={130}
                min={85}
                onChange={(event) => {
                  setUiScalePercent(Number(event.target.value));
                }}
                step={1}
                type="range"
                value={uiScalePercent}
              />

              <div className="space-y-1.5 pt-1">
                <label className="text-xs text-slate-300" htmlFor="contrast-mode">
                  对比度档位
                </label>
                <select
                  className="w-full rounded-[var(--radius)] border border-slate-700/70 bg-white px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-300"
                  id="contrast-mode"
                  onChange={(event) => {
                    setContrastMode(event.target.value as UiContrastMode);
                  }}
                  value={contrastMode}
                >
                  <option value="standard">标准对比度</option>
                  <option value="high">高对比度</option>
                </select>
              </div>
            </section>
          )}

          {showSettingsCategory && (
            <section
            className="scroll-mt-20 space-y-2 rounded-[var(--radius)] bg-slate-950/70 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70"
            id="settings-security"
          >
            <h3 className="text-sm font-semibold text-slate-100">安全</h3>
            <label className="flex items-start gap-3">
              <input
                checked={autoLockEnabled}
                className="mt-0.5 h-4 w-4 accent-[#2f6df4]"
                onChange={(event) => setAutoLockEnabled(event.target.checked)}
                type="checkbox"
              />
              <span className="text-xs text-slate-200">App 隐藏或闲置后自动锁定金库（推荐开启）。</span>
            </label>
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>自动锁定时长</span>
                <span>{autoLockMinutes} 分钟</span>
              </div>
              <input
                className="ot-thin-slider w-full accent-[#2f6df4]"
                disabled={!autoLockEnabled}
                max={120}
                min={1}
                onChange={(event) => setAutoLockMinutes(Number(event.target.value))}
                step={1}
                type="range"
                value={autoLockMinutes}
              />
            </div>

            {isMobileView && (
              <div className="rounded-[var(--radius)] border border-slate-700/70 bg-slate-900/64 px-3 py-2">
                <label className="flex items-start gap-3">
                  <input
                    checked={mobileBiometricEnabled}
                    className="mt-0.5 h-4 w-4 accent-[#2f6df4]"
                    disabled={!mobileBiometricAvailable}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      if (!checked) {
                        setMobileBiometricEnabled(false);
                        void clearBiometricMasterPassword();
                        toast.message('已关闭 Face ID / Touch ID，后续将仅使用金库密码或账号密码解锁。');
                        return;
                      }
                      void (async () => {
                        try {
                          await authenticateByBiometric('启用 Face ID / Touch ID 解锁');
                          await bindBiometricMasterPasswordFromSession();
                          setMobileBiometricEnabled(true);
                          toast.success('已启用 Face ID / Touch ID，后续将优先使用生物识别解锁。');
                        } catch (error) {
                          setMobileBiometricEnabled(false);
                          const fallback = '启用生物识别失败，请先确认金库已解锁并重试。';
                          const message = error instanceof Error ? error.message : fallback;
                          toast.error(message || fallback);
                        }
                      })();
                    }}
                    type="checkbox"
                  />
                  <span className="text-xs text-slate-200">
                    启用 Face ID / Touch ID 解锁（移动端）。未启用时，必须输入金库密码或账号密码解锁。
                  </span>
                </label>
                {!mobileBiometricAvailable && (
                  <p className="mt-1 text-[11px] text-amber-600">
                    当前设备未检测到可用生物识别能力，暂不可启用。
                  </p>
                )}
              </div>
            )}

            <label className="flex items-start gap-3 pt-1">
              <input
                checked={autoSftpPathSyncEnabled}
                className="mt-0.5 h-4 w-4 accent-[#2f6df4]"
                onChange={(event) => setAutoSftpPathSyncEnabled(event.target.checked)}
                type="checkbox"
              />
              <span className="text-xs text-slate-200">
                自动同步终端路径到 SFTP（默认开启，执行 cd/pushd/popd 后自动切换目录）。
              </span>
            </label>

            <div className="space-y-1.5 pt-2">
              <label className="text-xs text-slate-300" htmlFor="close-window-action">
                点击窗口关闭按钮时
              </label>
              <select
                className="w-full rounded-[var(--radius)] border border-slate-700/70 bg-white px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-300"
                id="close-window-action"
                onChange={(event) => {
                  setCloseWindowAction(event.target.value as CloseWindowAction);
                }}
                value={closeWindowAction}
              >
                <option value="ask">每次关闭都询问（推荐）</option>
                <option value="tray">默认驻留系统托盘</option>
                <option value="exit">默认直接退出</option>
              </select>
              <p className="text-[11px] text-slate-400">
                当前策略：{closeWindowActionLabel(closeWindowAction)}
              </p>
            </div>
            </section>
          )}

          {showSettingsCategory && (
            <section
              className="scroll-mt-20 space-y-3 rounded-[var(--radius)] bg-slate-950/70 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70"
              id="settings-diagnostics"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-100">环境诊断与自修复</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className="rounded-[var(--radius)] border border-slate-600/70 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-900/64 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isRunningHealthCheck}
                    onClick={() => {
                      void handleRunHealthCheck();
                    }}
                    type="button"
                  >
                    {isRunningHealthCheck ? '检测中...' : '执行健康检查'}
                  </button>
                  <button
                    className="rounded-[var(--radius)] border border-slate-600/70 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-900/64 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!healthReport}
                    onClick={() => {
                      void handleCopyHealthReport();
                    }}
                    type="button"
                  >
                    复制诊断报告
                  </button>
                  <button
                    className="rounded-[var(--radius)] border border-[#2f6df4] bg-[#2f6df4] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#245ad0] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isRunningSyncSelfHeal}
                    onClick={() => {
                      void handleRunSyncSelfHeal();
                    }}
                    type="button"
                  >
                    {isRunningSyncSelfHeal ? '修复中...' : '同步自修复'}
                  </button>
                  <button
                    className="rounded-[var(--radius)] border border-slate-600/70 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-900/64"
                    onClick={onOpenInspector}
                    type="button"
                  >
                    打开诊断中心
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-300">
                建议在首次安装、升级后、或出现“连接同步服务失败”时执行一次健康检查与同步自修复。
              </p>
              {healthReport ? (
                <div className="space-y-2">
                  {healthReport.items.map((item) => (
                    <article
                      className="rounded-[var(--radius)] border border-slate-700/70 bg-slate-900/72 px-3 py-2"
                      key={item.id}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-slate-100">{item.label}</p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            item.status === 'ok'
                              ? 'bg-emerald-100 text-emerald-700'
                              : item.status === 'error'
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {item.status === 'ok' ? '正常' : item.status === 'error' ? '异常' : '提示'}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-300">{item.message}</p>
                      {item.suggestion ? (
                        <p className="mt-1 text-[11px] text-slate-400">建议：{item.suggestion}</p>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="rounded-[var(--radius)] border border-dashed border-slate-600/70 bg-white px-3 py-2 text-xs text-slate-400">
                  尚未执行诊断，点击“执行健康检查”获取本机运行环境结果。
                </p>
              )}
            </section>
          )}

          {showFilesCategory && (
            <section
            className="scroll-mt-20 space-y-3 rounded-[var(--radius)] bg-slate-950/70 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70"
            id="settings-identity"
          >
            <h3 className="text-sm font-semibold text-slate-100">身份管理 · SSH 密钥</h3>
            <p className="text-xs text-slate-200">
              生成的新密钥会立即写入本地 E2EE 金库，并通过现有云同步链路自动上传。
            </p>

            <div className="rounded-[var(--radius)] bg-slate-900/62 p-3 ring-1 ring-slate-200/70">
              <p className="text-xs font-semibold text-slate-200">生成新密钥对</p>
              <div className="mt-2 flex items-center gap-4 text-xs text-slate-200">
                <label className="inline-flex items-center gap-1.5">
                  <input
                    checked={identityMode === 'new'}
                    className="h-3.5 w-3.5 accent-[#2f6df4]"
                    onChange={() => setIdentityMode('new')}
                    type="radio"
                  />
                  新建身份
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input
                    checked={identityMode === 'existing'}
                    className="h-3.5 w-3.5 accent-[#2f6df4]"
                    onChange={() => setIdentityMode('existing')}
                    type="radio"
                  />
                  更新已有身份
                </label>
              </div>

              {identityMode === 'existing' && (
                <div className="mt-2 space-y-1.5">
                  <label className="text-xs text-slate-300" htmlFor="key-target-identity">
                    目标身份
                  </label>
                  <select
                    className="w-full rounded-[var(--radius)] border border-slate-700/70 bg-white px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-300"
                    id="key-target-identity"
                    onChange={(event) => setSelectedIdentityId(event.target.value)}
                    value={selectedIdentityId}
                  >
                    {identities.map((identity) => (
                      <option key={identity.id} value={identity.id}>
                        {identity.name} ({identity.username})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-300" htmlFor="key-identity-name">
                    身份名称
                  </label>
                  <input
                    className="w-full rounded-[var(--radius)] border border-slate-700/70 bg-white px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-300"
                    id="key-identity-name"
                    onChange={(event) => setIdentityNameInput(event.target.value)}
                    placeholder="例如：生产服务器密钥"
                    value={identityNameInput}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-300" htmlFor="key-identity-username">
                    登录用户名
                  </label>
                  <input
                    className="w-full rounded-[var(--radius)] border border-slate-700/70 bg-white px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-300"
                    id="key-identity-username"
                    onChange={(event) => setIdentityUsernameInput(event.target.value)}
                    placeholder="例如：root"
                    value={identityUsernameInput}
                  />
                </div>
              </div>

              <div className="mt-2 space-y-1.5">
                <label className="text-xs text-slate-300" htmlFor="key-algorithm">
                  密钥算法
                </label>
                <select
                  className="w-full rounded-[var(--radius)] border border-slate-700/70 bg-white px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-300"
                  id="key-algorithm"
                  onChange={(event) => setKeyAlgorithm(event.target.value as SshKeyAlgorithm)}
                  value={keyAlgorithm}
                >
                  <option value="ed25519">Ed25519（推荐，轻量安全）</option>
                  <option value="ecdsaP256">ECDSA P-256（主流兼容）</option>
                  <option value="ecdsaP384">ECDSA P-384（更高安全边际）</option>
                  <option value="ecdsaP521">ECDSA P-521（高强度）</option>
                  <option value="rsa3072">RSA 3072（兼顾安全与兼容）</option>
                  <option value="rsa4096">RSA 4096（兼容优先）</option>
                </select>
              </div>

              <button
                className="mt-3 rounded-[var(--radius)] border border-[#2f6df4] bg-[#2f6df4] px-3 py-2 text-xs font-semibold text-white hover:bg-[#245ad0] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isGeneratingKey || isSavingVault}
                onClick={() => {
                  void handleGenerateIdentityKeypair();
                }}
                type="button"
              >
                {isGeneratingKey ? '生成中...' : '生成新密钥对并保存到金库'}
              </button>
            </div>

            <div className="rounded-[var(--radius)] bg-slate-900/62 p-3 ring-1 ring-slate-200/70">
              <p className="text-xs font-semibold text-slate-200">已有身份密钥</p>
              <p className="mt-1 text-[11px] text-slate-400">
                一键部署入口已迁移到“资产管理”中的每台设备操作区。当前会话：
                {activeTerminalTitle ?? '未连接'}
                {activeSessionIdentity
                  ? `（${authMethodLabel(activeSessionIdentity.authConfig.method)}）`
                  : ''}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                授权状态：{isProLicenseActive ? '已激活' : '未激活'}
                {isProLicenseActive
                  ? `（密钥部署：${canUseKeyDeployFeature ? '可用' : '不可用'}；密码策略：${
                      canUsePasswordAuthToggleFeature ? '可用' : '不可用'
                    }）`
                  : '（需激活后使用专业能力）'}
              </p>
              <div className="mt-2 rounded-[var(--radius)] border border-slate-700/70 bg-slate-900/68 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold text-slate-200">SSH 密码登录策略</p>
                  <button
                    className="rounded-[var(--radius)] border border-slate-600/70 bg-white px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-900/64 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!activeTerminalSessionId || isCheckingPasswordAuth || isUpdatingPasswordAuth}
                    onClick={() => {
                      void refreshPasswordAuthStatus();
                    }}
                    type="button"
                  >
                    {isCheckingPasswordAuth ? '检测中...' : '刷新状态'}
                  </button>
                </div>
                {!activeTerminalSessionId ? (
                  <p className="mt-1 text-[11px] text-slate-400">请先连接服务器会话后再管理密码登录策略。</p>
                ) : passwordAuthStatus ? (
                  passwordAuthStatus.supported ? (
                    <>
                      <p className="mt-1 text-[11px] text-slate-300">
                        当前状态：{passwordAuthStatus.enabled ? '已开启密码登录' : '已关闭密码登录'}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400">{passwordAuthStatus.detail}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          className="rounded-[var(--radius)] border border-slate-600/70 bg-white px-2.5 py-1 text-[11px] text-slate-200 hover:bg-slate-900/64 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={
                            isUpdatingPasswordAuth ||
                            !canUsePasswordAuthToggleFeature ||
                            passwordAuthStatus.enabled
                          }
                          onClick={() => {
                            void handleTogglePasswordAuth(true);
                          }}
                          type="button"
                        >
                          {isUpdatingPasswordAuth ? '处理中...' : '开启密码登录'}
                        </button>
                        <button
                          className="rounded-[var(--radius)] border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={
                            isUpdatingPasswordAuth ||
                            !canUsePasswordAuthToggleFeature ||
                            !passwordAuthStatus.enabled
                          }
                          onClick={() => {
                            void handleTogglePasswordAuth(false);
                          }}
                          type="button"
                        >
                          {isUpdatingPasswordAuth ? '处理中...' : '关闭密码登录'}
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="mt-1 text-[11px] text-slate-400">
                      当前服务器不支持该能力：{passwordAuthStatus.detail}
                    </p>
                  )
                ) : (
                  <p className="mt-1 text-[11px] text-slate-400">尚未检测，请点击“刷新状态”。</p>
                )}
                {!canUsePasswordAuthToggleFeature && (
                  <p className="mt-1 text-[11px] text-amber-700">
                    当前授权不包含“密码登录策略切换”能力，无法执行修改。
                  </p>
                )}
              </div>
              <div className="mt-2 max-h-52 space-y-2 overflow-auto pr-1">
                {identities.length === 0 ? (
                  <p className="rounded-[var(--radius)] border border-dashed border-slate-600/70 bg-white px-3 py-2 text-xs text-slate-400">
                    暂无身份配置，请先生成一个身份密钥。
                  </p>
                ) : (
                  identities.map((identity) => {
                    const hasPrivateKey =
                      identity.authConfig.method === 'privateKey' &&
                      (identity.authConfig.privateKey?.trim().length ?? 0) > 0;
                    return (
                      <div
                        className="rounded-[var(--radius)] border border-slate-700/70 bg-white px-3 py-2"
                        key={identity.id}
                      >
                        <p className="text-xs font-medium text-slate-100">
                          {identity.name} ({identity.username})
                        </p>
                        <p className="mt-1 text-[11px] text-slate-400">
                          认证方式：{authMethodLabel(identity.authConfig.method)}
                        </p>
                        {hasPrivateKey ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              className="rounded-[var(--radius)] border border-slate-600/70 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-900/64 disabled:cursor-not-allowed disabled:opacity-60"
                              disabled={isExportingKey}
                              onClick={() => {
                                void handleExportPrivateKey(identity);
                              }}
                              type="button"
                            >
                              {isExportingKey ? '导出中...' : '导出私钥'}
                            </button>
                          </div>
                        ) : (
                          <p className="mt-2 text-[11px] text-amber-700">
                            当前身份不是私钥认证，暂无可导出的私钥内容。
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            </section>
          )}

          {showProfileCategory && (
            <section
            className="scroll-mt-20 space-y-3 rounded-[var(--radius)] bg-slate-950/70 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70"
            id="settings-sync"
          >
            <h3 className="text-sm font-semibold text-slate-100">私有云同步</h3>
            <p className="text-xs text-slate-200">
              这里可查看当前同步状态，并执行连接账号、立即拉取和退出登录。
            </p>

            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-[var(--radius)] border border-slate-600/70 bg-white px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-900/64 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSyncingCloud}
                onClick={() => {
                  onOpenCloudAuth();
                }}
                type="button"
              >
                {cloudSyncSession ? '切换账号' : '连接账号'}
              </button>
              <button
                className="rounded-[var(--radius)] border border-slate-600/70 bg-white px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-900/64 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSyncingCloud || !cloudSyncSession}
                onClick={() => {
                  void syncPullFromCloud({ source: 'manual', force: true })
                    .then(() => {
                      const latestError = useHostStore.getState().cloudSyncError;
                      if (latestError) {
                        toast.error(latestError);
                        return;
                      }
                      toast.success('已执行云端拉取检查');
                    })
                    .catch((error) => {
                      const fallback = '云端拉取失败，请稍后重试。';
                      const message = error instanceof Error ? error.message : fallback;
                      toast.error(message || fallback);
                    });
                }}
                type="button"
              >
                立即拉取
              </button>
              <button
                className="rounded-[var(--radius)] border border-slate-600/70 bg-white px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-900/64 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSyncingCloud || !cloudSyncSession}
                onClick={() => {
                  logoutCloudAccount();
                  toast.message('已断开私有云同步账号');
                }}
                type="button"
              >
                退出登录
              </button>
              <button
                className="rounded-[var(--radius)] border border-slate-600/70 bg-white px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-900/64 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSyncingCloud || !cloudSyncSession}
                onClick={() => {
                  void refreshCloudLicenseStatus();
                }}
                type="button"
              >
                刷新授权
              </button>
            </div>

            {cloudSyncSession ? (
              <div className="space-y-2 rounded-[var(--radius)] border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                <p>已登录：{cloudSyncSession.email}（本地金库版本：v{vaultVersion ?? '-'}）</p>
                <p className="text-emerald-900/90">同步状态：{syncStatusText}</p>
                <p className="text-emerald-800/90">同步服务：**</p>
                <p className="text-emerald-900/90">同步授权：{licenseSummary}</p>
                <p className="text-emerald-800/90">
                  说明：主机上限=可保存的远程资产数量；设备上限=登录当前账号的本地客户端数量。
                </p>
                {cloudSyncPolicy?.lockSyncDomain ? (
                  <p className="text-emerald-900/90">
                    域名策略：已锁定{cloudSyncPolicy.hideSyncDomainInput ? '（并隐藏输入）' : ''}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="rounded-[var(--radius)] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                当前未登录私有云账号，数据仅保存在本机加密金库。你也可以先“跳过”，后续随时再登录同步。
              </p>
            )}
            {cloudSyncError ? (
              <p className="rounded-[var(--radius)] border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {cloudSyncError}
              </p>
            ) : null}
            {cloudSyncSession && cloudSyncPolicy?.requireActivation !== false && (
              <div
                className="rounded-[var(--radius)] border border-indigo-400/35 bg-indigo-500/10 px-3 py-3"
                id="settings-sync-license"
              >
                <button
                  className="flex w-full items-center justify-between gap-2 text-left"
                  onClick={() => {
                    setIsLicensePanelExpanded((prev) => !prev);
                  }}
                  type="button"
                >
                  <span className="text-xs font-semibold text-slate-100">同步激活码</span>
                  <span className="text-[11px] font-medium text-slate-300">
                    {isLicensePanelExpanded ? '收起' : '展开'}
                  </span>
                </button>
                <p className="mt-1 text-[11px] text-slate-300">
                  基础同步默认可用；输入购买的激活码可解锁 Pro 功能（如密钥部署等）。
                </p>
                {isLicensePanelExpanded && (
                  <div className="mt-2 flex gap-2">
                    <input
                      className="w-full rounded-[var(--radius)] border border-slate-700/70 bg-white px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-300"
                      onChange={(event) => {
                        setLicenseCodeInput(event.target.value);
                      }}
                      placeholder="例如：OT-MONTH-XXXXXXXX-XXXXXXXX"
                      type="text"
                      value={licenseCodeInput}
                    />
                    <button
                      className="rounded-[var(--radius)] border border-[#2f6df4] bg-[#2f6df4] px-3 py-2 text-xs font-semibold text-white hover:bg-[#245ad0] disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isActivatingCloudLicense}
                      onClick={() => {
                        void activateCloudLicenseCode(licenseCodeInput)
                          .then(() => {
                            setLicenseCodeInput('');
                            void refreshCloudLicenseStatus();
                          })
                          .catch((error) => {
                            const fallback = '激活失败，请稍后重试。';
                            const message = error instanceof Error ? error.message : fallback;
                            toast.error(message || fallback);
                          });
                      }}
                      type="button"
                    >
                      {isActivatingCloudLicense ? '激活中...' : '激活'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {cloudSyncSession ? (
              <div className="rounded-[var(--radius)] border border-violet-400/35 bg-violet-500/10 px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-100">账号 2FA（TOTP）</p>
                  <button
                    className="rounded-[var(--radius)] border border-slate-600/70 bg-white px-2.5 py-1 text-[11px] text-slate-200 hover:bg-slate-900/64 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isUpdatingCloud2FA}
                    onClick={() => {
                      void refreshCloudUser2FAStatus();
                    }}
                    type="button"
                  >
                    刷新
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-slate-300">
                  状态：{cloudUser2FAStatus?.enabled ? '已启用' : '未启用'}
                  {cloudUser2FAStatus?.enabled ? ` ｜ 恢复码剩余 ${cloudUser2FAStatus.backupCodesRemaining}` : ''}
                </p>

                {!cloudUser2FAStatus?.enabled ? (
                  <div className="mt-2 space-y-2">
                    {!cloudUser2FASetup ? (
                      <button
                        className="rounded-[var(--radius)] border border-[#2f6df4] bg-[#2f6df4] px-3 py-2 text-xs font-semibold text-white hover:bg-[#245ad0] disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={isUpdatingCloud2FA}
                        onClick={() => {
                          void beginCloudUser2FASetup().catch((error) => {
                            const fallback = '生成 2FA 密钥失败，请稍后重试。';
                            const message = error instanceof Error ? error.message : fallback;
                            toast.error(message || fallback);
                          });
                        }}
                        type="button"
                      >
                        {isUpdatingCloud2FA ? '生成中...' : '开始启用 2FA'}
                      </button>
                    ) : (
                      <div className="space-y-2 rounded-[var(--radius)] border border-violet-300 bg-white px-3 py-2">
                        <p className="text-[11px] text-slate-200">TOTP 密钥：{cloudUser2FASetup.secret}</p>
                        <p className="text-[11px] text-slate-200">otpauth URI：{cloudUser2FASetup.otpauthUri}</p>
                        <input
                          className="w-full rounded-[var(--radius)] border border-slate-700/70 bg-white px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-300"
                          onChange={(event) => {
                            setCloud2FAEnableOtpInput(event.target.value);
                          }}
                          placeholder="认证器当前 6 位验证码"
                          type="text"
                          value={cloud2FAEnableOtpInput}
                        />
                        <div className="flex gap-2">
                          <button
                            className="rounded-[var(--radius)] border border-[#2f6df4] bg-[#2f6df4] px-3 py-2 text-xs font-semibold text-white hover:bg-[#245ad0] disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isUpdatingCloud2FA}
                            onClick={() => {
                              void confirmEnableCloudUser2FA(cloud2FAEnableOtpInput)
                                .then(() => {
                                  setCloud2FAEnableOtpInput('');
                                })
                                .catch((error) => {
                                  const fallback = '启用 2FA 失败，请稍后重试。';
                                  const message = error instanceof Error ? error.message : fallback;
                                  toast.error(message || fallback);
                                });
                            }}
                            type="button"
                          >
                            {isUpdatingCloud2FA ? '启用中...' : '确认启用'}
                          </button>
                          <button
                            className="rounded-[var(--radius)] border border-slate-600/70 bg-white px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-900/64"
                            disabled={isUpdatingCloud2FA}
                            onClick={() => {
                              setCloud2FAEnableOtpInput('');
                            }}
                            type="button"
                          >
                            清空验证码
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 space-y-2">
                    <input
                      className="w-full rounded-[var(--radius)] border border-slate-700/70 bg-white px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-300"
                      onChange={(event) => {
                        setCloud2FADisableOtpInput(event.target.value);
                      }}
                      placeholder="关闭 2FA：输入当前验证码（优先）"
                      type="text"
                      value={cloud2FADisableOtpInput}
                    />
                    <input
                      className="w-full rounded-[var(--radius)] border border-slate-700/70 bg-white px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-300"
                      onChange={(event) => {
                        setCloud2FADisableBackupInput(event.target.value);
                      }}
                      placeholder="或输入恢复码（例如 ABCD-1234）"
                      type="text"
                      value={cloud2FADisableBackupInput}
                    />
                    <button
                      className="rounded-[var(--radius)] border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isUpdatingCloud2FA}
                      onClick={() => {
                        void disableCloudUser2FA({
                          otpCode: cloud2FADisableOtpInput,
                          backupCode: cloud2FADisableBackupInput
                        })
                          .then(() => {
                            setCloud2FADisableOtpInput('');
                            setCloud2FADisableBackupInput('');
                          })
                          .catch((error) => {
                            const fallback = '关闭 2FA 失败，请稍后重试。';
                            const message = error instanceof Error ? error.message : fallback;
                            toast.error(message || fallback);
                          });
                      }}
                      type="button"
                    >
                      {isUpdatingCloud2FA ? '处理中...' : '关闭 2FA'}
                    </button>
                  </div>
                )}

                {cloudUser2FABackupCodes.length > 0 ? (
                  <div className="mt-2 rounded-[var(--radius)] border border-amber-300 bg-amber-50 px-3 py-2">
                    <p className="text-[11px] font-semibold text-amber-800">恢复码（仅本次展示）</p>
                    <p className="mt-1 text-[11px] text-amber-700">
                      {cloudUser2FABackupCodes.join('  ')}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {cloudSyncSession ? (
              <div className="rounded-[var(--radius)] border border-slate-700/70 bg-slate-900/62 px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-100">团队空间</p>
                  {isLoadingCloudTeams ? <span className="text-[11px] text-slate-400">加载中...</span> : null}
                </div>
                <p className="mt-1 text-[11px] text-slate-300">
                  当前空间：{currentCloudTeamName} · 角色：{currentCloudTeamRole || 'Owner'}
                </p>
                <select
                  className="mt-2 w-full rounded-[var(--radius)] border border-slate-700/70 bg-slate-900/72 px-2 py-2 text-xs text-slate-100 outline-none focus:border-[#90b6ec]"
                  disabled={isLoadingCloudTeams}
                  onChange={(event) => {
                    const nextTeamId = event.target.value.trim();
                    void switchCloudTeam(nextTeamId || null).catch((error) => {
                      const fallback = '切换团队失败，请稍后重试。';
                      toast.error(error instanceof Error ? error.message : fallback);
                    });
                  }}
                  value={currentCloudTeamId}
                >
                  <option value="">个人空间</option>
                  {cloudTeams.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            </section>
          )}

          {showProfileCategory && (
            <section
            className="scroll-mt-20 space-y-3 rounded-[var(--radius)] bg-slate-950/70 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70"
            id="settings-devices"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-100">账号 · 登录设备管理</h3>
              <button
                className="rounded-[var(--radius)] border border-slate-600/70 bg-white px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-900/64 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!cloudSyncSession || isLoadingCloudDevices}
                onClick={() => {
                  void loadCloudDevices();
                }}
                type="button"
              >
                {isLoadingCloudDevices ? '加载中...' : '刷新列表'}
              </button>
            </div>
            {!cloudSyncSession ? (
              <p className="rounded-[var(--radius)] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                请先在上方登录私有云账号，才能查看设备列表。
              </p>
            ) : (
              <>
                <div className="max-h-56 space-y-2 overflow-auto pr-1">
                  {cloudDevices.length === 0 ? (
                    <p className="rounded-[var(--radius)] border border-dashed border-slate-600/70 bg-white px-3 py-2 text-xs text-slate-400">
                      暂无设备记录。
                    </p>
                  ) : (
                    cloudDevices.map((device) => (
                      <div
                        className="rounded-[var(--radius)] border border-slate-700/70 bg-white px-3 py-2"
                        key={device.id}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium text-slate-100">
                            {device.deviceName} - {device.deviceLocation} -{' '}
                            {formatRelativeOnline(device.lastSeenAt)}
                          </p>
                          {device.isCurrent ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                              当前设备
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-[11px] text-slate-400">{device.userAgent}</p>
                        <div className="mt-2 flex justify-end">
                          <button
                            className="rounded-[var(--radius)] border border-rose-300 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isLoadingCloudDevices}
                            onClick={() => {
                              void revokeCloudDevice(device.id).catch((error) => {
                                const fallback = '退出设备失败，请稍后重试。';
                                const message = error instanceof Error ? error.message : fallback;
                                toast.error(message || fallback);
                              });
                            }}
                            type="button"
                          >
                            {device.isCurrent ? '退出当前设备' : '退出此设备'}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <button
                  className="rounded-[var(--radius)] border border-rose-400 bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isLoadingCloudDevices || cloudDevices.length === 0}
                  onClick={() => {
                    void revokeAllCloudDevices().catch((error) => {
                      const fallback = '退出所有设备失败，请稍后重试。';
                      const message = error instanceof Error ? error.message : fallback;
                      toast.error(message || fallback);
                    });
                  }}
                  type="button"
                >
                  退出所有设备
                </button>
              </>
            )}
            </section>
          )}

          {showProfileCategory && (
            <section
            className="scroll-mt-20 space-y-3 rounded-[var(--radius)] bg-slate-950/70 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70"
            id="settings-ssh-keys"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-100">账号 · SSH 密钥轮换</h3>
              <button
                className="rounded-[var(--radius)] border border-slate-600/70 bg-white px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-900/64 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!cloudSyncSession || isLoadingCloudSSHKeys}
                onClick={() => {
                  void loadCloudSSHKeys();
                }}
                type="button"
              >
                {isLoadingCloudSSHKeys ? '加载中...' : '刷新列表'}
              </button>
            </div>
            {!cloudSyncSession ? (
              <p className="rounded-[var(--radius)] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                请先登录私有云账号，才能进行 SSH 密钥轮换。
              </p>
            ) : (
              <>
                <p className="text-xs text-slate-200">
                  状态：{cloudSSHCanRotate ? '可轮换（已具备密钥部署能力）' : '不可轮换（请升级套餐或输入激活码）'}
                </p>
                <div className="space-y-2 rounded-[var(--radius)] border border-slate-700/70 bg-white px-3 py-3">
                  <textarea
                    className="h-20 w-full resize-y rounded-[var(--radius)] border border-slate-700/70 bg-white px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-300"
                    onChange={(event) => {
                      setSshRotatePublicKey(event.target.value);
                    }}
                    placeholder="粘贴新的 OpenSSH 公钥（单行）"
                    value={sshRotatePublicKey}
                  />
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <input
                      className="w-full rounded-[var(--radius)] border border-slate-700/70 bg-white px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-300"
                      onChange={(event) => {
                        setSshRotateComment(event.target.value);
                      }}
                      placeholder="备注（可选）"
                      type="text"
                      value={sshRotateComment}
                    />
                    <input
                      className="w-full rounded-[var(--radius)] border border-slate-700/70 bg-white px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-300"
                      onChange={(event) => {
                        setSshRotateReason(event.target.value);
                      }}
                      placeholder="轮换原因（可选）"
                      type="text"
                      value={sshRotateReason}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <input
                      className="w-full rounded-[var(--radius)] border border-slate-700/70 bg-white px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-300"
                      min={7}
                      onChange={(event) => {
                        setSshRotateTtlDays(event.target.value);
                      }}
                      placeholder={`有效期天数（默认 ${cloudSSHDefaultTtlDays}）`}
                      type="number"
                      value={sshRotateTtlDays}
                    />
                    <input
                      className="w-full rounded-[var(--radius)] border border-slate-700/70 bg-white px-3 py-2 text-xs text-slate-100 outline-none focus:border-blue-300"
                      min={1}
                      onChange={(event) => {
                        setSshRotateOverlapDays(event.target.value);
                      }}
                      placeholder={`重叠期天数（默认 ${cloudSSHOverlapDays}）`}
                      type="number"
                      value={sshRotateOverlapDays}
                    />
                  </div>
                  <button
                    className="rounded-[var(--radius)] border border-[#2f6df4] bg-[#2f6df4] px-3 py-2 text-xs font-semibold text-white hover:bg-[#245ad0] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!cloudSSHCanRotate || isLoadingCloudSSHKeys}
                    onClick={() => {
                      const ttlDays = Number.parseInt(sshRotateTtlDays.trim(), 10);
                      const overlapDays = Number.parseInt(sshRotateOverlapDays.trim(), 10);
                      void rotateCloudSSHKey({
                        publicKey: sshRotatePublicKey,
                        comment: sshRotateComment,
                        reason: sshRotateReason,
                        ttlDays: Number.isFinite(ttlDays) ? ttlDays : undefined,
                        overlapDays: Number.isFinite(overlapDays) ? overlapDays : undefined
                      })
                        .then(() => {
                          setSshRotatePublicKey('');
                        })
                        .catch((error) => {
                          const fallback = '轮换 SSH 密钥失败，请稍后重试。';
                          const message = error instanceof Error ? error.message : fallback;
                          toast.error(message || fallback);
                        });
                    }}
                    type="button"
                  >
                    {isLoadingCloudSSHKeys ? '处理中...' : '提交轮换'}
                  </button>
                </div>
                <div className="max-h-64 space-y-2 overflow-auto pr-1">
                  {cloudSSHKeys.length === 0 ? (
                    <p className="rounded-[var(--radius)] border border-dashed border-slate-600/70 bg-white px-3 py-2 text-xs text-slate-400">
                      暂无 SSH 密钥轮换记录。
                    </p>
                  ) : (
                    cloudSSHKeys.map((item) => {
                      const statusMeta = formatSSHKeyStatus(item.status);
                      return (
                        <div
                          className="rounded-[var(--radius)] border border-slate-700/70 bg-white px-3 py-2"
                          key={item.id}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-medium text-slate-100">{item.algorithm}</p>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusMeta.className}`}
                            >
                              {statusMeta.label}
                            </span>
                          </div>
                          <p className="mt-1 break-all text-[11px] text-slate-300">{item.fingerprint}</p>
                          <p className="mt-1 text-[11px] text-slate-400">
                            备注：{item.comment || '-'} ｜ 到期：{item.expiresAt || '-'}
                          </p>
                          {item.status.trim().toLowerCase() === 'active' ? (
                            <div className="mt-2 flex items-center gap-2">
                              <input
                                className="w-full rounded-[var(--radius)] border border-slate-700/70 bg-white px-2.5 py-1.5 text-[11px] text-slate-200 outline-none focus:border-rose-300"
                                onChange={(event) => {
                                  setSshRevokeReason(event.target.value);
                                }}
                                placeholder="撤销原因（可选）"
                                type="text"
                                value={sshRevokeReason}
                              />
                              <button
                                className="rounded-[var(--radius)] border border-rose-300 bg-rose-50 px-2.5 py-1.5 text-[11px] font-medium text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                                disabled={isLoadingCloudSSHKeys}
                                onClick={() => {
                                  void revokeCloudSSHKey({
                                    keyId: item.id,
                                    reason: sshRevokeReason
                                  }).catch((error) => {
                                    const fallback = '撤销 SSH 密钥失败，请稍后重试。';
                                    const message = error instanceof Error ? error.message : fallback;
                                    toast.error(message || fallback);
                                  });
                                }}
                                type="button"
                              >
                                撤销密钥
                              </button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </section>
          )}

          {showOtherCategory && (
            <section
            className="scroll-mt-20 space-y-2 rounded-[var(--radius)] bg-slate-950/70 p-4 shadow-[0_10px_24px_rgba(15,23,42,0.08)] ring-1 ring-slate-200/70"
            id="settings-about"
          >
            <h3 className="text-sm font-semibold text-slate-100">关于</h3>
            <p className="text-xs text-slate-200">查看版本信息、开源致谢与新版本下载提示。</p>
            <button
              className="rounded-[var(--radius)] border border-slate-700/70 bg-white px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-900/64"
              onClick={onOpenAbout}
              type="button"
            >
              关于轨连终端
            </button>
            </section>
          )}

          {!showProfileCategory && !showSettingsCategory && !showFilesCategory && !showOtherCategory && (
            <p className="rounded-[var(--radius)] border border-dashed border-slate-600/70 bg-white/70 px-3 py-2 text-xs text-slate-400">
              未识别分类，请重新选择。
            </p>
          )}
        </div>

        {isShortcutSheetOpen && (
          <div className="absolute inset-0 z-20 flex items-end justify-center bg-black/45 p-3 backdrop-blur-[20px]">
            <div className="w-full max-w-xl overflow-hidden rounded-[var(--radius)] border border-slate-600/70 bg-slate-950/90 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-700/70 px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-100">快捷键清单</h3>
                <button
                  className="rounded-[var(--radius)] border border-slate-600/70 bg-slate-900/75 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800/80"
                  onClick={() => {
                    setIsShortcutSheetOpen(false);
                  }}
                  type="button"
                >
                  关闭
                </button>
              </div>
              <div className="max-h-[70vh] overflow-auto px-4 py-3 text-xs">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                  Desktop
                </p>
                <div className="overflow-hidden rounded-[var(--radius)] border border-slate-700/70">
                  {DESKTOP_SHORTCUTS.map((item, index) => (
                    <div
                      className={`grid grid-cols-[minmax(108px,40%)_1fr] gap-2 px-3 py-2 ${
                        index < DESKTOP_SHORTCUTS.length - 1 ? 'border-b border-slate-700/70' : ''
                      }`}
                      key={`${item.combo}-${item.action}`}
                    >
                      <code className="font-mono text-[11px] text-sky-300">{item.combo}</code>
                      <span className="text-slate-200">{item.action}</span>
                    </div>
                  ))}
                </div>

                <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                  Mobile
                </p>
                <div className="overflow-hidden rounded-[var(--radius)] border border-slate-700/70">
                  {MOBILE_SHORTCUTS.map((item, index) => (
                    <div
                      className={`grid grid-cols-[minmax(88px,34%)_1fr] gap-2 px-3 py-2 ${
                        index < MOBILE_SHORTCUTS.length - 1 ? 'border-b border-slate-700/70' : ''
                      }`}
                      key={`${item.combo}-${item.action}`}
                    >
                      <code className="font-mono text-[11px] text-violet-300">{item.combo}</code>
                      <span className="text-slate-200">{item.action}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
