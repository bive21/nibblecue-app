/** One permission the Android release removes from its merged manifest (`permissions.config.cjs`). */
export interface BlockedPermission {
  /** The full name, as a manifest spells it. */
  name: string;
  /** What would bring it in: a library, a plugin or the template. */
  from: string;
  /** Why the app goes without it. */
  why: string;
}

export declare const UNUSED_TODAY: readonly BlockedPermission[];
export declare const NEVER_WANTED: readonly BlockedPermission[];
export declare const BLOCKED_ANDROID_PERMISSIONS: readonly BlockedPermission[];
/** The names, in order, for `android.blockedPermissions`. */
export declare function androidBlockedPermissions(): string[];
