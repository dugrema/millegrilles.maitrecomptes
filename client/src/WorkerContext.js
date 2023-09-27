import React, { createContext, useContext, useState, useMemo, useEffect, useCallback } from 'react'
import { setupWorkers, cleanupWorkers } from './workers/workerLoader'
import { usagerDao, forgecommon } from '@dugrema/millegrilles.reactjs'
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

// Provider
export function WorkerProvider(props) {

    const { setErr } = props

    const [workerParams, setWorkerParams] = useState('')

    const [workersPrets, setWorkersPrets] = useState(false)
    // const [usager, setUsager] = useState('')
    const [etatConnexion, setEtatConnexion] = useState('')
    const [formatteurPret, setFormatteurPret] = useState('')
    // const [infoConnexion, setInfoConnexion] = useState('')

    const [etatSessionActive, setEtatSessionActive] = useState(null)
    const [usagerWebAuth, setUsagerWebAuth] = useState('')
    const [usagerDb, setUsagerDb] = useState('')
    const [usagerSocketIo, setUsagerSocketIo] = useState('')

    useEffect(()=>{
        console.info("Worker Context Setup workers")
        setWorkerParams(setupWorkers())
    }, [setupWorkers])

    const setUsagerSocketioCb = useCallback(usager => {
        setUsagerSocketIo(usager)
        if(usager && usager.auth) {
            setEtatSessionActive(true)
        }
    }, [setUsagerSocketIo])

    // const { workerInstances, workers, ready } = useMemo(()=>{
    //     console.info("Worker Context Setup workers")
    //     return setupWorkers() 
    // }, [setupWorkers])

    const etatAuthentifie = useMemo(()=>{
        const etatAuthentifie = !!usagerDb && !!etatSessionActive
        console.debug("WorkerProvider.etatAuthentifie = %s (etatSessionActive: %s,usagerDb: %O)",
            etatAuthentifie, etatSessionActive, usagerDb)
        return etatAuthentifie
    }, [usagerDb, etatSessionActive])

    // const etatAuthentifie = useMemo(()=>{
    //     const etatAuthentifie = !!usager && !!etatSessionActive
    //     console.debug("WorkerProvider.etatAuthentifie = %s (etatSessionActive: %s,usager: %O)",
    //         etatAuthentifie, etatSessionActive, usager)
    //     return etatAuthentifie
    // }, [usager, etatSessionActive])

    const etatPret = useMemo(()=>{
        const etatPret = formatteurPret && etatAuthentifie
        console.debug("WorkerProvider.etatPret = %s (formatteurPret: %s, etatAuthentifie: %s)",
            etatPret, formatteurPret, etatAuthentifie)
        return etatPret
    }, [formatteurPret, etatAuthentifie])

    // const setUsagerCb = useCallback(usager=>{
    //     if(usager) {
    //         if(!usager.extensions && usager.certificat) {
    //             console.debug("Extraire extensions de ", usager.certificat[0])
    //             const certForge = pki.certificateFromPem(usager.certificat[0])
    //             const extensions = forgecommon.extraireExtensionsMillegrille(certForge)
    //             usager = {...usager, extensions}
    //         } else if(usager.requete) {
    //             // Ok, mode requete certificat
    //         } else if(!usager.extensions) {
    //             throw new Error('Il faut fournir usager.extensions ou usager.certificat')
    //         }
    //         setUsager(usager)
    //     } else {
    //         setUsager('')
    //     }
    // }, [setUsager])

    const value = useMemo(()=>{
        if(workersPrets) return { 
            // usager, setUsager: setUsagerCb, infoConnexion
            
            usagerWebAuth, setUsagerWebAuth,
            usagerDb, setUsagerDb,
            usagerSocketIo, setUsagerSocketIo,
            etatSessionActive, setEtatSessionActive, 

            workers: workerParams.workers,
            etatConnexion, formatteurPret, etatAuthentifie, etatPret, 
        }
    }, [
        workerParams, workersPrets, 
        // usager, setUsagerCb,

        usagerWebAuth, setUsagerWebAuth,
        usagerDb, setUsagerDb,
        usagerSocketIo, setUsagerSocketIo,
        etatSessionActive, setEtatSessionActive, 
        
        etatConnexion, formatteurPret, etatAuthentifie, etatPret, 
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

    // useEffect(()=>{
    //     if(etatConnexion) {
    //         // Verifier etat session
    //         let interval = null
    //         verifierSession()
    //             .then(() => {
    //                 setEtatSessionActive(true)
    //                 interval = setInterval(verifierSession, CONST_INTERVAL_VERIF_SESSION)
    //             })
    //             .catch(err=>{
    //                 setEtatSessionActive(false)
    //                 // redirigerPortail(err)
    //             })
    //         return () => {
    //             if(interval) clearInterval(interval)
    //         }
    //     }
    // }, [etatConnexion, setEtatSessionActive])

    useEffect(()=>{
        if(!workerParams || !workersPrets) return

        if(workerParams.workers.connexion) {
            // setErreur('')
            connecter(workerParams.workers, setUsagerSocketioCb, setEtatConnexion, setFormatteurPret)
                .then(infoConnexion=>{
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
  
    if(!workersPrets) return (
        <Context.Provider value={value}>{props.attente}</Context.Provider>
    )

    return <Context.Provider value={value}>{props.children}</Context.Provider>
}

// export function WorkerContext(props) {
//     return <Context.Consumer>{props.children}</Context.Consumer>
// }

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