// Settings: appearance, BYOK provider, translation target, cache, about.

import { useState } from 'react';
import {
  PROVIDERS,
  TRANSLATE_TARGETS,
  langName,
  testLLM,
  type LLMConfig,
} from '@hackdigest/core';
import { useI18n } from '../i18n';
import { useSettings, useTrans } from '../state/store';
import { openExternal } from '../lib/hooks';
import { checkForUpdate, relaunchApp } from '../lib/updater';

const APP_VERSION = '0.1.3';
const REPO_URL = 'https://github.com/turinglambdaai/hackdigest';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="mb-4 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 flex items-center justify-between gap-4 text-sm">
      <span className="text-ink/80">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  'w-56 rounded-lg border border-line bg-raised px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-accent/50';

export default function SettingsPage() {
  const { t } = useI18n();
  const settings = useSettings((s) => s.settings);
  const patch = useSettings((s) => s.patch);
  const clearTrans = useTrans((s) => s.clear);
  const [testState, setTestState] = useState<'idle' | 'running' | 'ok' | 'fail'>('idle');
  const [testMsg, setTestMsg] = useState('');
  const [cacheCleared, setCacheCleared] = useState(false);
  const [updateState, setUpdateState] = useState<'idle' | 'checking' | 'none' | 'downloading' | 'error'>('idle');

  const provider = PROVIDERS.find((p) => p.id === settings.providerId);
  const llm = settings.llm ?? { baseUrl: '', apiKey: '', model: '' };

  const setLLM = (p: Partial<LLMConfig>) => patch({ llm: { ...llm, ...p } });

  const pickProvider = (id: string) => {
    const preset = PROVIDERS.find((p) => p.id === id);
    if (!preset) return;
    patch({
      providerId: id,
      llm: {
        baseUrl: preset.id === 'custom' ? '' : preset.baseUrl,
        apiKey: '',
        model: preset.defaultModel,
      },
    });
    setTestState('idle');
  };

  const runTest = async () => {
    if (!llm.baseUrl || !llm.model) return;
    setTestState('running');
    try {
      if (llm.apiKey) {
        await testLLM(llm);
      } else {
        // Ollama etc. work without a key; still probe /models.
        await testLLM({ ...llm, apiKey: 'none' });
      }
      setTestState('ok');
    } catch (e) {
      setTestState('fail');
      setTestMsg(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-5 py-6">
      <Section title={t.settingsAppearance}>
        <Row label={t.language}>
          <select className={inputCls} value={settings.uiLang} onChange={(e) => patch({ uiLang: e.target.value as 'zh' | 'en' })}>
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </Row>
        <Row label={t.theme}>
          <select className={inputCls} value={settings.theme} onChange={(e) => patch({ theme: e.target.value as 'light' | 'dark' | 'auto' })}>
            <option value="auto">{t.themeAuto}</option>
            <option value="light">{t.themeLight}</option>
            <option value="dark">{t.themeDark}</option>
          </select>
        </Row>
        <Row label={t.fontSize}>
          <select className={inputCls} value={settings.fontScale} onChange={(e) => patch({ fontScale: Number(e.target.value) })}>
            <option value={0.9}>A−</option>
            <option value={1}>A</option>
            <option value={1.1}>A+</option>
            <option value={1.25}>A++</option>
          </select>
        </Row>
      </Section>

      <Section title={t.settingsAI}>
        <p className="mb-4 rounded-lg bg-raised p-3 text-xs leading-relaxed text-mute">{t.byokHint}</p>
        <Row label={t.provider}>
          <select className={inputCls} value={settings.providerId} onChange={(e) => pickProvider(e.target.value)}>
            <option value="">—</option>
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Row>
        {provider && provider.note && <p className="mb-3 text-xs text-accent">{provider.note}</p>}
        {provider && provider.keyUrl && (
          <p className="mb-3 text-xs text-mute">
            <button className="underline hover:text-accent" onClick={() => void openExternal(provider.keyUrl!)}>
              {t.getApiKey} →
            </button>
          </p>
        )}
        {settings.providerId && (
          <>
            <Row label={t.baseUrl}>
              <input className={inputCls} value={llm.baseUrl} onChange={(e) => setLLM({ baseUrl: e.target.value.trim() })} placeholder="https://…/v1" />
            </Row>
            <Row label={t.model}>
              <input className={inputCls} value={llm.model} onChange={(e) => setLLM({ model: e.target.value.trim() })} list="model-list" />
              <datalist id="model-list">
                {provider?.models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </Row>
            <Row label={t.apiKey}>
              <input
                type="password"
                className={inputCls}
                value={llm.apiKey}
                onChange={(e) => setLLM({ apiKey: e.target.value.trim() })}
                placeholder="sk-…"
                autoComplete="off"
              />
            </Row>
            <Row label={t.targetLang}>
              <select className={inputCls} value={settings.translateTarget} onChange={(e) => patch({ translateTarget: e.target.value })}>
                {TRANSLATE_TARGETS.map((l) => (
                  <option key={l} value={l}>
                    {langName(l)}
                  </option>
                ))}
              </select>
            </Row>
            <div className="mt-2 flex items-center gap-3">
              <button
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                onClick={runTest}
                disabled={!llm.baseUrl || !llm.model || testState === 'running'}
              >
                {t.testConn}
              </button>
              {testState === 'ok' && <span className="text-xs text-green-600 dark:text-green-400">{t.testOk}</span>}
              {testState === 'fail' && (
                <span className="text-xs text-red-600 dark:text-red-400" title={testMsg}>
                  {t.testFail}
                </span>
              )}
            </div>
          </>
        )}
      </Section>

      <Section title={t.about}>
        <Row label={t.version}>
          <span className="text-sm text-mute">v{APP_VERSION}</span>
        </Row>
        <div className="mb-3 flex items-center gap-3">
          <button
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            disabled={updateState === 'checking' || updateState === 'downloading'}
            onClick={async () => {
              setUpdateState('checking');
              try {
                const update = await checkForUpdate();
                if (!update) {
                  setUpdateState('none');
                  return;
                }
                setUpdateState('downloading');
                await update.downloadAndInstall();
                await relaunchApp();
              } catch {
                setUpdateState('error');
              }
            }}
          >
            {updateState === 'downloading' ? t.updateNow : t.checkUpdate}
          </button>
          {updateState === 'none' && <span className="text-xs text-green-600 dark:text-green-400">{t.upToDate}</span>}
          {updateState === 'error' && <span className="text-xs text-red-600 dark:text-red-400">{t.updateFailed}</span>}
        </div>
        <Row label="GitHub">
          <button className="text-sm text-accent underline" onClick={() => void openExternal(REPO_URL)}>
            {t.viewRepo}
          </button>
        </Row>
        <p className="text-xs text-mute">{t.proComingSoon}</p>
        <button
          className="mt-3 rounded-lg border border-line px-3 py-1.5 text-xs text-mute hover:bg-raised hover:text-ink"
          onClick={async () => {
            const dbs = ['trans'].map((name) => indexedDB.deleteDatabase('hackdigest'));
            await Promise.all(dbs).catch(() => {});
            clearTrans();
            setCacheCleared(true);
          }}
        >
          {cacheCleared ? t.cacheCleared : t.clearTransCache}
        </button>
      </Section>
    </div>
  );
}
