/**
 * Añade un botón de ajustes rápidos (Quick Settings Tile) en Android que abre la pantalla
 * de nuevo movimiento mediante el deep link `<scheme>://nuevo`.
 *
 * Opciones (app.json): { "label": "Nuevo movimiento", "path": "nuevo" }
 */
const fs = require('fs');
const path = require('path');
const { AndroidConfig, withAndroidManifest, withDangerousMod, withStringsXml } = require('expo/config-plugins');

const SERVICE = 'NewMovementTileService';
const ICON = 'ic_quick_tile';
const LABEL_KEY = 'quick_tile_label';

// Signo "+" blanco: los íconos de los tiles deben ser de un solo color.
const ICON_XML = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="#FFFFFFFF"
        android:pathData="M11,5h2v6h6v2h-6v6h-2v-6h-6v-2h6z" />
</vector>
`;

const serviceKotlin = (pkg, url) => `package ${pkg}

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

/** Tile de ajustes rápidos: abre la app en la pantalla de nuevo movimiento. */
class ${SERVICE} : TileService() {
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

const withQuickTile = (config, { label = 'Nuevo movimiento', path: route = 'nuevo' } = {}) => {
  const pkg = config.android?.package;
  const scheme = Array.isArray(config.scheme) ? config.scheme[0] : config.scheme;
  if (!pkg || !scheme) throw new Error('with-quick-tile: faltan "android.package" o "scheme" en app.json');

  config = withStringsXml(config, (cfg) => {
    cfg.modResults = AndroidConfig.Strings.setStringItem(
      [{ $: { name: LABEL_KEY, translatable: 'false' }, _: label }],
      cfg.modResults,
    );
    return cfg;
  });

  config = withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    const name = `${pkg}.${SERVICE}`;
    app.service = (app.service ?? []).filter((s) => s.$['android:name'] !== name);
    app.service.push({
      $: {
        'android:name': name,
        'android:exported': 'true',
        'android:label': `@string/${LABEL_KEY}`,
        'android:icon': `@drawable/${ICON}`,
        'android:permission': 'android.permission.BIND_QUICK_SETTINGS_TILE',
      },
      'intent-filter': [{ action: [{ $: { 'android:name': 'android.service.quicksettings.action.QS_TILE' } }] }],
    });
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
      fs.writeFileSync(path.join(drawable, `${ICON}.xml`), ICON_XML);
      fs.writeFileSync(path.join(src, `${SERVICE}.kt`), serviceKotlin(pkg, `${scheme}://${route}`));
      return cfg;
    },
  ]);
};

module.exports = withQuickTile;
