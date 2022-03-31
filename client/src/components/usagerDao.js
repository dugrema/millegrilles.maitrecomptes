import {getListeUsagers as getListeUsagersIdb} from '@dugrema/millegrilles.reactjs'

const DB_NAME = 'millegrilles',
      STORE_USAGERS = 'usagers'
      // STORE_CLES_DECHIFFREES = 'clesDechiffrees'

let _dao = null,
    _ready = false

export function init() {
    const promise = new Promise(async (resolve, reject) => {
        // Detecter si idb est disponible, fallback sur localstorage
        try {
            const listeUsagers = await getListeUsagersIdb()
            throw new Error("fixme")
            console.debug("Liste usagers : %O", listeUsagers)
            _dao = idbDao()
            _ready = true
        } catch(err) {
            if(window.localStorage) {
                console.info("IDB non disponible, fallback sur localStorage (err: %s)", ''+err)
                _dao = localStorageDao()
                _ready = true
            } else {
                console.error("Storage non disponible")
                _ready = false
                return reject(err)
            }
        }
        resolve(_ready)
    })

    _ready = promise

    return promise
}

export function ready() {
    if(!_ready) return false
    return _ready
}

export async function getListeUsagers(...args) {
    if(_ready !== true) throw new Error("Pas initialise")
    return _dao.getListeUsagers(...args)
}

export async function getUsager(...args) {
    if(_ready !== true) throw new Error("Pas initialise")
    return _dao.getUsager(...args)
}

export async function updateUsager(...args) {
    if(_ready !== true) throw new Error("Pas initialise")
    return _dao.updateUsager(...args)
}

export async function supprimerUsager(...args) {
    if(_ready !== true) throw new Error("Pas initialise")
    return _dao.supprimerUsager(...args)
}

export async function saveCleDechiffree(...args) {
    if(_ready !== true) throw new Error("Pas initialise")
    return _dao.saveCleDechiffree(...args)
}

export async function getCleDechiffree(...args) {
    if(_ready !== true) throw new Error("Pas initialise")
    return _dao.getCleDechiffree(...args)
}

export async function entretienCache(...args) {
    if(_ready !== true) throw new Error("Pas initialise")
    return _dao.entretienCache(...args)
}

function idbDao() {
    return {
        getListeUsagers: getListeUsagersIdb,
        getUsager: todo,
        updateUsager: todo,
        supprimerUsager: todo,
        saveCleDechiffree: todo,
        getCleDechiffree: todo,
        entretienCache: todo,
    }
}

function localStorageDao() {
    return {
        getListeUsagers: getListeUsagersStorage,
        getUsager: getUsagerStorage,
        updateUsager: updateUsagerStorage,
        supprimerUsager: supprimerUsagerStorage,
        saveCleDechiffree: todo,
        getCleDechiffree: todo,
        entretienCache: todo,
    }
}

function todo() {
    throw new Error("todo")
}

function getListeUsagersStorage() {
    const localStorage = window.localStorage
    const nbKeys = window.localStorage.length
    const usagers = []
    const prefix = [DB_NAME, STORE_USAGERS].join('.') + '.'
    for(let i=0; i<nbKeys; i++) {
        const keyName = localStorage.key(i)
        if(keyName.startsWith(prefix)) {
            const usager = keyName.split('.').pop()
            usagers.push(usager)
        }
    }
    return usagers
}

function getUsagerStorage(nomUsager) {
    const keyStorage = [DB_NAME, STORE_USAGERS, nomUsager].join('.')
    let valueStorage = window.localStorage.getItem(keyStorage)
    if(valueStorage) valueStorage = JSON.parse(valueStorage)
    return valueStorage
}

function updateUsagerStorage(nomUsager, params, _opts) {
    let usager = getUsagerStorage(nomUsager)
    if(!usager) usager = {}
    const updateUsager = {...usager, ...params, nomUsager}
    const keyStorage = [DB_NAME, STORE_USAGERS, nomUsager].join('.')
    const valueStorage = JSON.stringify(updateUsager)
    return window.localStorage.setItem(keyStorage, valueStorage)
}

function supprimerUsagerStorage(nomUsager) {
    const keyStorage = [DB_NAME, STORE_USAGERS, nomUsager].join('.')
    return window.localStorage.removeItem(keyStorage)
}
