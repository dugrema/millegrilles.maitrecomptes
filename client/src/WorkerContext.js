import React, { createContext, useContext, useState, useMemo, useEffect, useCallback } from 'react'
import { setupWorkers, cleanupWorkers } from './workers/workerLoader'
import { usagerDao, forgecommon } from '@dugrema/millegrilles.reactjs'
import { pki } from '@dugrema/node-forge'

const CONST_INTERVAL_VERIF_SESSION = 600_000

const Context = createContext()

const { workerInstances, workers: _workers, ready } = setupWorkers()

// Hooks
function useWorkers() {
    return _workers
}
export default useWorkers

export function useUsager() {
    return useContext(Context).usager
}

export function useEtatConnexion() {
    return useContext(Context).etatConnexion
}

export function useFormatteurPret() {
    return useContext(Context).formatteurPret
}

export function useEtatAuthentifie() {
    return useContext(Context).etatAuthentifie
}

export function useInfoConnexion() {
    return useContext(Context).infoConnexion
}

export function useEtatPret() {
    return useContext(Context).etatPret
}

export function useEtatSessionActive() {
    return useContext(Context).etatSessionActive
}

export function useSetEtatSessionActive() {
    return useContext(Context).setEtatSessionActive
}

export function useSetUsager() {
    return useContext(Context).setUsager
}

// Provider
export function WorkerProvider(props) {

    const { setErr } = props

    // const [workers, setWorkers] = useState('')
    const [workersPrets, setWorkersPrets] = useState(false)
    const [usager, setUsager] = useState('')
    const [etatConnexion, setEtatConnexion] = useState('')
    const [formatteurPret, setFormatteurPret] = useState('')
    const [infoConnexion, setInfoConnexion] = useState('')
    const [etatSessionActive, setEtatSessionActive] = useState(null)

    const etatAuthentifie = useMemo(()=>{
        const etatAuthentifie = !!usager && !!etatSessionActive
        console.debug("WorkerProvider.etatAuthentifie = %s (etatSessionActive: %s,usager: %O)",
            etatAuthentifie, etatSessionActive, usager)
        return etatAuthentifie
    }, [usager, etatSessionActive])
    const etatPret = useMemo(()=>{
        const etatPret = etatConnexion && formatteurPret
        console.debug("WorkerProvider.etatPret = %s (etatConnexion: %s,formatteurPret: %s)",
            etatPret, etatConnexion, formatteurPret)
        return etatPret
    }, [etatConnexion, formatteurPret])

    const setUsagerCb = useCallback(usager=>{
        if(usager) {
            if(!usager.extensions && usager.certificat) {
                console.debug("Extraire extensions de ", usager.certificat[0])
                const certForge = pki.certificateFromPem(usager.certificat[0])
                const extensions = forgecommon.extraireExtensionsMillegrille(certForge)
                usager = {...usager, extensions}
            } else if(!usager.extensions) {
                throw new Error('Il faut fournir usager.extensions ou usager.certificat')
            }
            setUsager(usager)
        } else {
            setUsager('')
        }
    }, [setUsager])

    const value = useMemo(()=>{
        if(workersPrets) return { 
            usager, etatConnexion, formatteurPret, etatAuthentifie, infoConnexion, etatPret, 
            etatSessionActive, setEtatSessionActive, setUsager: setUsagerCb,
        }
    }, [
        workersPrets, 
        usager, etatConnexion, formatteurPret, etatAuthentifie, infoConnexion, etatPret, 
        etatSessionActive, setEtatSessionActive, setUsagerCb,
    ])

    useEffect(()=>{
        console.info("Initialiser web workers (ready : %O, workers : %O)", ready, _workers)

        // Initialiser workers et tables collections dans IDB
        const promiseIdb = usagerDao.init()
        Promise.all([promiseIdb, ready])
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
        // return () => { 
        //     console.info("Cleanup web workers")
        //     cleanupWorkers(workerInstances) 
        // }
    }, [setWorkersPrets, setErr])

    useEffect(()=>{
        // if(etatConnexion) {
        //     // Verifier etat connexion
        //     let interval = null
        //     verifierSession()
        //         .then(() => {interval = setInterval(verifierSession, CONST_INTERVAL_VERIF_SESSION)})
        //         .catch(redirigerPortail)
        //     return () => {
        //         if(interval) clearInterval(interval)
        //     }
        // }

        if(etatPret) {
            // Verifier etat session
            let interval = null
            verifierSession()
                .then(() => {
                    setEtatSessionActive(true)
                    interval = setInterval(verifierSession, CONST_INTERVAL_VERIF_SESSION)
                })
                .catch(err=>{
                    setEtatSessionActive(false)
                    // redirigerPortail(err)
                })
            return () => {
                if(interval) clearInterval(interval)
            }
        }
    }, [etatPret, setEtatSessionActive])

    useEffect(()=>{
        if(!workersPrets) return
        // setWorkersTraitementFichiers(workers)
        if(_workers.connexion) {
            // setErreur('')
            connecter(_workers, setUsager, setEtatConnexion, setFormatteurPret)
                .then(infoConnexion=>{
                    // const statusConnexion = JSON.stringify(infoConnexion)
                    if(infoConnexion.ok === false) {
                        console.error("Erreur de connexion [1] : %O", infoConnexion)
                        // setErreur("Erreur de connexion au serveur : " + infoConnexion.err); 
                    } else {
                        console.info("Info connexion : %O", infoConnexion)
                        setInfoConnexion(infoConnexion)
                    }
                })
                .catch(err=>{
                    // setErreur('Erreur de connexion. Detail : ' + err); 
                    console.debug("Erreur de connexion [2] : %O", err)
                })
        } else {
            // setErreur("Pas de worker de connexion")
            console.error("Pas de worker de connexion")
        }
    }, [ workersPrets, setUsager, setEtatConnexion, setFormatteurPret, setInfoConnexion ])

    useEffect(()=>{
        if(etatAuthentifie) {
          // Preload certificat maitre des cles
          _workers.connexion.getCertificatsMaitredescles()
            .catch(err=>console.error("Erreur preload certificat maitre des cles : %O", err))
        }
    }, [etatAuthentifie])
  
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