// Cache memoire
const TTL_DEFAULT = 120_000

const caches = {}

function setCacheValue(name, value, opts) {
    opts = opts || {}
    const ttl = opts.ttl || TTL_DEFAULT
    let cache = caches[name]
    if(!cache) { cache = {}; caches[name] = cache } // Init
    if(cache.timeout) clearTimeout(cache.timeout)
    cache.timeout = setTimeout(()=>{ delete caches[name] }, ttl)
    cache.value = value
}

function getCacheValue(name) {
    const cache = caches[name]
    if(cache) return cache.value
}

function expireCacheValue(name) {
    const cache = caches[name]
    if(cache && cache.timeout) {
        clearTimeout(cache.timeout)
    }
    delete caches[name]
}

module.exports = { setCacheValue, getCacheValue, expireCacheValue }
