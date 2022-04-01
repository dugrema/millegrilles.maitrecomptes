import { lazy, useState, useEffect, useCallback, Suspense } from 'react'
import Container from 'react-bootstrap/Container'
import Row from 'react-bootstrap/Row'
import Col from 'react-bootstrap/Col'
import Button from 'react-bootstrap/Button'
import {proxy as comlinkProxy} from 'comlink'

import { 
    LayoutApplication, HeaderApplication, FooterApplication, AlertTimeout, ModalAttente, 
    usagerDao, 
} from '@dugrema/millegrilles.reactjs'

import Menu from './Menu'

import './components/i18n'
import stylesCommuns from '@dugrema/millegrilles.reactjs/dist/index.css'
import './App.css'

const PreAuthentifier = lazy( () => import('./PreAuthentifier') )
const Accueil = lazy( () => import('./Accueil') )

const LOGGING = false  // Screen logging, pour debugger sur mobile

function App() {

    const [workers, setWorkers] = useState('')
    const [etatConnexion, setEtatConnexion] = useState(false)
    const [idmg, setIdmg] = useState('')
    const [usagerSessionActive, setUsagerSessionActive] = useState('')
    const [usagerDbLocal, setUsagerDbLocal] = useState('')
    const [formatteurPret, setFormatteurPret] = useState(false)
    const [resultatAuthentificationUsager, setResultatAuthentificationUsager] = useState('')

    // Messages, erreurs
    const [attente, setAttente] = useState(false)
    const [confirmation, setConfirmation] = useState('')
    const [error, setError] = useState('')
    //const confirmationCb = useCallback(confirmation=>setConfirmation(confirmation), [setConfirmation])
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

    // Workers, connexion socket.io
    useEffect(()=>{
        initialiserWorkers(setWorkers, setUsagerDbLocal, setEtatConnexion, appendLog)
            .catch(err=>console.error("Erreur chargement workers : %O", err))
    }, [setWorkers, appendLog])
    
    useEffect(()=>{
        if(workers && !etatConnexion) {
            connecterSocketIo(workers, erreurCb, appendLog, setIdmg, setEtatConnexion, setUsagerSessionActive)
                .catch(err=>erreurCb(err))
        }
    }, [workers, erreurCb, appendLog, etatConnexion, setIdmg, setEtatConnexion, setUsagerSessionActive])

    useEffect(()=>{
        usagerDao.init({forceLocalStorage: true})
            .catch(err=>console.error("Erreur ouverture usager dao : %O", err))
    }, [])

    // Load/reload du formatteur de message sur changement de certificat
    useEffect(()=>{
        if(!workers) return
        if(usagerDbLocal) chargerFormatteurCertificat(workers, usagerDbLocal)
            .then(()=>setFormatteurPret(true))
            .catch(err=>{
                setFormatteurPret(false)
                erreurCb(err)
            })
    }, [workers, usagerDbLocal, setFormatteurPret, erreurCb])

    return (
        <LayoutApplication>
      
            <HeaderApplication>
                <Menu 
                    workers={workers} 
                    etatConnexion={etatConnexion} 
                    usagerDbLocal={usagerDbLocal} 
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
                        erreurCb={erreurCb}
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
    if(!props.workers) return <Attente {...props} />
  
    const { resultatAuthentificationUsager } = props
  
    // Selection de la page a afficher
    let Page = PreAuthentifier
    if(resultatAuthentificationUsager) Page = Accueil
  
    return <Page {...props} />
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

async function initialiserWorkers(setWorkers, setUsager, setEtatConnexion, appendLog) {
    // Initialiser une seule fois
    appendLog("initialiserWorkers() Importer workers.load")

    const { setupWorkers } = require('./workers/workers.load')

    console.debug("Initialiser connexion worker")
    appendLog("Initialiser connexion worker")

    const { connexion } = await setupWorkers()
    // Conserver reference globale vers les workers/instances
    const connexionWorker = connexion.webWorker

    // Wiring callbacks avec comlink (web workers)
    const setEtatConnexionProxy = comlinkProxy(setEtatConnexion),
          setUsagerProxy = comlinkProxy(setUsager)
    await connexionWorker.setCallbacks(setEtatConnexionProxy, setUsagerProxy)

    appendLog("Verifier fonctionnement connexion worker")
    const actif = await connexionWorker.ping()
    appendLog(`Connexion worker ok, reponse actif : ${''+actif}`)

    const workers = { connexion: connexionWorker }
    setWorkers(workers)

    appendLog("Workers initialises")
    console.debug("Workers initialises : \nconnexion %O", connexion)
}


// async function connecterSocketIo(setInfoIdmg, setInfoUsager, setConnecte, setEtatProtege, setErrConnexion, appendLog) {
async function connecterSocketIo(workers, erreurCb, appendLog, setIdmg, setConnecte, setUsagerSessionActive) {
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

    console.debug("Connexion socket.io completee, info idmg : %O", infoIdmg)
    if(infoIdmg) {
        const { idmg, nomUsager } = infoIdmg
        appendLog(`Connexion socket.io completee, info idmg ${infoIdmg.idmg}`)
        if(idmg) setIdmg(idmg)
        setConnecte(true)

        if(nomUsager) {
            console.debug("Usager deja authentifie (session active) : %s", nomUsager)
            setUsagerSessionActive(nomUsager)
            // const usagerDbLocal = await usagerDao.getUsager(nomUsager)
            // setUsagerDbLocal(usagerDbLocal)
        }
    } else {
        appendLog('Connexion socket.io completee, aucune info idmg')
    }
  
    // connexion.socketOn('disconnect', comlinkProxy(() =>{
    //   console.debug("Deconnexion (connecte=false)")
    //   setConnecte(false)
    // }))

}

async function verifierSession(appendLog, erreurCb) {
    /* Verifier l'etat de la session usager. Va aussi creer le cookie de session
       (au besoin). Requis avant la connexion socket.io. */
    if(appendLog) appendLog("Verifier session")
    const axios = await import('axios')
    if(appendLog) appendLog("Axios charge")
    try {
        const reponseUser = await axios.get('/millegrilles/authentification/verifier')
        const headers = reponseUser.headers
        const userId = headers['x-user-id']
        const nomUsager = headers['x-user-name']
        appendLog(`Info session userId: ${userId}, nomUsager: ${nomUsager}`)
        return {userId, nomUsager}
    } catch(err) {
        if(err.isAxiosError && err.response.status === 401) { return false }
        appendLog(`Erreur verification session usager : ${''+err}`)
        erreurCb(err, 'Erreur acces au serveur')
        return false
    }
}

//   async function reconnecter(nomUsager, setConnecte, setInfoUsager, setErrConnexion) {
//     console.debug("Reconnexion usager %s", nomUsager)
//     if(!nomUsager) {
//       console.warn("Erreur reconnexion, nom usager non defini")
//       setErrConnexion(true)
//     }
//     setConnecte(true)
  
//     const infoUsager = await _connexionWorker.getInfoUsager(nomUsager)
//     console.debug("Information usager recue sur reconnexion : %O", infoUsager)
  
//     const challengeCertificat = infoUsager.challengeCertificat
  
//     // Emettre demander d'authentification secondaire - va etre accepte
//     // si la session est correctement initialisee.
//     try {
//       const messageFormatte = await _connexionWorker.formatterMessage(
//         challengeCertificat, 'signature', {attacherCertificat: true})
//       console.debug("reconnecter Message formatte : %O", messageFormatte)
//       const resultat = await _connexionWorker.authentifierCertificat(messageFormatte)
//       setInfoUsager(resultat)
//       console.debug("Resultat reconnexion %O", resultat)
//     } catch(err) {
//       console.error("Erreur de reconnexion : %O", err)
//       setErrConnexion('Erreur de reconnexion automatique')
//     }
//   }
  
//   async function _deconnecter(setInfoIdmg, setInfoUsager, setConnecte, setEtatProtege, setErrConnexion, appendLog) {
//     setInfoIdmg('')
//     setInfoUsager('')  // Reset aussi nomUsager
  
//     // Forcer l'expulsion de la session de l'usager
//     const axios = await import('axios')
//     await axios({url: '/millegrilles/authentification/fermer', timeout: 500})
  
//     // S'assurer de creer un nouveau cookie
//     await verifierSession(appendLog)
  
//     // Deconnecter socket.io pour detruire la session, puis reconnecter pour login
//     await _connexionWorker.deconnecter()
  
//       // Preparer la prochaine session (avec cookie)
//     await connecterSocketIo(setInfoIdmg, setInfoUsager, setConnecte, setEtatProtege, setErrConnexion, appendLog)
//   }

async function chargerFormatteurCertificat(workers, usager) {
    console.debug("Preparer formatteur de messages pour usager %O", usager)
    const connexion = workers.connexion
    const { certificat, clePriveePem } = usager

    if(connexion && certificat && clePriveePem) {
        return connexion.initialiserFormatteurMessage(certificat, clePriveePem)
    } else {
        return connexion.clearFormatteurMessage()
    }
}
