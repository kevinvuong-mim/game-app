import { Capacitor } from '@capacitor/core';

import { LocalStorageProvider } from './LocalStorage';
import { MemoryStorageProvider } from './MemoryStorage';
import { IndexedDBStorageProvider } from './IndexedDBStorage';
import { PreferencesStorageProvider } from './PreferencesStorage';
import type { StorageProvider, StorageProviderType } from './types';

/** Durable storage: native SharedPreferences/UserDefaults, IndexedDB on web. */
function resolveDurableProviderType(): StorageProviderType {
  return Capacitor.isNativePlatform() ? 'preferences' : 'indexedDB';
}

class StorageService {
  private primary: StorageProviderType;
  private providers = new Map<StorageProviderType, StorageProvider>();

  constructor() {
    this.providers.set('localStorage', new LocalStorageProvider());
    this.providers.set('indexedDB', new IndexedDBStorageProvider());
    this.providers.set('preferences', new PreferencesStorageProvider());
    this.providers.set('memory', new MemoryStorageProvider());
    this.primary = resolveDurableProviderType();
  }

  getDurableProviderType(): StorageProviderType {
    return resolveDurableProviderType();
  }

  getProvider(type?: StorageProviderType): StorageProvider {
    return this.providers.get(type ?? this.primary) ?? this.providers.get('memory')!;
  }

  async save<T>(key: string, value: T, provider?: StorageProviderType): Promise<void> {
    await this.getProvider(provider).save(key, value);
  }

  async load<T>(key: string, provider?: StorageProviderType): Promise<T | null> {
    return this.getProvider(provider).load<T>(key);
  }

  async remove(key: string, provider?: StorageProviderType): Promise<void> {
    await this.getProvider(provider).remove(key);
  }

  async clear(provider?: StorageProviderType): Promise<void> {
    await this.getProvider(provider).clear();
  }

  async keys(provider?: StorageProviderType): Promise<string[]> {
    return this.getProvider(provider).keys();
  }
}

export const storage = new StorageService();
