import { lazy, useState, useEffect, useCallback, Suspense } from 'react'
import Container from 'react-bootstrap/Container'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import Button from 'react-bootstrap/Button'
import {proxy as comlinkProxy} from 'comlink'
import { setupWorkers, cleanupWorkers } from './workers/workers.load'
import axios from 'axios'

import { 
    LayoutApplication, HeaderApplication, FooterApplication, AlertTimeout, ModalAttente, 
    usagerDao, 
} from '@dugrema/millegrilles.reactjs'

import Menu from './Menu'

import './components/i18n'
import stylesCommuns from '@dugrema/millegrilles.reactjs/dist/index.css'
import './App.css'
import { Alert } from 'react-bootstrap'

const PreAuthentifier = lazy( () => import('./PreAuthentifier') )
const Accueil = lazy( () => import('./Accueil') )
const GestionCompte = lazy( () => import('./GestionCompte') )

const LOGGING = false  // Screen logging, pour debugger sur mobile

function App() {

    // Callbacks worker connexion, permet de connaitre l'etat du worker
    const [usagerDaoPret, setUsagerDaoPret] = useState(false)
    const [workers, setWorkers] = useState('')
    const [etatConnexion, setEtatConnexion] = useState(false)
    const [formatteurPret, setFormatteurPret] = useState(false)
    const [usagerSessionActive, setUsagerSessionActive] = useState('')

    // Etat usager
    const [idmg, setIdmg] = useState('')
    const [usagerDbLocal, setUsagerDbLocal] = useState('')
    const [resultatAuthentificationUsager, setResultatAuthentificationUsager] = useState('')
    const [sectionAfficher, setSectionAfficher] = useState('')

    // Messages, erreurs
    const [attente, setAttente] = useState(false)
    const [confirmation, setConfirmation] = useState('')
    const [error, setError] = useState('')
    const confirmationCb = useCallback(confirmation=>setConfirmation(confirmation), [setConfirmation])
    const erreurCb = useCallback((err, message)=>{setError({err, message})}, [setError])

    // Troubleshooting (log sur ecran, e.g. pour appareils mobiles)
    const [logEvent, setLogEvent] = useState('')
    const [logEvents, setLogEvents] = useState([])
    const appendLog = useCallback(event=>{ if(LOGGING) {console.trace(event); setLogEvent(event);} }, [setLogEvent])
    const resetLog = useCallback(()=>setLogEvents([]), [setLogEvents])
    
    useEffect(()=>{
        if(LOGGING && logEvent) { setLogEvent(''); setLogEvents([...logEvents, logEvent]); }
    }, [logEvent, setLogEvent, logEvents, setLogEvents])
    useEffect(()=>{appendLog(`Etat connexion : ${etatConnexion}, usager: "${''+usagerDbLocal}"`)}, [appendLog, etatConnexion, usagerDbLocal])

    useEffect(()=>{
        if(!usagerDaoPret) return
        const workerInstances = initialiserWorkers(setUsagerSessionActive, setEtatConnexion, setFormatteurPret, appendLog)
        const workers = Object.keys(workerInstances).reduce((acc, item)=>{
            acc[item] = workerInstances[item].proxy
            return acc
        }, {})
        setWorkers(workers)

        console.info("Preparation cleanup workers")
        return () => {
            console.info("Cleanup workers")
            cleanupWorkers(workerInstances)
        }
    }, [usagerDaoPret, setWorkers, setUsagerSessionActive, setEtatConnexion, setFormatteurPret, appendLog])

    // Workers, connexion socket.io
    useEffect(()=>{
        // Init usager dao (requis par workers)
        usagerDao.init()
            .then(()=>setUsagerDaoPret(true))
            .catch(err=>erreurCb(err, "Erreur chargement usager dao"))
    }, [setUsagerDaoPret, appendLog, erreurCb])
    
    // Connecter a socket.io une fois les workers prets
    useEffect(()=>{
        if(!workers) return
        connecterSocketIo(workers, erreurCb, appendLog, setIdmg).catch(err=>erreurCb(err))
    }, [workers, erreurCb, appendLog, setIdmg])

    // Load/reload du formatteur de message sur changement de certificat
    useEffect(()=>{
        if(!workers) return
        if(usagerDbLocal) {
            chargerFormatteurCertificat(workers, usagerDbLocal)
                .then(pret=>setFormatteurPret(pret))
                .catch(err=>{
                    setFormatteurPret(false)
                    erreurCb(err)
                })
        } else {
            workers.connexion.clearFormatteurMessage().catch(err=>erreurCb(err))
        }
    }, [workers, usagerDbLocal, setFormatteurPret, erreurCb])

    // Reception nouveau certificat
    useEffect(()=>{
        if(resultatAuthentificationUsager) {
            const {nomUsager, certificat, delegations_date, delegations_version} = resultatAuthentificationUsager
            if(nomUsager && certificat) {
                import('./comptesUtil').then(async comptesUtil=>{
                    // console.debug("Nouveau certificat recu, on va le sauvegarder")
                    const usagerDbLocal = await usagerDao.getUsager(nomUsager)
                    // Remplacer clePriveePem et fingerprintPk
                    const { clePriveePem, fingerprintPk } = usagerDbLocal.requete

                    await comptesUtil.sauvegarderCertificatPem(
                        nomUsager, 
                        certificat, 
                        {requete: null, clePriveePem, fingerprintPk, delegations_date, delegations_version}
                    )

                    // Reload usager (trigger reload formatteurMessages)
                    setUsagerDbLocal(await usagerDao.getUsager(nomUsager))
                })
                .catch(err=>erreurCb(err))
            }
        }
    }, [resultatAuthentificationUsager, setUsagerDbLocal, erreurCb])

    return (
        <LayoutApplication>
      
            <HeaderApplication>
                <Menu 
                    workers={workers} 
                    etatConnexion={etatConnexion} 
                    usagerDbLocal={usagerDbLocal}
                    setSectionAfficher={setSectionAfficher}
                />
            </HeaderApplication>

            <Container className="contenu">
                <AlertTimeout variant="danger" titre="Erreur" delay={false} value={error} setValue={setError}/>
                <AlertTimeout value={confirmation} setValue={setConfirmation} />
                <ModalAttente show={attente} setAttente={setAttente} />

                <Suspense fallback={<Attente workers={workers} idmg={idmg} etatConnexion={etatConnexion} />}>
                    <Contenu 
                        workers={workers} 
                        usagerDbLocal={usagerDbLocal}
                        setUsagerDbLocal={setUsagerDbLocal}
                        etatConnexion={etatConnexion}
                        formatteurPret={formatteurPret}
                        resultatAuthentificationUsager={resultatAuthentificationUsager}
                        setResultatAuthentificationUsager={setResultatAuthentificationUsager}
                        usagerSessionActive={usagerSessionActive}
                        setUsagerSessionActive={setUsagerSessionActive}
                        confirmationCb={confirmationCb}
                        erreurCb={erreurCb}
                        sectionAfficher={sectionAfficher}
                        setSectionAfficher={setSectionAfficher}
                    />
                </Suspense>

                <Log log={logEvents} resetLog={resetLog} />

            </Container>

            <FooterApplication>
                <Footer workers={workers} idmg={idmg} />
            </FooterApplication>

        </LayoutApplication>
    )
}

export default App

function Attente(props) {
    return <p>Chargement en cours</p>
}

function Contenu(props) {
    const { 
        workers, sectionAfficher, etatConnexion, usagerDbLocal, usagerSessionActive,
        resultatAuthentificationUsager, setResultatAuthentificationUsager, 
        formatteurPret, erreurCb 
    } = props
    const { connexion } = workers
    const usagerAuthentifieOk = resultatAuthentificationUsager && resultatAuthentificationUsager.authentifie === true
    // const nomUsager = usagerDbLocal.nomUsager

    // Utilise pour indiquer qu'on peut reconnecter les listeners, refaire requetes, etc.
    const etatAuthentifie = (etatConnexion && usagerSessionActive && usagerDbLocal && formatteurPret && usagerAuthentifieOk)?true:false
    // console.debug("etatConnexion : %O, usagerSessionActive: %O, usagerDbLocal: %O, formatteurPret: %O, usagerAutentifieOk %O = etatAuthentifie %O", 
    //     etatConnexion, usagerSessionActive, usagerDbLocal, formatteurPret, usagerAuthentifieOk, etatAuthentifie
    // )

    // Flag pour conserver l'etat "authentifie" lors d'une perte de connexion
    const [connexionPerdue, setConnexionPerdue] = useState(false)

    // Re-authentification de l'usager si socket perdu
    useEffect(()=>{
        if(etatConnexion === true && usagerSessionActive && formatteurPret) {
            console.warn("Re-authentifier l'usager suite a une deconnexion")
            reauthentifier(connexion, usagerSessionActive, setResultatAuthentificationUsager, erreurCb)
                .then(()=>{setConnexionPerdue(false)})
                .catch(err=>erreurCb(err))
        }
    }, [
        connexion, usagerSessionActive, usagerAuthentifieOk, etatConnexion, formatteurPret,
        setResultatAuthentificationUsager, erreurCb, 
    ])

    // Retirer preuve d'authentification si on perd la connexion
    // Permet de forcer une re-authentification (pour evenements, etc.)
    useEffect(()=>{
        if(!etatConnexion && usagerAuthentifieOk === true) {
            console.warn("Connexion perdue")
            setConnexionPerdue(true)
            setResultatAuthentificationUsager('')
        }
    }, [etatConnexion, usagerAuthentifieOk, setConnexionPerdue, setResultatAuthentificationUsager])

    if(!props.workers) return <Attente {...props} />

    // Selection de la page a afficher
    let Page = PreAuthentifier
    if(usagerAuthentifieOk || connexionPerdue) {
        switch(sectionAfficher) {
            case 'GestionCompte': Page = GestionCompte; break
            default: Page = Accueil
        }
    }
  
    return (
        <>
            <Alert variant="warning" show={connexionPerdue}>
                <Alert.Heading>Connexion perdue</Alert.Heading>
                <p>La connexion au serveur a ete perdue.</p>
                <p>Cette condition est probablement temporaire et devrait se regler d'elle meme.</p>
            </Alert>
            <Page {...props} etatAuthentifie={etatAuthentifie} />
        </>
    )
}

// Utiliser pour reauthentifier l'usager avec son certificat apres une connexion perdue (et session active)
async function reauthentifier(connexion, nomUsager, setResultatAuthentificationUsager, erreurCb) {
    
    const infoUsager = await connexion.getInfoUsager(nomUsager)
    // console.debug("Info usager reauthentifier : %O", infoUsager)
    const { challengeCertificat } = infoUsager
    try {
        const reponse = await connexion.authentifierCertificat(challengeCertificat)
        // console.debug("Reponse authentifier certificat : %O", reponse)
        await setResultatAuthentificationUsager(reponse)
    } catch(err) {
        erreurCb(err, 'Erreur de connexion (authentification du certificat refusee)')
    }
}

function Footer(props) {
    return (
        <div className={stylesCommuns.centre}>
            <Row><Col>{props.idmg}</Col></Row>
            <Row><Col>MilleGrilles</Col></Row>
        </div>
    )
}

function Log(props) {
    if(!LOGGING) return ''
    return (
        <div className="log">
            <h2>Log</h2>
            <div><Button onClick={props.resetLog}>Clear log</Button></div>
            <ol>
                {props.log.map((item, idx)=>(
                    <li key={idx}>{item}</li>
                ))}
            </ol>
        </div>
    )
}

function initialiserWorkers(setUsager, setEtatConnexion, setFormatteurPret, appendLog) {
    // Initialiser une seule fois
    appendLog("initialiserWorkers() Importer workers.load")

    // console.debug("Initialiser connexion worker")
    appendLog("Initialiser connexion worker")

    const { connexion } = setupWorkers()
    // Conserver reference globale vers les workers/instances
    const connexionWorker = connexion.proxy

    new Promise(async resolve => {
        // Wiring callbacks avec comlink (web workers)
        const setEtatConnexionProxy = comlinkProxy(setEtatConnexion),
            setUsagerProxy = comlinkProxy(setUsager),
            setFormatteurPretProxy = comlinkProxy(setFormatteurPret)
        await connexionWorker.setCallbacks(setEtatConnexionProxy, setUsagerProxy, setFormatteurPretProxy)

        appendLog("Verifier fonctionnement connexion worker")
        const actif = await connexionWorker.ping()
        appendLog(`Connexion worker ok, reponse actif : ${''+actif}`)

        appendLog("Workers initialises")

        resolve()
    }).catch(err=>console.error("Erreur wiring callbacks workers : %O", err))

    return { connexion }
}

async function connecterSocketIo(workers, erreurCb, appendLog, setIdmg) {
    const {connexion} = workers
    if(!connexion) throw new Error("Connexion worker n'est pas initialise")
    
    // S'assurer que la session est creee - attendre reponse
  
    // Note : connexion socket.io est pure wss, on n'a pas de piggy-back pour
    //        recuperer le cookie de session.
  
    // Initialiser une premiere connexion via https pour permettre au navigateur
    // de recuperer le cookie de session.
    appendLog("Verifier session")
    await verifierSession(appendLog, erreurCb)
  
    const socketLocation = new URL(window.location.href)
    appendLog(`Session verifiee, connecter socketIo a ${socketLocation.href}`)
  
    const actif = await connexion.estActif()
    // console.debug("actif : %O", actif)
    appendLog(`connexionWorkers.estActif(): "${''+actif}"`)
  
    const infoIdmg = await connexion.connecter({location: socketLocation.href})
        .catch(err=>{
            if(err.socketOk) {
                appendLog("connecterSocketIo invoque sur socket deja ouvert")
            } else {
                erreurCb(err)
            }
        })

    // console.debug("Connexion socket.io completee, info idmg : %O", infoIdmg)
    if(infoIdmg) {
        const { idmg } = infoIdmg
        appendLog(`Connexion socket.io completee, info idmg ${infoIdmg.idmg}`)
        if(idmg) setIdmg(idmg)
        // setConnecte(true)

        // if(nomUsager) {
        //     // console.debug("Usager deja authentifie (session active) : %s", nomUsager)
        //     setUsagerSessionActive(nomUsager)
        //     // const usagerDbLocal = await usagerDao.getUsager(nomUsager)
        //     // setUsagerDbLocal(usagerDbLocal)
        // }
    } else {
        appendLog('Connexion socket.io completee, aucune info idmg')
    }
  
}

async function verifierSession(appendLog, erreurCb) {
    /* Verifier l'etat de la session usager. Va aussi creer le cookie de session
       (au besoin). Requis avant la connexion socket.io. */
    if(appendLog) appendLog("Verifier session")
    // const axios = await import('axios')
    if(appendLog) appendLog("Axios charge")
    try {
        const reponseUser = await axios({method: 'GET', url: '/millegrilles/authentification/verifier'})
        const headers = reponseUser.headers
        const userId = headers['x-user-id']
        const nomUsager = headers['x-user-name']
        appendLog(`Info session userId: ${userId}, nomUsager: ${nomUsager}`)
        return {userId, nomUsager}
    } catch(err) {
        if(err.isAxiosError && err.response.status === 401) { return false }
        appendLog(`Erreur verification session usager : ${''+err}`)
        // erreurCb(err, 'Erreur acces au serveur')
        console.warn("Erreur d'acces au serveur : %O", err)
        return false
    }
}

async function chargerFormatteurCertificat(workers, usager) {
    // console.debug("Preparer formatteur de messages pour usager %O", usager)
    const connexion = workers.connexion
    const { certificat, clePriveePem } = usager
    if(connexion && certificat && clePriveePem) {
        await connexion.initialiserFormatteurMessage(certificat, clePriveePem)
        return true
    } else {
        await connexion.clearFormatteurMessage()
        return false
    }
}
