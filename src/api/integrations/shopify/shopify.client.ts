import '@shopify/shopify-api/adapters/node';
import { shopifyApi, ApiVersion } from '@shopify/shopify-api';
import { env } from '../../../config/env.config.js';

export const shopify = shopifyApi({
    apiKey: env.shopifyApiKey || 'dummy_key',
    apiSecretKey: env.shopifyApiSecret || 'dummy_secret',
    scopes: (env.shopifyScopes || 'read_customers').split(','),
    hostName: (env.appUrl || 'http://localhost').replace(/https?:\/\//, ''),
    hostScheme: (env.appUrl || 'http://localhost').startsWith('https')
        ? 'https'
        : 'http',
    apiVersion: ApiVersion.January26,
    isEmbeddedApp: false, // We are a standalone SaaS app
    isCustomStoreApp: false
});
