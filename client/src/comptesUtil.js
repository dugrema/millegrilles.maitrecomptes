import axios from 'axios'

import { usagerDao } from '@dugrema/millegrilles.reactjs'

import { extraireExtensionsMillegrille } from '@dugrema/millegrilles.utiljs/src/forgecommon'
import { genererClePrivee, genererCsrNavigateur } from '@dugrema/millegrilles.utiljs/src/certificats'

import { pki as forgePki } from '@dugrema/node-forge'

export async function sauvegarderCertificatPem(usager, chainePem, dataAdditionnel) {
    dataAdditionnel = dataAdditionnel || {}

    const certForge = forgePki.certificateFromPem(chainePem[0])  // Validation simple, format correct
    const nomUsager = certForge.subject.getField('CN').value
    // const validityNotAfter = certForge.validity.notAfter.getTime()
    // console.debug("Sauvegarde du nouveau cerfificat de navigateur usager %s, expiration %O", nomUsager, validityNotAfter)
  
    if(nomUsager !== usager) throw new Error(`Certificat pour le mauvais usager : ${nomUsager} !== ${usager}`)
  
    const copieChainePem = [...chainePem]
    if(copieChainePem.length !==3) throw new Error(`Certificat recu n'a pas intermediaire/CA (len=${chainePem.length}): ${chainePem.join('')}`)
    const ca = copieChainePem.pop()
  
    await usagerDao.updateUsager(usager, {ca, certificat: copieChainePem, ...dataAdditionnel, requete: null})
}

export function getUserIdFromCertificat(certificat) {
    let certForge = certificat
    if(typeof(certificat) === 'string') {
        certForge = forgePki.certificateFromPem(certificat)
    }
    const extensions = extraireExtensionsMillegrille(certForge)
    const userId = extensions.userId
    return userId
}

export async function genererCle(nomUsager) {
    // Generer nouveau keypair et stocker
    const cles = await genererClePrivee()

    // Extraire cles, generer CSR du navigateur
    // const clePubliqueBytes = String.fromCharCode.apply(null, multibase.encode('base64', cles.publicKey.publicKeyBytes))
    const fingerprintPublicKey = Buffer.from(cles.publicKey.publicKeyBytes).toString('hex')
    // const fingerprintPublicKey = await hachage.hacher(publicKeyBytes, {hashingCode: 'blake2s-256', encoding: 'base58btc'})
    console.debug("Fingerprint publickey : %O \n(bytes : %O)", fingerprintPublicKey, cles.publicKey.publicKeyBytes)

    // const clePubliqueBytes = base58btc.encode(cles.publicKey.publicKeyBytes)
    const csrNavigateur = await genererCsrNavigateur(nomUsager, cles.pem)

    return {
        fingerprint_pk: fingerprintPublicKey, 
        csr: csrNavigateur,
        clePriveePem: cles.pem,
    }
}

// Initialiser le compte de l'usager
export async function initialiserCompteUsager(nomUsager, opts) {
    if(!opts) opts = {}
  
    if( ! nomUsager ) throw new Error("Usager null")
  
    let usager = await usagerDao.getUsager(nomUsager)
    const certificat = usager?usager.certificat:null
    let genererCsr = false
  
    // console.debug("initialiserNavigateur Information usager initiale : %O", usager)
  
    if( !usager ) {
        // console.debug("Nouvel usager, initialiser compte et creer CSR %s", nomUsager)
        genererCsr = true
    } else if( opts.regenerer === true ) {
        // console.debug("Force generer un nouveau certificat")
        genererCsr = true
    } else if(!certificat && !usager.requete) {
        // console.debug("Certificat/CSR absent, generer nouveau certificat")
        genererCsr = true
    } else if(certificat) {
        // Verifier la validite du certificat
        const {certificatValide, canRenew} = verifierDateRenouvellementCertificat(certificat) 
        if(!certificatValide) {
            // Certificat expire. Retirer certificat/cle du compte
            await usagerDao.updateUsager(nomUsager, {nomUsager, certificat: null, clePriveePem: null, fingerprintPk: null})
            usager.certificat = null
            usager.clePriveePem = null
        }
        if( canRenew || !certificatValide ) {
            // Generer nouveau certificat
            console.warn("Certificat invalide ou date de renouvellement atteinte")
            genererCsr = true
        }
    }
  
    if(genererCsr) {
        const nouvellesCles = await genererCle(nomUsager)
        const {csr, clePriveePem, fingerprint_pk} = nouvellesCles
        const requete = {csr, clePriveePem, fingerprintPk: fingerprint_pk}
        await usagerDao.updateUsager(nomUsager, {nomUsager, requete})
        usager = {...usager, nomUsager, requete}
    }
  
    // console.debug("Compte usager : %O", usager)
    return usager
}

function verifierDateRenouvellementCertificat(certificat) {
    // Verifier la validite du certificat
    const certForge = forgePki.certificateFromPem(certificat.join(''))
    
    const validityNotAfter = certForge.validity.notAfter.getTime(),
            validityNotBefore = certForge.validity.notBefore.getTime()
    const certificatValide = new Date().getTime() < validityNotAfter

    // Calculer 2/3 de la duree pour trigger de renouvellement
    const validityRenew = (validityNotAfter - validityNotBefore) / 3.0 * 2.0 + validityNotBefore
    const canRenew = new Date().getTime() > validityRenew

    // console.debug(
    //     "Certificat valide presentement : %s, epoch can renew? (%s) : %s (%s)",
    //     certificatValide, canRenew, validityRenew, new Date(validityRenew)
    // )

    return {certificatValide, canRenew}
}

export function getNomUsagerCsr(csrPem) {
    try {
        // console.debug("Charger pem csr : %O", csrPem)
        const csrForge = forgePki.certificationRequestFromPem(csrPem)
        // console.debug("CSR Forge : %O", csrForge)

        const cn = csrForge.subject.getField('CN').value
        // console.debug("Common name : %O", cn)

        return cn
    } catch(err) {
        console.warn("Erreur chargement CSR : %O", err)
        return null
    }
}

export async function preparerUsager(workers, nomUsager, erreurCb, opts) {
    opts = opts || {}
    const genererChallenge = opts.genererChallenge
    const connexion = null  // workers.connexion
    console.debug("comptesUtil.preparerUsager Suivant avec usager %s", nomUsager)
    
    // Verifier etat du compte local. Creer ou regenerer certificat (si absent ou expire).
    let usagerLocal = await initialiserCompteUsager(nomUsager) 

    let fingerprintNouveau = null,
        fingerprintCourant = null
    if(usagerLocal) {
        fingerprintCourant = usagerLocal.fingerprintPk
        if(usagerLocal.requete) {
            fingerprintNouveau = usagerLocal.requete.fingerprintPk
        }
    }

    const etatUsagerWebAuth = await chargerUsager(
        nomUsager, fingerprintNouveau, fingerprintCourant, 
        {genererChallenge}
    )
    // console.debug("Etat usager backend : %O", etatUsagerBackend)

    const infoUsager = etatUsagerWebAuth.infoUsager || {}
    const certificat = infoUsager.certificat
    if(certificat) {
        // Mettre a jour le certificat
        const usager = await usagerDao.getUsager(nomUsager)
        const requete = usager.requete
        if(requete) {
            const { clePriveePem, fingerprintPk } = requete
            // Extraire le certificat
            const dataAdditionnel = {clePriveePem, fingerprintPk}
            await sauvegarderCertificatPem(nomUsager, certificat, dataAdditionnel)
        }
    }

    return etatUsagerWebAuth
    // await setEtatUsagerBackend(etatUsagerBackend)
    // await setUsagerDbLocal(await usagerDao.getUsager(nomUsager))
}

// export async function chargerUsager(connexion, nomUsager, fingerprintPk, fingerprintCourant, opts) {
//     opts = opts || {}
//     const hostname = window.location.hostname
//     opts = {hostname, ...opts, fingerprintPk, fingerprintCourant}
//     const infoUsager = await connexion.getInfoUsager(nomUsager, opts)
//     return {nomUsager, infoUsager, authentifie: false}
// }

export async function chargerUsager(nomUsager, fingerprintPk, fingerprintCourant, opts) {
    opts = opts || {}
    const hostname = window.location.hostname
    const data = {
        nomUsager, hostname, 
        ...opts, 
        fingerprintPkNouveau: fingerprintPk, fingerprintPkCourant: fingerprintCourant
    }
    const reponse = await axios({method: 'POST', url: '/auth/get_usager', data, timeout: 20_000})
    const reponseEnveloppe = reponse.data
    const infoUsager = JSON.parse(reponseEnveloppe.contenu)
    console.debug("chargerUsager Reponse ", infoUsager)
    const authentifie = infoUsager?infoUsager.auth:false
    return {nomUsager, infoUsager, authentifie}
}

/** 
 * Supprime toutes les idb databases autre que celles de maitre des comptes, vide les cles, et autre storage.
 */
const DATABASES = ['collections', 'documents', 'messagerie']
const CACHE_STORAGE_NAMES = ['fichiersDechiffresTmp']
export async function cleanupNavigateur() {
    if('indexedDB' in window) {
        let databases = DATABASES
        if('databases' in window.indexedDB) {
            console.debug("Supporte indexedDB.databases()")
            databases = await window.indexedDB.databases()
            console.log(databases)
        }

        // Supprimer databases
        const promisesDelete = []
        for (const databaseName of databases) {
            if(databaseName === 'millegrilles') continue  // Skip DB millegrilles
            console.debug("Supprimer database %s", databaseName)
            const promise = new Promise((resolve, reject)=>{
                const request = window.indexedDB.deleteDatabase(databaseName)
                request.onblocked = e=>{
                    console.warn("delete blocked sur database %s : %O", databaseName, e)
                }
                request.onerror = err => {
                    console.warn("Erreur suppression database %s : %O", databaseName, err)
                    resolve()
                }
                request.onsuccess = () => {
                    console.debug("Database %s supprimee", databaseName)
                    resolve()
                }
            })
            promisesDelete.push(promise)
        }

        // Clear les cles dechiffrees
        promisesDelete.push(usagerDao.clearClesDechiffrees())

        // Supprimer cache storage
        if(caches) {
            const cacheStorage = caches
            for (const cacheName of CACHE_STORAGE_NAMES) {
                promisesDelete.push( cacheStorage.delete(cacheName) )
            }
        }

        await Promise.all(promisesDelete)

    } else {
        console.debug("IDB non supporte")
    }
}
