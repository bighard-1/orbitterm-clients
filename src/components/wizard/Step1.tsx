import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { step1Schema, type Step1FormValues } from '../../schemas/hostSchemas';
import { useHostStore } from '../../store/useHostStore';
import { detectMobileFormFactor, isAndroidRuntime } from '../../services/runtime';
import { Tooltip } from './Tooltip';

const inputClassName =
  'w-full rounded-xl border border-white/65 bg-white/70 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-frost-accent/60 focus:ring-2 focus:ring-frost-accent/20';

export function Step1(): JSX.Element {
  const basicInfo = useHostStore((state) => state.basicInfo);
  const identities = useHostStore((state) => state.identities);
  const updateBasicInfo = useHostStore((state) => state.updateBasicInfo);
  const nextStep = useHostStore((state) => state.nextStep);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors }
  } = useForm<Step1FormValues>({
    resolver: zodResolver(step1Schema),
    defaultValues: basicInfo,
    mode: 'onBlur'
  });

  const isMobileRuntime = useMemo(() => detectMobileFormFactor() || isAndroidRuntime(), []);
  const identityMode = watch('identityMode');
  const protocol = watch('protocol');
  const hasIdentities = identities.length > 0;

  const onSubmit = (values: Step1FormValues): void => {
    if (values.protocol === 'serial') {
      values.address = 'serial.local';
      values.port = 1;
      values.description = values.description.trim();
    }
    if (values.identityMode === 'existing' && !hasIdentities) {
      values.identityMode = 'new';
      values.identityId = '';
    }
    updateBasicInfo(values);
    nextStep();
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          主机名称 (可选)
          <Tooltip content="用于在轨连终端中识别该主机。可留空，系统会自动使用“地址:端口”作为默认名称。" />
        </label>
        <input className={inputClassName} placeholder="可留空，默认使用 地址:端口" {...register('name')} />
        {errors.name && <p className="text-xs text-rose-500">{errors.name.message}</p>}
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          主机分组 (可选)
          <Tooltip content="用于按业务或环境归档资产，例如：生产、测试、香港节点。可留空，后续可在编辑中修改。" />
        </label>
        <input className={inputClassName} placeholder="例如：生产 / 测试 / 香港节点" {...register('group')} />
        {errors.group && <p className="text-xs text-rose-500">{errors.group.message}</p>}
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          连接协议
          <Tooltip content="SSH 适用于服务器运维；Telnet 适用于旧设备；Serial 适用于本地串口设备（移动端仅展示，不可用）。" />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/70 bg-white/70 p-3 text-sm text-slate-700">
            <input type="radio" value="ssh" {...register('protocol')} />
            SSH
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/70 bg-white/70 p-3 text-sm text-slate-700">
            <input type="radio" value="telnet" {...register('protocol')} />
            Telnet
          </label>
          <label
            className={`flex items-center gap-2 rounded-xl border border-white/70 bg-white/70 p-3 text-sm ${
              isMobileRuntime ? 'cursor-not-allowed text-slate-400' : 'cursor-pointer text-slate-700'
            }`}
          >
            <input
              disabled={isMobileRuntime}
              type="radio"
              value="serial"
              {...register('protocol')}
            />
            Serial
          </label>
        </div>
        {isMobileRuntime && (
          <p className="text-xs text-amber-600">
            移动端暂不支持本地串口连接，桌面端可使用 Serial（如 COM3 / /dev/ttyUSB0）。
          </p>
        )}
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          {protocol === 'serial' ? '串口设备路径' : '主机地址'}
          <Tooltip
            content={
              protocol === 'serial'
                ? '例如 Windows: COM3；Linux/macOS: /dev/ttyUSB0、/dev/tty.SLAB_USBtoUART'
                : protocol === 'telnet'
                  ? 'Telnet 目标地址，支持域名、IPv4 或 [IPv6]。'
                  : '支持域名、IPv4 或 [IPv6]。该地址是客户端发起 SSH 连接的目标地址，请确保 DNS 或网络路由可达。'
            }
          />
        </label>
        {protocol === 'serial' ? (
          <>
            <input className={inputClassName} placeholder="例如：COM3 或 /dev/ttyUSB0" {...register('serialPath')} />
            {errors.serialPath && <p className="text-xs text-rose-500">{errors.serialPath.message}</p>}
          </>
        ) : (
          <>
            <input className={inputClassName} placeholder="例如：10.10.10.8 或 host.example.com" {...register('address')} />
            {errors.address && <p className="text-xs text-rose-500">{errors.address.message}</p>}
          </>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            {protocol === 'serial' ? '波特率' : '端口'}
            <Tooltip
              content={
                protocol === 'serial'
                  ? '常见值：9600、19200、38400、57600、115200。'
                  : protocol === 'telnet'
                    ? 'Telnet 默认端口为 23。'
                    : 'SSH 默认端口为 22。若服务端已做安全加固修改，请填写实际监听端口。可用范围为 1-65535。'
              }
            />
          </label>
          {protocol === 'serial' ? (
            <>
              <input className={inputClassName} type="number" {...register('serialBaudRate')} />
              {errors.serialBaudRate && <p className="text-xs text-rose-500">{errors.serialBaudRate.message}</p>}
            </>
          ) : (
            <>
              <input className={inputClassName} type="number" {...register('port')} />
              {errors.port && <p className="text-xs text-rose-500">{errors.port.message}</p>}
            </>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          备注说明
          <Tooltip content="可填写该主机用途、负责人或变更窗口信息，方便团队后续维护。此字段不会影响连接行为。" />
        </label>
        <textarea
          className={`${inputClassName} min-h-[92px] resize-y`}
          placeholder="例如：用于订单服务，负责人 @ops-team"
          {...register('description')}
        />
        {errors.description && <p className="text-xs text-rose-500">{errors.description.message}</p>}
      </div>

      <div className="space-y-3 rounded-2xl border border-white/60 bg-white/55 p-4">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          身份绑定
          <Tooltip content="身份用于集中管理登录用户与认证材料。主机只关联身份，后续改一次身份密钥即可同步到所有关联主机。" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/70 bg-white/70 p-3 text-sm text-slate-700">
            <input
              disabled={!hasIdentities}
              type="radio"
              value="existing"
              {...register('identityMode')}
            />
            选择已有身份
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/70 bg-white/70 p-3 text-sm text-slate-700">
            <input type="radio" value="new" {...register('identityMode')} />
            新建身份
          </label>
        </div>

        {identityMode === 'existing' && (
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              已有身份
              <Tooltip content="选择一个已保存身份，后续主机会复用该身份的用户名和认证方式。" />
            </label>
            <select className={inputClassName} {...register('identityId')}>
              <option value="">{hasIdentities ? '请选择身份' : '暂无身份，请改为新建身份'}</option>
              {identities.map((identity) => (
                <option key={identity.id} value={identity.id}>
                  {identity.name} ({identity.username})
                </option>
              ))}
            </select>
            {errors.identityId && <p className="text-xs text-rose-500">{errors.identityId.message}</p>}
          </div>
        )}

        {identityMode === 'new' && (
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                新身份名称 (可选)
                <Tooltip content="例如“生产服务器密钥”。可留空，系统将自动按“用户名@地址”生成。" />
              </label>
              <input className={inputClassName} placeholder="可留空，自动生成" {...register('identityName')} />
              {errors.identityName && <p className="text-xs text-rose-500">{errors.identityName.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                身份用户名
                <Tooltip content="该身份连接主机时使用的系统账号，如 root、ubuntu、ec2-user。" />
              </label>
              <input className={inputClassName} placeholder="例如：root" {...register('identityUsername')} />
              {errors.identityUsername && <p className="text-xs text-rose-500">{errors.identityUsername.message}</p>}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end pt-2">
        <button
          className="rounded-xl bg-frost-accent px-5 py-2.5 text-sm font-semibold text-white shadow-panel transition hover:bg-[#0c73da]"
          type="submit"
        >
          下一步：认证配置
        </button>
      </div>
    </form>
  );
}
