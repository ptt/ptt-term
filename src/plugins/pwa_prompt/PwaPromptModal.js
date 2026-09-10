import React, { useEffect } from 'preact/compat';
import { _ } from '../../js/i18n.js';
import './PwaPrompt.css';

export const PwaPromptModal = ({
  plugin,
  platform = 'desktop',
  isMac = false,
  isIOSChrome = false,
  inApp = false,
  hasNativePrompt = false,
  onInstallClick,
  onClose,
  onRemindLater,
}) => {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' || e.code === 'Escape' || e.keyCode === 27) {
        e.preventDefault();
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [onClose]);

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onRemindLater?.();
    }
  };

  const getBadgeLabel = () => {
    switch (platform) {
      case 'ios':
        return 'iOS App';
      case 'android':
        return 'Android App';
      default:
        return 'Desktop App';
    }
  };

  const getTitle = () => {
    switch (platform) {
      case 'ios':
        return _('pwa_prompt_title_ios') || '將 PTT Term 加入主畫面';
      case 'android':
        return _('pwa_prompt_title_android') || '安裝 PTT Term 應用程式';
      default:
        return _('pwa_prompt_title_desktop') || '安裝 PTT Term 桌面版 App';
    }
  };

  const renderStandardActions = () => (
    <div className="PwaPrompt-actions">
      <button
        type="button"
        className="PwaPrompt-btn PwaPrompt-btn-primary"
        onClick={() => onClose?.()}
      >
        {_('pwa_prompt_btn_got_it') || '我知道了'}
      </button>
      <button
        type="button"
        className="PwaPrompt-btn PwaPrompt-btn-secondary"
        onClick={() => onRemindLater?.()}
      >
        {_('pwa_prompt_btn_remind_later') || '下次提醒我'}
      </button>
    </div>
  );

  const renderContent = () => {
    if (inApp) {
      return (
        <div className="PwaPrompt-body">
          <div className="PwaPrompt-warning-box">
            <strong>⚠️ 偵測到應用程式內建瀏覽器 (如 LINE / FB)</strong>
            <br />
            內建瀏覽器無法直接安裝 App 或加入主畫面。
          </div>
          <p>
            {platform === 'ios'
              ? '請點擊右上角或右下角選單「…」，選擇「以 Safari 瀏覽器開啟」後，即可依照指引加入主畫面。'
              : '請點擊右上角選單「⋮」，選擇「以 Chrome 瀏覽器開啟」後即可進行安裝。'}
          </p>
          {renderStandardActions()}
        </div>
      );
    }

    if (platform === 'ios') {
      return (
        <div className="PwaPrompt-body">
          <p>
            {_('pwa_prompt_ios_desc') ||
              '加入主畫面可享受沉浸式全螢幕終端、全黑狀態列與完整的觸控體驗：'}
          </p>
          <ol className="PwaPrompt-steps">
            {isIOSChrome ? (
              <>
                <li>
                  點擊網址列右側的 <strong>分享</strong> 按鈕
                  <svg
                    className="PwaPrompt-inline-icon"
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                    <polyline points="16 6 12 2 8 6" />
                    <line x1="12" y1="2" x2="12" y2="15" />
                  </svg>
                  （或選單「…」）
                </li>
                <li>
                  點選 <strong>「檢視較多」</strong>，找到並點選 <strong>「加入主畫面」</strong>
                  <span className="PwaPrompt-inline-icon">➕</span>
                </li>
              </>
            ) : (
              <>
                <li>
                  點擊瀏覽器底部的 <strong>分享</strong> 按鈕
                  <svg
                    className="PwaPrompt-inline-icon"
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                    <polyline points="16 6 12 2 8 6" />
                    <line x1="12" y1="2" x2="12" y2="15" />
                  </svg>
                </li>
                <li>
                  在選單中向上滑動並點選 <strong>「加入主畫面」</strong>
                  <span className="PwaPrompt-inline-icon">➕</span>
                </li>
              </>
            )}
            <li>
              點擊右上角 <strong>「新增」</strong> 即可完成！
            </li>
          </ol>
          {renderStandardActions()}
        </div>
      );
    }

    if (hasNativePrompt) {
      return (
        <div className="PwaPrompt-body">
          <p>
            {_('pwa_prompt_native_desc') ||
              '安裝為 PWA 獨立應用程式，享有全螢幕瀏覽、獨立視窗與流暢不中斷的連線體驗。'}
          </p>
          <div className="PwaPrompt-actions">
            <button
              type="button"
              className="PwaPrompt-btn PwaPrompt-btn-primary"
              onClick={async () => {
                if (onInstallClick) {
                  await onInstallClick();
                }
              }}
            >
              📥 {_('pwa_prompt_btn_install') || '立即安裝'}
            </button>
            <button
              type="button"
              className="PwaPrompt-btn PwaPrompt-btn-secondary"
              onClick={() => onClose?.()}
            >
              {_('pwa_prompt_btn_not_needed') || '我不需要'}
            </button>
          </div>
        </div>
      );
    }

    if (platform === 'android') {
      return (
        <div className="PwaPrompt-body">
          <p>
            {_('pwa_prompt_android_desc') ||
              '可將 PTT Term 加入主畫面，享有全螢幕獨立視窗體驗：'}
          </p>
          <ol className="PwaPrompt-steps">
            <li>點擊瀏覽器右上角選單（⋮）</li>
            <li>
              點選 <strong>「安裝應用程式」</strong> 或 <strong>「加到主螢幕」</strong>
            </li>
            <li>確認新增即可從桌面一鍵開啟！</li>
          </ol>
          {renderStandardActions()}
        </div>
      );
    }

    // Desktop without active beforeinstallprompt
    return (
      <div className="PwaPrompt-body">
        <p>
          {_('pwa_prompt_desktop_desc') ||
            '將 PTT Term 安裝為桌面應用程式，享受乾淨獨立視窗與專屬桌面捷徑：'}
        </p>
        <ol className="PwaPrompt-steps">
          {isMac ? (
            <li>
              在 Safari 頂部選單點選 <strong>「檔案 (File)」➜「加入 Dock (Add to Dock...)」</strong>
            </li>
          ) : (
            <li>
              點擊瀏覽器網址列右側的 <strong>安裝圖示 ⊕</strong>
            </li>
          )}
          <li>
            或至瀏覽器右上角選單（⋮）選擇 <strong>「儲存並分享」➜「安裝 PTT Term」</strong>
          </li>
        </ol>
        {renderStandardActions()}
      </div>
    );
  };

  return (
    <div
      className="PwaPrompt-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={getTitle()}
      onClick={handleOverlayClick}
    >
      <div className="PwaPrompt-card">
        <button
          type="button"
          className="PwaPrompt-close"
          aria-label="Close"
          onClick={() => onClose?.()}
        >
          &times;
        </button>
        <div className="PwaPrompt-header">
          <span className="PwaPrompt-badge">{getBadgeLabel()}</span>
          <h4 className="PwaPrompt-title">{getTitle()}</h4>
        </div>
        {renderContent()}
        {platform === 'ios' && !inApp && !isIOSChrome && <div className="PwaPrompt-arrow-down" />}
      </div>
    </div>
  );
};

export default PwaPromptModal;
