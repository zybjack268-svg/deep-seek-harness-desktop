/**
 * Registry access: fetch the curated list from awesome-dsh-plugin.com with an
 * in-memory cache, falling back to the bundled snapshot when offline.
 */
export interface RegistryPlugin {
    name: string;
    owner: string;
    url: string;
    category: string;
    description: Record<string, string>;
    npm?: string | null;
    stars?: number | null;
    install: string;
    added: string;
    /**
     * Catalog-side deprecation flags (#60): supplied by awesome-dsh-plugin,
     * absent for every normal entry — the market only consumes them, so a
     * catalog without the fields behaves exactly as before.
     */
    deprecated?: boolean;
    /** Catalog name of the suggested replacement plugin, when deprecated. */
    replacement?: string;
}
export interface Registry {
    updated: string;
    count: number;
    categories: Record<string, Record<string, string>>;
    plugins: RegistryPlugin[];
}
export declare function loadRegistry(): Promise<{
    registry: Registry;
    source: 'live' | 'cache' | 'snapshot';
}>;
