import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState, type ChangeEvent } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { HostConfig, IdentityConfig } from '../types/host';
import { detectMobileFormFactor, isAndroidRuntime } from '../services/runtime';
import { hostPattern } from '../schemas/hostSchemas';

const editHostSchema = z
  .object({
    protocol: z.enum(['ssh', 'telnet', 'serial']).default('ssh'),
    name: z.string().max(50, '主机名称不能超过 50 个字符').default(''),
    group: z.string().max(40, '分组名称不能超过 40 个字符').default(''),
    address: z.string().max(255, '主机地址过长').default(''),
    port: z.coerce.number().int('端口必须是整数').min(1, '端口最小为 1').max(65535, '端口最大为 65535'),
    serialPath: z.string().max(255, '串口设备路径过长').default(''),
    serialBaudRate: z.coerce
      .number()
      .int('波特率必须是整数')
      .min(300, '波特率最小为 300')
      .max(4000000, '波特率过大，请检查')
      .default(115200),
    description: z.string().max(160, '备注不能超过 160 个字符').default(''),
    tagsText: z.string().max(120, '标签总长度不能超过 120 个字符').default(''),
    identityName: z.string().max(50, '身份名称不能超过 50 个字符').default(''),
    identityUsername: z.string().min(1, '请输入登录用户名').max(64, '用户名不能超过 64 个字符'),
    method: z.enum(['none', 'password', 'privateKey'], {
      required_error: '请选择认证方式'
    }),
    password: z.string().optional(),
    privateKey: z.string().optional(),
    passphrase: z.string().optional()
  })
  .superRefine((data, ctx) => {
    if (data.protocol === 'serial') {
      if (data.serialPath.trim().length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['serialPath'],
          message: '请输入串口设备路径，例如 COM3 或 /dev/ttyUSB0'
        });
      }
    } else {
      const normalizedAddress = data.address.trim();
      if (normalizedAddress.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['address'],
          message: '请输入有效的主机地址'
        });
      } else if (!hostPattern.test(normalizedAddress)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['address'],
          message: '请输入合法的域名、IPv4 或 [IPv6] 地址'
        });
      }
    }

    if (data.protocol !== 'serial' && data.method === 'password') {
      const pwd = data.password?.trim() ?? '';
      if (pwd.length < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['password'],
          message: '请输入登录密码'
        });
      }
    }

    if (data.protocol === 'ssh' && data.method === 'privateKey') {
      const key = data.privateKey?.trim() ?? '';
      if (key.length < 20) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['privateKey'],
          message: '私钥内容过短，请粘贴完整私钥'
        });
      }
    }
  });

export type HostEditFormValues = z.infer<typeof editHostSchema>;

interface HostEditDialogProps {
  open: boolean;
  host: HostConfig | null;
  identity: IdentityConfig | null;
  linkedHostCount: number;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (values: HostEditFormValues) => Promise<void>;
}

const inputClassName =
  'w-full rounded-xl border border-white/65 bg-white/70 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-frost-accent/60 focus:ring-2 focus:ring-frost-accent/20';

const normalizePrivateKeyContent = (content: string): string => {
  return content.replace(/\u0000/g, '').replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '').trim();
};

export function HostEditDialog({
  open,
  host,
  identity,
  linkedHostCount,
  isSaving,
  onClose,
  onSubmit
}: HostEditDialogProps): JSX.Element | null {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors }
  } = useForm<HostEditFormValues>({
    resolver: zodResolver(editHostSchema),
    mode: 'onBlur',
    defaultValues: {
      name: '',
      group: '',
      protocol: 'ssh',
      address: '',
      port: 22,
      serialPath: '',
      serialBaudRate: 115200,
      description: '',
      tagsText: '',
      identityName: '',
      identityUsername: '',
      method: 'password',
      password: '',
      privateKey: '',
      passphrase: ''
    }
  });

  useEffect(() => {
    if (!open || !host || !identity) {
      return;
    }
    setKeyUploadHint('');

    reset({
      name: host.basicInfo.name,
      group: host.basicInfo.group ?? '',
      protocol: host.basicInfo.protocol ?? 'ssh',
      address: host.basicInfo.address,
      port: host.basicInfo.port,
      serialPath: host.basicInfo.serialPath ?? '',
      serialBaudRate: host.basicInfo.serialBaudRate ?? 115200,
      description: host.basicInfo.description,
      tagsText: host.advancedOptions.tags.join(','),
      identityName: identity.name,
      identityUsername: identity.username,
      method: identity.authConfig.method,
      password: identity.authConfig.password ?? '',
      privateKey: identity.authConfig.privateKey ?? '',
      passphrase: identity.authConfig.passphrase ?? ''
    });
  }, [open, host, identity, reset]);

  const method = watch('method');
  const protocol = watch('protocol');
  const isMobileRuntime = detectMobileFormFactor() || isAndroidRuntime();
  const [keyUploadHint, setKeyUploadHint] = useState<string>('');

  useEffect(() => {
    if (protocol !== 'ssh' || method !== 'privateKey') {
      setKeyUploadHint('');
    }
  }, [method, protocol]);

  const handlePrivateKeyFileUpload = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const content = await file.text();
      const normalized = normalizePrivateKeyContent(content);
      setValue('privateKey', normalized, {
        shouldDirty: true,
        shouldValidate: true,
        shouldTouch: true
      });
      setKeyUploadHint(`已导入私钥文件：${file.name}`);
    } catch (_error) {
      setKeyUploadHint('读取私钥文件失败，请重试或直接粘贴私钥内容。');
    } finally {
      event.target.value = '';
    }
  };

  if (!open || !host || !identity) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[135] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
      <div className="flex max-h-[min(92vh,860px)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/30 bg-[#0a1321]/88 p-6 text-slate-100 shadow-2xl backdrop-blur-2xl sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8fb2e6]">Host Manager</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">编辑主机</h2>
            <p className="mt-2 text-xs text-[#a7c0e2]">
              若该身份被多台主机共用，修改认证会同步到所有关联主机（当前共 {linkedHostCount} 台）。
            </p>
          </div>
          <button
            className="rounded-lg border border-[#314969] bg-[#111f34] px-3 py-1.5 text-xs text-[#c7d8f3] hover:bg-[#162946]"
            disabled={isSaving}
            onClick={onClose}
            type="button"
          >
            关闭
          </button>
        </div>

        <form
          className="mt-5 min-h-0 flex-1 space-y-5 overflow-y-auto pr-1"
          onSubmit={handleSubmit((values) => {
            if (values.protocol === 'serial') {
              values.method = 'none';
              values.address = 'serial.local';
              values.port = 1;
              values.password = '';
              values.privateKey = '';
              values.passphrase = '';
            } else if (values.protocol === 'telnet') {
              values.method = 'password';
              values.privateKey = '';
              values.passphrase = '';
            }
            void onSubmit(values);
          })}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#95b0d8]">连接协议</label>
              <select className={inputClassName} {...register('protocol')}>
                <option value="ssh">SSH</option>
                <option value="telnet">Telnet</option>
                <option disabled={isMobileRuntime} value="serial">
                  Serial（本地串口）
                </option>
              </select>
              {isMobileRuntime && (
                <p className="text-[11px] text-amber-300">移动端暂不支持本地串口连接。</p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#95b0d8]">主机名称（可选）</label>
              <input className={inputClassName} placeholder="留空将自动使用 地址:端口" {...register('name')} />
              {errors.name && <p className="text-xs text-rose-300">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#95b0d8]">备注</label>
              <input className={inputClassName} placeholder="例如：生产集群入口" {...register('description')} />
              {errors.description && <p className="text-xs text-rose-300">{errors.description.message}</p>}
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#95b0d8]">分组（可选）</label>
              <input className={inputClassName} placeholder="例如：生产 / 测试 / 香港节点" {...register('group')} />
              {errors.group && <p className="text-xs text-rose-300">{errors.group.message}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#95b0d8]">
              标签（逗号分隔）
            </label>
            <input
              className={inputClassName}
              placeholder="例如：生产,测试,内网"
              {...register('tagsText')}
            />
            {errors.tagsText && <p className="text-xs text-rose-300">{errors.tagsText.message}</p>}
          </div>

          {protocol === 'serial' ? (
            <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#95b0d8]">串口设备路径</label>
                <input className={inputClassName} placeholder="例如：COM3 / /dev/ttyUSB0" {...register('serialPath')} />
                {errors.serialPath && <p className="text-xs text-rose-300">{errors.serialPath.message}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#95b0d8]">波特率</label>
                <input className={inputClassName} type="number" {...register('serialBaudRate')} />
                {errors.serialBaudRate && <p className="text-xs text-rose-300">{errors.serialBaudRate.message}</p>}
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#95b0d8]">主机地址</label>
                <input className={inputClassName} placeholder="例如：10.0.0.8" {...register('address')} />
                {errors.address && <p className="text-xs text-rose-300">{errors.address.message}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#95b0d8]">端口</label>
                <input className={inputClassName} type="number" {...register('port')} />
                {errors.port && <p className="text-xs text-rose-300">{errors.port.message}</p>}
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#95b0d8]">身份名称（可选）</label>
              <input className={inputClassName} placeholder="留空将自动生成" {...register('identityName')} />
              {errors.identityName && <p className="text-xs text-rose-300">{errors.identityName.message}</p>}
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#95b0d8]">登录用户名</label>
              <input className={inputClassName} placeholder="例如：root" {...register('identityUsername')} />
              {errors.identityUsername && <p className="text-xs text-rose-300">{errors.identityUsername.message}</p>}
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-[#2a3f5d] bg-[#0d1a2b]/75 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#95b0d8]">认证方式</p>
            {protocol === 'serial' ? (
              <div className="rounded-xl border border-[#35547d] bg-[#12233a] p-3 text-sm text-[#d4e5ff]">
                Serial 本地连接不使用应用层账号认证。
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-2 rounded-xl border border-[#35547d] bg-[#12233a] p-3 text-sm text-[#d4e5ff]">
                  <input type="radio" value="password" {...register('method')} />
                  密码认证
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-[#35547d] bg-[#12233a] p-3 text-sm text-[#d4e5ff]">
                  <input
                    disabled={protocol !== 'ssh'}
                    type="radio"
                    value="privateKey"
                    {...register('method')}
                  />
                  私钥认证
                </label>
              </div>
            )}

            {protocol !== 'serial' && method === 'password' && (
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#95b0d8]">登录密码</label>
                <input className={inputClassName} placeholder="请输入登录密码" type="password" {...register('password')} />
                {errors.password && <p className="text-xs text-rose-300">{errors.password.message}</p>}
              </div>
            )}

            {protocol === 'ssh' && method === 'privateKey' && (
              <div className="space-y-4">
                <div className="space-y-2 rounded-xl border border-[#35547d] bg-[#12233a] p-3">
                  <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#95b0d8]">
                    上传私钥文件
                  </label>
                  <input
                    accept=".pem,.key,.ppk,.txt,application/x-pem-file,text/plain"
                    className="block w-full text-xs text-[#d4e5ff] file:mr-3 file:rounded-lg file:border file:border-[#35547d] file:bg-[#0f1f34] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-[#d4e5ff] hover:file:bg-[#173051]"
                    onChange={(event) => {
                      void handlePrivateKeyFileUpload(event);
                    }}
                    type="file"
                  />
                  {keyUploadHint && <p className="text-xs text-[#9ab2d6]">{keyUploadHint}</p>}
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#95b0d8]">私钥内容</label>
                  <textarea
                    className={`${inputClassName} min-h-[120px] font-mono text-xs`}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                    {...register('privateKey')}
                  />
                  {errors.privateKey && <p className="text-xs text-rose-300">{errors.privateKey.message}</p>}
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#95b0d8]">私钥口令（可选）</label>
                  <input className={inputClassName} placeholder="可留空" type="password" {...register('passphrase')} />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              className="rounded-lg border border-[#35547d] bg-[#12233a] px-4 py-2 text-sm text-[#d4e5ff] hover:bg-[#193152]"
              disabled={isSaving}
              onClick={onClose}
              type="button"
            >
              取消
            </button>
            <button
              className="rounded-lg border border-[#4d76ab] bg-[#1a3254] px-4 py-2 text-sm font-semibold text-[#e2efff] hover:bg-[#24426b] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSaving}
              type="submit"
            >
              {isSaving ? '保存中...' : '保存更改'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
