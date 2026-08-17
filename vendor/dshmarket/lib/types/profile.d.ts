/**
 * Profile filesystem reads — everything the market learns from a dsh
 * profile directory (manifest, lockfile, installed package trees). Pure
 * functions of the directory contents; no processes, no network.
 */
/**
 * Resolve a profile name to its directory under DSH_HOME (default ~/.dsh).
 * An explicit directory is used by hosts, such as DSH Desktop, that own the
 * active profile location rather than deriving it from process environment.
 */
export declare function profileDir(profile: string, explicitDir?: string): string;
/** Community dependencies of the profile (in-box bundles filtered out). */
export declare function readInstalled(profile: string, explicitDir?: string): Record<string, string>;
/**
 * RAW dependency map of the profile manifest — including the in-box bundles
 * readInstalled() filters out. This is the rollback snapshot (#65): restoring
 * a filtered view would delete @deepseek-ai/dsh-base and friends.
 */
export declare function readManifestDeps(profile: string, explicitDir?: string): Record<string, string>;
/**
 * Restore the profile manifest's dependency map to a pre-operation snapshot,
 * leaving every other manifest field untouched. pnpm writes package.json
 * BEFORE it finishes installing (#65, #69: a 404/blocked-build failure lands
 * after the write), so a failed add leaves ghost dependencies that break
 * every later pnpm run — and pnpm itself can no longer remove them (the same
 * failure re-fires on any mutation). Direct manifest surgery is the only
 * reliable rollback; the lockfile is left as-is (pnpm reconciles it from the
 * manifest on the next run).
 * @returns names whose entries were dropped or reverted, empty when nothing changed.
 */
export declare function restoreManifestDeps(profile: string, snapshot: Record<string, string>, explicitDir?: string): string[];
/** The version actually present in the profile's node_modules, or null. */
export declare function readInstalledVersion(profile: string, name: string, explicitDir?: string): string | null;
/** Pinned commit per `owner/repo` from the profile lockfile's codeload tarball URLs. */
export declare function readLockCommits(profile: string, explicitDir?: string): Map<string, string>;
/** True when the installed package's manifest declares a dsh plugin surface. */
export declare function hasDshManifest(dir: string): boolean;
/**
 * True when the package's declared entry artifact actually exists — github
 * source checkouts of build-required plugins ship no lib/, and promoting one
 * into the bundle layer bricks the next boot (ERR_MODULE_NOT_FOUND kills the
 * whole profile, #18).
 */
export declare function entryArtifactExists(dir: string): boolean;
/**
 * Package names a bundle patch mounts — the `name:` rows of the package's
 * declared `dsh.bundle.patch` file. Line-wise on purpose: the strict
 * hot-mount parser rejects config/expression rows, but for "what does this
 * bundle bring in" any name row counts.
 */
export declare function bundlePatchTargets(dir: string): string[];
/**
 * Loader entry ids a bundle patch inserts. Cordis refuses to boot a tree
 * with a duplicate entry id ("duplicate loader entry id: storage", #122), so
 * these are what two bundles can collide on.
 */
export declare function bundlePatchEntryIds(dir: string): string[];
/** The profile manifest's `dsh.profile.bundles` — what the CLI reconciled. */
export declare function readProfileBundles(profileDirectory: string): string[];
/**
 * Loader entry ids a newly added package would collide on with bundles the
 * profile ALREADY loads (#122).
 *
 * Cordis hard-fails the whole tree on a duplicate id, so this is not a
 * cosmetic conflict: installing a TUI bundle into a web profile (both
 * declare `id: storage`) leaves DSH unable to start at all, with an error
 * naming neither plugin. Checked against the profile's own bundle list so a
 * package is never compared with itself.
 * @returns colliding ids mapped to the already-installed bundle that owns them.
 */
export declare function conflictingEntryIds(profileDirectory: string, candidate: string, installedBundles: readonly string[]): {
    id: string;
    owner: string;
}[];
/**
 * Whether the loader has anything to load for this package: its own entry
 * artifact, or — for CARRIER bundles — patch rows naming other packages that
 * do have one.
 *
 * Carriers are why `entryArtifactExists` alone is the wrong test (#103):
 * `@linxin666/dsh-skins` ships skin assets plus a patch mounting
 * `@linxin666/dsh-client-ui-skin-center`, and declares no main/exports/
 * index.js of its own. Judged by its own entry it looks like the
 * source-only checkout the #18 guard removes — so the market both flagged it
 * broken AND uninstalled it right after installing.
 * @param profileDirectory - resolved profile directory (host-authoritative under Desktop).
 * @param name - installed package name.
 */
export declare function hasLoadableEntry(profileDirectory: string, name: string): boolean;
/** Plugin subdirectories (depth 2) of a collection checkout, as relative paths. */
export declare function pluginSubdirs(root: string): string[];
/**
 * Allow the given packages' build scripts in the profile's
 * pnpm-workspace.yaml `allowBuilds` block (the key dsh profiles use),
 * merging with existing entries and leaving the rest of the yaml intact.
 * (#6 by @qichuang321.)
 * @returns every package now allowed.
 */
export declare function setAllowBuilds(profile: string, packages: string[], explicitDir?: string): string[];
