/**
 * Añade botones de ajustes rápidos (Quick Settings Tiles) en Android. Cada uno abre una
 * pantalla de la app mediante el deep link `<scheme>://<path>`.
 *
 * Opciones (app.json):
 * { "tiles": [{ "name": "NewMovement", "label": "Nuevo movimiento", "path": "nuevo", "icon": "plus" }] }
 * `name` da el nombre de la clase (`<name>TileService`); no lo cambies o el botón desaparece
 * del panel de quien ya lo agregó. `icon`: una de las claves de ICONS.
 */
const fs = require('fs');
const path = require('path');
const { AndroidConfig, withAndroidManifest, withDangerousMod, withStringsXml } = require('expo/config-plugins');

// Trazos de 24×24; los íconos de los tiles deben ser de un solo color (blanco).
const ICONS = {
  plus: 'M11,5h2v6h6v2h-6v6h-2v-6h-6v-2h6z',
  bell:
    'M12,22c1.1,0 2,-0.9 2,-2h-4c0,1.1 0.89,2 2,2zM18,16v-5c0,-3.07 -1.64,-5.64 -4.5,-6.32V4c0,-0.83 -0.67,-1.5 -1.5,-1.5s-1.5,0.67 -1.5,1.5v0.68C7.63,5.36 6,7.92 6,11v5l-2,2v1h16v-1l-2,-2z',
};

const DEFAULT_TILES = [{ name: 'NewMovement', label: 'Nuevo movimiento', path: 'nuevo', icon: 'plus' }];

/** NewMovement → new_movement */
const snake = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

const iconXml = (pathData) => `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="#FFFFFFFF"
        android:pathData="${pathData}" />
</vector>
`;

const serviceKotlin = (pkg, service, label, url) => `package ${pkg}

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

/** Tile de ajustes rápidos: abre la app en "${label}". */
class ${service} : TileService() {
  override fun onStartListening() {
    super.onStartListening()
    qsTile?.apply {
      state = Tile.STATE_INACTIVE
      updateTile()
    }
  }

  override fun onClick() {
    super.onClick()
    // Con el teléfono bloqueado, primero pide desbloquearlo.
    if (isLocked) unlockAndRun { open() } else open()
  }

  private fun open() {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("${url}")).apply {
      setPackage(packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      val pending = PendingIntent.getActivity(
        this, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
      )
      startActivityAndCollapse(pending)
    } else {
      @Suppress("DEPRECATION")
      startActivityAndCollapse(intent)
    }
  }
}
`;

const withQuickTile = (config, { tiles = DEFAULT_TILES } = {}) => {
  const pkg = config.android?.package;
  const scheme = Array.isArray(config.scheme) ? config.scheme[0] : config.scheme;
  if (!pkg || !scheme) throw new Error('with-quick-tile: faltan "android.package" o "scheme" en app.json');

  const specs = tiles.map(({ name, label, path: route, icon = 'plus' }) => {
    if (!name || !label || !route) throw new Error('with-quick-tile: cada tile necesita "name", "label" y "path"');
    if (!ICONS[icon]) throw new Error(`with-quick-tile: ícono desconocido "${icon}" (usa ${Object.keys(ICONS).join(', ')})`);
    const id = snake(name);
    return {
      service: `${name}TileService`,
      label,
      url: `${scheme}://${route}`,
      icon: ICONS[icon],
      drawable: `ic_tile_${id}`,
      labelKey: `quick_tile_${id}_label`,
    };
  });

  config = withStringsXml(config, (cfg) => {
    cfg.modResults = AndroidConfig.Strings.setStringItem(
      specs.map((s) => ({ $: { name: s.labelKey, translatable: 'false' }, _: s.label })),
      cfg.modResults,
    );
    return cfg;
  });

  config = withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    const names = new Set(specs.map((s) => `${pkg}.${s.service}`));
    app.service = (app.service ?? []).filter((s) => !names.has(s.$['android:name']));
    for (const s of specs) {
      app.service.push({
        $: {
          'android:name': `${pkg}.${s.service}`,
          'android:exported': 'true',
          'android:label': `@string/${s.labelKey}`,
          'android:icon': `@drawable/${s.drawable}`,
          'android:permission': 'android.permission.BIND_QUICK_SETTINGS_TILE',
        },
        'intent-filter': [{ action: [{ $: { 'android:name': 'android.service.quicksettings.action.QS_TILE' } }] }],
      });
    }
    return cfg;
  });

  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const main = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main');
      const drawable = path.join(main, 'res/drawable');
      const src = path.join(main, 'java', ...pkg.split('.'));
      fs.mkdirSync(drawable, { recursive: true });
      fs.mkdirSync(src, { recursive: true });
      for (const s of specs) {
        fs.writeFileSync(path.join(drawable, `${s.drawable}.xml`), iconXml(s.icon));
        fs.writeFileSync(path.join(src, `${s.service}.kt`), serviceKotlin(pkg, s.service, s.label, s.url));
      }
      return cfg;
    },
  ]);
};

module.exports = withQuickTile;
