import '../conv/uao';
import { App } from './app';
import { setupI18n } from './i18n';
import { getQueryVariable } from './util';
import { readValuesWithDefault } from './pref';

function startApp() {
  setupI18n();

  const app = new App();
  window.app = app;

  (process.env.DEVELOPER_MODE ? new Promise((resolve) => {
    app.showAlert('developerMode', {
      onDismiss: () => resolve()
    });
  }) : Promise.resolve()
  ).then(() => {
    // connect.
    const allowOverride = process.env.ALLOW_OVERRIDE_FROM_QUERY;
    const siteUrl = (allowOverride && getQueryVariable('site'))
      || process.env.DEFAULT_SITE;
    const siteType = (allowOverride && (getQueryVariable('type') || getQueryVariable('site_type') || getQueryVariable('profile')))
      || process.env.SITE_TYPE
      || 'auto';
    app.connect(siteUrl, siteType);
    // TODO: Call onSymFont for font data when it's implemented.
    console.log("load pref from storage");
    app.onValuesPrefChange(readValuesWithDefault());
    app.setInputAreaFocus();
    document.getElementById('BBSWindow').style.display = '';
    app.onWindowResize();
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
