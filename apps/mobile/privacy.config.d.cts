import type { ExpoConfig } from 'expo/config';

/** One required-reason API category and the reasons it is used for (Apple's own codes). */
export interface AccessedApiType {
  NSPrivacyAccessedAPIType: string;
  NSPrivacyAccessedAPITypeReasons: string[];
}

/** The app's own manifest, in the shape `ios.privacyManifests` takes. */
export declare const APP_PRIVACY_MANIFEST: Readonly<{
  NSPrivacyTracking: false;
  NSPrivacyTrackingDomains: string[];
  NSPrivacyAccessedAPITypes: AccessedApiType[];
}>;

/** The widget extension's manifest, written into its own folder at prebuild. */
export declare const WIDGET_PRIVACY_MANIFEST: Readonly<{
  NSPrivacyTracking: false;
  NSPrivacyTrackingDomains: string[];
  NSPrivacyCollectedDataTypes: never[];
  NSPrivacyAccessedAPITypes: AccessedApiType[];
}>;

/** expo-widgets' name for the extension's target and folder. */
export declare const WIDGET_TARGET: 'ExpoWidgetsTarget';

/** A property list's XML for a value made of dictionaries, arrays, strings and booleans. */
export declare function plistXml(value: unknown): string;

/** Adds the manifest to the extension's group and resources; false when there is no such target. */
export declare function addManifestToWidgetTarget(project: unknown): boolean;

/** The config plugin: the extension's manifest, after expo-widgets has made its target. */
export declare function withWidgetPrivacyManifest(config: ExpoConfig): ExpoConfig;
