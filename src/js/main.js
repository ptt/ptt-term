import React from 'react';
import ReactDOM from 'react-dom';
import { App } from './app';
import { setupI18n } from './i18n';
import { getQueryVariable } from './util';
import { readValuesWithDefault } from './pref';

function startApp() {
  setupI18n();

  const app = new App();
  window.app = app;

  (process.env.DEVELOPER_MODE ? import('../components/DeveloperModeAlert')
    .then(({DeveloperModeAlert}) => new Promise((resolve, reject) => {
      const container = document.getElementById('reactAlert')
      const onDismiss = () => {
        ReactDOM.unmountComponentAtNode(container)
        resolve()
      }
      ReactDOM.render(
        <DeveloperModeAlert onDismiss={onDismiss} />,
        container
      )
    })) : Promise.resolve()
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

function loadTable(url) {
  return fetch(url).then(response => {
    if (!response.ok)
      throw new Error('loadTable failed: ' + response.statusText + ': ' + url);
    return response.arrayBuffer();
  });
}

function loadResources() {
  Promise.all([
    loadTable(require('../conv/b2u_table.bin')),
    loadTable(require('../conv/u2b_table.bin'))
  ]).then((binData) => {
    window.lib = window.lib || {};
    window.lib.b2uArray = new Uint8Array(binData[0]);
    window.lib.u2bArray = new Uint8Array(binData[1]);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startApp);
    } else {
      startApp();
    }
  }, (e) => {
    console.log('loadResources failed: ' + e);
  });
}

loadResources();
