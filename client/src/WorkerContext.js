import React, { createContext, useContext, useState, useMemo, useEffect, useCallback } from 'react'
import { useMediaQuery } from '@react-hooks-hub/use-media-query'

import { setupWorkers, cleanupWorkers } from './workers/workerLoader'
import { 
    usagerDao, forgecommon,
    supporteFormatWebp, supporteFormatWebm, supporteFileStream, isTouchEnabled, detecterFormatsVideos,
} from '@dugrema/millegrilles.reactjs'
import { pki } from '@dugrema/node-forge'

const CONST_INTERVAL_VERIF_SESSION = 600_000

const Context = createContext()

// Hooks
function useWorkers() {
    return useContext(Context).workers
}
export default useWorkers

/** 
 * Usager tel que recu via la requete /auth/get_usager
 * {
 *  auth: bool, 
 *  authentication_challenge: {...},
 * 
 *  // Si disponible (optionnel)
 *  certificat: [chaine pems],
 * 
 *  // Si authentifie === true
 *  userId, 
 *  delegations_date: int,
 *  delegations_version: int,
 *  methodesDisponibles: {certificat: bool},
 * }
 * @return [value, setter]
 */
export function useUsagerWebAuth() {
    const context = useContext(Context)
    return [context.usagerWebAuth, context.setUsagerWebAuth]
}

/**
 * Copie de l'usager selectionne tel que charge de la base de donnees IDB.
 * {
 *   nomUsager: str,
 *   requete: str optionnel,
 *   fingerprintPk: str optionnel,
 *   certificat: list str optionnel (PEM),
 *   clePriveePem: str (PEM),
 *   delegations_version: int optionnel,
 *   delegations_date: int optionnel (epoch secs)
 * }
 * @returns [value, setter]
 */
export function useUsagerDb() {
    const context = useContext(Context)
    return [context.usagerDb, context.setUsagerDb]
}

/**
 * Information de l'usager authentifie via socket.io (apres upgrade).
 * @returns dict
 */
export function useUsagerSocketIo() {
    const context = useContext(Context)
    return [context.usagerSocketIo, context.setUsagerSocketIo]
}

/**
 * Retourne true si _socket.connected === true
 * @returns bool
 */
export function useEtatConnexion() {
    return useContext(Context).etatConnexion
}

/**
 * Retourne true si le formatteur est initialise avec le certificat de l'usager
 * @returns bool
 */
export function useFormatteurPret() {
    return useContext(Context).formatteurPret
}

/**
 * Valeur reponse.auth recue via /auth/get_usager ou /auth/authentifier_usager.
 * @returns bool
 */
export function useEtatAuthentifie() {
    return useContext(Context).etatAuthentifie
}

/**
 * Resultat de l'authentification sur connexion socket.io. Requiert un certificat valide.
 * @returns bool
 */
export function useEtatSocketioAuth() {
    return useContext(Context).etatSocketioAuth
}

/**
 * Valeur composite, indique que l'usager est authentifie et que les composants back-end sont prets.
 * Note : n'indique plus que la connexion socket.io est active. Utiliser useEtatConnexion().
 * @returns bool
 */
export function useEtatPret() {
    return useContext(Context).etatPret
}

/**
 * Retourne true si la session webauth est consideree comme valide.
 * Va etre reverifiee regulierement via /auth/verifier_usager.
 * @returns [value, setter]
 */
export function useEtatSessionActive() {
    const context = useContext(Context)
    return [context.etatSessionActive, context.setEtatSessionActive]
}

/**
 * Structure version : {delegations_version: int, delegations_date: int}
 * @returns 
 */
export function useVersionCertificat() {
    const context = useContext(Context)
    return [context.versionCertificat, context.setVersionCertificat]
}

// Provider
export function WorkerProvider(props) {

    const { setErr } = props

    const { device, orientation } = useMediaQuery()

    const [workerParams, setWorkerParams] = useState('')

    const [workersPrets, setWorkersPrets] = useState(false)
    const [etatConnexion, setEtatConnexion] = useState('')
    const [formatteurPret, setFormatteurPret] = useState('')
    const [versionCertificat, setVersionCertificat] = useState('')

    const [etatSessionActive, setEtatSessionActive] = useState(null)
    const [usagerWebAuth, setUsagerWebAuth] = useState('')
    const [usagerDb, setUsagerDb] = useState('')
    const [usagerSocketIo, setUsagerSocketIo] = useState('')
    const [capabilities, setCapabilities] = useState('')

    // Intercepter information de certificat lors de changement de usagerWebAuth
    const setUsagerWebAuthHandler = useCallback(value => {
        setUsagerWebAuth(value)
        if(value) {
            // Override versions
            const delegations_date = value.delegations_date || ''
            const delegations_version = value.delegations_version || ''
            setVersionCertificat({delegations_date, delegations_version})
        }
    }, [setUsagerWebAuth, setVersionCertificat])

    useEffect(()=>{
        console.info("Worker Context Setup workers")
        setWorkerParams(setupWorkers())
    }, [setupWorkers])

    const setUsagerSocketioCb = useCallback(usager => {
        console.debug("setUsagerSocketIoCb ", usager)
        setUsagerSocketIo(usager)
        if(usager && usager.auth) {
            setEtatSessionActive(true)
        } else {
            setEtatSessionActive(false)
        }
    }, [setUsagerSocketIo])

    const setUsagerDbCallback = useCallback(usager => {
        if(usager.certificat) {
            // Extraire extensions
            try {
                const certForge = pki.certificateFromPem(usager.certificat[0])
                const extensions = forgecommon.extraireExtensionsMillegrille(certForge)
                const securite = getNiveauSecurite(extensions)
                usager = {...usager, extensions, userId: extensions.userId, securite}
                // console.debug("setUsagerDbCallback : %O", usager)
            } catch(err) {
                console.warn("Erreur extraction extensions millegrilles du certificat : %O", err)
            }
        }
        setUsagerDb(usager)
    }, [setUsagerDb])

    const etatAuthentifie = useMemo(()=>{
        const etatAuthentifie = !!usagerDb && !!etatSessionActive
        // console.debug("WorkerProvider.etatAuthentifie = %s (etatSessionActive: %s,usagerDb: %O)",
        //     etatAuthentifie, etatSessionActive, usagerDb)
        return etatAuthentifie
    }, [usagerDb, etatSessionActive])

    const etatPret = useMemo(()=>{
        const etatPret = formatteurPret && etatAuthentifie
        // console.debug("WorkerProvider.etatPret = %s (formatteurPret: %s, etatAuthentifie: %s)",
        //     etatPret, formatteurPret, etatAuthentifie)
        return etatPret
    }, [formatteurPret, etatAuthentifie])

    const etatSocketioAuth = useMemo(()=>{
        if(!usagerSocketIo) return false
        return usagerSocketIo.socketioAuth || false
    }, [usagerSocketIo])

    const value = useMemo(()=>{
        if(workersPrets) return { 
            usagerWebAuth, setUsagerWebAuth: setUsagerWebAuthHandler,
            usagerDb, setUsagerDb: setUsagerDbCallback,
            usagerSocketIo, setUsagerSocketIo: setUsagerSocketioCb,
            etatSessionActive, setEtatSessionActive, 
            etatSocketioAuth,
            versionCertificat, setVersionCertificat,

            workers: workerParams.workers,
            etatConnexion, formatteurPret, etatAuthentifie, etatPret, capabilities,
        }
    }, [
        workerParams, workersPrets, 

        usagerWebAuth, setUsagerWebAuthHandler,
        usagerDb, setUsagerDbCallback,
        usagerSocketIo, setUsagerSocketioCb,
        etatSessionActive, setEtatSessionActive, 
        etatSocketioAuth,
        versionCertificat, setVersionCertificat,
        
        etatConnexion, formatteurPret, etatAuthentifie, etatPret, capabilities,
    ])

    useEffect(()=>{
        if(!workerParams) return
        console.info("Initialiser web workers (ready : %O, workers : %O)", workerParams.ready, workerParams)

        // Initialiser workers et tables collections dans IDB
        const promiseIdb = usagerDao.init()
        Promise.all([promiseIdb, workerParams.ready])
            .then(()=>{
                console.info("Workers prets")
                setWorkersPrets(true)
            })
            .catch(err=>{
                console.error("WorkerProvider Erreur initialisation usagers IDB / workers ", err)
                if(err.name === 'AxiosError') {
                    const response = err.response || {}
                    console.debug("Erreur axios : ", response)
                    setErr({ok: false, err: err, message: `Erreur durant le chargement d'information de la MilleGrille (fiche.json : ${response.status})`})
                } else {
                    setErr({ok: false, err})
                }
            })

        // Cleanup
        return () => { 
            console.info("Cleanup web workers")
            cleanupWorkers(workerParams.workerInstances) 
        }
    }, [workerParams, setWorkersPrets, setErr])

    useEffect(()=>{
        if(!workerParams || !workersPrets) return

        if(workerParams.workers.connexion) {
            // setErreur('')
            connecter(workerParams.workers, setUsagerSocketioCb, setEtatConnexion, setFormatteurPret)
                .then(infoConnexion=>{
                    console.debug("Info connexion ", infoConnexion)
                    // const statusConnexion = JSON.stringify(infoConnexion)
                    if(infoConnexion.ok === false) {
                        console.error("WorkerContext Erreur de connexion [1] : %O", infoConnexion)
                        // setErreur("Erreur de connexion au serveur : " + infoConnexion.err); 
                        setUsagerSocketIo('')
                        setEtatSessionActive(false)
                    } else {
                        console.info("WorkerContext Info connexion : %O", infoConnexion)
                        // setInfoConnexion(infoConnexion)
                        setUsagerSocketIo(infoConnexion)
                        setEtatSessionActive(infoConnexion.auth)
                    }
                })
                .catch(err=>{
                    // setErreur('Erreur de connexion. Detail : ' + err); 
                    console.debug("WorkerContext Erreur de connexion [2] : %O", err)
                    setUsagerSocketIo('')
                })
        } else {
            // setErreur("Pas de worker de connexion")
            console.error("WorkerContext Pas de worker de connexion")
            setUsagerSocketIo('')
        }
    }, [ workerParams, workersPrets, setUsagerSocketIo, setEtatConnexion, setFormatteurPret,setEtatSessionActive ])

    useEffect(()=>{
        if(etatAuthentifie) {
          // Preload certificat maitre des cles
          workerParams.workers.connexion.getCertificatsMaitredescles()
            .catch(err=>console.error("Erreur preload certificat maitre des cles : %O", err))
        }
    }, [workerParams, etatAuthentifie])

    useEffect(()=>{
        // Charger capabilities
        if(!device) return  // Bug dev, device est mis a undefined apres chargement
        loadCapabilities()
            .then(capabilities => {
                let dev = device
                if(device === 'desktop' && capabilities.touchEnabled) dev = 'tablet'
                const mobile = dev !== 'desktop' && capabilities.touchEnabled
                const caps = {...capabilities, device: dev, orientation, mobile}
                console.info("Browser capabilities : %O", caps)
                setCapabilities(caps)
            })
            .catch(err=>console.error("Erreur chargement capabilities ", err))
    }, [setCapabilities, device, orientation])

  
    if(!workersPrets) return (
        <Context.Provider value={value}>{props.attente}</Context.Provider>
    )

    return <Context.Provider value={value}>{props.children}</Context.Provider>
}

async function connecter(workers, setUsager, setEtatConnexion, setFormatteurPret) {
    const { connecter: connecterWorker } = await import('./workers/connecter')
    return connecterWorker(workers, setUsager, setEtatConnexion, setFormatteurPret)
}

async function verifierSession() {
    try {
        const importAxios = await import('axios')
        const reponse = await importAxios.default.get('/auth/verifier_usager')
        // console.debug("Reponse verifier session sur connexion : ", reponse)
        // const reponseCollections = await importAxios.default.get('/millegrilles/initSession')
        console.debug("Reponse verifier session sur collections : ", reponse)
        return true
    } catch(err) {
        return redirigerPortail(err)
    }
}

function redirigerPortail(err) {
    const reponse = err.response || {}
    const status = reponse.status
    if(status === 401) return false

    console.error("Erreur verification session : ", err)
    throw err
}

async function loadCapabilities() {
    const touchEnabled = isTouchEnabled()
    const webp = await supporteFormatWebp()
    // const webm = supporteFormatWebm()
    const stream = supporteFileStream()
    const video = detecterFormatsVideos()
    return { touchEnabled, webp, stream, video }
}

function getNiveauSecurite(extensions) {
    if(extensions) {
        if(extensions.delegationGlobale === 'proprietaire') return '4.secure'
        if(extensions.roles && extensions.roles.includes('compte_prive')) return '2.prive'

        const niveauxSecurite = extensions.niveauxSecurite || []
        if(niveauxSecurite) {
            if(niveauxSecurite.includes('4.secure')) return '4.secure'
            if(niveauxSecurite.includes('3.protege')) return '3.protege'
            if(niveauxSecurite.includes('2.prive')) return '2.prive'
        }
    }

    return '1.public'
}